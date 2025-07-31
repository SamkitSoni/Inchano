import { logger } from '../utils/logger';
import { WebSocketService } from './WebSocketService';
import { 
  LimitOrder, 
  NetworkName, 
  verifyOrder, 
  generateOrderHash,
  getNetworkFromChainId 
} from '../utils/signatureVerification';
import { DutchAuctionOrder } from '../auction-details/types';
import { AuctionCalculator } from '../auction-details/calculator';

export interface ProcessedOrder {
  orderHash: string;
  limitOrder: LimitOrder;
  dutchOrder: DutchAuctionOrder;
  signature: string;
  network: NetworkName;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  auctionStarted: boolean;
}

export enum OrderStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  AUCTION_ACTIVE = 'auction_active',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  FAILED = 'failed'
}

export interface OrderCreationParams {
  maker: string;
  receiver: string;
  makerAsset: string;
  takerAsset: string;
  makerAmount: string;
  takerAmount: string;
  startPrice: string;
  endPrice: string;
  auctionStartTime: number;
  auctionEndTime: number;
  salt?: string;
  signature: string;
  network?: NetworkName;
}

export interface DutchAuctionParams {
  startPrice: string;
  endPrice: string;
  startTime: number;
  endTime: number;
  priceDecayFunction?: 'linear' | 'exponential';
}

export class OrderProcessingService {
  private orders: Map<string, ProcessedOrder> = new Map();
  private webSocketService: WebSocketService | undefined;
  private auctionCalculator: AuctionCalculator;
  private auctionTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(webSocketService?: WebSocketService) {
    this.webSocketService = webSocketService;
    this.auctionCalculator = new AuctionCalculator();
    
    // Start periodic cleanup of expired orders
    this.startPeriodicCleanup();
  }

  /**
   * Process a new limit order from user
   */
  public async processLimitOrder(params: OrderCreationParams): Promise<{ success: boolean; orderHash?: string; error?: string }> {
    try {
      logger.info('Processing new limit order', { maker: params.maker, makerAsset: params.makerAsset });

      // Determine network (default to Sepolia)
      const chainId = parseInt(process.env['DEFAULT_CHAIN_ID'] || '11155111');
      const network = params.network || getNetworkFromChainId(chainId);

      // Create limit order structure
      const limitOrder: LimitOrder = {
        salt: params.salt || Math.floor(Date.now() * Math.random()).toString(),
        maker: params.maker,
        receiver: params.receiver,
        makerAsset: params.makerAsset,
        takerAsset: params.takerAsset,
        makerAmount: params.makerAmount,
        takerAmount: params.takerAmount,
        interactions: '0x' // Basic order without interactions
      };

      // Generate EIP-712 order hash
      const orderHash = generateOrderHash(limitOrder, network);

      // Verify signature
      const verification = verifyOrder(limitOrder, params.signature, network);
      if (!verification.isValid) {
        logger.warn('Order signature verification failed', { 
          orderHash, 
          errors: verification.errors 
        });
        return {
          success: false,
          error: 'Invalid order signature or data: ' + verification.errors.join(', ')
        };
      }

      // Check if order already exists
      if (this.orders.has(orderHash)) {
        logger.warn('Order already exists', { orderHash });
        return {
          success: false,
          error: 'Order already exists'
        };
      }

      // Create Dutch auction order structure
      const dutchOrder: DutchAuctionOrder = {
        orderHash,
        maker: params.maker,
        receiver: params.receiver,
        makerAsset: params.makerAsset,
        takerAsset: params.takerAsset,
        makerAmount: params.makerAmount,
        takerAmount: params.takerAmount,
        startTime: params.auctionStartTime,
        endTime: params.auctionEndTime,
        startPrice: params.startPrice,
        endPrice: params.endPrice,
        auctionStartTime: params.auctionStartTime,
        auctionEndTime: params.auctionEndTime,
        signature: params.signature,
        salt: limitOrder.salt
      };

      // Create processed order
      const processedOrder: ProcessedOrder = {
        orderHash,
        limitOrder,
        dutchOrder,
        signature: params.signature,
        network,
        status: OrderStatus.VERIFIED,
        createdAt: new Date(),
        updatedAt: new Date(),
        auctionStarted: false
      };

      // Store order
      this.orders.set(orderHash, processedOrder);

      logger.info('Limit order processed successfully', { 
        orderHash, 
        maker: params.maker,
        network,
        auctionStartTime: params.auctionStartTime
      });

      // Schedule Dutch auction start if needed
      await this.scheduleAuctionStart(orderHash, params.auctionStartTime);

      // Broadcast order created event
      if (this.webSocketService) {
        this.webSocketService.broadcastOrderCreated(dutchOrder);
      }

      return {
        success: true,
        orderHash
      };

    } catch (error) {
      logger.error('Failed to process limit order', { error, params });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Start Dutch auction for an order
   */
  public async startDutchAuction(orderHash: string): Promise<{ success: boolean; error?: string }> {
    try {
      const order = this.orders.get(orderHash);
      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (order.auctionStarted) {
        return { success: false, error: 'Auction already started' };
      }

      if (order.status !== OrderStatus.VERIFIED) {
        return { success: false, error: `Cannot start auction for order with status: ${order.status}` };
      }

      const currentTime = Math.floor(Date.now() / 1000);
      
      // Check if it's time to start the auction
      if (currentTime < order.dutchOrder.startTime) {
        return { success: false, error: 'Auction start time not reached yet' };
      }

      // Update order status
      order.status = OrderStatus.AUCTION_ACTIVE;
      order.auctionStarted = true;
      order.updatedAt = new Date();

      // Schedule auction end
      this.scheduleAuctionEnd(orderHash, order.dutchOrder.endTime);

      logger.info('Dutch auction started', { 
        orderHash,
        startPrice: order.dutchOrder.startPrice,
        endPrice: order.dutchOrder.endPrice,
        duration: order.dutchOrder.endTime - order.dutchOrder.startTime
      });

      // Broadcast auction started event
      if (this.webSocketService) {
        this.webSocketService.broadcastOrderUpdated(orderHash, order.dutchOrder, 'status');
      }

      return { success: true };

    } catch (error) {
      logger.error('Failed to start Dutch auction', { error, orderHash });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get current auction price for an order
   */
  public getCurrentPrice(orderHash: string): { success: boolean; price?: string; error?: string } {
    try {
      const order = this.orders.get(orderHash);
      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (order.status !== OrderStatus.AUCTION_ACTIVE) {
        return { success: false, error: 'Auction is not active' };
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const auctionDetails = this.auctionCalculator.calculateAuctionDetails(order.dutchOrder, currentTime);

      return {
        success: true,
        price: auctionDetails.currentPrice
      };

    } catch (error) {
      logger.error('Failed to get current price', { error, orderHash });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Fill an order (mark as filled)
   */
  public async fillOrder(orderHash: string, txHash: string, fillAmount: string, resolver: string): Promise<{ success: boolean; error?: string }> {
    try {
      const order = this.orders.get(orderHash);
      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (order.status !== OrderStatus.AUCTION_ACTIVE) {
        return { success: false, error: 'Order is not active for filling' };
      }

      // Update order status
      order.status = OrderStatus.FILLED;
      order.updatedAt = new Date();

      // Clear any scheduled timers
      const timer = this.auctionTimers.get(orderHash);
      if (timer) {
        clearTimeout(timer);
        this.auctionTimers.delete(orderHash);
      }

      logger.info('Order filled successfully', { 
        orderHash,
        txHash,
        fillAmount,
        resolver
      });

      // Broadcast order filled event
      if (this.webSocketService) {
        this.webSocketService.broadcastOrderUpdated(orderHash, order.dutchOrder, 'fill');
      }

      return { success: true };

    } catch (error) {
      logger.error('Failed to fill order', { error, orderHash });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Cancel an order
   */
  public async cancelOrder(orderHash: string): Promise<{ success: boolean; error?: string }> {
    try {
      const order = this.orders.get(orderHash);
      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (order.status === OrderStatus.FILLED) {
        return { success: false, error: 'Cannot cancel filled order' };
      }

      if (order.status === OrderStatus.CANCELLED) {
        return { success: false, error: 'Order already cancelled' };
      }

      // Update order status
      order.status = OrderStatus.CANCELLED;
      order.updatedAt = new Date();

      // Clear any scheduled timers
      const timer = this.auctionTimers.get(orderHash);
      if (timer) {
        clearTimeout(timer);
        this.auctionTimers.delete(orderHash);
      }

      logger.info('Order cancelled', { orderHash });

      // Broadcast order cancelled event
      if (this.webSocketService) {
        this.webSocketService.broadcastOrderUpdated(orderHash, order.dutchOrder, 'cancel');
      }

      return { success: true };

    } catch (error) {
      logger.error('Failed to cancel order', { error, orderHash });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get order by hash
   */
  public getOrder(orderHash: string): ProcessedOrder | undefined {
    return this.orders.get(orderHash);
  }

  /**
   * Get all orders
   */
  public getAllOrders(): ProcessedOrder[] {
    return Array.from(this.orders.values());
  }

  /**
   * Get active auction orders
   */
  public getActiveAuctions(): ProcessedOrder[] {
    return Array.from(this.orders.values())
      .filter(order => order.status === OrderStatus.AUCTION_ACTIVE);
  }

  /**
   * Schedule auction start
   */
  private async scheduleAuctionStart(orderHash: string, startTime: number): Promise<void> {
    const currentTime = Math.floor(Date.now() / 1000);
    const delay = Math.max(0, (startTime - currentTime) * 1000);

    if (delay > 0) {
      const timer = setTimeout(async () => {
        logger.info('Scheduled auction start triggered', { orderHash });
        await this.startDutchAuction(orderHash);
        this.auctionTimers.delete(orderHash);
      }, delay);

      this.auctionTimers.set(orderHash, timer);
      logger.info('Auction start scheduled', { orderHash, delay: delay / 1000 });
    } else {
      // Start immediately if time has passed
      await this.startDutchAuction(orderHash);
    }
  }

  /**
   * Schedule auction end
   */
  private scheduleAuctionEnd(orderHash: string, endTime: number): void {
    const currentTime = Math.floor(Date.now() / 1000);
    const delay = Math.max(0, (endTime - currentTime) * 1000);

    if (delay > 0) {
      const timer = setTimeout(() => {
        const order = this.orders.get(orderHash);
        if (order && order.status === OrderStatus.AUCTION_ACTIVE) {
          order.status = OrderStatus.EXPIRED;
          order.updatedAt = new Date();
          
          logger.info('Auction expired', { orderHash });
          
          if (this.webSocketService) {
            this.webSocketService.broadcastOrderUpdated(orderHash, order.dutchOrder, 'status');
          }
        }
        this.auctionTimers.delete(orderHash);
      }, delay);

      this.auctionTimers.set(orderHash, timer);
      logger.info('Auction end scheduled', { orderHash, delay: delay / 1000 });
    }
  }

  /**
   * Start periodic cleanup of expired orders
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      const currentTime = Math.floor(Date.now() / 1000);
      let expiredCount = 0;

      for (const [orderHash, order] of this.orders.entries()) {
        if (order.status === OrderStatus.AUCTION_ACTIVE && 
            currentTime > order.dutchOrder.endTime) {
          order.status = OrderStatus.EXPIRED;
          order.updatedAt = new Date();
          expiredCount++;

          // Clear any timers
          const timer = this.auctionTimers.get(orderHash);
          if (timer) {
            clearTimeout(timer);
            this.auctionTimers.delete(orderHash);
          }

          if (this.webSocketService) {
            this.webSocketService.broadcastOrderUpdated(orderHash, order.dutchOrder, 'status');
          }
        }
      }

      if (expiredCount > 0) {
        logger.info('Periodic cleanup completed', { expiredCount });
      }
    }, 60000); // Run every minute
  }

  /**
   * Get service statistics
   */
  public getStatistics() {
    const orders = Array.from(this.orders.values());
    return {
      totalOrders: orders.length,
      pending: orders.filter(o => o.status === OrderStatus.PENDING).length,
      verified: orders.filter(o => o.status === OrderStatus.VERIFIED).length,
      activeAuctions: orders.filter(o => o.status === OrderStatus.AUCTION_ACTIVE).length,
      filled: orders.filter(o => o.status === OrderStatus.FILLED).length,
      cancelled: orders.filter(o => o.status === OrderStatus.CANCELLED).length,
      expired: orders.filter(o => o.status === OrderStatus.EXPIRED).length,
      failed: orders.filter(o => o.status === OrderStatus.FAILED).length,
      activeTimers: this.auctionTimers.size
    };
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    // Clear all timers
    for (const timer of this.auctionTimers.values()) {
      clearTimeout(timer);
    }
    this.auctionTimers.clear();
    
    logger.info('OrderProcessingService cleanup completed');
  }
}

// Export singleton instance
export const orderProcessingService = new OrderProcessingService();
