import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { DutchAuctionOrder, AuctionStatus } from '../auction-details/types';
import { OrdersRoutes } from '../routes/orders';
import { websocketConnectionsTotal, recordWebSocketMessage, recordError } from '../utils/metrics';

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'pong' | 'order_update' | 'order_created' | 'order_filled' | 'order_cancelled' | 'profitable_opportunity';
  data?: any;
  timestamp: number;
  clientId?: string;
}

export interface WebSocketClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  isAlive: boolean;
  lastSeen: Date;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export interface SubscriptionFilter {
  maker?: string;
  makerAsset?: string;
  takerAsset?: string;
  status?: AuctionStatus[];
  minAmount?: string;
  maxAmount?: string;
}

export class WebSocketService extends EventEmitter {
  private server: WebSocket.Server;
  private clients: Map<string, WebSocketClient> = new Map();
  private orderRoutes: OrdersRoutes;
  private heartbeatInterval: NodeJS.Timeout = setInterval(() => {}, 0);
  private port: number;

  constructor(port: number = 8081, orderRoutes?: OrdersRoutes) {
    super();
    this.port = port;
    this.orderRoutes = orderRoutes || {} as OrdersRoutes; // Temporary placeholder
    this.server = new WebSocket.Server({ port });
    this.setupServer();
    this.startHeartbeat();
    
    logger.info(`WebSocket service started on port ${port}`);
  }

  // Method to update the OrdersRoutes reference after initialization
  public setOrderRoutes(orderRoutes: OrdersRoutes): void {
    this.orderRoutes = orderRoutes;
  }

  private setupServer(): void {
    this.server.on('connection', (ws: WebSocket, request) => {
      const clientId = this.generateClientId();
      const client: WebSocketClient = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        isAlive: true,
        lastSeen: new Date(),
        userAgent: request.headers['user-agent'],
        ipAddress: request.socket.remoteAddress
      };

      this.clients.set(clientId, client);
      
      // Update WebSocket connections metric
      websocketConnectionsTotal.set(this.clients.size);
      
      logger.info('WebSocket client connected', {
        clientId,
        totalClients: this.clients.size,
        userAgent: client.userAgent,
        ipAddress: client.ipAddress
      });

      // Send welcome message
      this.sendMessage(client, {
        type: 'ping',
        data: {
          clientId,
          message: 'Connected to DeFi Relayer WebSocket Service',
          serverTime: Date.now()
        },
        timestamp: Date.now()
      });

      // Handle messages from client
      ws.on('message', (message: Buffer) => {
        try {
          const parsedMessage: WebSocketMessage = JSON.parse(message.toString());
          this.handleClientMessage(client, parsedMessage);
        } catch (error) {
          logger.error('Invalid WebSocket message', { 
            clientId, 
            error: error instanceof Error ? error.message : 'Unknown error',
            rawMessage: message.toString().slice(0, 200) // Log first 200 chars
          });
          
          this.sendMessage(client, {
            type: 'ping',
            data: { error: 'Invalid message format' },
            timestamp: Date.now()
          });
        }
      });

      // Handle client disconnection
      ws.on('close', () => {
        this.clients.delete(clientId);
        // Update WebSocket connections metric
        websocketConnectionsTotal.set(this.clients.size);
        
        logger.info('WebSocket client disconnected', {
          clientId,
          totalClients: this.clients.size
        });
      });

      // Handle WebSocket errors
      ws.on('error', (error) => {
        logger.error('WebSocket client error', { 
          clientId, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

      // Handle pong responses
      ws.on('pong', () => {
        client.isAlive = true;
        client.lastSeen = new Date();
      });
    });
  }

  private handleClientMessage(client: WebSocketClient, message: WebSocketMessage): void {
    client.lastSeen = new Date();
    
    // Record incoming WebSocket message metric
    recordWebSocketMessage(message.type, 'inbound');

    switch (message.type) {
      case 'ping':
        this.sendMessage(client, {
          type: 'pong',
          data: { serverTime: Date.now() },
          timestamp: Date.now()
        });
        break;

      case 'subscribe':
        this.handleSubscription(client, message.data);
        break;

      case 'unsubscribe':
        this.handleUnsubscription(client, message.data);
        break;

      default:
        logger.warn('Unknown WebSocket message type', { 
          clientId: client.id, 
          type: message.type 
        });
        this.sendMessage(client, {
          type: 'ping',
          data: { error: `Unknown message type: ${message.type}` },
          timestamp: Date.now()
        });
    }
  }

  private handleSubscription(client: WebSocketClient, subscriptionData: any): void {
    try {
      const { subscription, filters } = subscriptionData;
      
      if (!subscription) {
        this.sendMessage(client, {
          type: 'ping',
          data: { error: 'Subscription type is required' },
          timestamp: Date.now()
        });
        return;
      }

      // Add subscription with optional filters
      const subscriptionKey = this.createSubscriptionKey(subscription, filters);
      client.subscriptions.add(subscriptionKey);

      logger.info('Client subscribed', { 
        clientId: client.id, 
        subscription,
        filters,
        totalSubscriptions: client.subscriptions.size
      });

      this.sendMessage(client, {
        type: 'ping',
        data: { 
          message: `Subscribed to ${subscription}`,
          subscription,
          filters
        },
        timestamp: Date.now()
      });

      // Send current state for certain subscriptions
      if (subscription === 'orders') {
        this.sendCurrentOrders(client, filters);
      } else if (subscription === 'profitable_opportunities') {
        this.sendProfitableOpportunities(client, filters);
      }

    } catch (error) {
      logger.error('Error handling subscription', { 
        clientId: client.id, 
        error: error instanceof Error ? error.message : 'Unknown error',
        subscriptionData
      });
      
      this.sendMessage(client, {
        type: 'ping',
        data: { error: 'Failed to process subscription' },
        timestamp: Date.now()
      });
    }
  }

  private handleUnsubscription(client: WebSocketClient, unsubscriptionData: any): void {
    try {
      const { subscription, filters } = unsubscriptionData;
      
      if (subscription === 'all') {
        client.subscriptions.clear();
        logger.info('Client unsubscribed from all', { clientId: client.id });
      } else {
        const subscriptionKey = this.createSubscriptionKey(subscription, filters);
        client.subscriptions.delete(subscriptionKey);
        logger.info('Client unsubscribed', { 
          clientId: client.id, 
          subscription: subscriptionKey 
        });
      }

      this.sendMessage(client, {
        type: 'ping',
        data: { message: 'Unsubscribed successfully' },
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Error handling unsubscription', { 
        clientId: client.id, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private createSubscriptionKey(subscription: string, filters?: SubscriptionFilter): string {
    if (!filters) return subscription;
    
    const filterString = JSON.stringify(filters);
    return `${subscription}:${Buffer.from(filterString).toString('base64')}`;
  }

  private sendCurrentOrders(client: WebSocketClient, filters?: SubscriptionFilter): void {
    try {
      const orders = this.orderRoutes.getAllOrders();
      let filteredOrders = orders;

      // Apply filters if provided
      if (filters) {
        filteredOrders = this.applyOrderFilters(orders, filters);
      }

      // Send orders in batches to avoid large messages
      const batchSize = 10;
      for (let i = 0; i < filteredOrders.length; i += batchSize) {
        const batch = filteredOrders.slice(i, i + batchSize);
        
        this.sendMessage(client, {
          type: 'order_update',
          data: {
            orders: batch,
            batch: Math.floor(i / batchSize) + 1,
            totalBatches: Math.ceil(filteredOrders.length / batchSize),
            total: filteredOrders.length
          },
          timestamp: Date.now()
        });
      }

    } catch (error) {
      logger.error('Error sending current orders', { 
        clientId: client.id, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private sendProfitableOpportunities(client: WebSocketClient, _filters?: any): void {
    // This would integrate with the profitable opportunities endpoint
    // For now, send a placeholder response
    this.sendMessage(client, {
      type: 'profitable_opportunity',
      data: {
        opportunities: [],
        count: 0,
        message: 'No profitable opportunities available'
      },
      timestamp: Date.now()
    });
  }

  private applyOrderFilters(orders: any[], filters: SubscriptionFilter): any[] {
    return orders.filter(order => {
      if (filters.maker && order.maker.toLowerCase() !== filters.maker.toLowerCase()) {
        return false;
      }
      
      if (filters.makerAsset && order.makerAsset.toLowerCase() !== filters.makerAsset.toLowerCase()) {
        return false;
      }
      
      if (filters.takerAsset && order.takerAsset.toLowerCase() !== filters.takerAsset.toLowerCase()) {
        return false;
      }
      
      if (filters.status && !filters.status.includes(order.status)) {
        return false;
      }
      
      if (filters.minAmount) {
        try {
          if (BigInt(order.makerAmount) < BigInt(filters.minAmount)) {
            return false;
          }
        } catch {
          // Invalid amount format, skip filter
        }
      }
      
      if (filters.maxAmount) {
        try {
          if (BigInt(order.makerAmount) > BigInt(filters.maxAmount)) {
            return false;
          }
        } catch {
          // Invalid amount format, skip filter
        }
      }
      
      return true;
    });
  }

  private sendMessage(client: WebSocketClient, message: WebSocketMessage): void {
    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
        // Record outbound WebSocket message metric
        recordWebSocketMessage(message.type, 'outbound');
      }
    } catch (error) {
      recordError('websocket_send_failed', 'websocket');
      logger.error('Failed to send WebSocket message', { 
        clientId: client.id, 
        error: error instanceof Error ? error.message : 'Unknown error',
        messageType: message.type
      });
    }
  }

  private broadcast(message: WebSocketMessage, subscriptionFilter?: (client: WebSocketClient) => boolean): void {
    let sentCount = 0;
    let failedCount = 0;

    this.clients.forEach(client => {
      try {
        if (subscriptionFilter && !subscriptionFilter(client)) {
          return;
        }

        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify(message));
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        logger.error('Failed to broadcast message to client', { 
          clientId: client.id, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failedCount++;
      }
    });

    logger.debug('WebSocket broadcast completed', { 
      messageType: message.type,
      sentCount,
      failedCount,
      totalClients: this.clients.size
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          logger.info('Terminating inactive WebSocket client', { clientId });
          client.ws.terminate();
          this.clients.delete(clientId);
          return;
        }

        client.isAlive = false;
        
        try {
          client.ws.ping();
        } catch (error) {
          logger.error('Failed to ping WebSocket client', { 
            clientId, 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          this.clients.delete(clientId);
        }
      });
    }, 30000); // 30 seconds
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for integration with order management

  public broadcastOrderCreated(order: DutchAuctionOrder): void {
    this.broadcast({
      type: 'order_created',
      data: { order },
      timestamp: Date.now()
    }, (client) => {
      return Array.from(client.subscriptions).some(sub => 
        sub.startsWith('orders') || sub.startsWith('order_created')
      );
    });
  }

  public broadcastOrderUpdated(orderHash: string, order: any, updateType: 'status' | 'fill' | 'cancel'): void {
    let messageType: WebSocketMessage['type'];
    
    switch (updateType) {
      case 'fill':
        messageType = 'order_filled';
        break;
      case 'cancel':
        messageType = 'order_cancelled';
        break;
      default:
        messageType = 'order_update';
    }

    this.broadcast({
      type: messageType,
      data: { orderHash, order, updateType },
      timestamp: Date.now()
    }, (client) => {
      return Array.from(client.subscriptions).some(sub => 
        sub.startsWith('orders') || sub.startsWith(messageType)
      );
    });
  }

  public broadcastProfitableOpportunity(opportunity: any): void {
    this.broadcast({
      type: 'profitable_opportunity',
      data: { opportunity },
      timestamp: Date.now()
    }, (client) => {
      return Array.from(client.subscriptions).some(sub => 
        sub.startsWith('profitable_opportunities') || sub.startsWith('profitable_opportunity')
      );
    });
  }

  public getStatus(): object {
    const clientStats = Array.from(this.clients.values()).reduce((stats, client) => {
      stats.totalSubscriptions += client.subscriptions.size;
      client.subscriptions.forEach(sub => {
        const baseType = sub.split(':')[0];
        stats.subscriptionTypes[baseType] = (stats.subscriptionTypes[baseType] || 0) + 1;
      });
      return stats;
    }, { totalSubscriptions: 0, subscriptionTypes: {} as Record<string, number> });

    return {
      port: this.port,
      connectedClients: this.clients.size,
      totalSubscriptions: clientStats.totalSubscriptions,
      subscriptionTypes: clientStats.subscriptionTypes,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  public async stop(): Promise<void> {
    logger.info('Stopping WebSocket service...');
    
    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    this.clients.forEach(client => {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch (error) {
        logger.error('Error closing WebSocket client', { 
          clientId: client.id, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.clients.clear();

    // Close the server
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          logger.error('Error stopping WebSocket server', { error });
          reject(error);
        } else {
          logger.info('WebSocket service stopped');
          resolve();
        }
      });
    });
  }
}
