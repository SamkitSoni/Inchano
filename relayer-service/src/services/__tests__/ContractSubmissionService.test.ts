import { ethers } from 'ethers';
import { ContractSubmissionService, FillOrderParams, TransactionResult } from '../ContractSubmissionService';
import { LimitOrder } from '../../utils/signatureVerification';

// Mock ethers
jest.mock('ethers', () => ({
  ...jest.requireActual('ethers'),
  providers: {
    JsonRpcProvider: jest.fn(),
  },
  Wallet: jest.fn(),
  Contract: jest.fn(),
  BigNumber: {
    from: jest.fn(),
  },
  utils: {
    parseEther: jest.fn(),
    isAddress: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock signature verification
jest.mock('../../utils/signatureVerification', () => ({
  getDomainData: jest.fn().mockReturnValue({
    name: '1inch Limit Order Protocol',
    version: '4',
    chainId: 1,
    verifyingContract: '0x1111111254EEB25477B68fb85Ed929f73A960582'
  }),
}));

describe('ContractSubmissionService', () => {
  let service: ContractSubmissionService;
  let mockProvider: jest.Mocked<ethers.providers.JsonRpcProvider>;
  let mockWallet: jest.Mocked<ethers.Wallet>;
  let mockContract: jest.Mocked<ethers.Contract>;
  let mockSigner: jest.Mocked<ethers.Contract>;

  const mockOrder: LimitOrder = {
    salt: '12345',
    maker: '0x1234567890123456789012345678901234567890',
    receiver: '0x1234567890123456789012345678901234567890',
    makerAsset: '0xA0b86a33E6441b8b4C862d2B9b8a9E0C6C59D8C0',
    takerAsset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    makerAmount: '1000000000000000000',
    takerAmount: '100000000000000000',
    interactions: '0x'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock provider
    mockProvider = {
      getGasPrice: jest.fn().mockResolvedValue(ethers.BigNumber.from('20000000000')),
      getBlockNumber: jest.fn().mockResolvedValue(12345),
      getBlock: jest.fn().mockResolvedValue({ timestamp: Date.now() }),
    } as any;

    // Mock wallet
    mockWallet = {
      address: '0x9876543210987654321098765432109876543210',
      provider: mockProvider,
    } as any;

    // Mock contract with signer
    mockSigner = {
      estimateGas: {
        fillOrder: jest.fn().mockResolvedValue(ethers.BigNumber.from('200000')),
        cancelOrder: jest.fn().mockResolvedValue(ethers.BigNumber.from('100000')),
      },
      fillOrder: jest.fn().mockResolvedValue({
        hash: '0xabcdef1234567890',
        wait: jest.fn().mockResolvedValue({
          blockNumber: 12346,
          gasUsed: ethers.BigNumber.from('180000'),
        }),
      }),
      cancelOrder: jest.fn().mockResolvedValue({
        hash: '0xfedcba0987654321',
        wait: jest.fn().mockResolvedValue({
          blockNumber: 12347,
          gasUsed: ethers.BigNumber.from('90000'),
        }),
      }),
    } as any;

    // Mock base contract
    mockContract = {
      connect: jest.fn().mockReturnValue(mockSigner),
      hashOrder: jest.fn().mockResolvedValue('0x1234567890abcdef'),
      remainingOrderAmount: jest.fn().mockResolvedValue(ethers.BigNumber.from('500000000000000000')),
      isValidSignature: jest.fn().mockResolvedValue('0x1626ba7e'),
    } as any;

    // Setup mocks
    (ethers.providers.JsonRpcProvider as jest.Mock).mockImplementation(() => mockProvider);
    (ethers.Wallet as jest.Mock).mockImplementation(() => mockWallet);
    (ethers.Contract as jest.Mock).mockImplementation(() => mockContract);

    // Set environment variables for testing
    process.env.RELAYER_PRIVATE_KEY = '0x' + '1'.repeat(64);
  });

  afterEach(() => {
    delete process.env.RELAYER_PRIVATE_KEY;
  });

  describe('initialization', () => {
    it('should initialize without private key', () => {
      delete process.env.RELAYER_PRIVATE_KEY;
      expect(() => new ContractSubmissionService()).not.toThrow();
    });

    it('should initialize with private key', () => {
      process.env.RELAYER_PRIVATE_KEY = '0x' + '1'.repeat(64);
      expect(() => new ContractSubmissionService()).not.toThrow();
    });
  });

  describe('fillOrder', () => {
    beforeEach(() => {
      service = new ContractSubmissionService();
    });

    it('should successfully fill an order', async () => {
      const fillParams: FillOrderParams = {
        order: mockOrder,
        signature: '0x' + '1'.repeat(130),
        fillAmount: '100000000000000000',
      };

      const result = await service.fillOrder(fillParams, 'ethereum');

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xabcdef1234567890');
      expect(result.gasUsed).toBe('180000');
      expect(result.blockNumber).toBe(12346);
      expect(mockSigner['fillOrder']).toHaveBeenCalled();
    });

    it('should handle fill order failure', async () => {
      mockSigner['fillOrder'] = jest.fn().mockRejectedValue(new Error('Transaction failed'));
      
      const fillParams: FillOrderParams = {
        order: mockOrder,
        signature: '0x' + '1'.repeat(130),
        fillAmount: '100000000000000000',
      };

      const result = await service.fillOrder(fillParams, 'ethereum');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction failed');
    });

    it('should fail when wallet is not available', async () => {
      delete process.env.RELAYER_PRIVATE_KEY;
      service = new ContractSubmissionService();

      const fillParams: FillOrderParams = {
        order: mockOrder,
        signature: '0x' + '1'.repeat(130),
        fillAmount: '100000000000000000',
      };

      const result = await service.fillOrder(fillParams, 'ethereum');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Wallet not available - private key not configured');
    });
  });

  describe('cancelOrder', () => {
    beforeEach(() => {
      service = new ContractSubmissionService();
    });

    it('should successfully cancel an order', async () => {
      const result = await service.cancelOrder(mockOrder, 'ethereum');

      expect(result.success).toBe(true);
      expect(result.txHash).toBe('0xfedcba0987654321');
      expect(result.gasUsed).toBe('90000');
      expect(result.blockNumber).toBe(12347);
      expect(mockSigner['cancelOrder']).toHaveBeenCalled();
    });

    it('should handle cancel order failure', async () => {
      mockSigner['cancelOrder'] = jest.fn().mockRejectedValue(new Error('Cancel failed'));
      
      const result = await service.cancelOrder(mockOrder, 'ethereum');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cancel failed');
    });
  });

  describe('hashOrder', () => {
    beforeEach(() => {
      service = new ContractSubmissionService();
    });

    it('should return order hash from contract', async () => {
      const hash = await service.hashOrder(mockOrder, 'ethereum');
      expect(hash).toBe('0x1234567890abcdef');
      expect(mockContract['hashOrder']).toHaveBeenCalled();
    });

    it('should throw error when contract is not available', async () => {
      // Create service without contracts
      const emptyService = Object.create(ContractSubmissionService.prototype);
      emptyService.contracts = new Map();
      
      await expect(emptyService.hashOrder(mockOrder, 'ethereum'))
        .rejects.toThrow('Contract not available for network: ethereum');
    });
  });

  describe('getRemainingOrderAmount', () => {
    beforeEach(() => {
      service = new ContractSubmissionService();
    });

    it('should return remaining order amount', async () => {
      const result = await service.getRemainingOrderAmount('0x123', 'ethereum');
      
      expect(result.data).toBe('500000000000000000');
      expect(result.blockNumber).toBe(12345);
      expect(mockContract['remainingOrderAmount']).toHaveBeenCalledWith('0x123');
    });
  });

  describe('isValidSignature', () => {
    beforeEach(() => {
      service = new ContractSubmissionService();
    });

    it('should return true for valid signature', async () => {
      const isValid = await service.isValidSignature('0x123', '0xsignature', 'ethereum');
      expect(isValid).toBe(true);
      expect(mockContract['isValidSignature']).toHaveBeenCalledWith('0x123', '0xsignature');
    });

    it('should return false for invalid signature', async () => {
      mockContract['isValidSignature'] = jest.fn().mockResolvedValue('0x00000000');
      
      const isValid = await service.isValidSignature('0x123', '0xsignature', 'ethereum');
      expect(isValid).toBe(false);
    });

    it('should return false on error', async () => {
      mockContract['isValidSignature'] = jest.fn().mockRejectedValue(new Error('Contract error'));
      
      const isValid = await service.isValidSignature('0x123', '0xsignature', 'ethereum');
      expect(isValid).toBe(false);
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      service = new ContractSubmissionService();
    });

    it('should return network status', () => {
      const status = service.getNetworkStatus();
      expect(status).toHaveProperty('ethereum');
      expect(status).toHaveProperty('sepolia');
      expect(status.ethereum.connected).toBe(true);
    });

    it('should return readiness status', () => {
      const isReady = service.isReady();
      expect(typeof isReady).toBe('boolean');
    });

    it('should return supported networks', () => {
      const networks = service.getSupportedNetworks();
      expect(networks).toContain('ethereum');
      expect(networks).toContain('sepolia');
    });
  });
});
