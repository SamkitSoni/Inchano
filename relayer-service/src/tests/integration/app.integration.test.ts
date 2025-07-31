import { describe, beforeAll, afterAll, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../index';
import { Server } from 'http';
import WebSocket from 'ws';

describe('Integration Tests - Full Application', () => {
  let server: Server;
  let testPort: number;
  let wsClient: WebSocket;

  beforeAll(async () => {
    // Find an available port for testing
    testPort = 3001;
    process.env['PORT'] = testPort.toString();
    process.env['WS_PORT'] = '8082';
    process.env['NODE_ENV'] = 'test';
    process.env['ALCHEMY_API_KEY'] = 'test-key';

    // Start the server
    server = app.listen(testPort);
    
    // Wait for server to be ready
    await new Promise<void>((resolve) => {
      server.on('listening', () => resolve());
    });

    // Give the WebSocket service time to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }
    
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    
    // Clean up any lingering timers
    jest.clearAllTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.close();
    }
  });

  describe('Health Check Integration', () => {
    it('should return comprehensive system health', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: 'test',
        memory: expect.objectContaining({
          rss: expect.any(Number),
          heapTotal: expect.any(Number),
          heapUsed: expect.any(Number),
          external: expect.any(Number),
          arrayBuffers: expect.any(Number)
        }),
        services: expect.objectContaining({
          escrowMonitor: expect.any(String),
          webSocket: expect.any(String),
          priceUpdater: expect.any(String)
        }),
        metrics: expect.objectContaining({
          totalRequests: expect.any(Number),
          totalErrors: expect.any(Number),
          activeConnections: expect.any(Number)
        })
      });
    });

    it('should track request metrics across multiple calls', async () => {
      // Make multiple requests
      await request(app).get('/health').expect(200);
      await request(app).get('/health').expect(200);
      await request(app).get('/health').expect(200);

      const response = await request(app)
        .get('/health')
        .expect(200);

      // Should have at least 4 requests now (including this one)
      expect(response.body.metrics.totalRequests).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Orders API Integration', () => {
    const validOrder = {
      maker: '0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8',
      receiver: '0x842d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8',
      makerAsset: '0xA0b86a33E6b2d8D1e7c3e4F5a6B7c8D9E0f1a2b3',
      takerAsset: '0xB1c97b44F7d1f9e8c4e5F6a7B8c9D0e1F2a3b4c5',
      makerAmount: '1000000000000000000',
      takerAmount: '2000000000000000000',
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 3600,
      startPrice: '2000000000000000000',
      endPrice: '1500000000000000000',
      auctionStartTime: Math.floor(Date.now() / 1000),
      auctionEndTime: Math.floor(Date.now() / 1000) + 1800,
      signature: '0x1234567890abcdef'
    };

    it('should handle complete order lifecycle', async () => {
      // Create order
      const createResponse = await request(app)
        .post('/api/orders')
        .send(validOrder)
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.orderHash).toBeDefined();
      const orderHash = createResponse.body.data.orderHash;

      // Get order by hash
      const getResponse = await request(app)
        .get(`/api/orders/${orderHash}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.order.orderHash).toBe(orderHash);

      // Update order status
      const updateResponse = await request(app)
        .patch(`/api/orders/${orderHash}`)
        .send({ status: 'active' })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.order.status).toBe('active');

      // Get order status with auction details
      const statusResponse = await request(app)
        .get(`/api/orders/${orderHash}/status`)
        .expect(200);

      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data).toMatchObject({
        orderHash,
        status: 'active',
        currentPrice: expect.any(String),
        timeRemaining: expect.any(Number),
        progress: expect.any(Number),
        isActive: expect.any(Boolean)
      });

      // Get auction details
      const auctionResponse = await request(app)
        .get(`/api/orders/${orderHash}/auction`)
        .expect(200);

      expect(auctionResponse.body.success).toBe(true);
      expect(auctionResponse.body.data).toMatchObject({
        orderHash,
        currentPrice: expect.any(String),
        timeRemaining: expect.any(Number),
        priceDecayRate: expect.any(String),
        isActive: expect.any(Boolean),
        progress: expect.any(Number)
      });

      // Cancel order
      const cancelResponse = await request(app)
        .delete(`/api/orders/${orderHash}`)
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);
    });

    it('should handle order filtering and pagination', async () => {
      // Create multiple orders with different makers
      const orders = [];
      for (let i = 0; i < 5; i++) {
        const order = {
          ...validOrder,
          maker: `0x${i.toString().padStart(40, '0')}`,
          salt: `salt_${i}`
        };
        
        const response = await request(app)
          .post('/api/orders')
          .send(order)
          .expect(201);
        
        orders.push(response.body.data.orderHash);
      }

      // Test pagination
      const paginatedResponse = await request(app)
        .get('/api/orders?limit=2&offset=0')
        .expect(200);

      expect(paginatedResponse.body.success).toBe(true);
      expect(paginatedResponse.body.data.orders).toHaveLength(2);
      expect(paginatedResponse.body.data.pagination).toMatchObject({
        limit: 2,
        offset: 0,
        total: expect.any(Number),
        hasMore: expect.any(Boolean)
      });

      // Test filtering by maker
      const filteredResponse = await request(app)
        .get(`/api/orders?maker=0x${0}`)
        .expect(200);

      expect(filteredResponse.body.success).toBe(true);
      expect(filteredResponse.body.data.orders).toHaveLength(1);
    });

    it('should provide profitable opportunities', async () => {
      // Create an active order
      const order = { ...validOrder, status: 'active' };
      const createResponse = await request(app)
        .post('/api/orders')
        .send(order)
        .expect(201);

      const orderHash = createResponse.body.data.orderHash;

      // Update to active status
      await request(app)
        .patch(`/api/orders/${orderHash}`)
        .send({ status: 'active' })
        .expect(200);

      // Get profitable opportunities
      const opportunitiesResponse = await request(app)
        .get('/api/orders/profitable/opportunities?gasPrice=20000000000&minProfitMargin=0.01')
        .expect(200);

      expect(opportunitiesResponse.body.success).toBe(true);
      expect(opportunitiesResponse.body.data).toMatchObject({
        opportunities: expect.any(Array),
        count: expect.any(Number),
        gasPrice: '20000000000',
        minProfitMargin: 0.01,
        timestamp: expect.any(String)
      });
    });

    it('should provide order metrics and statistics', async () => {
      const metricsResponse = await request(app)
        .get('/api/orders/stats/metrics')
        .expect(200);

      expect(metricsResponse.body.success).toBe(true);
      expect(metricsResponse.body.data).toMatchObject({
        totalOrders: expect.any(Number),
        activeOrders: expect.any(Number),
        filledOrders: expect.any(Number),
        cancelledOrders: expect.any(Number),
        expiredOrders: expect.any(Number),
        averageFillRate: expect.any(Number),
        totalVolume: expect.any(String),
        averageAuctionDuration: expect.any(Number),
        timestamp: expect.any(String)
      });
    });

    it('should handle order validation errors', async () => {
      const invalidOrder: any = { ...validOrder };
      delete invalidOrder.maker;

      const response = await request(app)
        .post('/api/orders')
        .send(invalidOrder)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required field: maker');
    });

    it('should prevent duplicate orders', async () => {
      // Create first order
      await request(app)
        .post('/api/orders')
        .send(validOrder)
        .expect(201);

      // Try to create the same order again
      const response = await request(app)
        .post('/api/orders')
        .send(validOrder)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Order already exists');
    });
  });

  describe('WebSocket Integration', () => {
    it('should handle WebSocket connections and order updates', (done) => {
      wsClient = new WebSocket(`ws://localhost:8082`);
      
      let messagesReceived = 0;
      const expectedMessages = 2; // order_created and order_updated

      wsClient.on('open', async () => {
        // Create an order after WebSocket is connected
        const response = await request(app)
          .post('/api/orders')
          .send(validOrder)
          .expect(201);

        const orderHash = response.body.data.orderHash;

        // Update the order status
        setTimeout(async () => {
          await request(app)
            .patch(`/api/orders/${orderHash}`)
            .send({ status: 'active' })
            .expect(200);
        }, 100);
      });

      wsClient.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        messagesReceived++;
        
        if (message.type === 'order_created') {
          expect(message.data).toMatchObject({
            orderHash: expect.any(String),
            maker: validOrder.maker,
            status: 'pending'
          });
        } else if (message.type === 'order_updated') {
          expect(message.data).toMatchObject({
            orderHash: expect.any(String),
            status: 'active'
          });
        }

        if (messagesReceived >= expectedMessages) {
          done();
        }
      });

      wsClient.on('error', (error) => {
        done(error);
      });

      // Set a timeout to prevent hanging
      setTimeout(() => {
        if (messagesReceived < expectedMessages) {
          done(new Error(`Expected ${expectedMessages} messages but received ${messagesReceived}`));
        }
      }, 5000);
    });

    it('should handle WebSocket heartbeat', (done) => {
      wsClient = new WebSocket(`ws://localhost:8082`);
      
      wsClient.on('open', () => {
        // Send heartbeat
        wsClient.send(JSON.stringify({ type: 'heartbeat' }));
      });

      wsClient.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'heartbeat_response') {
          expect(message.data).toMatchObject({
            timestamp: expect.any(String),
            status: 'ok'
          });
          done();
        }
      });

      wsClient.on('error', (error) => {
        done(error);
      });

      setTimeout(() => {
        done(new Error('Heartbeat response not received within timeout'));
      }, 3000);
    });
  });

  describe('Metrics Integration', () => {
    it('should expose Prometheus metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('relayer_service_http_requests_total');
      expect(response.text).toContain('relayer_service_errors_total');
      expect(response.text).toContain('relayer_service_websocket_connections_total');
      expect(response.text).toContain('relayer_service_health_status');
    });

    it('should track HTTP request metrics', async () => {
      // Make some requests to generate metrics
      await request(app).get('/health').expect(200);
      await request(app).get('/api/orders').expect(200);
      
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      // Should contain request counters
      expect(response.text).toMatch(/relayer_service_http_requests_total.*method="GET".*route="\/health"/);
      expect(response.text).toMatch(/relayer_service_http_requests_total.*method="GET".*route="\/api\/orders"/);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle 404 errors gracefully', async () => {
      const response = await request(app)
        .get('/nonexistent-endpoint')
        .expect(404);

      // Should not crash the application
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      expect(healthResponse.body.status).toBe('ok');
    });

    it('should handle invalid JSON in requests', async () => {
      const response = await request(app)
        .post('/api/orders')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Application should still be healthy
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      expect(healthResponse.body.status).toBe('ok');
    });

    it('should handle database/service errors gracefully', async () => {
      // Try to get a non-existent order
      const response = await request(app)
        .get('/api/orders/0xinvalidhash')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Order not found');

      // Application should still be healthy
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      expect(healthResponse.body.status).toBe('ok');
    });
  });

  describe('System Resource Integration', () => {
    it('should handle memory usage tracking', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.memory.heapUsed).toBeGreaterThan(0);
      expect(response.body.memory.heapTotal).toBeGreaterThan(response.body.memory.heapUsed);
      expect(response.body.memory.rss).toBeGreaterThan(0);
    });

    it('should track uptime correctly', async () => {
      const response1 = await request(app)
        .get('/health')
        .expect(200);

      const uptime1 = response1.body.uptime;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const response2 = await request(app)
        .get('/health')
        .expect(200);

      const uptime2 = response2.body.uptime;

      expect(uptime2).toBeGreaterThan(uptime1);
    });
  });

  describe('Cross-Service Integration', () => {
    it('should coordinate between orders service and WebSocket service', async () => {
      return new Promise<void>((resolve, reject) => {
        wsClient = new WebSocket(`ws://localhost:8082`);
        
        wsClient.on('open', async () => {
          try {
            // Create an order
            const response = await request(app)
              .post('/api/orders')
              .send(validOrder)
              .expect(201);

            const orderHash = response.body.data.orderHash;

            // The WebSocket should receive the order creation event
            wsClient.on('message', (data) => {
              const message = JSON.parse(data.toString());
              
              if (message.type === 'order_created') {
                expect(message.data.orderHash).toBe(orderHash);
                resolve();
              }
            });
          } catch (error) {
            reject(error);
          }
        });

        wsClient.on('error', reject);

        setTimeout(() => {
          reject(new Error('WebSocket integration test timeout'));
        }, 5000);
      });
    });
  });
});
