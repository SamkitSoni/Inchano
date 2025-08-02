import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { DutchAuctionOrder, AuctionStatus, AuctionDetails } from '../auction-details/types';
import { AuctionCalculator } from '../auction-details/calculator';
import { WebSocketService } from '../services/WebSocketService';
import { 
  OrderProcessingService,
  OrderCreationParams,
  OrderStatus as ProcessingOrderStatus
} from '../services/OrderService';

export interface OrderCreationRequest {
  maker: string;
  receiver: string;
  makerAsset: string;
  takerAsset: string;
  makerAmount: string;
  takerAmount: string;
  startTime: number;
  endTime: number;
  startPrice: string;
  endPrice: string;
  auctionStartTime: number;
  auctionEndTime: number;
  salt?: string;
  signature: string;
}

export interface OrderUpdateRequest {
  status?: AuctionStatus;
  signature?: string;
}

export interface OrdersListQuery {
  maker?: string;
  status?: AuctionStatus;
  makerAsset?: string;
  takerAsset?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'price' | 'endTime';
  sortOrder?: 'asc' | 'desc';
}

interface OrderWithMetadata {
  orderHash: string;
  maker: string;
  receiver: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  makerAmount: string;
  takerAmount: string;
  salt: string;
  signature: string;
  startPrice: string;
  endPrice: string;
  startTime: number;
  endTime: number;
  auctionStartTime: number;
  auctionEndTime: number;
  status: AuctionStatus;
  createdAt: Date;
  updatedAt: Date;
}

class OrdersRoutes {
  private router: Router;
  private orders: Map<string, OrderWithMetadata> = new Map();
  private webSocketService: WebSocketService | undefined;
  private orderProcessingService: OrderProcessingService;

  constructor(webSocketService?: WebSocketService) {
    this.router = Router();
    this.webSocketService = webSocketService;
    this.orderProcessingService = new OrderProcessingService(webSocketService);
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Create a new order
    this.router.post('/', this.createOrder.bind(this));
    
    // Get all orders with optional filtering and pagination
    this.router.get('/', this.getOrders.bind(this));
    
    // Get order by hash
    this.router.get('/:orderHash', this.getOrderByHash.bind(this));
    
    // Update order status or details
    this.router.patch('/:orderHash', this.updateOrder.bind(this));
    
    // Cancel an order
    this.router.delete('/:orderHash', this.cancelOrder.bind(this));
    
    // Get order status with real-time auction details
    this.router.get('/:orderHash/status', this.getOrderStatus.bind(this));
    
    // Get order auction details (current price, time remaining, etc.)
    this.router.get('/:orderHash/auction', this.getOrderAuctionDetails.bind(this));
    
    // Get profitable orders for resolvers
    this.router.get('/profitable/opportunities', this.getProfitableOpportunities.bind(this));
    
    // Submit order fill transaction
    this.router.post('/:orderHash/fill', this.fillOrder.bind(this));
    
    // Get order metrics and statistics
    this.router.get('/stats/metrics', this.getOrderMetrics.bind(this));
    
    // Signal readiness for key sharing
    this.router.post('/:orderHash/signal-key-share', this.signalKeyShare.bind(this));
  }

  private async createOrder(req: Request, res: Response): Promise<void> {
    try {
      const orderData: OrderCreationRequest = req.body;
      
      // Validate required fields
      const requiredFields = [
        'maker', 'receiver', 'makerAsset', 'takerAsset', 'makerAmount', 
        'takerAmount', 'startTime', 'endTime', 'startPrice', 'endPrice',
        'auctionStartTime', 'auctionEndTime', 'signature'
      ];
      
      for (const field of requiredFields) {
        if (!orderData[field as keyof OrderCreationRequest]) {
          res.status(400).json({
            success: false,
            error: `Missing required field: ${field}`
          });
          return;
        }
      }

      // Prepare order creation parameters
      const orderParams: OrderCreationParams = {
        maker: orderData.maker,
        receiver: orderData.receiver,
        makerAsset: orderData.makerAsset,
        takerAsset: orderData.takerAsset,
        makerAmount: orderData.makerAmount,
        takerAmount: orderData.takerAmount,
        startPrice: orderData.startPrice,
        endPrice: orderData.endPrice,
        auctionStartTime: orderData.auctionStartTime,
        auctionEndTime: orderData.auctionEndTime,
        signature: orderData.signature,
        ...(orderData.salt && { salt: orderData.salt })
      };

      // Process the limit order using OrderProcessingService
      const result = await this.orderProcessingService.processLimitOrder(orderParams);
      
      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error
        });
        return;
      }

      // Get the processed order for response
      const processedOrder = this.orderProcessingService.getOrder(result.orderHash!);
      if (!processedOrder) {
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve processed order'
        });
        return;
      }

      // Store in our internal format
      const orderWithMetadata: OrderWithMetadata = {
        ...processedOrder.dutchOrder,
        status: this.mapProcessingStatusToAuctionStatus(processedOrder.status),
        createdAt: processedOrder.createdAt,
        updatedAt: processedOrder.updatedAt
      };
      this.orders.set(result.orderHash!, orderWithMetadata);
      
      logger.info('Order created and processed successfully', { 
        orderHash: result.orderHash,
        maker: orderData.maker,
        makerAsset: orderData.makerAsset,
        takerAsset: orderData.takerAsset,
        status: processedOrder.status
      });

      res.status(201).json({
        success: true,
        data: {
          orderHash: result.orderHash,
          order: this.sanitizeOrderForResponse(orderWithMetadata),
          status: processedOrder.status,
          message: 'Order created and processed successfully'
        }
      });
    } catch (error) {
      logger.error('Error creating order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create order'
      });
    }
  }

  private async getOrders(req: Request, res: Response): Promise<void> {
    try {
      const query: OrdersListQuery = req.query as any;
      let filteredOrders = Array.from(this.orders.values());

      // Apply filters
      if (query.maker) {
        filteredOrders = filteredOrders.filter(order => 
          order.maker.toLowerCase() === query.maker!.toLowerCase()
        );
      }

      if (query.status) {
        filteredOrders = filteredOrders.filter(order => order.status === query.status);
      }

      if (query.makerAsset) {
        filteredOrders = filteredOrders.filter(order => 
          order.makerAsset.toLowerCase() === query.makerAsset!.toLowerCase()
        );
      }

      if (query.takerAsset) {
        filteredOrders = filteredOrders.filter(order => 
          order.takerAsset.toLowerCase() === query.takerAsset!.toLowerCase()
        );
      }

      // Apply sorting
      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = query.sortOrder || 'desc';
      
      filteredOrders.sort((a, b) => {
        let aVal: any, bVal: any;
        
        switch (sortBy) {
          case 'createdAt':
            aVal = a.createdAt.getTime();
            bVal = b.createdAt.getTime();
            break;
          case 'price':
            aVal = BigInt(a.startPrice);
            bVal = BigInt(b.startPrice);
            break;
          case 'endTime':
            aVal = a.endTime;
            bVal = b.endTime;
            break;
          default:
            aVal = a.createdAt.getTime();
            bVal = b.createdAt.getTime();
        }

        if (sortOrder === 'asc') {
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
      });

      // Apply pagination
      const limit = Math.min(parseInt(query.limit?.toString() || '50'), 100);
      const offset = parseInt(query.offset?.toString() || '0');
      const paginatedOrders = filteredOrders.slice(offset, offset + limit);

      // Sanitize orders for response
      const sanitizedOrders = paginatedOrders.map(order => this.sanitizeOrderForResponse(order));

      res.json({
        success: true,
        data: {
          orders: sanitizedOrders,
          pagination: {
            limit,
            offset,
            total: filteredOrders.length,
            hasMore: offset + limit < filteredOrders.length
          }
        }
      });
    } catch (error) {
      logger.error('Error getting orders:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get orders'
      });
    }
  }

  private async getOrderByHash(req: Request, res: Response): Promise<void> {
    try {
      const { orderHash } = req.params;
      const order = this.orders.get(orderHash);

      if (!order) {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          order: this.sanitizeOrderForResponse(order)
        }
      });
    } catch (error) {
      logger.error('Error getting order by hash:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get order'
      });
    }
  }

  private async updateOrder(req: Request, res: Response): Promise<void> {
    try {
      const { orderHash } = req.params;
      const updateData: OrderUpdateRequest = req.body;
      const order = this.orders.get(orderHash);

      if (!order) {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
        return;
      }

      // Update allowed fields
      if (updateData.status && Object.values(AuctionStatus).includes(updateData.status)) {
        order.status = updateData.status;
        
        // Broadcast order status update
        if (this.webSocketService) {
          this.webSocketService.broadcastOrderUpdated(orderHash, order, 'status');
        }
      }

      if (updateData.signature) {
        order.signature = updateData.signature;
      }

      order.updatedAt = new Date();
      
      logger.info('Order updated successfully', { 
        orderHash,
        status: order.status,
        updatedFields: Object.keys(updateData)
      });

      res.json({
        success: true,
        data: {
          order: this.sanitizeOrderForResponse(order),
          message: 'Order updated successfully'
        }
      });
    } catch (error) {
      logger.error('Error updating order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update order'
      });
    }
  }

  private async cancelOrder(req: Request, res: Response): Promise<void> {
    try {
      const { orderHash } = req.params;
      const order = this.orders.get(orderHash);

      if (!order) {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
        return;
      }

      if (order.status === AuctionStatus.FILLED) {
        res.status(400).json({
          success: false,
          error: 'Cannot cancel filled order'
        });
        return;
      }

      if (order.status === AuctionStatus.CANCELLED) {
        res.status(400).json({
          success: false,
          error: 'Order already cancelled'
        });
        return;
      }

      order.status = AuctionStatus.CANCELLED;
      order.updatedAt = new Date();
      
      // Broadcast order cancelled event
      if (this.webSocketService) {
        this.webSocketService.broadcastOrderUpdated(orderHash, order, 'cancel');
      }
      
      logger.info('Order cancelled successfully', { orderHash });

      res.json({
        success: true,
        data: {
          orderHash,
          message: 'Order cancelled successfully'
        }
      });
    } catch (error) {
      logger.error('Error cancelling order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel order'
      });
    }
  }

  private async getOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const { orderHash } = req.params;
      const order = this.orders.get(orderHash);

      if (!order) {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
        return;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const auctionDetails = AuctionCalculator.calculateAuctionDetails(this.convertToOrderCalculatorFormat(order), currentTime);

      res.json({
        success: true,
        data: {
          orderHash,
          status: order.status,
          currentPrice: auctionDetails.currentPrice,
          timeRemaining: Math.max(0, order.auctionEndTime - currentTime),
          progress: Math.min(1, Math.max(0, (currentTime - order.auctionStartTime) / (order.auctionEndTime - order.auctionStartTime))),
          isActive: order.status === AuctionStatus.ACTIVE && currentTime < order.auctionEndTime,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        }
      });
    } catch (error) {
      logger.error('Error getting order status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get order status'
      });
    }
  }

  private async getOrderAuctionDetails(req: Request, res: Response): Promise<void> {
    try {
      const { orderHash } = req.params;
      const order = this.orders.get(orderHash);

      if (!order) {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
        return;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const calculationResult = AuctionCalculator.calculateAuctionDetails(this.convertToOrderCalculatorFormat(order), currentTime);
      
      const timeRemaining = Math.max(0, order.auctionEndTime - currentTime);
      const progress = Math.min(1, Math.max(0, (currentTime - order.auctionStartTime) / (order.auctionEndTime - order.auctionStartTime)));
      
      const auctionDetails: AuctionDetails = {
        orderHash,
        currentPrice: calculationResult.currentPrice,
        startPrice: order.startPrice,
        endPrice: order.endPrice,
        startTime: order.startTime,
        endTime: order.endTime,
        timeRemaining,
        priceDecay: calculationResult.priceDecay,
        isProfitable: calculationResult.isProfitable,
        estimatedProfit: calculationResult.estimatedProfit,
        nextPriceUpdate: currentTime + 60, // Next update in 60 seconds
        isActive: order.status === AuctionStatus.ACTIVE && timeRemaining > 0,
        progress,
        estimatedFillPrice: calculationResult.currentPrice
      };

      res.json({
        success: true,
        data: auctionDetails
      });
    } catch (error) {
      logger.error('Error getting auction details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get auction details'
      });
    }
  }

  private async getProfitableOpportunities(req: Request, res: Response): Promise<void> {
    try {
      const gasPrice = req.query['gasPrice']?.toString() || '20000000000'; // 20 gwei default
      const minProfitMargin = parseFloat(req.query['minProfitMargin']?.toString() || '0.01'); // 1% default
      
      const activeOrders = Array.from(this.orders.values())
        .filter(order => order.status === AuctionStatus.ACTIVE);
      
      const opportunities = [];
      const currentTime = Math.floor(Date.now() / 1000);
      
      for (const order of activeOrders) {
        if (currentTime >= order.auctionEndTime) {
          // Mark expired orders
          order.status = AuctionStatus.EXPIRED;
          order.updatedAt = new Date();
          continue;
        }

        const calculationResult = AuctionCalculator.calculateWithProfitability(this.convertToOrderCalculatorFormat(order), gasPrice, currentTime);
        
        if (calculationResult.isProfitable) {
          const netProfitBigInt = BigInt(calculationResult.netProfit);
          const currentPriceBigInt = BigInt(calculationResult.currentPrice);
          const profitMargin = Number(netProfitBigInt * BigInt(10000) / currentPriceBigInt) / 10000;
          
          if (profitMargin >= minProfitMargin) {
            opportunities.push({
              orderHash: order.orderHash,
              order: this.sanitizeOrderForResponse(order),
              profitability: {
                currentPrice: calculationResult.currentPrice,
                netProfit: calculationResult.netProfit,
                gasEstimate: calculationResult.gasEstimate,
                profitMargin: profitMargin.toString(),
                timeRemaining: calculationResult.timeRemaining
              },
              auctionProgress: Math.min(1, Math.max(0, (currentTime - order.auctionStartTime) / (order.auctionEndTime - order.auctionStartTime)))
            });
          }
        }
      }

      // Sort by profit margin (highest first)
      opportunities.sort((a, b) => 
        parseFloat(b.profitability.profitMargin) - parseFloat(a.profitability.profitMargin)
      );

      res.json({
        success: true,
        data: {
          opportunities,
          count: opportunities.length,
          gasPrice,
          minProfitMargin,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error getting profitable opportunities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get profitable opportunities'
      });
    }
  }

  private async fillOrder(req: Request, res: Response): Promise<void> {
    try {
      const { orderHash } = req.params;
      const { txHash, fillAmount, resolver } = req.body;
      const order = this.orders.get(orderHash);

      if (!order) {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
        return;
      }

      if (order.status !== AuctionStatus.ACTIVE) {
        res.status(400).json({
          success: false,
          error: 'Order is not active'
        });
        return;
      }

      // Mark order as filled
      order.status = AuctionStatus.FILLED;
      order.updatedAt = new Date();
      
      // Broadcast order filled event
      if (this.webSocketService) {
        this.webSocketService.broadcastOrderUpdated(orderHash, order, 'fill');
      }
      
      logger.info('Order filled successfully', { 
        orderHash,
        txHash,
        fillAmount,
        resolver
      });

      res.json({
        success: true,
        data: {
          orderHash,
          txHash,
          fillAmount,
          resolver,
          message: 'Order fill submitted successfully'
        }
      });
    } catch (error) {
      logger.error('Error filling order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fill order'
      });
    }
  }

  private async getOrderMetrics(_req: Request, res: Response): Promise<void> {
    try {
      const orders = Array.from(this.orders.values());
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Calculate metrics
      const totalOrders = orders.length;
      const activeOrders = orders.filter(order => 
        order.status === AuctionStatus.ACTIVE && currentTime < order.auctionEndTime
      ).length;
      
      const filledOrders = orders.filter(order => order.status === AuctionStatus.FILLED);
      const averageFillRate = totalOrders > 0 ? filledOrders.length / totalOrders : 0;
      
      // Calculate total volume in wei (sum of all filled orders)
      const totalVolume = filledOrders.reduce((sum, order) => {
        return sum + BigInt(order.takerAmount);
      }, BigInt(0)).toString();
      
      // Calculate average auction duration for completed orders
      const completedOrders = orders.filter(order => 
        order.status === AuctionStatus.FILLED || order.status === AuctionStatus.EXPIRED
      );
      
      const averageAuctionDuration = completedOrders.length > 0 
        ? completedOrders.reduce((sum, order) => {
            const duration = (order.updatedAt.getTime() - order.createdAt.getTime()) / 1000;
            return sum + duration;
          }, 0) / completedOrders.length
        : 0;

      const metrics = {
        totalOrders,
        activeOrders,
        filledOrders: filledOrders.length,
        cancelledOrders: orders.filter(order => order.status === AuctionStatus.CANCELLED).length,
        expiredOrders: orders.filter(order => order.status === AuctionStatus.EXPIRED).length,
        averageFillRate: Math.round(averageFillRate * 10000) / 10000, // 4 decimal places
        totalVolume,
        averageAuctionDuration: Math.round(averageAuctionDuration * 100) / 100, // 2 decimal places
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Error getting order metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get order metrics'
      });
    }
  }


  private mapProcessingStatusToAuctionStatus(processingStatus: ProcessingOrderStatus): AuctionStatus {
    switch (processingStatus) {
      case ProcessingOrderStatus.PENDING:
        return AuctionStatus.PENDING;
      case ProcessingOrderStatus.VERIFIED:
        return AuctionStatus.PENDING;
      case ProcessingOrderStatus.AUCTION_ACTIVE:
        return AuctionStatus.ACTIVE;
      case ProcessingOrderStatus.FILLED:
        return AuctionStatus.FILLED;
      case ProcessingOrderStatus.CANCELLED:
        return AuctionStatus.CANCELLED;
      case ProcessingOrderStatus.EXPIRED:
        return AuctionStatus.EXPIRED;
      case ProcessingOrderStatus.FAILED:
        return AuctionStatus.CANCELLED; // Map failed to cancelled
      default:
        return AuctionStatus.PENDING;
    }
  }

  private convertToOrderCalculatorFormat(order: OrderWithMetadata): DutchAuctionOrder {
    return {
      ...order,
      createdAt: order.createdAt.getTime(),
      updatedAt: order.updatedAt.getTime()
    };
  }

  private sanitizeOrderForResponse(order: OrderWithMetadata) {
    return {
      orderHash: order.orderHash,
      maker: order.maker,
      receiver: order.receiver,
      makerAsset: order.makerAsset,
      takerAsset: order.takerAsset,
      makerAmount: order.makerAmount,
      takerAmount: order.takerAmount,
      startTime: order.startTime,
      endTime: order.endTime,
      startPrice: order.startPrice,
      endPrice: order.endPrice,
      auctionStartTime: order.auctionStartTime,
      auctionEndTime: order.auctionEndTime,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    };
  }

  public getRouter(): Router {
    return this.router;
  }

  // Public method to add orders from other services (like the gateway)
  public addOrder(order: DutchAuctionOrder): void {
    const orderWithStatus = {
      ...order,
      status: AuctionStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.orders.set(order.orderHash, orderWithStatus);
  }

  // Public method to get all orders (for integration with other services)
  public getAllOrders(): OrderWithMetadata[] {
    return Array.from(this.orders.values());
  }

  // Public method to update order status (for integration with monitoring services)
  public updateOrderStatus(orderHash: string, status: AuctionStatus): boolean {
    const order = this.orders.get(orderHash);
    if (order) {
      order.status = status;
      order.updatedAt = new Date();
      return true;
    }
    return false;
  }

  private async signalKeyShare(req: Request, res: Response): Promise<void> {
    try {
      const { orderHash } = req.params;

      if (!this.orders.has(orderHash)) {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
        return;
      }

      // Here you may include logic to handle the signaling for key sharing

      logger.info(`Order ${orderHash} signaled readiness for key sharing`);
      res.status(200).json({
        success: true,
        message: 'Key share signal acknowledged'
      });
    } catch (error) {
      logger.error('Error in signaling key share readiness:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to signal key share readiness'
      });
    }
  }
}

export const createOrdersRouter = (): Router => {
  const ordersRoutes = new OrdersRoutes();
  return ordersRoutes.getRouter();
};

export { OrdersRoutes };
