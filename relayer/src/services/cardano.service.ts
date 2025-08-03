import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { config } from '../config';
import { cardanoConfig } from '../config/cardano.config';
import { logger } from '../utils/logger';

export class CardanoService {
  private blockfrost: BlockFrostAPI | null = null;
  private walletAddress: string | null = null;

  constructor() {
    // Initialize Blockfrost API
    this.blockfrost = new BlockFrostAPI({
      projectId: config.cardano.blockfrostProjectId,
      network: config.cardano.network === 'preprod' ? 'preprod' : 'mainnet'
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test Blockfrost connection
      const networkInfo = await this.blockfrost!.network();
      logger.info(`Connected to Cardano ${config.cardano.network} network`);
      
      // For this demo, we'll derive a wallet address from the seed phrase
      // In production, you'd use proper key derivation
      this.walletAddress = await this.deriveWalletAddressFromSeed();
      
      logger.info('Cardano service initialized successfully with Blockfrost');
    } catch (error) {
      logger.error('Failed to initialize Cardano service:', error);
      throw error;
    }
  }

  private async deriveWalletAddressFromSeed(): Promise<string> {
    // For demo purposes, we'll use a deterministic address based on the seed
    // In production, you'd use proper BIP39/BIP32 key derivation
    const seedWords = config.cardano.walletSeedPhrase.split(' ');
    if (seedWords.length < 12) {
      throw new Error('Invalid seed phrase - must be at least 12 words');
    }
    
    // Mock address generation - in real implementation, use cardano-serialization-lib
    const hash = this.simpleHash(config.cardano.walletSeedPhrase);
    return `addr_test1q${hash.substring(0, 50)}`;
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).padStart(50, '0');
  }

  async getWalletAddress(): Promise<string> {
    if (!this.walletAddress) {
      throw new Error('Cardano service not initialized');
    }
    return this.walletAddress;
  }

  async getWalletBalance(): Promise<any> {
    if (!this.blockfrost || !this.walletAddress) {
      throw new Error('Cardano service not initialized');
    }
    
    try {
      const addresses = await this.blockfrost.addresses(this.walletAddress);
      const balance = {
        lovelace: parseInt(addresses.amount.find(a => a.unit === 'lovelace')?.quantity || '0'),
        ada: parseInt(addresses.amount.find(a => a.unit === 'lovelace')?.quantity || '0') / 1000000,
        assets: addresses.amount.filter(a => a.unit !== 'lovelace')
      };
      
      return balance;
    } catch (error) {
      logger.warn('Could not fetch wallet balance (address may be new):', error);
      return {
        lovelace: 0,
        ada: 0,
        assets: [],
        note: 'Address may be new or unfunded'
      };
    }
  }

  async checkLimitOrderProtocol(): Promise<any> {
    try {
      // Use the fresh deployed contract address
      const lopAddress = cardanoConfig.contracts.limitOrderProtocol.address;
      const deploymentTx = cardanoConfig.contracts.limitOrderProtocol.deploymentTx;
      
      logger.info(`Checking LOP contract at address: ${lopAddress}`);
      
      // Check if deployment transaction exists
      try {
        const tx = await this.blockfrost!.txs(deploymentTx);
        logger.info(`LOP deployment transaction found: ${tx.block}`);
      } catch (txError) {
        logger.warn(`LOP deployment transaction not found: ${txError}`);
      }
      
      // Try to get contract info (this might not work for script addresses)
      try {
        const addressInfo = await this.blockfrost!.addresses(lopAddress);
        return {
          address: lopAddress,
          type: addressInfo.type,
          script: addressInfo.script,
          currentBalance: addressInfo.amount.find((a: any) => a.unit === 'lovelace')?.quantity || '0',
          deploymentTx
        };
      } catch (error) {
        // This is expected for newly deployed script addresses
        logger.info(`Script address not yet indexed: ${error}`);
        return {
          address: lopAddress,
          type: 'script',
          script: true,
          deploymentTx,
          status: 'deployed_but_not_indexed'
        };
      }
    } catch (error) {
      logger.error('Error checking LOP contract:', error);
      throw error;
    }
  }

  async checkEscrowFactory(): Promise<any> {
    try {
      // Use the fresh deployed contract address
      const escrowAddress = cardanoConfig.contracts.escrowFactory.address;
      const deploymentTx = cardanoConfig.contracts.escrowFactory.deploymentTx;
      const lopIntegration = cardanoConfig.contracts.escrowFactory.lopIntegration;
      
      logger.info(`Checking EscrowFactory at address: ${escrowAddress}`);
      
      // Check if deployment transaction exists
      try {
        const tx = await this.blockfrost!.txs(deploymentTx);
        logger.info(`EscrowFactory deployment transaction found: ${tx.block}`);
      } catch (txError) {
        logger.warn(`EscrowFactory deployment transaction not found: ${txError}`);
      }
      
      // Try to get contract info
      try {
        const addressInfo = await this.blockfrost!.addresses(escrowAddress);
        return {
          address: escrowAddress,
          type: addressInfo.type,
          script: addressInfo.script,
          currentBalance: addressInfo.amount.find((a: any) => a.unit === 'lovelace')?.quantity || '0',
          deploymentTx,
          lopIntegration
        };
      } catch (error) {
        // This is expected for newly deployed script addresses
        logger.info(`Script address not yet indexed: ${error}`);
        return {
          address: escrowAddress,
          type: 'script',
          script: true,
          deploymentTx,
          lopIntegration,
          status: 'deployed_but_not_indexed'
        };
      }
    } catch (error) {
      logger.error('Error checking EscrowFactory contract:', error);
      throw error;
    }
  }

  async getContractInfo(): Promise<any> {
    try {
      const lopCheck = await this.checkLimitOrderProtocol();
      const escrowCheck = await this.checkEscrowFactory();
      
      return {
        limitOrderProtocol: {
          address: config.cardano.contracts.lopAddress,
          accessible: lopCheck
        },
        escrowFactory: {
          address: config.cardano.contracts.escrowFactoryAddress,
          accessible: escrowCheck
        }
      };
    } catch (error) {
      logger.error('Failed to get contract info:', error);
      throw error;
    }
  }

  async getNetworkInfo(): Promise<any> {
    if (!this.blockfrost) {
      throw new Error('Blockfrost not initialized');
    }
    
    try {
      const network = await this.blockfrost.network();
      const latestEpoch = await this.blockfrost.epochsLatest();
      
      return {
        networkName: config.cardano.network,
        supply: network.supply,
        stake: network.stake,
        currentEpoch: latestEpoch.epoch,
        blockCount: latestEpoch.block_count
      };
    } catch (error) {
      logger.error('Failed to get network info:', error);
      throw error;
    }
  }

  async getScriptInfo(scriptAddress: string): Promise<any> {
    if (!this.blockfrost) {
      throw new Error('Blockfrost not initialized');
    }
    
    try {
      const addressInfo = await this.blockfrost.addresses(scriptAddress);
      const utxos = await this.blockfrost.addressesUtxos(scriptAddress);
      
      return {
        address: scriptAddress,
        type: addressInfo.type,
        isScript: addressInfo.script,
        utxoCount: utxos.length,
        totalValue: addressInfo.amount.find(a => a.unit === 'lovelace')?.quantity || '0'
      };
    } catch (error) {
      logger.error(`Failed to get script info for ${scriptAddress}:`, error);
      return {
        address: scriptAddress,
        error: error instanceof Error ? error.message : 'Unknown error',
        accessible: false
      };
    }
  }

  // Method to get Blockfrost instance for advanced operations
  getBlockfrost(): BlockFrostAPI {
    if (!this.blockfrost) {
      throw new Error('Blockfrost not initialized');
    }
    return this.blockfrost;
  }
}
