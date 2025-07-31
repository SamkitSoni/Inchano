import { CardanoEscrowMonitor } from './CardanoEscrowMonitor';
import { 
  CardanoMonitorConfig, 
  CardanoEscrowContract 
} from './types';
import { createDefaultCardanoConfig } from './config';

// Mock WebSocket for testing
jest.mock('ws');

describe('CardanoEscrowMonitor', () => {
  let monitor: CardanoEscrowMonitor;
  let mockConfig: CardanoMonitorConfig;

  beforeEach(() => {
    mockConfig = createDefaultCardanoConfig('ws://localhost:1337');
    monitor = new CardanoEscrowMonitor(mockConfig);
  });

  afterEach(() => {
    if (monitor.isRunning()) {
      monitor.stop();
    }
  });

  describe('Constructor', () => {
    it('should create monitor with valid config', () => {
      expect(monitor).toBeInstanceOf(CardanoEscrowMonitor);
      expect(monitor.isRunning()).toBe(false);
    });

    it('should throw error with invalid config', () => {
      const invalidConfig = { ...mockConfig, ogmiosUrl: '' };
      expect(() => new CardanoEscrowMonitor(invalidConfig)).toThrow('Ogmios URL is required');
    });

    it('should throw error with no contracts', () => {
      const invalidConfig = { ...mockConfig, contracts: [] };
      expect(() => new CardanoEscrowMonitor(invalidConfig)).toThrow('At least one contract must be provided');
    });
  });

  describe('State Management', () => {
    it('should return empty states initially', () => {
      expect(monitor.getAllEscrowStates()).toHaveLength(0);
    });

    it('should return active contracts', () => {
      const activeContracts = monitor.getActiveContracts();
      expect(activeContracts.length).toBeGreaterThan(0);
      expect(activeContracts.every(c => c.isActive)).toBe(true);
    });

    it('should add new contract', () => {
      const initialCount = monitor.getActiveContracts().length;
      const newContract: CardanoEscrowContract = {
        scriptAddress: 'addr_test1wqag8t7z8m5m5vxf8k9k9k9k9k9k9k9k9k9k9k9k9k9k9k9k9k123456',
        scriptHash: 'abcd1234567890abcdef1234567890abcdef1234567890abcdef12',
        name: 'Test Contract',
        description: 'Test contract for unit tests',
        createdAt: new Date(),
        isActive: true
      };

      monitor.addContract(newContract);
      expect(monitor.getActiveContracts().length).toBe(initialCount + 1);
    });

    it('should remove contract', () => {
      const contracts = monitor.getActiveContracts();
      const initialCount = contracts.length;
      const contractToRemove = contracts[0];

      monitor.removeContract(contractToRemove.scriptAddress);
      expect(monitor.getActiveContracts().length).toBe(initialCount - 1);
    });
  });

  describe('Connection Status', () => {
    it('should return correct connection status', () => {
      const status = monitor.getConnectionStatus();
      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('reconnectAttempts');
      expect(status).toHaveProperty('currentSlot');
      expect(status).toHaveProperty('monitoredContracts');
      expect(status.connected).toBe(false);
    });

    it('should return current slot', () => {
      expect(monitor.getCurrentSlot()).toBe(0);
    });
  });

  describe('Event Handling', () => {
    it('should emit monitor:start event on successful start', (done) => {
      monitor.on('monitor:start', () => {
        expect(monitor.isRunning()).toBe(true);
        done();
      });

      // Mock successful connection
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            setTimeout(callback, 10);
          }
        }),
        send: jest.fn(),
        close: jest.fn()
      };

      // Override WebSocket constructor
      (require('ws') as any).mockImplementation(() => mockWs);

      monitor.start().catch(done);
    });

    it('should emit monitor:stop event on stop', (done) => {
      monitor.on('monitor:stop', () => {
        expect(monitor.isRunning()).toBe(false);
        done();
      });

      // First set the monitor as connected
      (monitor as any).isConnected = true;
      monitor.stop();
    });

    it('should emit connection events', (done) => {
      let eventsReceived = 0;
      const expectedEvents = ['connection:open'];

      expectedEvents.forEach(eventName => {
        monitor.on(eventName as any, () => {
          eventsReceived++;
          if (eventsReceived === expectedEvents.length) {
            done();
          }
        });
      });

      // Mock WebSocket events
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            setTimeout(callback, 10);
          }
        }),
        send: jest.fn(),
        close: jest.fn()
      };

      (require('ws') as any).mockImplementation(() => mockWs);
      monitor.start().catch(done);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', (done) => {
      monitor.on('connection:error', (error) => {
        expect(error).toBeInstanceOf(Error);
        done();
      });

      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Connection failed')), 10);
          }
        }),
        send: jest.fn(),
        close: jest.fn()
      };

      (require('ws') as any).mockImplementation(() => mockWs);
      monitor.start().catch(() => {
        // Expected to fail
      });
    });

    it('should handle invalid Ogmios messages', () => {
      // This should not throw
      expect(() => {
        (monitor as any).handleMessage({ type: 'invalid' });
      }).not.toThrow();
    });
  });

  describe('Utility Methods', () => {
    it('should add amounts correctly', () => {
      const result = (monitor as any).addAmounts('1000000', '2000000');
      expect(result).toBe('3000000');
    });

    it('should extract assets from value', () => {
      const value = {
        lovelace: '1000000',
        'policy1.asset1': '100',
        'policy2.asset2': '200'
      };

      const assets = (monitor as any).extractAssets(value);
      expect(assets).toEqual({
        'policy1.asset1': '100',
        'policy2.asset2': '200'
      });
      expect(assets).not.toHaveProperty('lovelace');
    });
  });
});

// Integration test helpers
export const createMockCardanoTransaction = (outputs: any[]) => ({
  id: 'mock-tx-id-' + Math.random().toString(36).substr(2, 9),
  inputs: [],
  outputs,
  fee: '170000',
  validityInterval: {},
  certificates: [],
  withdrawals: {},
  mint: {},
  witness: {}
});

export const createMockCardanoOutput = (address: string, lovelace: string, datum?: any) => ({
  address,
  value: { lovelace },
  datum,
  datumHash: datum ? 'mock-datum-hash' : undefined
});

export const createMockCardanoBlock = (slot: number, height: number, transactions: any[]) => ({
  slot,
  hash: 'mock-block-hash-' + slot,
  height,
  transactions
});
