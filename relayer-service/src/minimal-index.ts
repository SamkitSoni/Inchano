import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import WebSocket from 'ws';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3001;
const WS_PORT = process.env['WS_PORT'] || 8081;

// Store orders in memory for testing
const orders = new Map<string, any>();
let wsClients: Set<WebSocket> = new Set();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      api: 'online',
      websocket: 'online'
    }
  });
});

// Create order endpoint
app.post('/api/orders', async (req, res) => {
  try {
    const { limitOrder, signature, startPrice, endPrice, startTime, endTime } = req.body;
    
    if (!limitOrder || !signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: limitOrder and signature'
      });
    }

    // Generate order hash
    const orderHash = '0x' + Math.random().toString(16).substr(2, 64);
    
    const order = {
      orderHash,
      maker: limitOrder.maker,
      receiver: limitOrder.receiver,
      makerAsset: limitOrder.makerAsset,
      takerAsset: limitOrder.takerAsset,
      makingAmount: limitOrder.makingAmount,
      takingAmount: limitOrder.takingAmount,
      salt: limitOrder.salt,
      signature,
      startPrice: startPrice || limitOrder.makingAmount,
      endPrice: endPrice || limitOrder.takingAmount,
      startTime: startTime || Math.floor(Date.now() / 1000),
      endTime: endTime || Math.floor(Date.now() / 1000) + 3600, // 1 hour default
      status: 'created',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Store order
    orders.set(orderHash, order);

    logger.info('Order created:', { orderHash, maker: limitOrder.maker });

    // Broadcast to WebSocket clients
    const message = JSON.stringify({
      type: 'order_created',
      data: {
        orderHash,
        order
      },
      timestamp: Date.now()
    });

    wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    
    return res.json({
      success: true,
      data: {
        orderHash,
        order
      }
    });
  } catch (error) {
    logger.error('Order creation failed:', error);
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get orders endpoint
app.get('/api/orders', (req, res) => {
  const { page = 1, limit = 10, status, maker } = req.query;
  
  let ordersList = Array.from(orders.values());
  
  // Filter by status
  if (status) {
    ordersList = ordersList.filter(order => order.status === status);
  }
  
  // Filter by maker
  if (maker) {
    ordersList = ordersList.filter(order => order.maker.toLowerCase() === maker.toString().toLowerCase());
  }
  
  // Pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const start = (pageNum - 1) * limitNum;
  const end = start + limitNum;
  const paginatedOrders = ordersList.slice(start, end);
  
  res.json({
    success: true,
    data: {
      orders: paginatedOrders,
      total: ordersList.length,
      page: pageNum,
      limit: limitNum
    }
  });
});

// Get single order
app.get('/api/orders/:orderHash', (req, res) => {
  const { orderHash } = req.params;
  const order = orders.get(orderHash);
  
  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }
  
  return res.json({
    success: true,
    data: order
  });
});

// Cancel order
app.post('/api/orders/:orderHash/cancel', (req, res) => {
  const { orderHash } = req.params;
  const order = orders.get(orderHash);
  
  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }
  
  if (order.status !== 'created' && order.status !== 'active') {
    return res.status(400).json({
      success: false,
      error: 'Order cannot be cancelled'
    });
  }
  
  order.status = 'cancelled';
  order.updatedAt = Date.now();
  
  // Broadcast to WebSocket clients
  const message = JSON.stringify({
    type: 'order_cancelled',
    data: {
      orderHash,
      order
    },
    timestamp: Date.now()
  });

  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  
  logger.info('Order cancelled:', { orderHash });
  
  return res.json({
    success: true,
    data: {
      message: 'Order cancelled successfully'
    }
  });
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ port: Number(WS_PORT) });

// WebSocket connection handling
wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');
  wsClients.add(ws);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    data: {
      message: 'Connected to relayer WebSocket',
      timestamp: new Date().toISOString()
    }
  }));
  
  // Handle messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.info('WebSocket message received:', data);
      
      // Handle ping messages
      if (data.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      logger.error('WebSocket message parse error:', error);
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
    wsClients.delete(ws);
  });
  
  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
    wsClients.delete(ws);
  });
});

// Heartbeat for cleaning up dead connections
setInterval(() => {
  wsClients.forEach(client => {
    if (client.readyState !== WebSocket.OPEN) {
      wsClients.delete(client);
    }
  });
}, 30000);

// Start HTTP server
server.listen(PORT, () => {
  logger.info(`Relayer service started on port ${PORT}`);
  logger.info(`WebSocket server started on port ${WS_PORT}`);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
  // Close WebSocket server
  wss.close(() => {
    logger.info('WebSocket server closed');
  });
  
  // Close HTTP server
  server.close(() => {
    logger.info('Process terminated gracefully');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
