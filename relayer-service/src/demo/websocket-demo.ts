import WebSocket from 'ws';
import { logger } from '../utils/logger';

interface WebSocketMessage {
  type: string;
  data?: any;
  timestamp: number;
  clientId?: string;
}

class WebSocketDemoClient {
  private ws: WebSocket;
  private clientId: string | null = null;
  private isConnected: boolean = false;

  constructor(private url: string = 'ws://localhost:8081') {
    logger.info(`Attempting to connect to WebSocket server at ${this.url}`);
    this.ws = new WebSocket(this.url);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.ws.on('open', () => {
      this.isConnected = true;
      logger.info('✅ Connected to DeFi Relayer WebSocket');
      
      // Start demo sequence after connection
      setTimeout(() => this.runDemo(), 1000);
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        logger.error('Failed to parse WebSocket message', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          data: data.toString()
        });
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.isConnected = false;
      logger.info('❌ Disconnected from WebSocket', { 
        code, 
        reason: reason.toString() 
      });
    });

    this.ws.on('error', (error: Error) => {
      logger.error('WebSocket error:', { error: error.message });
    });
  }

  private handleMessage(message: WebSocketMessage): void {
    const timestamp = new Date(message.timestamp).toISOString();
    
    switch (message.type) {
      case 'ping':
        if (message.data?.clientId) {
          this.clientId = message.data.clientId;
          logger.info('🆔 Received client ID:', { 
            clientId: this.clientId,
            serverMessage: message.data.message 
          });
        } else if (message.data?.message) {
          logger.info('📨 Server message:', { 
            message: message.data.message,
            timestamp 
          });
        }
        break;

      case 'pong':
        logger.info('🏓 Pong received:', { 
          serverTime: message.data?.serverTime,
          timestamp 
        });
        break;

      case 'order_created':
        logger.info('🆕 Order created:', {
          orderHash: message.data?.order?.orderHash,
          maker: message.data?.order?.maker,
          status: message.data?.order?.status,
          timestamp
        });
        break;

      case 'order_update':
        logger.info('🔄 Order status update:', {
          orderHash: message.data?.orderHash,
          updateType: message.data?.updateType,
          status: message.data?.order?.status,
          currentPrice: message.data?.order?.currentPrice,
          timeRemaining: message.data?.order?.timeRemaining,
          timestamp
        });
        break;

      case 'order_filled':
        logger.info('✅ Order filled:', {
          orderHash: message.data?.orderHash,
          updateType: message.data?.updateType,
          timestamp
        });
        break;

      case 'order_cancelled':
        logger.info('❌ Order cancelled:', {
          orderHash: message.data?.orderHash,
          updateType: message.data?.updateType,
          timestamp
        });
        break;

      case 'profitable_opportunity':
        logger.info('💰 Profitable opportunities:', {
          count: message.data?.opportunities?.length || 0,
          totalCount: message.data?.count,
          gasPrice: message.data?.gasPrice,
          timestamp
        });
        
        if (message.data?.opportunities?.length > 0) {
          message.data.opportunities.forEach((opp: any, index: number) => {
            logger.info(`  Opportunity ${index + 1}:`, {
              orderHash: opp.orderHash,
              profitMargin: opp.profitMargin,
              netProfit: opp.netProfit,
              timeRemaining: opp.timeRemaining
            });
          });
        }
        break;

      default:
        logger.info('📬 Unknown message type:', { 
          type: message.type, 
          data: message.data,
          timestamp 
        });
    }
  }

  private sendMessage(type: string, data: any = {}): void {
    if (!this.isConnected) {
      logger.warn('Cannot send message: not connected');
      return;
    }

    const message: WebSocketMessage = {
      type,
      data,
      timestamp: Date.now()
    };

    try {
      this.ws.send(JSON.stringify(message));
      logger.debug('📤 Sent message:', { type, data });
    } catch (error) {
      logger.error('Failed to send message:', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        type,
        data 
      });
    }
  }

  private async runDemo(): Promise<void> {
    logger.info('🚀 Starting WebSocket demo sequence...');

    // Step 1: Send ping
    logger.info('Step 1: Sending ping...');
    this.sendMessage('ping', {});
    await this.sleep(2000);

    // Step 2: Subscribe to orders
    logger.info('Step 2: Subscribing to all orders...');
    this.sendMessage('subscribe', {
      subscription: 'orders'
    });
    await this.sleep(2000);

    // Step 3: Subscribe to orders with filters
    logger.info('Step 3: Subscribing to orders with maker filter...');
    this.sendMessage('subscribe', {
      subscription: 'orders',
      filters: {
        maker: '0x1234567890abcdef1234567890abcdef12345678',
        status: ['active', 'pending']
      }
    });
    await this.sleep(2000);

    // Step 4: Subscribe to profitable opportunities
    logger.info('Step 4: Subscribing to profitable opportunities...');
    this.sendMessage('subscribe', {
      subscription: 'profitable_opportunities'
    });
    await this.sleep(5000);

    // Step 5: Create a test order via REST API (simulated)
    logger.info('Step 5: To see real events, create orders via the REST API:');
    logger.info('  POST http://localhost:3000/api/orders');
    logger.info('  Example payload:', {
      maker: '0x1234567890abcdef1234567890abcdef12345678',
      receiver: '0xabcdef1234567890abcdef1234567890abcdef12',
      makerAsset: '0xA0b86a33E6C9ad6c5a2A97B18FA8B22346EBA93f', // USDC
      takerAsset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      makerAmount: '1000000000000000000',
      takerAmount: '2000000000000000000',
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 3600,
      startPrice: '2000000000000000000',
      endPrice: '1000000000000000000',
      auctionStartTime: Math.floor(Date.now() / 1000),
      auctionEndTime: Math.floor(Date.now() / 1000) + 3600,
      signature: '0x1234...'
    });

    // Keep connection alive and listen for events
    logger.info('🔄 Demo running... Listening for real-time events...');
    logger.info('   (Press Ctrl+C to exit)');
    
    // Send periodic pings to keep connection alive
    const pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.sendMessage('ping', {});
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);

    // Unsubscribe after 5 minutes for demo purposes
    setTimeout(() => {
      logger.info('Step 6: Unsubscribing from events (demo cleanup)...');
      this.sendMessage('unsubscribe', { subscription: 'all' });
      clearInterval(pingInterval);
      setTimeout(() => this.disconnect(), 2000);
    }, 300000); // 5 minutes
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public disconnect(): void {
    if (this.ws) {
      logger.info('🔌 Disconnecting from WebSocket...');
      this.ws.close();
    }
  }
}

// Demo script execution
async function main(): Promise<void> {
  logger.info('🎬 Starting WebSocket Demo Client');
  logger.info('Make sure the relayer service is running on port 3000 and WebSocket on port 8081');

  const client = new WebSocketDemoClient();

  // Handle process termination
  process.on('SIGINT', () => {
    logger.info('🛑 Received SIGINT, shutting down gracefully...');
    client.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('🛑 Received SIGTERM, shutting down gracefully...');
    client.disconnect();
    process.exit(0);
  });
}

// Run the demo if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    logger.error('Demo failed:', { error: error.message });
    process.exit(1);
  });
}

export { WebSocketDemoClient };
