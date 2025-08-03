import { CardanoService } from './cardano.service';
import { EthereumService } from './ethereum.service';
import { logger } from '../utils/logger';

export class RelayerService {
  private cardanoService: CardanoService;
  private ethereumService: EthereumService;

  constructor() {
    this.cardanoService = new CardanoService();
    this.ethereumService = new EthereumService();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Relayer Service...');
      
      // Initialize both blockchain services
      await Promise.all([
        this.cardanoService.initialize(),
        this.ethereumService.initialize()
      ]);
      
      logger.info('Relayer Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Relayer Service:', error);
      throw error;
    }
  }

  async getStatus(): Promise<any> {
    try {
      const [cardanoAddress, ethereumAddress] = await Promise.all([
        this.cardanoService.getWalletAddress(),
        this.ethereumService.getWalletAddress()
      ]);

      const [cardanoBalance, ethereumBalance] = await Promise.all([
        this.cardanoService.getWalletBalance(),
        this.ethereumService.getWalletBalance()
      ]);

      const [cardanoContracts, ethereumContracts] = await Promise.all([
        this.cardanoService.getContractInfo(),
        this.ethereumService.getContractInfo()
      ]);

      return {
        status: 'operational',
        wallets: {
          cardano: {
            address: cardanoAddress,
            balance: cardanoBalance
          },
          ethereum: {
            address: ethereumAddress,
            balance: `${ethereumBalance} ETH`
          }
        },
        contracts: {
          cardano: cardanoContracts,
          ethereum: ethereumContracts
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get relayer status:', error);
      throw error;
    }
  }

  async testContractConnections(): Promise<any> {
    try {
      logger.info('Testing contract connections...');
      
      const results = {
        cardano: {
          limitOrderProtocol: false,
          escrowFactory: false
        },
        ethereum: {
          limitOrderProtocol: false,
          escrowFactory: false
        }
      };

      // Test Cardano contracts
      try {
        results.cardano.limitOrderProtocol = await this.cardanoService.checkLimitOrderProtocol();
        results.cardano.escrowFactory = await this.cardanoService.checkEscrowFactory();
      } catch (error) {
        logger.error('Cardano contract test failed:', error);
      }

      // Test Ethereum contracts
      try {
        results.ethereum.limitOrderProtocol = await this.ethereumService.checkLimitOrderProtocol();
        results.ethereum.escrowFactory = await this.ethereumService.checkEscrowFactory();
      } catch (error) {
        logger.error('Ethereum contract test failed:', error);
      }

      logger.info('Contract connection tests completed', results);
      return results;
    } catch (error) {
      logger.error('Failed to test contract connections:', error);
      throw error;
    }
  }

  getCardanoService(): CardanoService {
    return this.cardanoService;
  }

  getEthereumService(): EthereumService {
    return this.ethereumService;
  }
}
