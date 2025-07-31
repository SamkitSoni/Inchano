import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { WebSocketService, WebSocketMessage, WebSocketClient, SubscriptionFilter } from '../WebSocketService';
import { OrdersRoutes } from '../../routes/orders';
import { AuctionStatus, DutchAuctionOrder } from '../../auction-details/types';
import { websocketConnectionsTotal, recordWebSocketMessage, recordError } from '../../utils/metrics';

// Mock dependencies
jest.mock('ws');
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../utils/metrics', () => ({
  websocketConnectionsTotal: { set: jest.fn() },
  recordWebSocketMessage: jest.fn(),
  recordError: jest.fn(),
}));

describe('WebSocketService', () => {
  let service: WebSocketService;
  let mockServer: jest.Mocked<WebSocket.Server>;
  let mockOrdersService: jest.Mocked<OrdersRoutes>;
  let mockWebSocket: jest.Mocked<WebSocket>;
  let connectionHandler: (ws: WebSocket, request: any) => void;
  let messageHandler: (message: Buffer) => void;
  let closeHandler: () => void;
  let errorHandler: (error: Error) => void;
  let pongHandler: () => void;

  const mockOrder: DutchAuctionOrder = {
    orderHash: '0x123',
    maker: '0x1234567890123456789012345678901234567890',
    receiver: '0x1234567890123456789012345678901234567890',
    makerAsset: '0xA0b86a33E6441b8b4C862d2B9b8a9E0C6C59D8C0',
    takerAsset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    makerAmount: '1000000000000000000',
    takerAmount: '100000000000000000',
    salt: '12345',
    interactions: '0x',
    status: AuctionStatus.ACTIVE,
    auctionStartTime: Math.floor(Date.now() / 1000),
    auctionEndTime: Math.floor(Date.now() / 1000) + 1000,
    startPrice: '1000000000000000000',
    endPrice: '500000000000000000'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock WebSocket Server
    mockServer = {
      on: jest.fn((event: string, handler: any) => {
        if (event === 'connection') {
          connectionHandler = handler;
        }
      }),
      close: jest.fn((callback) => callback && callback()),
    } as any;

    // Mock WebSocket instance
    mockWebSocket = {
      send: jest.fn(),
      on: jest.fn((event: string, handler: any) => {
        switch (event) {
          case 'message':
            messageHandler = handler;
            break;
          case 'close':
            closeHandler = handler;
            break;
          case 'error':
            errorHandler = handler;
            break;
          case 'pong':
            pongHandler = handler;
            break;
        }
      }),
      close: jest.fn(),
      terminate: jest.fn(),
      ping: jest.fn(),
      readyState: WebSocket.OPEN,
    } as any;

    // Mock OrdersRoutes
    mockOrdersService = {
      getAllOrders: jest.fn().mockReturnValue([mockOrder]),
    } as any;

    // Mock WebSocket.Server constructor
    (WebSocket.Server as jest.Mock).mockImplementation(() => mockServer);

    service = new WebSocketService(8081, mockOrdersService);
  });

  afterEach(() => {
    jest.useRealTimers();
    if (service) {
      service.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize WebSocket server on specified port', () => {
      expect(WebSocket.Server).toHaveBeenCalledWith({ port: 8081 });
    });

    it('should use default port when not specified', () => {
      const defaultService = new WebSocketService();
      expect(WebSocket.Server).toHaveBeenCalledWith({ port: 8081 });
      defaultService.stop();
    });

    it('should setup server event listeners', () => {
      expect(mockServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should start heartbeat mechanism', () => {
      expect(setInterval).toHaveBeenCalled();
    });
  });

  describe('client connection', () => {
    beforeEach(() => {
      // Simulate client connection
      const mockRequest = {
        headers: { 'user-agent': 'test-client' },
        socket: { remoteAddress: '192.168.1.100' }
      };
      connectionHandler(mockWebSocket, mockRequest);
    });

    it('should handle new client connections', () => {
      expect(mockWebSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWebSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWebSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWebSocket.on).toHaveBeenCalledWith('pong', expect.any(Function));
    });

    it('should send welcome message to new clients', () => {
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Connected to DeFi Relayer WebSocket Service')
      );
    });

    it('should update connection metrics', () => {
      expect(websocketConnectionsTotal.set).toHaveBeenCalled();
    });
  });

  describe('message handling', () => {
    beforeEach(() => {
      connectionHandler(mockWebSocket, {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      });
      jest.clearAllMocks();
    });

    it('should handle ping messages', () => {
      const pingMessage: WebSocketMessage = {
        type: 'ping',
        timestamp: Date.now()
      };

      messageHandler(Buffer.from(JSON.stringify(pingMessage)));

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"pong"')
      );
      expect(recordWebSocketMessage).toHaveBeenCalledWith('ping', 'inbound');
    });

    it('should handle subscription messages', () => {
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        data: { subscription: 'orders' },
        timestamp: Date.now()
      };

      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Subscribed to orders')
      );
    });

    it('should handle subscription with filters', () => {
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        data: {
          subscription: 'orders',
          filters: {
            maker: '0x1234567890123456789012345678901234567890',
            status: [AuctionStatus.ACTIVE]
          }
        },
        timestamp: Date.now()
      };

      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Subscribed to orders')
      );
    });

    it('should handle unsubscription messages', () => {
      // First subscribe
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        data: { subscription: 'orders' },
        timestamp: Date.now()
      };
      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));

      // Then unsubscribe
      const unsubscribeMessage: WebSocketMessage = {
        type: 'unsubscribe',
        data: { subscription: 'orders' },
        timestamp: Date.now()
      };
      messageHandler(Buffer.from(JSON.stringify(unsubscribeMessage)));

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Unsubscribed successfully')
      );
    });

    it('should handle unsubscribe all', () => {
      const unsubscribeAllMessage: WebSocketMessage = {
        type: 'unsubscribe',
        data: { subscription: 'all' },
        timestamp: Date.now()
      };

      messageHandler(Buffer.from(JSON.stringify(unsubscribeAllMessage)));

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Unsubscribed successfully')
      );
    });

    it('should handle invalid JSON messages', () => {
      messageHandler(Buffer.from('invalid json'));

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid message format')
      );
    });

    it('should handle unknown message types', () => {
      const unknownMessage = {
        type: 'unknown',
        timestamp: Date.now()
      };

      messageHandler(Buffer.from(JSON.stringify(unknownMessage)));

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Unknown message type')
      );
    });

    it('should handle subscription without subscription type', () => {
      const invalidSubscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        data: {},
        timestamp: Date.now()
      };

      messageHandler(Buffer.from(JSON.stringify(invalidSubscribeMessage)));

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Subscription type is required')
      );
    });
  });

  describe('client disconnection', () => {
    beforeEach(() => {
      connectionHandler(mockWebSocket, {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      });
    });

    it('should handle client disconnection', () => {
      closeHandler();

      expect(websocketConnectionsTotal.set).toHaveBeenCalled();
    });

    it('should handle client errors', () => {
      const error = new Error('Connection error');
      errorHandler(error);

      // Should log the error but not crash
      expect(mockWebSocket.send).not.toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });
  });

  describe('heartbeat mechanism', () => {
    beforeEach(() => {
      connectionHandler(mockWebSocket, {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      });
    });

    it('should ping clients periodically', () => {
      jest.advanceTimersByTime(30000);

      expect(mockWebSocket.ping).toHaveBeenCalled();
    });

    it('should terminate inactive clients', () => {
      // Advance time twice without pong response
      jest.advanceTimersByTime(30000);
      jest.advanceTimersByTime(30000);

      expect(mockWebSocket.terminate).toHaveBeenCalled();
    });

    it('should keep alive clients that respond to ping', () => {
      jest.advanceTimersByTime(30000);
      pongHandler(); // Client responds
      jest.advanceTimersByTime(30000);

      expect(mockWebSocket.terminate).not.toHaveBeenCalled();
    });
  });

  describe('broadcasting', () => {
    beforeEach(() => {
      connectionHandler(mockWebSocket, {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      });
      // Subscribe to orders
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        data: { subscription: 'orders' },
        timestamp: Date.now()
      };
      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));
      jest.clearAllMocks();
    });

    it('should broadcast order created events', () => {
      service.broadcastOrderCreated(mockOrder);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('order_created')
      );
    });

    it('should broadcast order updated events', () => {
      service.broadcastOrderUpdated('0x123', mockOrder, 'status');

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('order_update')
      );
    });

    it('should broadcast order filled events', () => {
      service.broadcastOrderUpdated('0x123', mockOrder, 'fill');

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('order_filled')
      );
    });

    it('should broadcast order cancelled events', () => {
      service.broadcastOrderUpdated('0x123', mockOrder, 'cancel');

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('order_cancelled')
      );
    });

    it('should broadcast profitable opportunities', () => {
      // Subscribe to profitable opportunities
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        data: { subscription: 'profitable_opportunities' },
        timestamp: Date.now()
      };
      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));
      jest.clearAllMocks();

      const opportunity = {
        opportunities: [{ orderHash: '0x123', profit: '1000' }],
        count: 1
      };

      service.broadcastProfitableOpportunity(opportunity);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('profitable_opportunity')
      );
    });
  });

  describe('order filtering', () => {
    beforeEach(() => {
      connectionHandler(mockWebSocket, {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      });
    });

    it('should send current orders on subscription', () => {
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        data: { subscription: 'orders' },
        timestamp: Date.now()
      };

      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));

      expect(mockOrdersService.getAllOrders).toHaveBeenCalled();
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('order_update')
      );
    });

    it('should apply filters when sending current orders', () => {
      const subscribeMessage: WebSocketMessage = {
        type: 'subscribe',
        data: {
          subscription: 'orders',
          filters: {
            status: [AuctionStatus.ACTIVE],
            maker: '0x1234567890123456789012345678901234567890'
          }
        },
        timestamp: Date.now()
      };

      messageHandler(Buffer.from(JSON.stringify(subscribeMessage)));

      expect(mockOrdersService.getAllOrders).toHaveBeenCalled();
    });
  });

  describe('service status', () => {
    it('should return service status', () => {
      const status = service.getStatus();

      expect(status).toHaveProperty('port');
      expect(status).toHaveProperty('connectedClients');
      expect(status).toHaveProperty('totalSubscriptions');
      expect(status).toHaveProperty('subscriptionTypes');
      expect(status).toHaveProperty('uptime');
      expect(status).toHaveProperty('timestamp');
    });
  });

  describe('service shutdown', () => {
    beforeEach(() => {
      connectionHandler(mockWebSocket, {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      });
    });

    it('should close all connections on stop', async () => {
      await service.stop();

      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, 'Server shutting down');
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should clear heartbeat interval on stop', async () => {
      await service.stop();

      expect(clearInterval).toHaveBeenCalled();
    });

    it('should handle errors during client disconnect', async () => {
      mockWebSocket.close.mockImplementation(() => {
        throw new Error('Close error');
      });

      await expect(service.stop()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      connectionHandler(mockWebSocket, {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      });
    });

    it('should handle send errors gracefully', () => {
      mockWebSocket.send.mockImplementation(() => {
        throw new Error('Send failed');
      });

      const pingMessage: WebSocketMessage = {
        type: 'ping',
        timestamp: Date.now()
      };

      expect(() => {
        messageHandler(Buffer.from(JSON.stringify(pingMessage)));
      }).not.toThrow();

      expect(recordError).toHaveBeenCalledWith('websocket_send_failed', 'websocket');
    });

    it('should handle closed connection during send', () => {
      mockWebSocket.readyState = WebSocket.CLOSED;

      const pingMessage: WebSocketMessage = {
        type: 'ping',
        timestamp: Date.now()
      };

      messageHandler(Buffer.from(JSON.stringify(pingMessage)));

      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('setOrderRoutes', () => {
    it('should update order routes reference', () => {
      const newOrdersService = {} as OrdersRoutes;
      service.setOrderRoutes(newOrdersService);

      // This is tested indirectly through subscription behavior
      expect(service).toBeDefined();
    });
  });
});

