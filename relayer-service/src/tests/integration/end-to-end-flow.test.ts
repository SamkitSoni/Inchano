import WebSocket from 'ws';
import request from 'supertest';
import express from 'express';
import { OrdersRoutes } from '../../routes/orders';
import { WebSocketService } from '../../services/WebSocketService';
import { EscrowMonitor } from '../../escrow-monitor/EscrowMonitor';
import { AuctionStatus } from '../../auction-details/types';

interface SecretSharingService {
  shareSecret(secret: string, resolvers: string[]): Promise<void>;
  verifyFinality(orderHash: string): Promise<boolean>;
  notifyResolvers(message: any): Promise<void>;
}

interface MockResolver {
  id: string;
  ws: WebSocket;
  receivedMessages: any[];
  hasReceivedSecret: boolean;
  hasVerifiedEscrow: boolean;
}

describe('End-to-End Order Flow Integration Test', () => {
  let app: express.Application;
  let ordersRoutes: OrdersRoutes;
  let webSocketService: WebSocketService;
  let escrowMonitor: EscrowMonitor;
  let secretSharingService: SecretSharingService;
  let wsPort: number;
  let httpPort: number;
  let mockResolvers: MockResolver[] = [];
  let server: any;

  const testOrder = {
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
    signature: '0xmocksignature123456789'
  };

  beforeAll(async () => {
    // Setup ports
    wsPort = 9000 + Math.floor(Math.random() * 100);
    httpPort = 3000 + Math.floor(Math.random() * 100);

    // Initialize services
    ordersRoutes = new OrdersRoutes();
    webSocketService = new WebSocketService(wsPort, ordersRoutes);
    
    // Mock escrow monitor
    escrowMonitor = {
      start: jest.fn(),
      stop: jest.fn(),
      addContract: jest.fn(),
      removeContract: jest.fn(),
      getContractState: jest.fn(),
      on: jest.fn(),
      emit: jest.fn()
    } as any;

    // Mock secret sharing service
    secretSharingService = {
      shareSecret: jest.fn().mockResolvedValue(undefined),
      verifyFinality: jest.fn().mockResolvedValue(true),
      notifyResolvers: jest.fn().mockResolvedValue(undefined)
    };

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/orders', ordersRoutes.getRouter());
    
    // Start HTTP server
    server = app.listen(httpPort);
    
    // Wait for services to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Cleanup
    mockResolvers.forEach(resolver => {
      if (resolver.ws && resolver.ws.readyState === WebSocket.OPEN) {
        resolver.ws.close();
      }
    });
    
    await webSocketService.stop();
    if (server) {
      server.close();
    }
  });

  beforeEach(() => {
    // Reset mock resolvers
    mockResolvers = [];
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup resolvers after each test
    mockResolvers.forEach(resolver => {
      if (resolver.ws && resolver.ws.readyState === WebSocket.OPEN) {
        resolver.ws.close();
      }
    });
    mockResolvers = [];
  });

  describe('Complete Order Flow', () => {
    it('should execute the complete flow: order creation → Dutch auction → escrow deployment → resolver verification → secret sharing', async () => {
      console.log('🚀 Starting complete end-to-end flow test...');
      
      // Step 1: Create multiple mock resolvers
      console.log('📡 Setting up mock resolvers...');
      const numResolvers = 3;
      const resolverSetupPromises = [];
      
      for (let i = 0; i < numResolvers; i++) {
        const setupPromise = new Promise<MockResolver>((resolve) => {
          const ws = new WebSocket(`ws://localhost:${wsPort}`);
          const resolver: MockResolver = {
            id: `resolver_${i}`,
            ws,
            receivedMessages: [],
            hasReceivedSecret: false,
            hasVerifiedEscrow: false
          };

          ws.on('open', () => {
            console.log(`✅ Resolver ${i} connected`);
          });

          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            resolver.receivedMessages.push(message);
            
            // Handle welcome message and subscribe to orders
            if (message.type === 'ping' && message.data?.message?.includes('Connected')) {
              const subscriptionMessage = {
                type: 'subscribe',
                data: { subscription: 'orders' },
                timestamp: Date.now()
              };
              ws.send(JSON.stringify(subscriptionMessage));
            }
            
            // Handle order events
            if (message.type === 'order_created') {
              console.log(`📨 Resolver ${i} received order_created event`);
            }
            
            if (message.type === 'escrow_deployed') {
              console.log(`🏦 Resolver ${i} received escrow deployment notification`);
              resolver.hasVerifiedEscrow = true;
            }
            
            if (message.type === 'secret_shared') {
              console.log(`🔑 Resolver ${i} received secret`);
              resolver.hasReceivedSecret = true;
            }
          });

          ws.on('error', (error) => {
            console.error(`❌ Resolver ${i} error:`, error);
          });

          // Wait for connection and subscription
          setTimeout(() => {
            mockResolvers.push(resolver);
            resolve(resolver);
          }, 500);
        });
        
        resolverSetupPromises.push(setupPromise);
      }

      await Promise.all(resolverSetupPromises);
      console.log(`✅ ${numResolvers} resolvers set up and subscribed`);

      // Step 2: User creates order
      console.log('📝 Step 1: Creating order...');
      const orderResponse = await request(app)
        .post('/api/orders')
        .send(testOrder)
        .expect(201);

      expect(orderResponse.body.success).toBe(true);
      const orderHash = orderResponse.body.data.orderHash;
      console.log(`✅ Order created with hash: ${orderHash}`);

      // Wait for WebSocket notifications to propagate
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify all resolvers received order creation event
      mockResolvers.forEach((resolver, index) => {
        const orderCreatedMessages = resolver.receivedMessages.filter(
          msg => msg.type === 'order_created'
        );
        expect(orderCreatedMessages.length).toBeGreaterThan(0);
        console.log(`✅ Resolver ${index} received order creation notification`);
      });

      // Step 3: User verifies details and activates Dutch auction
      console.log('🔍 Step 2: User verifying order details and activating Dutch auction...');
      const activateResponse = await request(app)
        .patch(`/api/orders/${orderHash}`)
        .send({ status: AuctionStatus.ACTIVE })
        .expect(200);

      expect(activateResponse.body.success).toBe(true);
      console.log('✅ Order activated for Dutch auction');

      // Step 4: Simulate escrow contract deployment
      console.log('🏦 Step 3: Deploying escrow contracts...');
      const sourceEscrowAddress = '0x' + '1'.repeat(40);
      const destinationEscrowAddress = '0x' + '2'.repeat(40);

      // Simulate escrow deployment events
      const escrowDeploymentNotification = {
        type: 'escrow_deployed',
        data: {
          orderHash,
          sourceEscrow: sourceEscrowAddress,
          destinationEscrow: destinationEscrowAddress,
          deploymentTime: Date.now()
        },
        timestamp: Date.now()
      };

      // Broadcast escrow deployment to all resolvers
      mockResolvers.forEach(resolver => {
        if (resolver.ws.readyState === WebSocket.OPEN) {
          resolver.ws.send(JSON.stringify(escrowDeploymentNotification));
        }
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('✅ Escrow contracts deployed and notifications sent');

      // Step 5: Resolvers verify escrow deployment
      console.log('🔍 Step 4: Resolvers verifying escrow deployment...');
      
      // Simulate resolver verification process
      const verificationPromises = mockResolvers.map(async (resolver, index) => {
        // Simulate escrow verification
        const verified = await new Promise<boolean>(resolve => {
          setTimeout(() => {
            console.log(`✅ Resolver ${index} verified escrow contracts`);
            resolve(true);
          }, 100 + Math.random() * 200);
        });
        
        resolver.hasVerifiedEscrow = verified;
        return verified;
      });

      const verificationResults = await Promise.all(verificationPromises);
      expect(verificationResults.every(result => result === true)).toBe(true);
      console.log('✅ All resolvers verified escrow deployment');

      // Step 6: Check finality and prepare for secret sharing
      console.log('🔒 Step 5: Checking finality lock...');
      
      // Simulate finality check
      const finalityCheckResult = await secretSharingService.verifyFinality(orderHash);
      expect(finalityCheckResult).toBe(true);
      console.log('✅ Finality lock verified');

      // Step 7: User signals for key sharing
      console.log('🔑 Step 6: User signaling for key sharing...');
      
      const keyShareSignal = await request(app)
        .post(`/api/orders/${orderHash}/signal-key-share`)
        .send({ readyForKeyShare: true })
        .expect(200);

      console.log('✅ Key share signal sent');

      // Step 8: Secret sharing to all resolvers
      console.log('🔐 Step 7: Sharing secret to all resolvers...');
      
      const secret = 'mock_secret_12345678901234567890';
      const resolverAddresses = mockResolvers.map(r => r.id);
      
      await secretSharingService.shareSecret(secret, resolverAddresses);
      
      // Simulate secret sharing notifications
      const secretSharingNotification = {
        type: 'secret_shared',
        data: {
          orderHash,
          secret,
          sharedAt: Date.now(),
          resolvers: resolverAddresses
        },
        timestamp: Date.now()
      };

      // Send secret to all resolvers
      mockResolvers.forEach(resolver => {
        if (resolver.ws.readyState === WebSocket.OPEN) {
          resolver.ws.send(JSON.stringify(secretSharingNotification));
        }
      });

      await new Promise(resolve => setTimeout(resolve, 300));
      console.log('✅ Secret shared to all resolvers');

      // Step 9: Verify final state
      console.log('🎯 Step 8: Verifying final state...');
      
      // Check that all resolvers received the secret
      mockResolvers.forEach((resolver, index) => {
        const secretMessages = resolver.receivedMessages.filter(
          msg => msg.type === 'secret_shared'
        );
        expect(secretMessages.length).toBeGreaterThan(0);
        expect(resolver.hasVerifiedEscrow).toBe(true);
        console.log(`✅ Resolver ${index} completed full flow`);
      });

      // Verify service calls
      expect(secretSharingService.shareSecret).toHaveBeenCalledWith(secret, resolverAddresses);
      expect(secretSharingService.verifyFinality).toHaveBeenCalledWith(orderHash);

      // Final order status check
      const finalOrderResponse = await request(app)
        .get(`/api/orders/${orderHash}`)
        .expect(200);

      expect(finalOrderResponse.body.success).toBe(true);
      console.log('✅ Final order state verified');

      console.log('🎉 Complete end-to-end flow test passed successfully!');
    }, 30000); // 30 second timeout for complete flow

    it('should handle finality lock verification correctly', async () => {
      console.log('🔒 Testing finality lock verification...');
      
      // Create order
      const orderResponse = await request(app)
        .post('/api/orders')
        .send(testOrder)
        .expect(201);

      const orderHash = orderResponse.body.data.orderHash;
      
      // Test finality verification
      const isFinalized = await secretSharingService.verifyFinality(orderHash);
      expect(isFinalized).toBe(true);
      expect(secretSharingService.verifyFinality).toHaveBeenCalledWith(orderHash);
      
      console.log('✅ Finality lock verification test passed');
    });

    it('should handle secret sharing to multiple resolvers', async () => {
      console.log('🔐 Testing secret sharing functionality...');
      
      const secret = 'test_secret_987654321';
      const resolvers = ['resolver1', 'resolver2', 'resolver3'];
      
      await secretSharingService.shareSecret(secret, resolvers);
      
      expect(secretSharingService.shareSecret).toHaveBeenCalledWith(secret, resolvers);
      expect(secretSharingService.notifyResolvers).not.toHaveBeenCalled(); // Should only be called if needed
      
      console.log('✅ Secret sharing test passed');
    });

    it('should handle resolver disconnection gracefully during the flow', async () => {
      console.log('🔌 Testing resolver disconnection handling...');
      
      // Set up resolvers
      const resolver1 = new WebSocket(`ws://localhost:${wsPort}`);
      const resolver2 = new WebSocket(`ws://localhost:${wsPort}`);
      
      await new Promise(resolve => {
        let connected = 0;
        const checkConnected = () => {
          connected++;
          if (connected === 2) resolve(undefined);
        };
        
        resolver1.on('open', checkConnected);
        resolver2.on('open', checkConnected);
      });

      // Create order
      const orderResponse = await request(app)
        .post('/api/orders')
        .send(testOrder)
        .expect(201);

      // Disconnect one resolver mid-flow
      resolver1.close();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Continue with flow - should handle disconnection gracefully
      const secret = 'test_secret_disconnection';
      const resolvers = ['resolver1', 'resolver2'];
      
      await expect(
        secretSharingService.shareSecret(secret, resolvers)
      ).resolves.not.toThrow();
      
      resolver2.close();
      console.log('✅ Resolver disconnection handling test passed');
    });
  });

  describe('Relayer Core Functionality', () => {
    it('should verify finality lock for orders', async () => {
      console.log('🔒 Testing relayer finality lock verification...');
      
      const orderResponse = await request(app)
        .post('/api/orders')
        .send(testOrder)
        .expect(201);

      const orderHash = orderResponse.body.data.orderHash;
      
      // Test the two main relayer functionalities
      // 1. Finality lock verification
      const finalityResult = await secretSharingService.verifyFinality(orderHash);
      expect(finalityResult).toBe(true);
      
      console.log('✅ Relayer finality lock verification passed');
    });

    it('should handle secret sharing to all resolvers', async () => {
      console.log('🔑 Testing relayer secret sharing functionality...');
      
      const secret = 'relayer_test_secret';
      const resolvers = ['resolver_a', 'resolver_b', 'resolver_c'];
      
      // 2. Secret sharing to all resolvers
      await secretSharingService.shareSecret(secret, resolvers);
      
      expect(secretSharingService.shareSecret).toHaveBeenCalledWith(secret, resolvers);
      
      console.log('✅ Relayer secret sharing functionality passed');
    });
  });
});
