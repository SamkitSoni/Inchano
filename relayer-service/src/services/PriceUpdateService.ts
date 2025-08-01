import { logger } from '../utils/logger';
import { OrdersRoutes } from '../routes/orders';
import { WebSocketService } from './WebSocketService';
import { AuctionStatus } from '../auction-details/types';
import { AuctionCalculator } from '../auction-details/calculator';

export interface PriceUpdateConfig {
  updateInterval: number; // milliseconds
  enableRealTimeUpdates: boolean;
}

export class PriceUpdateService {
  private ordersService: OrdersRoutes;
  private webSocketService: WebSocketService;
  private calculator: AuctionCalculator;
  private config: PriceUpdateConfig;
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(
    ordersService: OrdersRoutes,
    webSocketService: WebSocketService,
    config: PriceUpdateConfig = {
      updateInterval: 30000, // 30 seconds default
      enableRealTimeUpdates: true
    }
  ) {
    this.ordersService = ordersService;
    this.webSocketService = webSocketService;
    this.calculator = new AuctionCalculator();
    this.config = config;
  }

  public start(): void {
    if (this.isRunning) {
      logger.warn('PriceUpdateService is already running');
      return;
    }

    if (!this.config.enableRealTimeUpdates) {
      logger.info('Real-time price updates are disabled');
      return;
    }

    this.isRunning = true;
    this.updateInterval = setInterval(() => {
      this.updateActivePrices();
    }, this.config.updateInterval);

    logger.info(`PriceUpdateService started with ${this.config.updateInterval}ms interval`);
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.isRunning = false;
    logger.info('PriceUpdateService stopped');
  }

  private updateActivePrices(): void {
    try {
      const activeOrders = this.ordersService.getAllOrders()
        .filter(order => order.status === AuctionStatus.ACTIVE);

      const currentTime = Math.floor(Date.now() / 1000);
      let updatedCount = 0;
      let expiredCount = 0;

      for (const order of activeOrders) {
        // Check if order has expired
        if (currentTime >= order.auctionEndTime) {
          this.ordersService.updateOrderStatus(order.orderHash, AuctionStatus.EXPIRED);
          this.webSocketService.broadcastOrderUpdated(order.orderHash, order, 'status');
          expiredCount++;
          continue;
        }

        // Calculate current price
        try {
          const auctionDetails = this.calculator.calculateAuctionDetails(order, currentTime);
          
          // Broadcast price update
          this.webSocketService.broadcastOrderUpdated(order.orderHash, {
            ...order,
            currentPrice: auctionDetails.currentPrice,
            timeRemaining: Math.max(0, order.auctionEndTime - currentTime),
            progress: Math.min(1, Math.max(0, (currentTime - order.auctionStartTime) / (order.auctionEndTime - order.auctionStartTime)))
          }, 'status');

          updatedCount++;
        } catch (error) {
          logger.error('Error calculating auction details for order', {
            orderHash: order.orderHash,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      if (updatedCount > 0 || expiredCount > 0) {
        logger.debug('Price update cycle completed', {
          activeOrders: activeOrders.length,
          updatedOrders: updatedCount,
          expiredOrders: expiredCount,
          timestamp: new Date().toISOString()
        });
      }

      // Broadcast profitable opportunities update
      this.broadcastProfitableOpportunities();

    } catch (error) {
      logger.error('Error in price update cycle', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private broadcastProfitableOpportunities(): void {
    try {
      const activeOrders = this.ordersService.getAllOrders()
        .filter(order => order.status === AuctionStatus.ACTIVE);

      const currentTime = Math.floor(Date.now() / 1000);
      const gasPrice = '20000000000'; // 20 gwei default
      const opportunities = [];

      for (const order of activeOrders) {
        if (currentTime >= order.auctionEndTime) {
          continue;
        }

        try {
          const calculationResult = this.calculator.calculateWithProfitability(order, gasPrice, currentTime);
          
          if (calculationResult.isProfitable) {
            const netProfitBigInt = BigInt(calculationResult.netProfit);
            const currentPriceBigInt = BigInt(calculationResult.currentPrice);
            const profitMargin = Number(netProfitBigInt * BigInt(10000) / currentPriceBigInt) / 10000;

            if (profitMargin >= 0.01) { // 1% minimum
              opportunities.push({
                orderHash: order.orderHash,
                currentPrice: calculationResult.currentPrice,
                netProfit: calculationResult.netProfit,
                gasEstimate: calculationResult.gasEstimate,
                profitMargin: profitMargin.toString(),
                timeRemaining: calculationResult.timeRemaining,
                auctionProgress: Math.min(1, Math.max(0, (currentTime - order.auctionStartTime) / (order.auctionEndTime - order.auctionStartTime)))
              });
            }
          }
        } catch (error) {
          // Skip problematic orders
          continue;
        }
      }

      if (opportunities.length > 0) {
        // Sort by profit margin (highest first)
        opportunities.sort((a, b) => 
          parseFloat(b.profitMargin) - parseFloat(a.profitMargin)
        );

        this.webSocketService.broadcastProfitableOpportunity({
          opportunities: opportunities.slice(0, 10), // Top 10 opportunities
          count: opportunities.length,
          timestamp: new Date().toISOString(),
          gasPrice
        });
      }

    } catch (error) {
      logger.error('Error broadcasting profitable opportunities', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public getStatus(): object {
    return {
      isRunning: this.isRunning,
      updateInterval: this.config.updateInterval,
      enableRealTimeUpdates: this.config.enableRealTimeUpdates,
      nextUpdate: this.updateInterval ? new Date(Date.now() + this.config.updateInterval).toISOString() : null
    };
  }

  public updateConfig(config: Partial<PriceUpdateConfig>): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...config };

    if (wasRunning && this.config.enableRealTimeUpdates) {
      this.start();
    }

    logger.info('PriceUpdateService configuration updated', this.config);
  }
}
