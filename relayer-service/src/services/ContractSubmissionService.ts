import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { LimitOrder, NetworkName, getDomainData } from '../utils/signatureVerification';

// Environment configuration
const config = {
  rpcUrls: {
    ethereum: process.env['ETH_RPC_URL'] || 'https://eth-mainnet.alchemyapi.io/v2/your-api-key',
    sepolia: process.env['SEPOLIA_RPC_URL'] || 'https://eth-sepolia.alchemyapi.io/v2/your-api-key'
  },
  privateKey: process.env['RELAYER_PRIVATE_KEY'], // Should be set for transaction signing
  gasLimits: {
    fillOrder: parseInt(process.env['FILL_ORDER_GAS_LIMIT'] || '200000'),
    cancelOrder: parseInt(process.env['CANCEL_ORDER_GAS_LIMIT'] || '100000')
  }
};

export interface FillOrderParams {
  order: LimitOrder;
  signature: string;
  fillAmount: string;
  takerTraits?: string;
  interaction?: string;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  gasUsed?: string;
  error?: string;
  blockNumber?: number;
  timestamp?: number;
}

export interface ContractCallResult {
  data: any;
  blockNumber: number;
  timestamp: number;
}

export class ContractSubmissionService {
  private providers: Map<NetworkName, ethers.providers.JsonRpcProvider> = new Map();
  private wallets: Map<NetworkName, ethers.Wallet> = new Map();
  private contracts: Map<NetworkName, ethers.Contract> = new Map();

  // 1inch Limit Order Protocol ABI (simplified)
  private readonly LIMIT_ORDER_ABI = [
    'function fillOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makerAmount, uint256 takerAmount, bytes makerTraits, bytes interactions) order, bytes signature, bytes interaction, uint256 makingAmount, uint256 takingAmount, uint256 skipPermitAndThresholdAmount) external payable returns (uint256, uint256, bytes32)',
    'function cancelOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makerAmount, uint256 takerAmount, bytes makerTraits, bytes interactions) order) external returns (uint256)',
    'function hashOrder(tuple(uint256 salt, address maker, address receiver, address makerAsset, address takerAsset, uint256 makerAmount, uint256 takerAmount, bytes makerTraits, bytes interactions) order) external view returns (bytes32)',
    'function remainingOrderAmount(bytes32 orderHash) external view returns (uint256)',
    'function isValidSignature(bytes32 hash, bytes signature) external view returns (bytes4)',
    'event OrderFilled(bytes32 indexed orderHash, uint256 remaining)',
    'event OrderCancelled(bytes32 indexed orderHash)'
  ];

  constructor() {
    this.initializeProviders();
    this.initializeWallets();
    this.initializeContracts();
  }

  private initializeProviders(): void {
    try {
      Object.entries(config.rpcUrls).forEach(([network, rpcUrl]) => {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        this.providers.set(network as NetworkName, provider);
        logger.debug(`Initialized provider for ${network}`, { rpcUrl: rpcUrl.replace(/api-key/gi, '***') });
      });
    } catch (error) {
      logger.error('Failed to initialize providers', error);
      throw new Error('Provider initialization failed');
    }
  }

  private initializeWallets(): void {
    if (!config.privateKey) {
      logger.warn('No private key configured - contract submission will not be available');
      return;
    }

    try {
      this.providers.forEach((provider, network) => {
        const wallet = new ethers.Wallet(config.privateKey!, provider);
        this.wallets.set(network, wallet);
        logger.debug(`Initialized wallet for ${network}`, { address: wallet.address });
      });
    } catch (error) {
      logger.error('Failed to initialize wallets', error);
      throw new Error('Wallet initialization failed');
    }
  }

  private initializeContracts(): void {
    try {
      this.providers.forEach((provider, network) => {
        const domainData = getDomainData(network);
        const contract = new ethers.Contract(
          domainData.verifyingContract,
          this.LIMIT_ORDER_ABI,
          provider
        );
        this.contracts.set(network, contract);
        logger.debug(`Initialized contract for ${network}`, { 
          address: domainData.verifyingContract 
        });
      });
    } catch (error) {
      logger.error('Failed to initialize contracts', error);
      throw new Error('Contract initialization failed');
    }
  }

  /**
   * Submit order fill transaction to blockchain
   */
  async fillOrder(
    params: FillOrderParams,
    network: NetworkName = 'ethereum'
  ): Promise<TransactionResult> {
    try {
      const wallet = this.wallets.get(network);
      const contract = this.contracts.get(network);

      if (!wallet) {
        throw new Error('Wallet not available - private key not configured');
      }

      if (!contract) {
        throw new Error(`Contract not available for network: ${network}`);
      }

      // Connect contract to wallet for transactions
      const contractWithSigner = contract.connect(wallet);

      // Prepare order tuple for contract call
      const orderTuple = [
        params.order.salt,
        params.order.maker,
        params.order.receiver,
        params.order.makerAsset,
        params.order.takerAsset,
        params.order.makerAmount,
        params.order.takerAmount,
        '0x', // makerTraits (simplified)
        params.order.interactions
      ];

      // Estimate gas
      const gasEstimate = await contractWithSigner.estimateGas['fillOrder'](
        orderTuple,
        params.signature,
        params.interaction || '0x',
        params.fillAmount,
        0, // takingAmount (0 for market orders)
        0  // skipPermitAndThresholdAmount
      );

      // Get current gas price
      const gasPrice = await wallet.provider.getGasPrice();
      const adjustedGasPrice = gasPrice.mul(110).div(100); // 10% increase for faster confirmation

      logger.info('Submitting fill order transaction', {
        network,
        orderHash: await this.hashOrder(params.order, network),
        fillAmount: params.fillAmount,
        gasEstimate: gasEstimate.toString(),
        gasPrice: adjustedGasPrice.toString()
      });

      // Submit transaction
      const tx = await contractWithSigner['fillOrder'](
        orderTuple,
        params.signature,
        params.interaction || '0x',
        params.fillAmount,
        0, // takingAmount
        0, // skipPermitAndThresholdAmount
        {
          gasLimit: gasEstimate.mul(120).div(100), // 20% buffer
          gasPrice: adjustedGasPrice
        }
      );

      logger.info('Fill order transaction submitted', {
        txHash: tx.hash,
        network,
        gasPrice: adjustedGasPrice.toString()
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      logger.info('Fill order transaction confirmed', {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        network
      });

      return {
        success: true,
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber,
        timestamp: Math.floor(Date.now() / 1000)
      };

    } catch (error) {
      logger.error('Fill order transaction failed', {
        error,
        network,
        order: params.order
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Cancel order on blockchain
   */
  async cancelOrder(
    order: LimitOrder,
    network: NetworkName = 'ethereum'
  ): Promise<TransactionResult> {
    try {
      const wallet = this.wallets.get(network);
      const contract = this.contracts.get(network);

      if (!wallet) {
        throw new Error('Wallet not available - private key not configured');
      }

      if (!contract) {
        throw new Error(`Contract not available for network: ${network}`);
      }

      // Connect contract to wallet
      const contractWithSigner = contract.connect(wallet);

      // Prepare order tuple
      const orderTuple = [
        order.salt,
        order.maker,
        order.receiver,
        order.makerAsset,
        order.takerAsset,
        order.makerAmount,
        order.takerAmount,
        '0x', // makerTraits
        order.interactions
      ];

      // Estimate gas
      const gasEstimate = await contractWithSigner.estimateGas['cancelOrder'](orderTuple);
      const gasPrice = await wallet.provider.getGasPrice();

      logger.info('Submitting cancel order transaction', {
        network,
        orderHash: await this.hashOrder(order, network),
        gasEstimate: gasEstimate.toString()
      });

      // Submit transaction
      const tx = await contractWithSigner['cancelOrder'](orderTuple, {
        gasLimit: gasEstimate.mul(120).div(100),
        gasPrice: gasPrice.mul(110).div(100)
      });

      const receipt = await tx.wait();

      logger.info('Cancel order transaction confirmed', {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        network
      });

      return {
        success: true,
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber,
        timestamp: Math.floor(Date.now() / 1000)
      };

    } catch (error) {
      logger.error('Cancel order transaction failed', {
        error,
        network,
        order
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get order hash from contract
   */
  async hashOrder(
    order: LimitOrder,
    network: NetworkName = 'ethereum'
  ): Promise<string> {
    try {
      const contract = this.contracts.get(network);
      if (!contract) {
        throw new Error(`Contract not available for network: ${network}`);
      }

      const orderTuple = [
        order.salt,
        order.maker,
        order.receiver,
        order.makerAsset,
        order.takerAsset,
        order.makerAmount,
        order.takerAmount,
        '0x', // makerTraits
        order.interactions
      ];

      const hash = await contract['hashOrder'](orderTuple);
      return hash;
    } catch (error) {
      logger.error('Failed to get order hash from contract', { error, order, network });
      throw error;
    }
  }

  /**
   * Get remaining order amount
   */
  async getRemainingOrderAmount(
    orderHash: string,
    network: NetworkName = 'ethereum'
  ): Promise<ContractCallResult> {
    try {
      const contract = this.contracts.get(network);
      const provider = this.providers.get(network);

      if (!contract || !provider) {
        throw new Error(`Contract or provider not available for network: ${network}`);
      }

      const remaining = await contract['remainingOrderAmount'](orderHash);
      const blockNumber = await provider.getBlockNumber();
      const block = await provider.getBlock(blockNumber);

      return {
        data: remaining.toString(),
        blockNumber,
        timestamp: block.timestamp
      };
    } catch (error) {
      logger.error('Failed to get remaining order amount', { error, orderHash, network });
      throw error;
    }
  }

  /**
   * Check if signature is valid for order
   */
  async isValidSignature(
    orderHash: string,
    signature: string,
    network: NetworkName = 'ethereum'
  ): Promise<boolean> {
    try {
      const contract = this.contracts.get(network);
      if (!contract) {
        throw new Error(`Contract not available for network: ${network}`);
      }

      const result = await contract['isValidSignature'](orderHash, signature);
      // ERC1271 magic value is 0x1626ba7e
      return result === '0x1626ba7e';
    } catch (error) {
      logger.error('Failed to validate signature', { error, orderHash, network });
      return false;
    }
  }

  /**
   * Get network status and configuration
   */
  getNetworkStatus(): Record<NetworkName, { connected: boolean; address?: string; blockNumber?: number }> {
    const status: Record<string, any> = {};

    (['ethereum', 'sepolia'] as NetworkName[]).forEach(network => {
      const provider = this.providers.get(network);
      const wallet = this.wallets.get(network);
      
      status[network] = {
        connected: !!provider,
        address: wallet?.address,
        blockNumber: null // Would need async call to get current block
      };
    });

    return status;
  }

  /**
   * Check if service is ready for transactions
   */
  isReady(): boolean {
    return this.wallets.size > 0 && this.contracts.size > 0;
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks(): NetworkName[] {
    return Array.from(this.providers.keys());
  }
}

// Export singleton instance
export const contractSubmissionService = new ContractSubmissionService();
