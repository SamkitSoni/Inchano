import { WebSocketApi, OrderEventType, NetworkEnum } from '@1inch/fusion-sdk';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import winston from 'winston';

interface ResolverConnection {
    id: string;
    ws: WebSocket;
    isAlive: boolean;
    lastSeen: Date;
}

interface BroadcastMessage {
    type: string;
    timestamp: Date;
    data: any;
}

class FusionOrderGateway extends EventEmitter {
    private wsApi: WebSocketApi;
    private resolvers: Map<string, ResolverConnection> = new Map();
    private wsServer: WebSocket.Server;
    private logger: winston.Logger;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private isConnected = false;

    constructor(port: number = 8080) {
        super();
        
        // Initialize logger
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'fusion-gateway.log' })
            ]
        });

        // Initialize WebSocket API for 1inch Fusion+
        this.wsApi = new WebSocketApi({
            url: 'wss://api.1inch.dev/fusion-plus/ws',
            network: NetworkEnum.ETHEREUM,
            lazyInit: true
        });

        // Initialize WebSocket server for resolver connections
        this.wsServer = new WebSocket.Server({ port });
        this.setupResolverServer();
    }

    public async start(): Promise<void> {
        try {
            this.logger.info('Starting Fusion+ Order Gateway...');
            
            // Initialize 1inch WebSocket connection
            this.wsApi.init();
            this.setupEventListeners();
            
            // Start heartbeat for resolver connections
            this.startHeartbeat();
            
            this.logger.info('Fusion+ Order Gateway started successfully');
        } catch (error) {
            this.logger.error('Failed to start gateway:', error);
            throw error;
        }
    }

    private setupEventListeners(): void {
        // Connection events
        this.wsApi.onOpen(() => {
            this.logger.info('Connected to 1inch Fusion+ WebSocket');
            this.isConnected = true;
            this.reconnectAttempts = 0;
        });

        this.wsApi.onClose(() => {
            this.logger.warn('1inch WebSocket connection closed');
            this.isConnected = false;
            this.handleReconnection();
        });

        this.wsApi.onError((error) => {
            this.logger.error('1inch WebSocket error:', error);
            this.isConnected = false;
        });

        // Order events
        this.wsApi.order.onOrder((data: OrderEventType) => {
            this.logger.info('Order event received:', { event: data.event });
            this.handleOrderEvent(data);
        });

        // Specific order event handlers
        this.wsApi.order.onOrderCreated((data) => {
            this.logger.info('New order created:', { orderHash: (data as any).result?.orderHash });
            this.broadcastToResolvers({
                type: 'order_created',
                timestamp: new Date(),
                data
            });
        });

        this.wsApi.order.onOrderFilled((data) => {
            this.logger.info('Order filled:', { orderHash: (data as any).result?.orderHash });
            this.broadcastToResolvers({
                type: 'order_filled',
                timestamp: new Date(),
                data
            });
        });

        this.wsApi.order.onOrderCancelled((data) => {
            this.logger.info('Order cancelled:', { orderHash: (data as any).result?.orderHash });
            this.broadcastToResolvers({
                type: 'order_cancelled',
                timestamp: new Date(),
                data
            });
        });

        // RPC events
        this.wsApi.rpc.onGetActiveOrders((data) => {
            this.logger.info('Active orders received:', { count: data.items?.length });
            this.broadcastToResolvers({
                type: 'active_orders',
                timestamp: new Date(),
                data
            });
        });
    }

    private setupResolverServer(): void {
        this.wsServer.on('connection', (ws: WebSocket, request) => {
            const resolverId = this.generateResolverId();
            const resolver: ResolverConnection = {
                id: resolverId,
                ws,
                isAlive: true,
                lastSeen: new Date()
            };

            this.resolvers.set(resolverId, resolver);
            this.logger.info('Resolver connected:', { 
                resolverId, 
                totalResolvers: this.resolvers.size,
                clientIP: request.socket.remoteAddress 
            });

            // Handle resolver messages
            ws.on('message', (message: Buffer) => {
                try {
                    const data = JSON.parse(message.toString());
                    this.handleResolverMessage(resolverId, data);
                } catch (error) {
                    this.logger.error('Invalid message from resolver:', { resolverId, error });
                }
            });

            // Handle resolver disconnection
            ws.on('close', () => {
                this.resolvers.delete(resolverId);
                this.logger.info('Resolver disconnected:', { 
                    resolverId, 
                    totalResolvers: this.resolvers.size 
                });
            });

            // Handle pong responses
            ws.on('pong', () => {
                resolver.isAlive = true;
                resolver.lastSeen = new Date();
            });

            // Send welcome message
            this.sendToResolver(resolverId, {
                type: 'welcome',
                timestamp: new Date(),
                data: { resolverId, status: 'connected' }
            });
        });
    }

    private handleOrderEvent(data: OrderEventType): void {
        // Emit event for internal listeners
        this.emit('order_event', data);

        // Broadcast to all connected resolvers
        this.broadcastToResolvers({
            type: 'order_event',
            timestamp: new Date(),
            data
        });
    }

    private handleResolverMessage(resolverId: string, message: any): void {
        const resolver = this.resolvers.get(resolverId);
        if (!resolver) return;

        resolver.lastSeen = new Date();

        switch (message.type) {
            case 'ping':
                this.sendToResolver(resolverId, {
                    type: 'pong',
                    timestamp: new Date(),
                    data: {}
                });
                break;
            
            case 'get_active_orders':
                this.wsApi.rpc.getActiveOrders(message.params || {});
                break;
            
            case 'subscribe_orders':
                // Handle order subscription preferences
                this.logger.info('Resolver subscribed to orders:', { resolverId });
                break;
            
            case 'get_profitable_opportunities':
                // Emit request for profitable opportunities
                this.emit('request_profitable_opportunities', {
                    resolverId,
                    gasPrice: message.params?.gasPrice || '20000000000'
                });
                break;
                
            default:
                this.logger.warn('Unknown message type from resolver:', { 
                    resolverId, 
                    type: message.type 
                });
        }
    }

    private broadcastToResolvers(message: BroadcastMessage): void {
        const messageStr = JSON.stringify(message);
        let successCount = 0;
        let failureCount = 0;

        this.resolvers.forEach((resolver, resolverId) => {
            try {
                if (resolver.ws.readyState === WebSocket.OPEN) {
                    resolver.ws.send(messageStr);
                    successCount++;
                } else {
                    failureCount++;
                }
            } catch (error) {
                this.logger.error('Failed to send message to resolver:', { 
                    resolverId, 
                    error 
                });
                failureCount++;
            }
        });

        this.logger.debug('Broadcast completed:', { 
            type: message.type,
            successCount,
            failureCount,
            totalResolvers: this.resolvers.size 
        });
    }

    private sendToResolver(resolverId: string, message: BroadcastMessage): void {
        const resolver = this.resolvers.get(resolverId);
        if (!resolver) return;

        try {
            if (resolver.ws.readyState === WebSocket.OPEN) {
                resolver.ws.send(JSON.stringify(message));
            }
        } catch (error) {
            this.logger.error('Failed to send message to resolver:', { resolverId, error });
        }
    }

    private startHeartbeat(): void {
        setInterval(() => {
            this.resolvers.forEach((resolver, resolverId) => {
                if (!resolver.isAlive) {
                    resolver.ws.terminate();
                    this.resolvers.delete(resolverId);
                    this.logger.info('Removed inactive resolver:', { resolverId });
                    return;
                }

                resolver.isAlive = false;
                resolver.ws.ping();
            });
        }, 30000); // 30 seconds
    }

    private handleReconnection(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        
        this.logger.info(`Attempting to reconnect in ${delay}ms... (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.wsApi.init();
        }, delay);
    }

    private generateResolverId(): string {
        return `resolver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    public broadcastProfitableOpportunity(opportunity: any): void {
        this.logger.info('Broadcasting profitable opportunity:', {
            orderHash: opportunity.order?.orderHash,
            netProfit: opportunity.profitability?.netProfit
        });
        
        this.broadcastToResolvers({
            type: 'profitable_opportunity',
            timestamp: new Date(),
            data: opportunity
        });
    }

    public sendProfitableOpportunities(resolverId: string, opportunities: any[]): void {
        this.logger.info('Sending profitable opportunities to resolver:', {
            resolverId,
            count: opportunities.length
        });
        
        this.sendToResolver(resolverId, {
            type: 'profitable_opportunities',
            timestamp: new Date(),
            data: { opportunities }
        });
    }

    public getStatus(): object {
        return {
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            connectedResolvers: this.resolvers.size,
            resolvers: Array.from(this.resolvers.values()).map(r => ({
                id: r.id,
                isAlive: r.isAlive,
                lastSeen: r.lastSeen
            }))
        };
    }

    public async stop(): Promise<void> {
        this.logger.info('Stopping Fusion+ Order Gateway...');
        
        // Close all resolver connections
        this.resolvers.forEach((resolver) => {
            resolver.ws.close();
        });
        this.resolvers.clear();

        // Close WebSocket server
        this.wsServer.close();
        
        // Close 1inch WebSocket connection
        this.wsApi.close();
        
        this.logger.info('Fusion+ Order Gateway stopped');
    }
}

export default FusionOrderGateway;
