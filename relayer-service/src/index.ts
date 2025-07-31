import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { metricsMiddleware, metricsRoute } from './middleware/metricsMiddleware';
import { healthRouter } from './routes/health';
// Initialize metrics early
import './utils/metrics';
import { EscrowMonitor } from './escrow-monitor/EscrowMonitor';
import { createEscrowRouter } from './routes/escrow';
import { loadContractsFromEnv } from './escrow-monitor/config';
import { OrdersRoutes } from './routes/orders';
import { WebSocketService } from './services/WebSocketService';
import { PriceUpdateService } from './services/PriceUpdateService';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Add metrics middleware to track all HTTP requests
app.use(metricsMiddleware);

// Initialize Escrow Monitor
const escrowMonitor = new EscrowMonitor({
  alchemyApiKey: process.env['ALCHEMY_API_KEY'] || '',
  network: 'sepolia',
  contracts: loadContractsFromEnv(),
  webhookUrl: process.env['ESCROW_WEBHOOK_URL'],
  enableLogging: process.env['NODE_ENV'] !== 'production'
});

escrowMonitor.on('escrow:event', (event) => {
  logger.info('Escrow Event:', event);
});

escrowMonitor.on('escrow:state_change', (state) => {
  logger.info('Escrow State Changed:', state);
});

escrowMonitor.start().catch(error => {
  logger.error('Failed to start Escrow Monitor:', error);
});

// Initialize WebSocket Service first (without OrdersRoutes)
const wsPort = parseInt(process.env['WS_PORT'] || '8081');
const webSocketService = new WebSocketService(wsPort);

// Now create OrdersRoutes with WebSocket service
const ordersRoutes = new OrdersRoutes(webSocketService);

// Update WebSocket service with the correct OrdersRoutes reference
webSocketService.setOrderRoutes(ordersRoutes);

// Initialize real-time price update service
const priceUpdateInterval = parseInt(process.env['PRICE_UPDATE_INTERVAL'] || '30000'); // 30 seconds default
const enableRealTimeUpdates = process.env['ENABLE_REALTIME_UPDATES'] !== 'false'; // enabled by default

const priceUpdateService = new PriceUpdateService(
  ordersRoutes,
  webSocketService,
  {
    updateInterval: priceUpdateInterval,
    enableRealTimeUpdates
  }
);

// Start price update service
priceUpdateService.start();

// Set up event listeners for order updates
webSocketService.on('order_created', (order) => {
  logger.info('Order created via WebSocket', { orderHash: order.orderHash });
});

webSocketService.on('order_updated', (orderHash, _order, updateType) => {
  logger.info('Order updated via WebSocket', { orderHash, updateType });
});

// Routes
app.get('/metrics', metricsRoute);
app.use('/health', healthRouter);
app.use('/api/escrow', createEscrowRouter(escrowMonitor));
app.use('/api/orders', ordersRoutes.getRouter());

// Error handling middleware
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Relayer service started on port ${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
  server.close(async () => {
    try {
      // Stop price update service
      priceUpdateService.stop();
      logger.info('Price update service stopped');
      
      // Stop WebSocket service
      await webSocketService.stop();
      logger.info('WebSocket service stopped');
      
      // Stop Escrow monitor
      await escrowMonitor.stop();
      logger.info('Escrow monitor stopped');
      
      logger.info('Process terminated gracefully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
