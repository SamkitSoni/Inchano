import { describe, beforeAll, afterAll, it, expect, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../index';
import { Server } from 'http';
import WebSocket from 'ws';
import { performance } from 'perf_hooks';

describe('Load Tests - System Reliability', () => {
  let server: Server;
  let testPort: number;

  beforeAll(async () => {
    testPort = 3002;
    process.env['PORT'] = testPort.toString();
    process.env['WS_PORT'] = '8083';
    process.env['NODE_ENV'] = 'test';
    process.env['ALCHEMY_API_KEY'] = 'test-key';

    server = app.listen(testPort);
    
    await new Promise<void>((resolve) => {
      server.on('listening', () => resolve());
    });

    // Give services time to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    jest.clearAllTimers();
  });

  const createValidOrder = (index = 0) => ({
    maker: `0x${index.toString(16).padStart(40, '0')}`,
    receiver: `0x${(index + 1).toString(16).padStart(40, '0')}`,
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
    salt: `salt_${index}_${Date.now()}`,
    signature: `0x${index.toString(16).padStart(64, '0')}`
  });

  describe('HTTP Endpoint Load Tests', () => {
    it('should handle concurrent health check requests', async () => {
      const concurrentRequests = 50;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/health').expect(200)
      );

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const duration = endTime - startTime;

      // All requests should succeed
      expect(responses).toHaveLength(concurrentRequests);
      responses.forEach(response => {
        expect(response.body.status).toBe('ok');
      });

      // Should complete within reasonable time (less than 5 seconds)
      expect(duration).toBeLessThan(5000);
      
      console.log(`✓ ${concurrentRequests} concurrent health checks completed in ${duration.toFixed(2)}ms`);
    });

    it('should handle concurrent order creation requests', async () => {
      const concurrentRequests = 20;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentRequests }, (_, index) =>
        request(app)
          .post('/api/orders')
          .send(createValidOrder(index))
          .expect(201)
      );

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const duration = endTime - startTime;

      // All requests should succeed
      expect(responses).toHaveLength(concurrentRequests);
      responses.forEach((response, index) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data.orderHash).toBeDefined();
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(10000);
      
      console.log(`✓ ${concurrentRequests} concurrent order creations completed in ${duration.toFixed(2)}ms`);
    });

    it('should handle mixed concurrent requests', async () => {
      const requestTypes = [
        () => request(app).get('/health'),
        () => request(app).get('/api/orders'),
        () => request(app).get('/metrics'),
        () => request(app).post('/api/orders').send(createValidOrder(Math.floor(Math.random() * 1000)))
      ];

      const concurrentRequests = 30;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentRequests }, (_, index) => {
        const requestType = requestTypes[index % requestTypes.length];
        return requestType();
      });

      const responses = await Promise.allSettled(promises);
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Count successful vs failed requests
      const fulfilled = responses.filter(r => r.status === 'fulfilled').length;
      const rejected = responses.filter(r => r.status === 'rejected').length;

      // At least 90% should succeed
      expect(fulfilled / concurrentRequests).toBeGreaterThanOrEqual(0.9);
      
      console.log(`✓ ${concurrentRequests} mixed requests: ${fulfilled} succeeded, ${rejected} failed in ${duration.toFixed(2)}ms`);
    });

    it('should maintain performance under sustained load', async () => {
      const requestsPerBatch = 10;
      const batches = 5;
      const batchInterval = 100; // ms between batches
      
      const results: number[] = [];
      
      for (let batch = 0; batch < batches; batch++) {
        const startTime = performance.now();
        
        const promises = Array.from({ length: requestsPerBatch }, () =>
          request(app).get('/health').expect(200)
        );
        
        await Promise.all(promises);
        const endTime = performance.now();
        const batchDuration = endTime - startTime;
        
        results.push(batchDuration);
        
        if (batch < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, batchInterval));
        }
      }
      
      // Performance should remain consistent (no dramatic increase in response time)
      const firstBatch = results[0];
      const lastBatch = results[results.length - 1];
      const performanceDegradation = (lastBatch - firstBatch) / firstBatch;
      
      // Performance degradation should be less than 100%
      expect(performanceDegradation).toBeLessThan(1.0);
      
      console.log(`✓ Sustained load test: Performance degradation ${(performanceDegradation * 100).toFixed(2)}%`);
      console.log(`  Batch times: ${results.map(r => r.toFixed(2)).join('ms, ')}ms`);
    });
  });

  describe('WebSocket Load Tests', () => {
    it('should handle multiple concurrent WebSocket connections', async () => {
      const connectionCount = 20;
      const connections: WebSocket[] = [];
      
      try {
        // Create multiple connections
        const connectionPromises = Array.from({ length: connectionCount }, () =>
          new Promise<WebSocket>((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:8083`);
            
            ws.on('open', () => {
              connections.push(ws);
              resolve(ws);
            });
            
            ws.on('error', reject);
            
            setTimeout(() => reject(new Error('Connection timeout')), 5000);
          })
        );

        const connectedSockets = await Promise.all(connectionPromises);
        expect(connectedSockets).toHaveLength(connectionCount);
        
        // Test heartbeat on all connections
        const heartbeatPromises = connectedSockets.map(ws =>
          new Promise<void>((resolve, reject) => {
            ws.once('message', (data) => {
              const message = JSON.parse(data.toString());
              if (message.type === 'heartbeat_response') {
                resolve();
              } else {
                reject(new Error('Unexpected message type'));
              }
            });
            
            ws.send(JSON.stringify({ type: 'heartbeat' }));
            
            setTimeout(() => reject(new Error('Heartbeat timeout')), 3000);
          })
        );

        await Promise.all(heartbeatPromises);
        
        console.log(`✓ ${connectionCount} concurrent WebSocket connections established and responding`);
        
      } finally {
        // Clean up connections
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
      }
    });

    it('should broadcast order updates to multiple clients efficiently', async () => {
      const clientCount = 10;
      const connections: WebSocket[] = [];
      
      try {
        // Create multiple WebSocket connections
        const connectionPromises = Array.from({ length: clientCount }, () =>
          new Promise<WebSocket>((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:8083`);
            
            ws.on('open', () => {
              connections.push(ws);
              resolve(ws);
            });
            
            ws.on('error', reject);
            setTimeout(() => reject(new Error('Connection timeout')), 5000);
          })
        );

        await Promise.all(connectionPromises);
        
        // Set up message listeners
        const messagePromises = connections.map(ws =>
          new Promise<void>((resolve, reject) => {
            ws.once('message', (data) => {
              const message = JSON.parse(data.toString());
              if (message.type === 'order_created') {
                resolve();
              }
            });
            
            setTimeout(() => reject(new Error('Message timeout')), 5000);
          })
        );

        // Create an order to trigger broadcast
        const startTime = performance.now();
        await request(app)
          .post('/api/orders')
          .send(createValidOrder(Date.now()))
          .expect(201);

        // Wait for all clients to receive the message
        await Promise.all(messagePromises);
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        console.log(`✓ Order broadcast to ${clientCount} clients in ${duration.toFixed(2)}ms`);
        
      } finally {
        connections.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
      }
    });
  });

  describe('Memory and Resource Tests', () => {
    it('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Create load
      const requestCount = 100;
      const promises = Array.from({ length: requestCount }, (_, index) =>
        request(app)
          .post('/api/orders')
          .send(createValidOrder(index + Date.now()))
          .expect(201)
      );

      await Promise.all(promises);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const finalMemory = process.memoryUsage();
      
      // Memory increase should be reasonable (less than 50MB)
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);
      
      expect(memoryIncreaseMB).toBeLessThan(50);
      
      console.log(`✓ Memory increase after ${requestCount} orders: ${memoryIncreaseMB.toFixed(2)}MB`);
    });

    it('should handle rapid successive requests without timeout', async () => {
      const requestCount = 50;
      const maxDuration = 10000; // 10 seconds
      
      const startTime = performance.now();
      
      // Send requests in rapid succession (no await between them)
      const promises: Promise<any>[] = [];
      for (let i = 0; i < requestCount; i++) {
        promises.push(
          request(app)
            .get('/health')
            .timeout(5000) // Individual request timeout
        );
      }
      
      const results = await Promise.allSettled(promises);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      // Should complete within time limit
      expect(duration).toBeLessThan(maxDuration);
      
      // At least 95% should succeed
      expect(successful / requestCount).toBeGreaterThanOrEqual(0.95);
      
      console.log(`✓ ${requestCount} rapid requests: ${successful} succeeded, ${failed} failed in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Error Recovery Tests', () => {
    it('should recover from temporary service overload', async () => {
      // Simulate overload with many requests
      const overloadRequests = 100;
      const promises = Array.from({ length: overloadRequests }, (_, index) =>
        request(app)
          .post('/api/orders')
          .send(createValidOrder(index + Date.now()))
          .timeout(1000) // Short timeout to simulate overload
      );

      // Don't wait for all to complete - some may fail due to overload
      const results = await Promise.allSettled(promises);
      
      // Wait for system to recover
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // System should be responsive again
      const recoveryResponse = await request(app)
        .get('/health')
        .expect(200);
      
      expect(recoveryResponse.body.status).toBe('ok');
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      console.log(`✓ System recovered after overload (${successful}/${overloadRequests} requests succeeded)`);
    });

    it('should maintain service availability during high error rates', async () => {
      // Generate a mix of valid and invalid requests
      const totalRequests = 50;
      const promises = Array.from({ length: totalRequests }, (_, index) => {
        if (index % 3 === 0) {
          // Invalid request - missing required fields
          return request(app)
            .post('/api/orders')
            .send({ maker: 'invalid' });
        } else {
          // Valid request
          return request(app)
            .post('/api/orders')
            .send(createValidOrder(index + Date.now()));
        }
      });

      const results = await Promise.allSettled(promises);
      
      // Health check should still work
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);
      
      expect(healthResponse.body.status).toBe('ok');
      
      const successful = results.filter(r => 
        r.status === 'fulfilled' && (r.value as any).status >= 200 && (r.value as any).status < 500
      ).length;
      
      console.log(`✓ Service remained available with ${successful}/${totalRequests} valid responses`);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet response time SLAs', async () => {
      const slaRequirements = {
        health: 100, // ms
        orderCreation: 500, // ms
        orderRetrieval: 200, // ms
        metrics: 300 // ms
      };

      // Test health endpoint
      const healthStart = performance.now();
      await request(app).get('/health').expect(200);
      const healthDuration = performance.now() - healthStart;
      expect(healthDuration).toBeLessThan(slaRequirements.health);

      // Test order creation
      const createStart = performance.now();
      const createResponse = await request(app)
        .post('/api/orders')
        .send(createValidOrder(Date.now()))
        .expect(201);
      const createDuration = performance.now() - createStart;
      expect(createDuration).toBeLessThan(slaRequirements.orderCreation);

      // Test order retrieval
      const orderHash = createResponse.body.data.orderHash;
      const retrieveStart = performance.now();
      await request(app).get(`/api/orders/${orderHash}`).expect(200);
      const retrieveDuration = performance.now() - retrieveStart;
      expect(retrieveDuration).toBeLessThan(slaRequirements.orderRetrieval);

      // Test metrics endpoint
      const metricsStart = performance.now();
      await request(app).get('/metrics').expect(200);
      const metricsDuration = performance.now() - metricsStart;
      expect(metricsDuration).toBeLessThan(slaRequirements.metrics);

      console.log(`✓ SLA compliance: Health ${healthDuration.toFixed(2)}ms, Create ${createDuration.toFixed(2)}ms, Retrieve ${retrieveDuration.toFixed(2)}ms, Metrics ${metricsDuration.toFixed(2)}ms`);
    });

    it('should maintain throughput under continuous load', async () => {
      const testDuration = 5000; // 5 seconds
      const expectedMinThroughput = 10; // requests per second
      
      let completedRequests = 0;
      const startTime = performance.now();
      const endTime = startTime + testDuration;
      
      const sendRequest = async (): Promise<void> => {
        if (performance.now() < endTime) {
          try {
            await request(app).get('/health').timeout(1000);
            completedRequests++;
          } catch (error) {
            // Ignore individual failures
          }
          
          // Continue sending requests
          setImmediate(sendRequest);
        }
      };

      // Start multiple concurrent request streams
      const streams = 5;
      const streamPromises = Array.from({ length: streams }, () => sendRequest());
      
      // Wait for test duration
      await new Promise(resolve => setTimeout(resolve, testDuration));
      
      const actualDuration = performance.now() - startTime;
      const throughput = (completedRequests / actualDuration) * 1000; // requests per second
      
      expect(throughput).toBeGreaterThan(expectedMinThroughput);
      
      console.log(`✓ Throughput test: ${completedRequests} requests in ${actualDuration.toFixed(2)}ms (${throughput.toFixed(2)} req/s)`);
    });
  });
});
