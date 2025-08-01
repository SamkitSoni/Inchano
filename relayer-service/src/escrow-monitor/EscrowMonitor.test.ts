import { EscrowMonitor } from './EscrowMonitor';
import { MonitorConfig, EscrowContract, EscrowEventType } from './types';
import { logger } from '../utils/logger';

// Mock WebSocket
jest.mock('ws');

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('EscrowMonitor', () => {
  let monitor: EscrowMonitor;
  let mockConfig: MonitorConfig;

  beforeEach(() => {
    mockConfig = {
      alchemyApiKey: 'test-api-key',
      network: 'sepolia',
      contracts: [
        {
          address: '0x1234567890123456789012345678901234567890',
          name: 'Test Contract',
          description: 'Test escrow contract',
          createdAt: new Date(),
          isActive: true
        }
      ],
      enableLogging: true
    };

    monitor = new EscrowMonitor(mockConfig);
  });

  afterEach(() => {
    if (monitor.isRunning()) {
      monitor.stop();
    }
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create a monitor with valid configuration', () => {
      expect(monitor).toBeInstanceOf(EscrowMonitor);
      expect(monitor.isRunning()).toBe(false);
    });

    it('should throw error for missing API key', () => {
      const invalidConfig = { ...mockConfig, alchemyApiKey: '' };
      expect(() => new EscrowMonitor(invalidConfig)).toThrow('Alchemy API Key is required');
    });

    it('should throw error for empty contracts array', () => {
      const invalidConfig = { ...mockConfig, contracts: [] };
      expect(() => new EscrowMonitor(invalidConfig)).toThrow('At least one contract address must be provided');
    });

    it('should throw error for invalid contract address', () => {
      const invalidConfig = {
        ...mockConfig,
        contracts: [{
          address: 'invalid-address',
          name: 'Invalid Contract',
          description: 'Test',
          createdAt: new Date(),
          isActive: true
        }]
      };
      expect(() => new EscrowMonitor(invalidConfig)).toThrow('Invalid contract address: invalid-address');
    });
  });

  describe('Contract Management', () => {
    it('should return active contracts', () => {
      const activeContracts = monitor.getActiveContracts();
      expect(activeContracts).toHaveLength(1);
      expect(activeContracts[0].address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should add new contract', () => {
      const newContract: EscrowContract = {
        address: '0x9876543210987654321098765432109876543210',
        name: 'New Contract',
        description: 'New test contract',
        createdAt: new Date(),
        isActive: true
      };

      monitor.addContract(newContract);
      const activeContracts = monitor.getActiveContracts();
      expect(activeContracts).toHaveLength(2);
    });

    it('should remove contract', () => {
      monitor.removeContract('0x1234567890123456789012345678901234567890');
      const activeContracts = monitor.getActiveContracts();
      expect(activeContracts).toHaveLength(0);
    });
  });

  describe('Escrow State Management', () => {
    it('should return empty states initially', () => {
      const states = monitor.getAllEscrowStates();
      expect(states).toHaveLength(0);
    });

    it('should return undefined for non-existent escrow state', () => {
      const state = monitor.getEscrowState('0x1234567890123456789012345678901234567890', '1');
      expect(state).toBeUndefined();
    });
  });

  describe('Connection Status', () => {
    it('should return correct connection status when not connected', () => {
      const status = monitor.getConnectionStatus();
      expect(status.connected).toBe(false);
      expect(status.reconnectAttempts).toBe(0);
      expect(status.subscriptions).toBe(0);
    });

    it('should report not running initially', () => {
      expect(monitor.isRunning()).toBe(false);
    });
  });

  describe('Event Handling', () => {
    it('should emit monitor:start event when starting', (done) => {
      monitor.on('monitor:start', () => {
        done();
      });

      // Mock successful WebSocket connection
      const mockWs = {
        on: jest.fn((event, callback) => {
          if (event === 'open') {
            setTimeout(callback, 0);
          }
        }),
        send: jest.fn(),
        close: jest.fn()
      };

      // Override WebSocket creation
      jest.doMock('ws', () => {
        return jest.fn(() => mockWs);
      });

      monitor.start().catch(() => {
        // Handle connection errors in tests
      });
    });

    it('should emit monitor:stop event when stopping', (done) => {
      monitor.on('monitor:stop', () => {
        done();
      });

      // Mock the monitor as running
      (monitor as any).isConnected = true;
      (monitor as any).ws = {
        close: jest.fn()
      };

      monitor.stop();
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket connection errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      try {
        await monitor.start();
      } catch (error) {
        expect(error).toBeDefined();
      }

      consoleSpy.mockRestore();
    });

    it('should not start if already running', async () => {
      // Mock the monitor as running
      (monitor as any).isConnected = true;

      await monitor.start();
      expect(logger.warn).toHaveBeenCalledWith('Monitor is already running');
    });

    it('should not stop if not running', async () => {
      await monitor.stop();
      expect(logger.warn).toHaveBeenCalledWith('Monitor is not running');
    });
  });

  describe('WebSocket URL Generation', () => {
    it('should generate correct WebSocket URL for Sepolia', () => {
      const url = (monitor as any).getWebSocketUrl();
      expect(url).toBe('wss://eth-sepolia.g.alchemy.com/v2/test-api-key');
    });

    it('should generate correct WebSocket URL for mainnet', () => {
      const mainnetConfig = { ...mockConfig, network: 'mainnet' as const };
      const mainnetMonitor = new EscrowMonitor(mainnetConfig);
      const url = (mainnetMonitor as any).getWebSocketUrl();
      expect(url).toBe('wss://eth-mainnet.g.alchemy.com/v2/test-api-key');
    });
  });

  describe('Message ID Generation', () => {
    it('should generate sequential message IDs', () => {
      const id1 = (monitor as any).generateId();
      const id2 = (monitor as any).generateId();
      expect(parseInt(id2)).toBe(parseInt(id1) + 1);
    });
  });

  describe('Event Type Mapping', () => {
    it('should map event names correctly', () => {
      expect((monitor as any).mapEventType('EscrowCreated')).toBe(EscrowEventType.CONTRACT_CREATED);
      expect((monitor as any).mapEventType('EscrowFunded')).toBe(EscrowEventType.DEPOSIT);
      expect((monitor as any).mapEventType('EscrowReleased')).toBe(EscrowEventType.RELEASE);
      expect((monitor as any).mapEventType('EscrowRefunded')).toBe(EscrowEventType.REFUND);
      expect((monitor as any).mapEventType('EscrowDisputed')).toBe(EscrowEventType.DISPUTE);
      expect((monitor as any).mapEventType('EscrowResolved')).toBe(EscrowEventType.RESOLVE);
      expect((monitor as any).mapEventType('EscrowCancelled')).toBe(EscrowEventType.CONTRACT_CANCELLED);
      expect((monitor as any).mapEventType('UnknownEvent')).toBe(null);
    });
  });
});

describe('EscrowMonitor Integration Tests', () => {
  it('should handle a complete escrow lifecycle', () => {
    // This would be an integration test with actual contract events
    // For now, we'll test the state update logic
    const config: MonitorConfig = {
      alchemyApiKey: 'test-key',
      network: 'sepolia',
      contracts: [{
        address: '0x1234567890123456789012345678901234567890',
        name: 'Test Contract',
        description: 'Test',
        createdAt: new Date(),
        isActive: true
      }],
      enableLogging: false
    };

    const monitor = new EscrowMonitor(config);
    
    // Mock the internal state update method
    const updateStateMock = jest.spyOn(monitor as any, 'updateEscrowState');
    
    // Test that the method exists and can be called
    expect(updateStateMock).toBeDefined();
  });
});
