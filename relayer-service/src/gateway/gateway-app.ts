#!/usr/bin/env node

import FusionOrderGateway from './FusionOrderGateway';
import { AuctionMonitor, AuctionConfig } from './AuctionMonitor';
import winston from 'winston';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class GatewayApplication {
    private gateway: FusionOrderGateway;
    private auctionMonitor: AuctionMonitor;
    private logger: winston.Logger;

    constructor() {
        // Initialize logger
        this.logger = winston.createLogger({
            level: process.env['LOG_LEVEL'] || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
                })
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ 
                    filename: 'gateway-application.log',
                    format: winston.format.json()
                })
            ]
        });

        // Initialize auction monitor with configuration
        const auctionConfig: AuctionConfig = {
            priceUpdateInterval: parseInt(process.env['PRICE_UPDATE_INTERVAL'] || '5000'), // 5 seconds
            maxSlippage: parseFloat(process.env['MAX_SLIPPAGE'] || '0.05'), // 5%
            minProfitMargin: parseFloat(process.env['MIN_PROFIT_MARGIN'] || '0.01'), // 1%
            gasBuffer: parseFloat(process.env['GAS_BUFFER'] || '0.2') // 20%
        };

        this.auctionMonitor = new AuctionMonitor(auctionConfig);
        
        // Initialize gateway
        const wsPort = parseInt(process.env['WS_PORT'] || '8080');
        this.gateway = new FusionOrderGateway(wsPort);

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Gateway events
        this.gateway.on('order_event', (data) => {
            this.logger.info('Processing order event:', { 
                event: data.event,
                orderHash: (data as any).result?.orderHash 
            });
            
            // Convert Fusion+ order to auction order format if needed
            if (data.event === 'order_created') {
                this.handleNewOrder(data);
            } else if (data.event === 'order_filled' || data.event === 'order_cancelled') {
                this.handleOrderCompletion(data);
            }
        });

        // Auction monitor events
        this.auctionMonitor.on('profitable_opportunity', (opportunity) => {
            this.logger.info('Profitable opportunity detected:', {
                orderHash: opportunity.order.orderHash,
                netProfit: opportunity.profitability.netProfit,
                currentPrice: opportunity.profitability.currentPrice
            });

            // Broadcast opportunity to resolvers
            this.gateway.broadcastProfitableOpportunity(opportunity);
        });

        // Gateway events for profitable opportunities
        this.gateway.on('request_profitable_opportunities', (request) => {
            this.logger.info('Resolver requested profitable opportunities:', {
                resolverId: request.resolverId,
                gasPrice: request.gasPrice
            });
            
            const opportunities = this.auctionMonitor.getProfitableOpportunities(request.gasPrice);
            this.gateway.sendProfitableOpportunities(request.resolverId, opportunities);
        });

        this.auctionMonitor.on('order_expired', (order) => {
            this.logger.info('Order expired:', { orderHash: order.orderHash });
        });

        this.auctionMonitor.on('price_update', (details) => {
            this.logger.debug('Price updated:', {
                orderHash: details.orderHash,
                currentPrice: details.currentPrice,
                progress: details.progress
            });
        });

        // Process shutdown signals
        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception:', error);
            this.shutdown('uncaughtException');
        });
        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection:', { reason, promise });
        });
    }

    private handleNewOrder(orderData: any): void {
        try {
            // Extract order information from Fusion+ event
            const result = orderData.result;
            if (!result) return;

            // Convert to auction order format
            const auctionOrder = this.convertToAuctionOrder(result);
            if (auctionOrder) {
                this.auctionMonitor.addOrder(auctionOrder);
                this.logger.info('Order added to auction monitoring:', { 
                    orderHash: auctionOrder.orderHash 
                });
            }
        } catch (error) {
            this.logger.error('Error processing new order:', error);
        }
    }

    private handleOrderCompletion(orderData: any): void {
        try {
            const result = orderData.result;
            const orderHash = result?.orderHash;
            
            if (orderHash && this.auctionMonitor.isMonitoring(orderHash)) {
                this.auctionMonitor.removeOrder(orderHash);
                this.logger.info('Order removed from monitoring:', { 
                    orderHash,
                    event: orderData.event 
                });
            }
        } catch (error) {
            this.logger.error('Error processing order completion:', error);
        }
    }

    private convertToAuctionOrder(fusionOrder: any): any {
        // Convert Fusion+ order format to auction order format
        // This is a simplified conversion - would need more complex logic in production
        const currentTime = Math.floor(Date.now() / 1000);
        
        return {
            orderHash: fusionOrder.orderHash,
            maker: fusionOrder.order?.maker || '',
            receiver: fusionOrder.order?.receiver || '',
            makerAsset: fusionOrder.order?.makerAsset || '',
            takerAsset: fusionOrder.order?.takerAsset || '',
            makerAmount: fusionOrder.order?.makingAmount || '0',
            takerAmount: fusionOrder.order?.takingAmount || '0',
            startTime: currentTime, // Should be extracted from auction details
            endTime: currentTime + 3600, // Should be extracted from auction details
            startPrice: fusionOrder.order?.takingAmount || '0',
            endPrice: (BigInt(fusionOrder.order?.takingAmount || '0') * BigInt(90) / BigInt(100)).toString(), // 10% discount
            auctionStartTime: currentTime,
            auctionEndTime: currentTime + 3600,
            salt: fusionOrder.order?.salt || '',
            signature: fusionOrder.signature || ''
        };
    }

    public async start(): Promise<void> {
        try {
            this.logger.info('Starting Fusion+ Gateway Application...');

            // Start auction monitor
            this.auctionMonitor.start();
            this.logger.info('Auction monitor started');

            // Start WebSocket gateway
            await this.gateway.start();
            this.logger.info('WebSocket gateway started');

            this.logger.info('Fusion+ Gateway Application is running successfully', {
                wsPort: process.env['WS_PORT'] || '8080',
                logLevel: process.env['LOG_LEVEL'] || 'info'
            });

        } catch (error) {
            this.logger.error('Failed to start application:', error);
            process.exit(1);
        }
    }

    public async shutdown(signal: string): Promise<void> {
        this.logger.info(`Shutting down application (${signal})...`);

        try {
            // Stop auction monitor
            this.auctionMonitor.stop();
            this.logger.info('Auction monitor stopped');

            // Stop gateway
            await this.gateway.stop();
            this.logger.info('WebSocket gateway stopped');

            this.logger.info('Application shutdown complete');
            process.exit(0);
        } catch (error) {
            this.logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }

    public getStatus(): object {
        return {
            gateway: this.gateway.getStatus(),
            auctionMonitor: {
                activeOrders: this.auctionMonitor.getActiveOrderCount(),
                profitableOpportunities: this.auctionMonitor.getProfitableOpportunities().length
            },
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            timestamp: new Date().toISOString()
        };
    }

    // Public API methods for external interaction
    public async requestActiveOrders(): Promise<void> {
        // Trigger active orders request through WebSocket API
        this.logger.info('Requesting active orders from 1inch...');
        // The gateway will handle the RPC call and broadcast results
    }

    public getProfitableOpportunities(): Array<any> {
        return this.auctionMonitor.getProfitableOpportunities();
    }

    public updateAuctionConfig(config: Partial<AuctionConfig>): void {
        this.auctionMonitor.updateConfiguration(config);
        this.logger.info('Auction configuration updated:', config);
    }
}

// CLI interface
if (require.main === module) {
    const app = new GatewayApplication();
    
    // Handle CLI arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Fusion+ Order Broadcasting Gateway

Usage: node gateway-app.js [options]

Options:
  --help, -h          Show this help message
  --status, -s        Show application status and exit
  --config, -c        Show current configuration and exit

Environment Variables:
  WS_PORT             WebSocket server port (default: 8080)
  LOG_LEVEL           Log level (default: info)
  PRICE_UPDATE_INTERVAL  Price update interval in ms (default: 5000)
  MAX_SLIPPAGE        Maximum allowed slippage (default: 0.05)
  MIN_PROFIT_MARGIN   Minimum profit margin (default: 0.01)
  GAS_BUFFER          Gas estimation buffer (default: 0.2)

Examples:
  node gateway-app.js
  WS_PORT=9090 LOG_LEVEL=debug node gateway-app.js
        `);
        process.exit(0);
    }

    if (args.includes('--status') || args.includes('-s')) {
        console.log('Application Status:');
        console.log(JSON.stringify(app.getStatus(), null, 2));
        process.exit(0);
    }

    if (args.includes('--config') || args.includes('-c')) {
        console.log('Current Configuration:');
        console.log(JSON.stringify({
            WS_PORT: process.env['WS_PORT'] || '8080',
            LOG_LEVEL: process.env['LOG_LEVEL'] || 'info',
            PRICE_UPDATE_INTERVAL: process.env['PRICE_UPDATE_INTERVAL'] || '5000',
            MAX_SLIPPAGE: process.env['MAX_SLIPPAGE'] || '0.05',
            MIN_PROFIT_MARGIN: process.env['MIN_PROFIT_MARGIN'] || '0.01',
            GAS_BUFFER: process.env['GAS_BUFFER'] || '0.2'
        }, null, 2));
        process.exit(0);
    }

    // Start the application
    app.start().catch((error) => {
        console.error('Failed to start application:', error);
        process.exit(1);
    });
}

export default GatewayApplication;
