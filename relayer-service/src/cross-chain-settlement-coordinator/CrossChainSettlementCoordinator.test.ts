import { EscrowMonitor } from '../escrow-monitor/EscrowMonitor';
import { CardanoEscrowMonitor } from '../cardano-escrow-monitor/CardanoEscrowMonitor';
import { CardanoBridge } from '../cardano-bridge/CardanoBridge';
import { CrossChainSettlementCoordinator, CrossChainCoordinatorConfig } from './CrossChainSettlementCoordinator';
import { EscrowEvent, EscrowEventType } from '../escrow-monitor/types';
import { CardanoEscrowEvent, CardanoEscrowEventType } from '../cardano-escrow-monitor/types';
import { BigNumber } from 'ethers';

// Mock logger to prevent console spam
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../escrow-monitor/EscrowMonitor');
jest.mock('../cardano-escrow-monitor/CardanoEscrowMonitor');
jest.mock('../cardano-bridge/CardanoBridge');

const mockEthereumMonitor = new EscrowMonitor({} as any);
const mockCardanoMonitor = new CardanoEscrowMonitor({} as any);
const mockCardanoBridge = new CardanoBridge({} as any);

const config: CrossChainCoordinatorConfig = {
  enableAutoSettlement: true,
  maxRetries: 3,
  retryDelay: 1000
};

let coordinator: CrossChainSettlementCoordinator;

beforeEach(() => {
  jest.clearAllMocks();
  
  // Setup default mock behaviors
  jest.spyOn(mockCardanoBridge, 'isReady').mockReturnValue(true);
  jest.spyOn(mockCardanoBridge, 'initialize').mockResolvedValue();
  jest.spyOn(mockCardanoBridge, 'releaseOnCardano').mockResolvedValue('cardano_tx_hash');
  jest.spyOn(mockCardanoBridge, 'releaseOnEthereum').mockResolvedValue('ethereum_tx_hash');
  
  coordinator = new CrossChainSettlementCoordinator(
    mockEthereumMonitor, 
    mockCardanoMonitor, 
    mockCardanoBridge, 
    config
  );
});

afterEach(() => {
  if (coordinator) {
    coordinator.stop();
  }
  jest.clearAllMocks();
});

describe('CrossChainSettlementCoordinator', () => {
  it('should create coordinator instance with valid config', () => {
    expect(coordinator).toBeInstanceOf(CrossChainSettlementCoordinator);
    expect(coordinator.isOperational()).toBe(false); // Not started yet
  });

  it('should start and initialize bridge if not ready', async () => {
    jest.spyOn(mockCardanoBridge, 'isReady').mockReturnValueOnce(false).mockReturnValue(true);
    const initializeSpy = jest.spyOn(mockCardanoBridge, 'initialize').mockResolvedValue();

    await coordinator.start();

    expect(initializeSpy).toHaveBeenCalled();
    expect(coordinator.isOperational()).toBe(true);
  });

  it('should not reinitialize bridge if already ready', async () => {
    jest.spyOn(mockCardanoBridge, 'isReady').mockReturnValue(true);
    const initializeSpy = jest.spyOn(mockCardanoBridge, 'initialize').mockResolvedValue();

    await coordinator.start();

    expect(initializeSpy).not.toHaveBeenCalled();
    expect(coordinator.isOperational()).toBe(true);
  });

  it('should handle Ethereum release event and trigger Cardano settlement', async () => {
    await coordinator.start();
    
    const mockEthereumEvent: EscrowEvent = {
      type: EscrowEventType.RELEASE,
      contractAddress: '0x123',
      transactionHash: '0xabc123def456',
      blockNumber: 100,
      timestamp: new Date(),
      data: {
        escrowId: '1',
        buyer: '0xbuyer',
        seller: '0xseller',
        amount: BigNumber.from(1000)
      }
    };
    
    const releaseOnCardanoSpy = jest.spyOn(mockCardanoBridge, 'releaseOnCardano');
    
    // Simulate the event by calling the handler directly
    await (coordinator as any).handleEthereumEvent(mockEthereumEvent);
    
    expect(releaseOnCardanoSpy).toHaveBeenCalledWith(expect.objectContaining({
      escrowId: '1',
      buyer: '0xbuyer',
      seller: '0xseller',
      network: 'ethereum'
    }));
  });

  it('should handle Cardano release event and trigger Ethereum settlement', async () => {
    await coordinator.start();
    
    const mockCardanoEvent: CardanoEscrowEvent = {
      type: CardanoEscrowEventType.ESCROW_RELEASED,
      scriptAddress: 'addr123',
      transactionId: 'txn123abc456',
      outputIndex: 0,
      slot: 123,
      blockHeight: 1,
      timestamp: new Date(),
      data: {
        amount: '2000'
      }
    };
    
    const releaseOnEthereumSpy = jest.spyOn(mockCardanoBridge, 'releaseOnEthereum');
    
    // Simulate the event by calling the handler directly
    await (coordinator as any).handleCardanoEvent(mockCardanoEvent);
    
    expect(releaseOnEthereumSpy).toHaveBeenCalledWith(expect.objectContaining({
      escrowId: 'txn123abc456',
      amount: '2000',
      network: 'cardano'
    }));
  });

  it('should not process events if auto settlement is disabled', async () => {
    const disabledCoordinator = new CrossChainSettlementCoordinator(
      mockEthereumMonitor, 
      mockCardanoMonitor, 
      mockCardanoBridge, 
      { ...config, enableAutoSettlement: false }
    );
    
    await disabledCoordinator.start();
    
    const mockEthereumEvent: EscrowEvent = {
      type: EscrowEventType.RELEASE,
      contractAddress: '0x123',
      transactionHash: '0xabc',
      blockNumber: 100,
      timestamp: new Date(),
      data: {}
    };
    
    const releaseOnCardanoSpy = jest.spyOn(mockCardanoBridge, 'releaseOnCardano');
    
    await (disabledCoordinator as any).handleEthereumEvent(mockEthereumEvent);
    
    expect(releaseOnCardanoSpy).not.toHaveBeenCalled();
    
    disabledCoordinator.stop();
  });

  it('should handle bridge errors properly', async () => {
    await coordinator.start();
    
    const errorHandlerSpy = jest.fn();
    coordinator.on('coordinator:error', errorHandlerSpy);
    
    const testError = new Error('Bridge connection failed');
    
    // Simulate bridge error by calling the handler directly
    (coordinator as any).handleBridgeError(testError, 'releaseOnCardano');
    
    expect(errorHandlerSpy).toHaveBeenCalledWith(testError);
  });

  it('should track settlement records', async () => {
    await coordinator.start();
    
    const status = coordinator.getStatus();
    
    expect(status).toEqual({
      running: true,
      totalSettlements: 0,
      pendingSettlements: 0,
      completedSettlements: 0,
      failedSettlements: 0
    });
  });

  it('should stop coordinator properly', async () => {
    await coordinator.start();
    expect(coordinator.isOperational()).toBe(true);
    
    await coordinator.stop();
    expect(coordinator.getStatus().running).toBe(false);
  });
});

