import { PriceUpdateService, PriceUpdateConfig } from '../PriceUpdateService';
import { OrdersRoutes } from '../../routes/orders';
import { WebSocketService } from '../WebSocketService';
import { AuctionCalculator } from '../../auction-details/calculator';
import { AuctionStatus, DutchAuctionOrder, AuctionCalculationResult } from '../../auction-details/types';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../auction-details/calculator');

describe('PriceUpdateService', () => {
  let service: PriceUpdateService;
  let mockOrdersService: jest.Mocked<OrdersRoutes>;
  let mockWebSocketService: jest.Mocked<WebSocketService>;
  let mockAuctionCalculator: jest.Mocked<AuctionCalculator>;

  const mockConfig: PriceUpdateConfig = {
    updateInterval: 1000, // 1 second for testing
    enableRealTimeUpdates: true
  };

  // Type for extended order as used by OrdersRoutes
  type ExtendedOrder = DutchAuctionOrder & { status: AuctionStatus; createdAt: Date; updatedAt: Date };

  const mockActiveOrder: ExtendedOrder = {
    orderHash: '0x1234567890abcdef',
    maker: '0x1234567890123456789012345678901234567890',
    receiver: '0x1234567890123456789012345678901234567890',
    makerAsset: '0xA0b86a33E6441b8b4C862d2B9b8a9E0C6C59D8C0',
    takerAsset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    makerAmount: '1000000000000000000',
    takerAmount: '100000000000000000',
    salt: '12345',
    signature: '0x' + '1'.repeat(130),
    startTime: Math.floor(Date.now() / 1000) - 100,
    endTime: Math.floor(Date.now() / 1000) + 900,
    startPrice: '1000000000000000000',
    endPrice: '500000000000000000',
    auctionStartTime: Math.floor(Date.now() / 1000) - 100, // Started 100 seconds ago
    auctionEndTime: Math.floor(Date.now() / 1000) + 900,   // Ends in 900 seconds
    status: AuctionStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockExpiredOrder: ExtendedOrder = {
    ...mockActiveOrder,
    orderHash: '0xfedcba0987654321',
    auctionEndTime: Math.floor(Date.now() / 1000) - 100, // Expired 100 seconds ago
    endTime: Math.floor(Date.now() / 1000) - 100
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock OrdersRoutes
    mockOrdersService = {
      getAllOrders: jest.fn(),
      updateOrderStatus: jest.fn(),
    } as any;

    // Mock WebSocketService
    mockWebSocketService = {
      broadcastOrderUpdated: jest.fn(),
      broadcastProfitableOpportunity: jest.fn(),
    } as any;

    // Mock AuctionCalculator
    mockAuctionCalculator = new AuctionCalculator() as jest.Mocked<AuctionCalculator>;
    (AuctionCalculator as jest.Mock).mockImplementation(() => mockAuctionCalculator);

    mockAuctionCalculator.calculateAuctionDetails = jest.fn().mockReturnValue({
      currentPrice: '750000000000000000',
      timeRemaining: 800,
      auctionProgress: 0.1
    });

    mockAuctionCalculator.calculateWithProfitability = jest.fn().mockReturnValue({
      currentPrice: '750000000000000000',
      timeElapsed: 100,
      timeRemaining: 800,
      priceDecay: '250000000000000000',
      isProfitable: true,
      gasEstimate: '150000',
      netProfit: '50000000000000000'
    });

    service = new PriceUpdateService(mockOrdersService, mockWebSocketService, mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
    if (service) {
      service.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const customConfig: PriceUpdateConfig = {
        updateInterval: 5000,
        enableRealTimeUpdates: false
      };

      const customService = new PriceUpdateService(
        mockOrdersService,
        mockWebSocketService,
        customConfig
      );

      const status = customService.getStatus();
      expect(status).toMatchObject({
        isRunning: false,
        updateInterval: 5000,
        enableRealTimeUpdates: false
      });
    });

    it('should initialize with default config when not provided', () => {
      const defaultService = new PriceUpdateService(mockOrdersService, mockWebSocketService);
      const status = defaultService.getStatus();
      
      expect(status).toMatchObject({
        isRunning: false,
        updateInterval: 30000,
        enableRealTimeUpdates: true
      });
    });
  });

  describe('start', () => {
    it('should start the service when real-time updates are enabled', () => {
      mockOrdersService.getAllOrders.mockReturnValue([mockActiveOrder]);

      service.start();

      const status = service.getStatus();
      expect(status).toMatchObject({
        isRunning: true,
        enableRealTimeUpdates: true
      });
    });

    it('should not start when real-time updates are disabled', () => {
      const disabledConfig: PriceUpdateConfig = {
        updateInterval: 1000,
        enableRealTimeUpdates: false
      };

      const disabledService = new PriceUpdateService(
        mockOrdersService,
        mockWebSocketService,
        disabledConfig
      );

      disabledService.start();

      const status = disabledService.getStatus();
      expect(status).toMatchObject({
        isRunning: false,
        enableRealTimeUpdates: false
      });
    });

    it('should not start if already running', () => {
      service.start();
      service.start(); // Second call

      const status = service.getStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop the service', () => {
      service.start();
      service.stop();

      const status = service.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should handle stop when not running', () => {
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('updateActivePrices', () => {
    beforeEach(() => {
      service.start();
    });

    it('should update prices for active orders', () => {
      mockOrdersService.getAllOrders.mockReturnValue([mockActiveOrder]);

      // Fast-forward time to trigger update
      jest.advanceTimersByTime(1000);

      expect(mockAuctionCalculator.calculateAuctionDetails).toHaveBeenCalledWith(
        mockActiveOrder,
        expect.any(Number)
      );
      expect(mockWebSocketService.broadcastOrderUpdated).toHaveBeenCalledWith(
        mockActiveOrder.orderHash,
        expect.objectContaining({
          currentPrice: '750000000000000000',
          timeRemaining: expect.any(Number),
          progress: expect.any(Number)
        }),
        'status'
      );
    });

    it('should expire orders that have passed their end time', () => {
      mockOrdersService.getAllOrders.mockReturnValue([mockExpiredOrder]);

      jest.advanceTimersByTime(1000);

      expect(mockOrdersService.updateOrderStatus).toHaveBeenCalledWith(
        mockExpiredOrder.orderHash,
        AuctionStatus.EXPIRED
      );
      expect(mockWebSocketService.broadcastOrderUpdated).toHaveBeenCalledWith(
        mockExpiredOrder.orderHash,
        mockExpiredOrder,
        'status'
      );
    });

    it('should handle calculation errors gracefully', () => {
      mockOrdersService.getAllOrders.mockReturnValue([mockActiveOrder]);
      mockAuctionCalculator.calculateAuctionDetails.mockImplementation(() => {
        throw new Error('Calculation failed');
      });

      expect(() => {
        jest.advanceTimersByTime(1000);
      }).not.toThrow();
    });

    it('should broadcast profitable opportunities', () => {
      mockOrdersService.getAllOrders.mockReturnValue([mockActiveOrder]);

      jest.advanceTimersByTime(1000);

      expect(mockWebSocketService.broadcastProfitableOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({
          opportunities: expect.any(Array),
          count: expect.any(Number),
          timestamp: expect.any(String),
          gasPrice: '20000000000'
        })
      );
    });

    it('should filter profitable opportunities by minimum margin', () => {
      const lowProfitOrder = { ...mockActiveOrder, orderHash: '0xlow_profit' };
      mockOrdersService.getAllOrders.mockReturnValue([mockActiveOrder, lowProfitOrder]);

      // Mock low profitability for second order
      mockAuctionCalculator.calculateWithProfitability
        .mockReturnValueOnce({
          currentPrice: '750000000000000000',
          timeElapsed: 100,
          timeRemaining: 800,
          priceDecay: '250000000000000000',
          isProfitable: true,
          gasEstimate: '150000',
          netProfit: '50000000000000000' // High profit
        })
        .mockReturnValueOnce({
          currentPrice: '750000000000000000',
          timeElapsed: 100,
          timeRemaining: 800,
          priceDecay: '250000000000000000',
          isProfitable: true,
          gasEstimate: '150000',
          netProfit: '1000000000000000' // Low profit (< 1%)
        });

      jest.advanceTimersByTime(1000);

      expect(mockWebSocketService.broadcastProfitableOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({
          opportunities: expect.arrayContaining([
            expect.objectContaining({
              orderHash: mockActiveOrder.orderHash
            })
          ])
        })
      );
    });

    it('should sort opportunities by profit margin', () => {
      const highProfitOrder = { ...mockActiveOrder, orderHash: '0xhigh_profit' };
      const mediumProfitOrder = { ...mockActiveOrder, orderHash: '0xmedium_profit' };
      
      mockOrdersService.getAllOrders.mockReturnValue([
        mockActiveOrder,
        highProfitOrder,
        mediumProfitOrder
      ]);

      mockAuctionCalculator.calculateWithProfitability
        .mockReturnValueOnce({
          currentPrice: '1000000000000000000',
          timeElapsed: 100,
          timeRemaining: 800,
          priceDecay: '0',
          isProfitable: true,
          gasEstimate: '150000',
          netProfit: '100000000000000000' // 10% profit
        })
        .mockReturnValueOnce({
          currentPrice: '1000000000000000000',
          timeElapsed: 100,
          timeRemaining: 800,
          priceDecay: '0',
          isProfitable: true,
          gasEstimate: '150000',
          netProfit: '200000000000000000' // 20% profit (highest)
        })
        .mockReturnValueOnce({
          currentPrice: '1000000000000000000',
          timeElapsed: 100,
          timeRemaining: 800,
          priceDecay: '0',
          isProfitable: true,
          gasEstimate: '150000',
          netProfit: '150000000000000000' // 15% profit
        });

      jest.advanceTimersByTime(1000);

      const broadcastCall = mockWebSocketService.broadcastProfitableOpportunity.mock.calls[0][0];
      const opportunities = broadcastCall.opportunities;

      expect(opportunities[0].orderHash).toBe(highProfitOrder.orderHash);
      expect(opportunities[1].orderHash).toBe(mediumProfitOrder.orderHash);
      expect(opportunities[2].orderHash).toBe(mockActiveOrder.orderHash);
    });

    it('should limit opportunities to top 10', () => {
      const manyOrders = Array.from({ length: 15 }, (_, i) => ({
        ...mockActiveOrder,
        orderHash: `0xorder_${i}`
      }));

      mockOrdersService.getAllOrders.mockReturnValue(manyOrders);

      // Mock profitable for all orders
      mockAuctionCalculator.calculateWithProfitability.mockReturnValue({
        currentPrice: '1000000000000000000',
        timeElapsed: 100,
        timeRemaining: 800,
        priceDecay: '0',
        isProfitable: true,
        gasEstimate: '150000',
        netProfit: '100000000000000000'
      });

      jest.advanceTimersByTime(1000);

      const broadcastCall = mockWebSocketService.broadcastProfitableOpportunity.mock.calls[0][0];
      expect(broadcastCall.opportunities).toHaveLength(10);
      expect(broadcastCall.count).toBe(15);
    });
  });

  describe('getStatus', () => {
    it('should return current service status', () => {
      const status = service.getStatus();
      
      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('updateInterval');
      expect(status).toHaveProperty('enableRealTimeUpdates');
      expect(status).toHaveProperty('nextUpdate');
    });

    it('should return nextUpdate as null when not running', () => {
      const status = service.getStatus();
      expect(status.nextUpdate).toBeNull();
    });

    it('should return nextUpdate time when running', () => {
      service.start();
      const status = service.getStatus();
      expect(status.nextUpdate).toBeTruthy();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig: Partial<PriceUpdateConfig> = {
        updateInterval: 5000
      };

      service.updateConfig(newConfig);

      const status = service.getStatus();
      expect(status.updateInterval).toBe(5000);
    });

    it('should restart service if it was running', () => {
      service.start();
      expect(service.getStatus().isRunning).toBe(true);

      service.updateConfig({ updateInterval: 2000 });

      const status = service.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.updateInterval).toBe(2000);
    });

    it('should not start service if it was not running', () => {
      expect(service.getStatus().isRunning).toBe(false);

      service.updateConfig({ updateInterval: 2000 });

      expect(service.getStatus().isRunning).toBe(false);
    });

    it('should disable service when real-time updates are disabled', () => {
      service.start();
      expect(service.getStatus().isRunning).toBe(true);

      service.updateConfig({ enableRealTimeUpdates: false });

      expect(service.getStatus().isRunning).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle getAllOrders errors', () => {
      mockOrdersService.getAllOrders.mockImplementation(() => {
        throw new Error('Database error');
      });

      service.start();

      expect(() => {
        jest.advanceTimersByTime(1000);
      }).not.toThrow();
    });

    it('should handle WebSocket broadcast errors', () => {
      mockOrdersService.getAllOrders.mockReturnValue([mockActiveOrder]);
      mockWebSocketService.broadcastOrderUpdated.mockImplementation(() => {
        throw new Error('WebSocket error');
      });

      service.start();

      expect(() => {
        jest.advanceTimersByTime(1000);
      }).not.toThrow();
    });

    it('should handle profitable opportunities calculation errors', () => {
      mockOrdersService.getAllOrders.mockReturnValue([mockActiveOrder]);
      mockAuctionCalculator.calculateWithProfitability.mockImplementation(() => {
        throw new Error('Profitability calculation failed');
      });

      service.start();

      expect(() => {
        jest.advanceTimersByTime(1000);
      }).not.toThrow();

      // Should still broadcast but with empty opportunities
      expect(mockWebSocketService.broadcastProfitableOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({
          opportunities: [],
          count: 0
        })
      );
    });
  });

  describe('BigInt calculations', () => {
    it('should handle BigInt profit margin calculations correctly', () => {
      mockOrdersService.getAllOrders.mockReturnValue([mockActiveOrder]);
      
      mockAuctionCalculator.calculateWithProfitability.mockReturnValue({
        currentPrice: '1000000000000000000', // 1 ETH
        timeElapsed: 100,
        timeRemaining: 800,
        priceDecay: '0',
        isProfitable: true,
        gasEstimate: '150000',
        netProfit: '50000000000000000'     // 0.05 ETH (5% profit)
      });

      service.start();
      jest.advanceTimersByTime(1000);

      const broadcastCall = mockWebSocketService.broadcastProfitableOpportunity.mock.calls[0][0];
      const opportunity = broadcastCall.opportunities[0];
      
      expect(parseFloat(opportunity.profitMargin)).toBeCloseTo(0.05, 4); // 5%
    });

    it('should handle zero profit scenarios', () => {
      mockOrdersService.getAllOrders.mockReturnValue([mockActiveOrder]);
      
      mockAuctionCalculator.calculateWithProfitability.mockReturnValue({
        currentPrice: '1000000000000000000',
        timeElapsed: 100,
        timeRemaining: 800,
        priceDecay: '0',
        isProfitable: false,
        gasEstimate: '150000',
        netProfit: '0' // No profit
      });

      service.start();
      jest.advanceTimersByTime(1000);

      const broadcastCall = mockWebSocketService.broadcastProfitableOpportunity.mock.calls[0][0];
      expect(broadcastCall.opportunities).toHaveLength(0);
    });
  });
});
