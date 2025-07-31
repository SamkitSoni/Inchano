import { AuctionDetailsParser, AuctionCalculator, AuctionMonitor } from './index';
import { DutchAuctionOrder, AuctionConfig } from './types';
import { 
  calculateCurrentPrice, 
  calculatePriceDecayRate, 
  calculateAuctionProgress,
  getAuctionStatus,
  isProfitable
} from './utils';

describe('AuctionDetails Module', () => {
  // Sample Dutch auction order for testing
  const sampleOrder: DutchAuctionOrder = {
    orderHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    maker: '0xMakerAddress',
    receiver: '0xReceiverAddress',
    makerAsset: '0xUSDC',
    takerAsset: '0xETH',
    makerAmount: '1000000000', // 1000 USDC (6 decimals)
    takerAmount: '500000000000000000', // 0.5 ETH (18 decimals)
    startTime: Math.floor(Date.now() / 1000), // Now
    endTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    startPrice: '2000000000000000000', // 2 ETH
    endPrice: '1000000000000000000', // 1 ETH
    auctionStartTime: Math.floor(Date.now() / 1000),
    auctionEndTime: Math.floor(Date.now() / 1000) + 3600,
    salt: '0x123',
    signature: '0xSignature'
  };

  describe('AuctionDetailsParser', () => {
    it('should parse raw auction data correctly', () => {
      const rawData = { ...sampleOrder };
      const parsed = AuctionDetailsParser.parse(rawData);
      
      expect(parsed.orderHash).toBe(sampleOrder.orderHash);
      expect(parsed.maker).toBe(sampleOrder.maker);
      expect(parsed.startPrice).toBe(sampleOrder.startPrice);
    });

    it('should validate order data', () => {
      expect(AuctionDetailsParser.validateOrder(sampleOrder)).toBe(true);
      
      const invalidOrder = { ...sampleOrder, orderHash: '' };
      expect(AuctionDetailsParser.validateOrder(invalidOrder)).toBe(false);
    });

    it('should throw error for invalid data', () => {
      expect(() => AuctionDetailsParser.parse(null)).toThrow('Invalid auction data');
    });
  });

  describe('Utils Functions', () => {
    it('should calculate current price correctly', () => {
      const currentTime = sampleOrder.startTime + 1800; // 30 minutes in
      const currentPrice = calculateCurrentPrice(sampleOrder, currentTime);
      
      // At 50% progress, price should be halfway between start and end
      const expectedPrice = '1500000000000000000'; // 1.5 ETH
      expect(currentPrice).toBe(expectedPrice);
    });

    it('should calculate price decay rate', () => {
      const decayRate = calculatePriceDecayRate(sampleOrder);
      const expectedRate = '277777777777777'; // (2-1 ETH) / 3600 seconds
      expect(decayRate).toBe(expectedRate);
    });

    it('should calculate auction progress', () => {
      const halfwayTime = sampleOrder.startTime + 1800; // 30 minutes
      const progress = calculateAuctionProgress(sampleOrder, halfwayTime);
      expect(progress).toBe(0.5);
    });

    it('should determine auction status', () => {
      const beforeStart = sampleOrder.startTime - 100;
      const duringAuction = sampleOrder.startTime + 100;
      const afterEnd = sampleOrder.endTime + 100;

      expect(getAuctionStatus(sampleOrder, beforeStart)).toBe('pending');
      expect(getAuctionStatus(sampleOrder, duringAuction)).toBe('active');
      expect(getAuctionStatus(sampleOrder, afterEnd)).toBe('expired');
    });

    it('should check profitability', () => {
      // Create an order that should be profitable with low gas, unprofitable with high gas
      const profitableOrder: DutchAuctionOrder = {
        ...sampleOrder,
        startPrice: '100000000000000000', // 0.1 ETH - smaller value for testing
        endPrice: '50000000000000000', // 0.05 ETH
      };
      
      const currentTime = profitableOrder.startTime + 100; // Early in auction
      const highGasPrice = '1000000000000'; // 1000 gwei - very high gas price
      const lowGasPrice = '1000000000'; // 1 gwei

      expect(isProfitable(profitableOrder, currentTime, lowGasPrice)).toBe(true);
      expect(isProfitable(profitableOrder, currentTime, highGasPrice)).toBe(false);
    });
  });

  describe('AuctionCalculator', () => {
    let calculator: AuctionCalculator;

    beforeEach(() => {
      const config: AuctionConfig = {
        priceUpdateInterval: 1000,
        maxSlippage: 0.05,
        minProfitMargin: 0.01,
        gasBuffer: 0.2
      };
      calculator = new AuctionCalculator(config);
    });

    it('should calculate auction details', () => {
      const details = calculator.calculateAuctionDetails(sampleOrder);
      
      expect(details.orderHash).toBe(sampleOrder.orderHash);
      expect(details.isActive).toBe(true);
      expect(parseFloat(details.currentPrice)).toBeGreaterThan(0);
      expect(details.timeRemaining).toBeGreaterThan(0);
    });

    it('should calculate with profitability analysis', () => {
      const gasPrice = '20000000000'; // 20 gwei
      const result = calculator.calculateWithProfitability(sampleOrder, gasPrice);
      
      expect(result.currentPrice).toBeDefined();
      expect(result.isProfitable).toBeDefined();
      expect(result.gasEstimate).toBeDefined();
      expect(result.netProfit).toBeDefined();
    });

    it('should calculate optimal execution time', () => {
      const gasPrice = '20000000000';
      const targetProfitMargin = 0.02;
      
      const optimalTime = calculator.calculateOptimalExecutionTime(
        sampleOrder, 
        gasPrice, 
        targetProfitMargin
      );
      
      expect(optimalTime).toBeGreaterThanOrEqual(sampleOrder.startTime);
      expect(optimalTime).toBeLessThanOrEqual(sampleOrder.endTime);
    });

    it('should calculate batch orders', () => {
      const orders = [sampleOrder, { ...sampleOrder, orderHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' }];
      const gasPrice = '20000000000';
      
      const results = calculator.calculateBatch(orders, gasPrice);
      
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('currentPrice');
      expect(results[0]).toHaveProperty('isProfitable');
    });

    it('should calculate efficiency metrics', () => {
      const metrics = calculator.calculateEfficiencyMetrics(sampleOrder);
      
      expect(metrics.priceDecayRate).toBeDefined();
      expect(metrics.timeUtilization).toBeGreaterThanOrEqual(0);
      expect(metrics.priceUtilization).toBeGreaterThanOrEqual(0);
      expect(metrics.efficiency).toBeGreaterThanOrEqual(0);
      expect(metrics.efficiency).toBeLessThanOrEqual(1);
    });
  });

  describe('AuctionMonitor', () => {
    let monitor: AuctionMonitor;

    beforeEach(() => {
      const config: AuctionConfig = {
        priceUpdateInterval: 100, // Fast updates for testing
        maxSlippage: 0.05,
        minProfitMargin: 0.01,
        gasBuffer: 0.2
      };
      monitor = new AuctionMonitor(config);
    });

    afterEach(() => {
      monitor.stop();
    });

    it('should add and monitor orders', () => {
      monitor.addOrder(sampleOrder);
      
      expect(monitor.isMonitoring(sampleOrder.orderHash)).toBe(true);
      expect(monitor.getActiveOrderCount()).toBe(1);
    });

    it('should remove orders', () => {
      monitor.addOrder(sampleOrder);
      monitor.removeOrder(sampleOrder.orderHash);
      
      expect(monitor.isMonitoring(sampleOrder.orderHash)).toBe(false);
      expect(monitor.getActiveOrderCount()).toBe(0);
    });

    it('should get order details', () => {
      monitor.addOrder(sampleOrder);
      const details = monitor.getOrderDetails(sampleOrder.orderHash);
      
      expect(details).not.toBeNull();
      expect(details?.orderHash).toBe(sampleOrder.orderHash);
    });

    it('should get profitable orders', () => {
      // Create an order that should be profitable
      const profitableOrder: DutchAuctionOrder = {
        ...sampleOrder,
        startPrice: '10000000000000000000', // 10 ETH - much higher to ensure profitability
        endPrice: '5000000000000000000', // 5 ETH
      };
      
      monitor.addOrder(profitableOrder);
      const gasPrice = '1000000000'; // Low gas price for profitability
      const profitable = monitor.getProfitableOrders(gasPrice);
      
      expect(profitable).toHaveLength(1);
      expect(profitable[0].orderHash).toBe(profitableOrder.orderHash);
    });

    it('should emit events on order changes', (done) => {
      monitor.on('order_added', (event) => {
        expect(event.orderHash).toBe(sampleOrder.orderHash);
        expect(event.eventType).toBe('start');
        done();
      });
      
      monitor.addOrder(sampleOrder);
    });

    it('should start and stop monitoring', () => {
      expect(() => monitor.start()).not.toThrow();
      expect(() => monitor.stop()).not.toThrow();
    });

    it('should handle order fill events', () => {
      monitor.addOrder(sampleOrder);
      
      const fillData = {
        transactionHash: '0xfillTx',
        blockNumber: 12345,
        fillPrice: '1500000000000000000'
      };
      
      monitor.on('order_filled', (event) => {
        expect(event.orderHash).toBe(sampleOrder.orderHash);
        expect(event.transactionHash).toBe(fillData.transactionHash);
      });
      
      monitor.handleOrderFill(sampleOrder.orderHash, fillData);
      expect(monitor.isMonitoring(sampleOrder.orderHash)).toBe(false);
    });

    it('should get metrics', () => {
      monitor.addOrder(sampleOrder);
      const metrics = monitor.getMetrics();
      
      expect(metrics.totalOrders).toBe(1);
      expect(metrics.activeOrders).toBe(1);
      expect(metrics.averageAuctionDuration).toBeDefined();
      expect(metrics.averageFillRate).toBeDefined();
      expect(metrics.totalVolume).toBeDefined();
    });

    it('should clear all orders', () => {
      monitor.addOrder(sampleOrder);
      monitor.addOrder({ ...sampleOrder, orderHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' });
      
      expect(monitor.getActiveOrderCount()).toBe(2);
      
      monitor.clearAllOrders();
      expect(monitor.getActiveOrderCount()).toBe(0);
    });
  });
});
