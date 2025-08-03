import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { logger } from '../utils/logger';
import { SimpleOrderService } from './simple-order.service';

export interface WebSocketMessage {
  type: 'order_created' | 'order_updated' | 'order_cancelled' | 'auction_started' | 'price_update';
  data: any;
  timestamp: number;
}

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Set<any> = new Set();

  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws, req) => {
      logger.info('WebSocket client connected', { 
        clientCount: this.clients.size + 1,
        userAgent: req.headers['user-agent'] 
      });

      this.clients.add(ws);

      // Send welcome message
      this.sendToClient(ws, {
        type: 'order_updated',
        data: { message: 'Connected to Inchano Relayer WebSocket' },
        timestamp: Date.now()
      });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          logger.debug('WebSocket message received', { data });
          
          // Handle client messages (ping, subscribe, register as resolver, etc.)
          if (data.type === 'ping') {
            this.sendToClient(ws, {
              type: 'order_updated',
              data: { type: 'pong' },
              timestamp: Date.now()
            });
          } else if (data.type === 'register_resolver') {
            // Register this connection as a resolver for order broadcasting
            SimpleOrderService.addResolver(ws);
            this.sendToClient(ws, {
              type: 'order_updated',
              data: { type: 'resolver_registered', message: 'Successfully registered as resolver' },
              timestamp: Date.now()
            });
            logger.info('WebSocket client registered as resolver');
          }
        } catch (error) {
          logger.error('Invalid WebSocket message', { error, message: message.toString() });
        }
      });

      ws.on('close', (code, reason) => {
        logger.info('WebSocket client disconnected', { 
          code, 
          reason: reason.toString(),
          clientCount: this.clients.size - 1 
        });
        this.clients.delete(ws);
        // Remove from resolver list if it was registered
        SimpleOrderService.removeResolver(ws);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket client error', { error });
        this.clients.delete(ws);
        SimpleOrderService.removeResolver(ws);
      });
    });

    logger.info('WebSocket server initialized');
  }

  broadcast(message: WebSocketMessage): void {
    if (!this.wss) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        try {
          client.send(messageStr);
          sentCount++;
        } catch (error) {
          logger.error('Failed to send WebSocket message to client', { error });
          this.clients.delete(client);
        }
      } else {
        this.clients.delete(client);
      }
    });

    logger.debug('WebSocket message broadcasted', { 
      type: message.type, 
      clientCount: sentCount 
    });
  }

  private sendToClient(client: any, message: WebSocketMessage): void {
    if (client.readyState === client.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        logger.error('Failed to send WebSocket message to client', { error });
        this.clients.delete(client);
      }
    }
  }

  // Specific broadcast methods for different events
  broadcastOrderCreated(orderId: string, orderData: any): void {
    this.broadcast({
      type: 'order_created',
      data: { orderId, order: orderData },
      timestamp: Date.now()
    });
  }

  broadcastOrderUpdated(orderId: string, orderData: any, updateType: string): void {
    this.broadcast({
      type: 'order_updated',
      data: { orderId, order: orderData, updateType },
      timestamp: Date.now()
    });
  }

  broadcastOrderCancelled(orderId: string): void {
    this.broadcast({
      type: 'order_cancelled',
      data: { orderId },
      timestamp: Date.now()
    });
  }

  broadcastAuctionStarted(orderId: string, auctionData: any): void {
    this.broadcast({
      type: 'auction_started',
      data: { orderId, auction: auctionData },
      timestamp: Date.now()
    });
  }

  broadcastPriceUpdate(orderId: string, currentPrice: string, timeRemaining: number): void {
    this.broadcast({
      type: 'price_update',
      data: { orderId, currentPrice, timeRemaining },
      timestamp: Date.now()
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    if (this.wss) {
      this.wss.close();
      this.clients.clear();
      logger.info('WebSocket server closed');
    }
  }
}
