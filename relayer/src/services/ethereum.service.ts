import { createPublicClient, createWalletClient, http, getContract, Address } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config';
import { logger } from '../utils/logger';

// Basic ABI interfaces for contract interaction
const LIMIT_ORDER_PROTOCOL_ABI = [
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }]
  }
] as const;

const ESCROW_FACTORY_ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }]
  }
] as const;

export class EthereumService {
  private publicClient: any;
  private walletClient: any;
  private account: any;

  constructor() {
    // Create public client for reading
    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(config.ethereum.rpcUrl)
    });

    // Create wallet client for transactions
    this.account = privateKeyToAccount(config.ethereum.privateKey as `0x${string}`);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: sepolia,
      transport: http(config.ethereum.rpcUrl)
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection by getting the latest block
      const block = await this.publicClient.getBlockNumber();
      logger.info(`Connected to Sepolia testnet, latest block: ${block}`);
      
      // Get wallet balance
      const balance = await this.getWalletBalance();
      logger.info(`Wallet balance: ${balance} ETH`);
    } catch (error) {
      logger.error('Failed to initialize Ethereum service:', error);
      throw error;
    }
  }

  async getWalletAddress(): Promise<string> {
    return this.account.address;
  }

  async getAddressBalance(address: string): Promise<string> {
    try {
      const balance = await this.publicClient.getBalance({ address: address as `0x${string}` });
      return balance.toString();
    } catch (error) {
      logger.error('Failed to get address balance:', error);
      throw error;
    }
  }

  async getWalletBalance(): Promise<string> {
    const balance = await this.publicClient.getBalance({
      address: this.account.address
    });
    
    // Convert from wei to ETH
    return (Number(balance) / 1e18).toFixed(6);
  }

  async checkLimitOrderProtocol(): Promise<boolean> {
    try {
      // Simple contract call using readContract directly
      const name = await this.publicClient.readContract({
        address: config.ethereum.contracts.lopAddress as Address,
        abi: LIMIT_ORDER_PROTOCOL_ABI,
        functionName: 'name'
      });
      
      logger.info(`LOP contract name: ${name}`);
      return true;
    } catch (error) {
      logger.error('Failed to check Limit Order Protocol:', error);
      return false;
    }
  }

  async checkEscrowFactory(): Promise<boolean> {
    try {
      // Simple contract call using readContract directly
      const owner = await this.publicClient.readContract({
        address: config.ethereum.contracts.escrowFactoryAddress as Address,
        abi: ESCROW_FACTORY_ABI,
        functionName: 'owner'
      });
      
      logger.info(`Escrow Factory owner: ${owner}`);
      return true;
    } catch (error) {
      logger.error('Failed to check Escrow Factory:', error);
      return false;
    }
  }

  async getContractInfo(): Promise<any> {
    try {
      const lopCheck = await this.checkLimitOrderProtocol();
      const escrowCheck = await this.checkEscrowFactory();
      
      return {
        limitOrderProtocol: {
          address: config.ethereum.contracts.lopAddress,
          accessible: lopCheck
        },
        escrowFactory: {
          address: config.ethereum.contracts.escrowFactoryAddress,
          accessible: escrowCheck
        },
        otherContracts: {
          feeBank: config.ethereum.contracts.feeBankAddress,
          escrowSrc: config.ethereum.contracts.escrowSrcAddress,
          escrowDst: config.ethereum.contracts.escrowDstAddress,
          weth: config.ethereum.contracts.wethAddress
        }
      };
    } catch (error) {
      logger.error('Failed to get contract info:', error);
      throw error;
    }
  }

  getPublicClient() {
    return this.publicClient;
  }

  getWalletClient() {
    return this.walletClient;
  }
}
