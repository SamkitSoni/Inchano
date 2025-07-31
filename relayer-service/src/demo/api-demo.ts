#!/usr/bin/env ts-node

import express from 'express';
import cors from 'cors';
import { logger } from '../utils/logger';
import { errorHandler } from '../middleware/errorHandler';
import { healthRouter } from '../routes/health';
import { OrdersRoutes } from '../routes/orders';
import { WebSocketService } from '../services/WebSocketService';

/**
 * Standalone API Demo Server
 * 
 * This demonstrates the RESTful API endpoints for dApp integration
 * without requiring external services like Alchemy API or escrow monitoring.
 */

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Orders Management
const ordersRoutes = new OrdersRoutes();

// Initialize WebSocket Service
const wsPort = parseInt(process.env['WS_PORT'] || '8081');
const webSocketService = new WebSocketService(wsPort, ordersRoutes);

// Set up event listeners for order updates
webSocketService.on('order_created', (order) => {
  logger.info('Order created via WebSocket', { orderHash: order.orderHash });
});

webSocketService.on('order_updated', (orderHash, _order, updateType) => {
  logger.info('Order updated via WebSocket', { orderHash, updateType });
});

// Routes
app.use('/health', healthRouter);
app.use('/api/orders', ordersRoutes.getRouter());

// API Documentation endpoint
app.get('/api/docs', (_req, res) => {
  res.json({
    success: true,
    data: {
      title: 'DeFi Relayer Service API',
      version: '1.0.0',
      description: 'RESTful API for dApp integration with order management and status updates',
      baseUrl: `http://localhost:${PORT}/api`,
      webSocketUrl: `ws://localhost:${wsPort}`,
      endpoints: {
        orders: {
          'POST /orders': 'Create a new order',
          'GET /orders': 'List orders with filtering and pagination',
          'GET /orders/:orderHash': 'Get order by hash',
          'PATCH /orders/:orderHash': 'Update order status',
          'DELETE /orders/:orderHash': 'Cancel order',
          'GET /orders/:orderHash/status': 'Get order status with auction details',
          'GET /orders/:orderHash/auction': 'Get detailed auction information',
          'GET /orders/profitable/opportunities': 'Get profitable opportunities',
          'POST /orders/:orderHash/fill': 'Submit order fill transaction',
          'GET /orders/stats/metrics': 'Get order metrics and statistics'
        },
        webSocket: {
          'ws://localhost:8081': 'WebSocket endpoint for real-time updates',
          subscriptions: ['orders', 'profitable_opportunities', 'order_created', 'order_filled', 'order_cancelled']
        }
      },
      documentation: 'See /src/docs/api-documentation.md for detailed API documentation'
    }
  });
});

// Example data endpoint for demo purposes
app.get('/api/demo/sample-order', (_req, res) => {
  const currentTime = Math.floor(Date.now() / 1000);
  const sampleOrder = {
    maker: '0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8',
    receiver: '0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8',
    makerAsset: '0xA0b86a33E6b2d8D1e7c3e4F5a6B7c8D9E0f1a2b3',
    takerAsset: '0xB1c97b44F7d1f9e8c4e5F6a7B8c9D0e1F2a3b4c5',
    makerAmount: '1000000000000000000', // 1 ETH
    takerAmount: '2000000000000000000', // 2 ETH
    startTime: currentTime,
    endTime: currentTime + 3600, // 1 hour from now
    startPrice: '2000000000000000000',
    endPrice: '1800000000000000000', // 10% price decay
    auctionStartTime: currentTime,
    auctionEndTime: currentTime + 3600,
    signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
  };

  res.json({
    success: true,
    data: {
      sampleOrder,
      description: 'Use this sample order data to test the POST /api/orders endpoint',
      usage: `curl -X POST http://localhost:${PORT}/api/orders -H "Content-Type: application/json" -d '${JSON.stringify(sampleOrder)}'`
    }
  });
});

// WebSocket status endpoint
app.get('/api/websocket/status', (_req, res) => {
  res.json({
    success: true,
    data: webSocketService.getStatus()
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 DeFi Relayer API Demo Server started on port ${PORT}`);
  logger.info(`📖 API Documentation: http://localhost:${PORT}/api/docs`);
  logger.info(`🔗 WebSocket Service: ws://localhost:${wsPort}`);
  logger.info(`📊 Health Check: http://localhost:${PORT}/health`);
  logger.info(`📝 Sample Order: http://localhost:${PORT}/api/demo/sample-order`);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
  server.close(async () => {
    try {
      // Stop WebSocket service
      await webSocketService.stop();
      logger.info('WebSocket service stopped');
      
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
