import { CardanoBridge } from './CardanoBridge';
import { BridgeConfig, CrossChainSettlementData } from './types';
import { ethers } from 'ethers';

// Mock logger to prevent console spam
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),  
    debug: jest.fn()
  }
}));

// Mock ethers
jest.mock('ethers', () => ({
  ethers: {
    providers: {
      JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getNetwork: jest.fn().mockResolvedValue({ name: 'sepolia', chainId: 11155111 }),
        getBalance: jest.fn().mockResolvedValue(ethers.BigNumber.from('1000000000000000000')),
        estimateGas: jest.fn().mockResolvedValue(ethers.BigNumber.from('21000')),
        getGasPrice: jest.fn().mockResolvedValue(ethers.BigNumber.from('20000000000')),
        waitForTransaction: jest.fn().mockResolvedValue({ status: 1 })
      }))
    },
    Wallet: jest.fn().mockImplementation(() => ({
      address: '0x742d35Cc6644C3f4F0bD0cba6e2F0e8C5FCd1234',
      sendTransaction: jest.fn().mockResolvedValue({
        hash: '0xtest_transaction_hash',
        wait: jest.fn().mockResolvedValue({ status: 1 })
      })
    })),
    Contract: jest.fn().mockImplementation(() => ({
      interface: {
        encodeFunctionData: jest.fn().mockReturnValue('0xencoded_function_data')
      }
    })),
    utils: {
      formatBytes32String: jest.fn().mockReturnValue('0x' + '0'.repeat(64))
    },
    BigNumber: {
      from: jest.fn().mockImplementation((value) => ({
        mul: jest.fn().mockReturnThis(),
        div: jest.fn().mockReturnThis(),
        toString: jest.fn().mockReturnValue(value.toString())
      }))
    }
  }
}));

const mockConfig: BridgeConfig = {
  cardanoNodeUrl: 'http://localhost:3001',
  cardanoNetwork: 'testnet',
  ethereumRpcUrl: 'https://sepolia.infura.io/v3/test-key',
  ethereumNetwork: 'sepolia',
  privateKey: '0x' + '1'.repeat(64),
  cardanoWalletSeed: 'test seed phrase for cardano wallet'
};

describe('CardanoBridge', () => {
  let bridge: CardanoBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new CardanoBridge(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Construction and Initialization', () => {
    it('should create bridge instance with valid config', () => {
      expect(bridge).toBeInstanceOf(CardanoBridge);
      expect(bridge.isReady()).toBe(false);
    });

    it('should initialize successfully', async () => {
      await bridge.initialize();
      expect(bridge.isReady()).toBe(true);
    });

    it('should not reinitialize if already ready', async () => {
      await bridge.initialize();
      expect(bridge.isReady()).toBe(true);
      
      // Should not throw error or change ready state
      await bridge.initialize();
      expect(bridge.isReady()).toBe(true);
    });

    it('should return partial config without sensitive data', () => {
      const config = bridge.getConfig();
      
      expect(config).toEqual({
        cardanoNetwork: 'testnet',
        ethereumNetwork: 'sepolia',
        cardanoNodeUrl: 'http://localhost:3001',
        ethereumRpcUrl: 'https://sepolia.infura.io/v3/test-key'
      });
      
      expect(config).not.toHaveProperty('privateKey');
      expect(config).not.toHaveProperty('cardanoWalletSeed');
    });
  });

  describe('Cardano Operations', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should release funds on Cardano', async () => {
      const settlementData: CrossChainSettlementData = {
        escrowId: '1',
        buyer: '0xbuyer',
        seller: 'addr_test1cardano_seller',
        amount: '1000000',
        transactionHash: '0xeth_tx_hash',
        network: 'ethereum'
      };

      const txHash = await bridge.releaseOnCardano(settlementData);
      
      expect(txHash).toMatch(/^cardano_[a-f0-9]+$/);
      expect(typeof txHash).toBe('string');
    });

    it('should validate settlement data before Cardano release', async () => {
      const invalidData: CrossChainSettlementData = {
        escrowId: '',
        buyer: '',
        seller: '',
        amount: '0',
        transactionHash: '',
        network: 'ethereum'
      };

      await expect(bridge.releaseOnCardano(invalidData)).rejects.toThrow('Escrow ID is required');
    });

    it('should get Cardano balance (placeholder)', async () => {
      const address = 'addr_test1cardano_address';
      const balance = await bridge.getCardanoBalance(address);
      
      expect(balance).toBe('1000000000'); // Placeholder value
    });
  });

  describe('Ethereum Operations', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should release funds on Ethereum', async () => {
      const settlementData: CrossChainSettlementData = {
        escrowId: '1',
        buyer: '0xbuyer',
        seller: '0xseller',
        amount: '1000000',
        transactionHash: 'cardano_tx_hash',
        network: 'cardano'
      };

      const txHash = await bridge.releaseOnEthereum(settlementData);
      
      expect(txHash).toBe('0xtest_transaction_hash');
    });

    it('should validate settlement data before Ethereum release', async () => {
      const invalidData: CrossChainSettlementData = {
        escrowId: '',
        buyer: '',
        seller: '',
        amount: '0',
        transactionHash: '',
        network: 'cardano'
      };

      await expect(bridge.releaseOnEthereum(invalidData)).rejects.toThrow('Escrow ID is required');
    });

    it('should get Ethereum balance', async () => {
      const address = '0x742d35Cc6644C3f4F0bD0cba6e2F0e8C5FCd1234';
      const balance = await bridge.getEthereumBalance(address);
      
      expect(balance).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error if not initialized before operations', async () => {
      const settlementData: CrossChainSettlementData = {
        escrowId: '1',
        buyer: '0xbuyer',
        seller: 'addr_test1cardano_seller',
        amount: '1000000',
        transactionHash: '0xeth_tx_hash',
        network: 'ethereum'
      };

      await expect(bridge.releaseOnCardano(settlementData)).rejects.toThrow('CardanoBridge not initialized');
    });

    it('should emit bridge error events', async () => {
      await bridge.initialize();
      
      const errorSpy = jest.fn();
      bridge.on('bridge:error', errorSpy);

      // Mock a failed transaction to trigger error
      const mockProvider = (bridge as any).ethereumProvider;
      mockProvider.estimateGas.mockRejectedValueOnce(new Error('Gas estimation failed'));

      const settlementData: CrossChainSettlementData = {
        escrowId: '1',
        buyer: '0xbuyer',
        seller: '0xseller',
        amount: '1000000',
        transactionHash: 'cardano_tx_hash',
        network: 'cardano'
      };

      await expect(bridge.releaseOnEthereum(settlementData)).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error), 'releaseOnEthereum');
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should emit settlement events', async () => {
      const ethereumToCardanoSpy = jest.fn();
      const transactionSubmittedSpy = jest.fn();
      
      bridge.on('settlement:ethereum_to_cardano', ethereumToCardanoSpy);
      bridge.on('transaction:submitted', transactionSubmittedSpy);

      const settlementData: CrossChainSettlementData = {
        escrowId: '1',
        buyer: '0xbuyer',
        seller: 'addr_test1cardano_seller',
        amount: '1000000',
        transactionHash: '0xeth_tx_hash',
        network: 'ethereum'
      };

      const txHash = await bridge.releaseOnCardano(settlementData);

      expect(ethereumToCardanoSpy).toHaveBeenCalledWith(settlementData);
      expect(transactionSubmittedSpy).toHaveBeenCalledWith(txHash, 'cardano');
    });

    it('should emit transaction confirmation events for Ethereum', async () => {
      const confirmationSpy = jest.fn();
      bridge.on('transaction:confirmed', confirmationSpy);

      const settlementData: CrossChainSettlementData = {
        escrowId: '1',
        buyer: '0xbuyer',
        seller: '0xseller',
        amount: '1000000',
        transactionHash: 'cardano_tx_hash',
        network: 'cardano'
      };

      const txHash = await bridge.releaseOnEthereum(settlementData);

      // Wait a bit for the confirmation handler to be called
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(confirmationSpy).toHaveBeenCalledWith(txHash, 'ethereum');
    });
  });

  describe('Data Validation', () => {
    beforeEach(async () => {
      await bridge.initialize();
    });

    it('should validate all required fields in settlement data', async () => {
      const testCases = [
        { field: 'escrowId', value: '', expectedError: 'Escrow ID is required' },
        { field: 'buyer', value: '', expectedError: 'Buyer and seller addresses are required' },
        { field: 'seller', value: '', expectedError: 'Buyer and seller addresses are required' },
        { field: 'amount', value: '0', expectedError: 'Amount must be greater than 0' },
        { field: 'transactionHash', value: '', expectedError: 'Transaction hash is required' }
      ];

      for (const testCase of testCases) {
        const settlementData: CrossChainSettlementData = {
          escrowId: '1',
          buyer: '0xbuyer',
          seller: 'addr_test1cardano_seller',
          amount: '1000000',
          transactionHash: '0xeth_tx_hash',
          network: 'ethereum',
          [testCase.field]: testCase.value
        };

        await expect(bridge.releaseOnCardano(settlementData)).rejects.toThrow(testCase.expectedError);
      }
    });
  });
});
