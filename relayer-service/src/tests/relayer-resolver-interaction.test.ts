import WebSocket from 'ws';
import { WebSocketService } from '../services/WebSocketService';
import { OrdersRoutes } from '../routes/orders';
import { DutchAuctionOrder, AuctionStatus } from '../auction-details/types';

describe('Relayer-Resolver Interaction Tests', () => {
  let webSocketService: WebSocketService;
  let ordersRoutes: OrdersRoutes;
  let wsPort: number;
  let mockResolver: WebSocket;
  let mockResolver2: WebSocket;

  // Mock order data with proper typing
  const mockOrder: DutchAuctionOrder & { status: AuctionStatus; createdAt: Date; updatedAt: Date } = {
    orderHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    maker: '0x742d35cc6473ff0c27b7b2cdB94b4b0BdF6bC97a',
    receiver: '0x742d35cc6473ff0c27b7b2cdB94b4b0BdF6bC97a',
    makerAsset: '0xA0b86a33E6441c4e02b70c4db41A54531E9fb9b5',
    takerAsset: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    makerAmount: '1000000000000000000',
    takerAmount: '2000000000000000000',
    startTime: Math.floor(Date.now() / 1000),
    endTime: Math.floor(Date.now() / 1000) + 3600,
    startPrice: '2000000000000000000',
    endPrice: '1500000000000000000',
    auctionStartTime: Math.floor(Date.now() / 1000),
    auctionEndTime: Math.floor(Date.now() / 1000) + 3600,
    salt: '12345678901234567890',
    signature: '0xsignature123',
    status: AuctionStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeAll(async () => {
    // Find available port
    wsPort = 8090 + Math.floor(Math.random() * 100);
    
    // Initialize services
    ordersRoutes = new OrdersRoutes();
    webSocketService = new WebSocketService(wsPort, ordersRoutes);
    
    // Wait for WebSocket server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Cleanup
    if (mockResolver && mockResolver.readyState === WebSocket.OPEN) {
      mockResolver.close();
    }
    if (mockResolver2 && mockResolver2.readyState === WebSocket.OPEN) {
      mockResolver2.close();
    }
    
    await webSocketService.stop();
  });

  beforeEach(async () => {
    // Clear any existing orders
    ordersRoutes = new OrdersRoutes();
    webSocketService.setOrderRoutes(ordersRoutes);
  });

  afterEach(() => {
    if (mockResolver && mockResolver.readyState === WebSocket.OPEN) {
      mockResolver.close();
    }
    if (mockResolver2 && mockResolver2.readyState === WebSocket.OPEN) {
      mockResolver2.close();
    }
  });

  describe('WebSocket Connection Tests', () => {
    it('should allow resolver to connect to relayer', (done) => {
      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);
      
      mockResolver.on('open', () => {
        expect(mockResolver.readyState).toBe(WebSocket.OPEN);
        done();
      });

      mockResolver.on('error', (error) => {
        done(error);
      });
    });

    it('should send welcome message to resolver upon connection', (done) => {
      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);
      
      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        expect(message.type).toBe('ping');
        expect(message.data).toHaveProperty('clientId');
        expect(message.data).toHaveProperty('message');
        expect(message.data.message).toContain('Connected to DeFi Relayer WebSocket Service');
        done();
      });

      mockResolver.on('error', (error) => {
        done(error);
      });
    });

    it('should handle multiple resolver connections', (done) => {
      let connectionsReceived = 0;
      const expectedConnections = 2;

      const handleConnection = () => {
        connectionsReceived++;
        if (connectionsReceived === expectedConnections) {
          expect(mockResolver.readyState).toBe(WebSocket.OPEN);
          expect(mockResolver2.readyState).toBe(WebSocket.OPEN);
          done();
        }
      };

      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);
      mockResolver.on('open', handleConnection);
      
      mockResolver2 = new WebSocket(`ws://localhost:${wsPort}`);
      mockResolver2.on('open', handleConnection);
    });
  });

  describe('Message Exchange Tests', () => {
    it('should handle ping-pong messages', (done) => {
      const pingMessage = {
        type: 'ping',
        timestamp: Date.now()
      };

      let welcomeReceived = false;
      let pingSent = false;
      let messageCount = 0;
      
      // Create a new WebSocket connection for this test
      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);
      
      // Set up message handler BEFORE connection opens
      mockResolver.on('message', (data) => {
        messageCount++;
        const message = JSON.parse(data.toString());
        console.log(`Message ${messageCount}:`, JSON.stringify(message, null, 2));
        
        if (message.type === 'pong') {
          console.log('✅ Received pong message');
          expect(message.data).toHaveProperty('serverTime');
          done();
          return;
        }
        
        if (message.type === 'ping' && message.data && message.data.message && message.data.message.includes('Connected') && !welcomeReceived) {
          console.log('✅ Received welcome message, sending ping');
          welcomeReceived = true;
          pingSent = true;
          
          setTimeout(() => {
            console.log('📤 Sending ping message:', JSON.stringify(pingMessage, null, 2));
            mockResolver.send(JSON.stringify(pingMessage));
          }, 100); // Small delay to ensure message is sent
        }
      });

      mockResolver.on('error', (error) => {
        console.error('WebSocket error:', error);
        done(error);
      });
      
      mockResolver.on('open', () => {
        console.log('🔗 WebSocket connection opened');
      });

      // Add timeout as fallback
      setTimeout(() => {
        console.log(`Timeout reached. welcomeReceived: ${welcomeReceived}, pingSent: ${pingSent}, messageCount: ${messageCount}`);
        if (!welcomeReceived) {
          done(new Error('Did not receive welcome message'));
        } else if (!pingSent) {
          done(new Error('Failed to send ping message'));
        } else {
          done(new Error('Did not receive pong response within timeout'));
        }
      }, 8000);
    }, 10000);

    it('should handle subscription requests', (done) => {
      const subscriptionMessage = {
        type: 'subscribe',
        data: {
          subscription: 'orders'
        },
        timestamp: Date.now()
      };

      let welcomeReceived = false;
      
      // Create a new WebSocket connection for this test
      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);

      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('Subscription test - received message:', JSON.stringify(message, null, 2));
        
        if (message.type === 'ping' && message.data && message.data.message && message.data.message.includes('Connected') && !welcomeReceived) {
          // Welcome message received, send subscription
          console.log('Sending subscription request...');
          welcomeReceived = true;
          setTimeout(() => {
            mockResolver.send(JSON.stringify(subscriptionMessage));
          }, 100);
        } else if (message.type === 'ping' && message.data && message.data.message && message.data.message.includes('Subscribed')) {
          console.log('Received subscription confirmation');
          expect(message.data.subscription).toBe('orders');
          done();
        } else if (message.type === 'order_update') {
          // This is the current orders response
          console.log('Received order update (initial orders list)');
          expect(message.data).toHaveProperty('orders');
          expect(Array.isArray(message.data.orders)).toBe(true);
        }
      });
      
      mockResolver.on('error', (error) => {
        console.error('WebSocket error in subscription test:', error);
        done(error);
      });
    }, 10000);

    it('should handle unsubscription requests', (done) => {
      const subscriptionMessage = {
        type: 'subscribe',
        data: { subscription: 'orders' },
        timestamp: Date.now()
      };

      const unsubscriptionMessage = {
        type: 'unsubscribe',
        data: { subscription: 'orders' },
        timestamp: Date.now()
      };

      let subscribed = false;
      let welcomeReceived = false;
      
      // Create a new WebSocket connection for this test
      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);

      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('Unsubscription test - received message:', JSON.stringify(message, null, 2));
        
        if (message.type === 'ping' && message.data && message.data.message && message.data.message.includes('Connected') && !welcomeReceived) {
          console.log('Sending subscription request...');
          welcomeReceived = true;
          setTimeout(() => {
            mockResolver.send(JSON.stringify(subscriptionMessage));
          }, 100);
        } else if (message.type === 'ping' && message.data && message.data.message && message.data.message.includes('Subscribed') && !subscribed) {
          console.log('Sending unsubscription request...');
          subscribed = true;
          setTimeout(() => {
            mockResolver.send(JSON.stringify(unsubscriptionMessage));
          }, 100);
        } else if (message.type === 'ping' && message.data && message.data.message === 'Unsubscribed successfully') {
          console.log('Received unsubscription confirmation');
          done();
        } else if (message.type === 'order_update') {
          console.log('Received order update (initial orders list)');
          // This is expected after subscription
        }
      });
      
      mockResolver.on('error', (error) => {
        console.error('WebSocket error in unsubscription test:', error);
        done(error);
      });
    }, 10000);
  });

  describe('Order Broadcasting Tests', () => {
    beforeEach((done) => {
      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);
      mockResolver.on('open', () => {
        // Subscribe to orders immediately after connection
        const subscriptionMessage = {
          type: 'subscribe',
          data: { subscription: 'orders' },
          timestamp: Date.now()
        };
        
        setTimeout(() => {
          mockResolver.send(JSON.stringify(subscriptionMessage));
          setTimeout(done, 500);
        }, 100);
      });
    });

    it('should broadcast new order creation to subscribed resolvers', (done) => {
      let welcomeReceived = false;
      let subscribed = false;
      
      // Create a new connection for this test
      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);

      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('Order creation test - received message:', JSON.stringify(message, null, 2));
        
        if (message.type === 'order_created') {
          console.log('✅ Received order_created broadcast');
          expect(message.data).toHaveProperty('order');
          expect(message.data.order.orderHash).toBe(mockOrder.orderHash);
          done();
        } else if (message.type === 'ping' && message.data && message.data.message && message.data.message.includes('Connected') && !welcomeReceived) {
          console.log('Received welcome, subscribing to orders...');
          welcomeReceived = true;
          const subscriptionMessage = {
            type: 'subscribe',
            data: { subscription: 'orders' },
            timestamp: Date.now()
          };
          setTimeout(() => {
            mockResolver.send(JSON.stringify(subscriptionMessage));
          }, 100);
        } else if (message.type === 'ping' && message.data && message.data.message && message.data.message.includes('Subscribed') && !subscribed) {
          console.log('Subscribed to orders, broadcasting order creation...');
          subscribed = true;
          setTimeout(() => {
            webSocketService.broadcastOrderCreated(mockOrder);
          }, 100);
        } else if (message.type === 'order_update') {
          console.log('Received initial order list');
          // Initial order list - ignore
        }
      });
      
      mockResolver.on('error', (error) => {
        console.error('WebSocket error in order creation test:', error);
        done(error);
      });
    }, 10000);

    it('should broadcast order updates to subscribed resolvers', (done) => {
      let welcomeReceived = false;

      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'order_update') {
          if (message.data.orders) {
            // This is the initial order list
            return;
          }
          
          expect(message.data).toHaveProperty('orderHash');
          expect(message.data.orderHash).toBe(mockOrder.orderHash);
          expect(message.data).toHaveProperty('updateType');
          done();
        } else if (message.type === 'ping' && message.data.message && !welcomeReceived) {
          welcomeReceived = true;
          // Simulate order update by directly broadcasting
          setTimeout(() => {
            const updatedOrder = { ...mockOrder, status: AuctionStatus.FILLED };
            webSocketService.broadcastOrderUpdated(mockOrder.orderHash, updatedOrder, 'status');
          }, 100);
        }
      });
    });

    it('should broadcast profitable opportunities to subscribed resolvers', (done) => {
      const subscriptionMessage = {
        type: 'subscribe',
        data: { subscription: 'profitable_opportunities' },
        timestamp: Date.now()
      };

      let welcomeReceived = false;

      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'profitable_opportunity') {
          expect(message.data).toHaveProperty('opportunities');
          expect(Array.isArray(message.data.opportunities)).toBe(true);
          done();
        } else if (message.type === 'ping' && message.data.message && !welcomeReceived) {
          welcomeReceived = true;
          mockResolver.send(JSON.stringify(subscriptionMessage));
        }
      });
    });
  });

  describe('Multi-Resolver Broadcasting Tests', () => {
    beforeEach((done) => {
      let connectionsReady = 0;
      
      const checkReady = () => {
        connectionsReady++;
        if (connectionsReady === 2) {
          // Both resolvers connected, subscribe them to orders
          const subscriptionMessage = {
            type: 'subscribe',
            data: { subscription: 'orders' },
            timestamp: Date.now()
          };
          
          setTimeout(() => {
            mockResolver.send(JSON.stringify(subscriptionMessage));
            mockResolver2.send(JSON.stringify(subscriptionMessage));
            setTimeout(done, 500);
          }, 100);
        }
      };

      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);
      mockResolver.on('open', checkReady);
      
      mockResolver2 = new WebSocket(`ws://localhost:${wsPort}`);
      mockResolver2.on('open', checkReady);
    });

    it('should broadcast order creation to multiple resolvers', (done) => {
      let resolver1Received = false;
      let resolver2Received = false;
      let bothSubscribed = false;
      let subscriptionCount = 0;

      const checkCompletion = () => {
        if (resolver1Received && resolver2Received) {
          console.log('✅ Both resolvers received order_created broadcast');
          done();
        }
      };

      const checkSubscriptions = () => {
        subscriptionCount++;
        if (subscriptionCount === 2 && !bothSubscribed) {
          bothSubscribed = true;
          console.log('Both resolvers subscribed, broadcasting order...');
          setTimeout(() => {
            webSocketService.broadcastOrderCreated(mockOrder);
          }, 100);
        }
      };

      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('Resolver 1 - received message:', JSON.stringify(message, null, 2));
        
        if (message.type === 'order_created') {
          console.log('✅ Resolver 1 got order_created');
          expect(message.data).toHaveProperty('order');
          expect(message.data.order.orderHash).toBe(mockOrder.orderHash);
          resolver1Received = true;
          checkCompletion();
        } else if (message.type === 'ping' && message.data && message.data.message && message.data.message.includes('Subscribed')) {
          console.log('✅ Resolver 1 subscribed, checking...');
          checkSubscriptions();
        }
      });

      mockResolver2.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('Resolver 2 - received message:', JSON.stringify(message, null, 2));
        
        if (message.type === 'order_created') {
          console.log('✅ Resolver 2 got order_created');
          expect(message.data).toHaveProperty('order');
          expect(message.data.order.orderHash).toBe(mockOrder.orderHash);
          resolver2Received = true;
          checkCompletion();
        } else if (message.type === 'ping' && message.data && message.data.message && message.data.message.includes('Subscribed')) {
          console.log('✅ Resolver 2 subscribed, checking...');
          checkSubscriptions();
        }
      });
    }, 10000);
  });

  describe('Error Handling Tests', () => {
    beforeEach((done) => {
      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);
      mockResolver.on('open', () => done());
    });

    it('should handle invalid JSON messages gracefully', (done) => {
      let welcomeReceived = false;

      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'ping' && message.data.message && !welcomeReceived) {
          welcomeReceived = true;
          // Send invalid JSON
          mockResolver.send('{ invalid json }');
        } else if (message.type === 'ping' && message.data.error) {
          expect(message.data.error).toBe('Invalid message format');
          done();
        }
      });
    });

    it('should handle unknown message types gracefully', (done) => {
      const unknownMessage = {
        type: 'unknown_type',
        data: {},
        timestamp: Date.now()
      };

      let welcomeReceived = false;

      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'ping' && message.data.message && !welcomeReceived) {
          welcomeReceived = true;
          mockResolver.send(JSON.stringify(unknownMessage));
        } else if (message.type === 'ping' && message.data.error) {
          expect(message.data.error).toContain('Unknown message type');
          done();
        }
      });
    });

    it('should handle resolver disconnection gracefully', (done) => {
      let connected = false;
      
      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'ping' && message.data.message && !connected) {
          connected = true;
          // Disconnect resolver after receiving welcome message
          mockResolver.close();
          
          // Verify service continues to work after disconnection
          setTimeout(() => {
            // If no error is thrown, test passes
            done();
          }, 100);
        }
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle rapid message exchange', (done) => {
      mockResolver = new WebSocket(`ws://localhost:${wsPort}`);
      
      let messagesReceived = 0;
      const totalMessages = 10;
      
      mockResolver.on('open', () => {
        // Send rapid ping messages
        for (let i = 0; i < totalMessages; i++) {
          const pingMessage = {
            type: 'ping',
            data: { sequence: i },
            timestamp: Date.now()
          };
          mockResolver.send(JSON.stringify(pingMessage));
        }
      });

      mockResolver.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'pong') {
          messagesReceived++;
          if (messagesReceived === totalMessages) {
            done();
          }
        }
      });
    }, 10000); // 10 second timeout

    it('should handle concurrent connections under load', (done) => {
      const connections: WebSocket[] = [];
      const numConnections = 5;
      let connectionsEstablished = 0;

      for (let i = 0; i < numConnections; i++) {
        const ws = new WebSocket(`ws://localhost:${wsPort}`);
        connections.push(ws);
        
        ws.on('open', () => {
          connectionsEstablished++;
          if (connectionsEstablished === numConnections) {
            // All connections established
            connections.forEach(connection => connection.close());
            done();
          }
        });

        ws.on('error', (error) => {
          done(error);
        });
      }
    }, 15000); // 15 second timeout
  });
});
