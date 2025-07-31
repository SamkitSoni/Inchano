// @ts-ignore
import { SDK } from '../cross-chain-sdk/dist/cjs/sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { CardanoBridge } from './src/cardano-bridge/CardanoBridge';
import { CrossChainSettlementCoordinator } from './src/cross-chain-settlement-coordinator/CrossChainSettlementCoordinator';
import { EscrowMonitor } from './src/escrow-monitor/EscrowMonitor';
import { CardanoEscrowMonitor } from './src/cardano-escrow-monitor/CardanoEscrowMonitor';
import { logger } from './src/utils/logger';
import { loadContractsFromEnv } from './src/escrow-monitor/config';
import { loadCardanoContractsFromEnv } from './src/cardano-escrow-monitor/config';
import { NetworkEnum } from '@1inch/fusion-sdk';

dotenv.config();

// Ethereum Configuration
const ethereumRpcUrl = process.env['RPC_URL'] || process.env['ETHEREUM_RPC_URL'] || 'https://sepolia.infura.io/v3/your-project-id';
const privateKey = process.env['PRIVATE_KEY'];
const walletAddress = process.env['WALLET_ADDRESS'];

// Cardano Configuration
const cardanoNodeUrl = process.env['CARDANO_NODE_URL'] || process.env['OGMIOS_URL'] || 'ws://localhost:1337';
const cardanoWalletSeed = process.env['CARDANO_WALLET_SEED'] || '';

if (!privateKey) {
  throw new Error('PRIVATE_KEY environment variable is required');
}

if (!walletAddress) {
  throw new Error('WALLET_ADDRESS environment variable is required');
}

// Initialize Ethereum provider
// Initialize Ethereum provider for other usages (if needed)
// const ethereumProvider = new ethers.providers.JsonRpcProvider(ethereumRpcUrl);

// Initialize SDK
const sdk = new SDK({
  url: 'https://api.1inch.dev/fusion-plus',
  authKey: process.env['ONE_INCH_API_KEY'] || process.env['ALCHEMY_API_KEY'] || '',
});

// Initialize Cardano Bridge
const cardanoBridge = new CardanoBridge({
  cardanoNodeUrl,
  cardanoNetwork: 'testnet',
  ethereumRpcUrl,
  ethereumNetwork: 'sepolia',
  privateKey,
  cardanoWalletSeed,
});

// Initialize monitors with proper configurations
const ethereumMonitor = new EscrowMonitor({
  alchemyApiKey: process.env['ALCHEMY_API_KEY'] || '',
  network: 'sepolia',
  contracts: loadContractsFromEnv(),
  webhookUrl: process.env['ESCROW_WEBHOOK_URL'],
  enableLogging: true,
});

const cardanoMonitor = new CardanoEscrowMonitor({
  ogmiosUrl: cardanoNodeUrl,
  network: 'testnet',
  contracts: loadCardanoContractsFromEnv(),
  enableLogging: true,
  syncFromSlot: parseInt(process.env['CARDANO_SYNC_FROM_SLOT'] || '0'),
});

// Initialize Cross-chain Settlement Coordinator
const coordinator = new CrossChainSettlementCoordinator(
  ethereumMonitor,
  cardanoMonitor,
  cardanoBridge,
  {
    enableAutoSettlement: true,
    settlementDelay: 5000, // 5 seconds delay
    maxRetries: 3,
    retryDelay: 10000, // 10 seconds
  }
);

// Define function to perform ETH->ADA swap
const performEthToAdaSwap = async () => {
  try {
    logger.info('Starting ETH->ADA swap integration test');

    // Initialize all components
    await cardanoBridge.initialize();
    await coordinator.start();
    
    logger.info('All components initialized successfully');

    // Define swap parameters for ETH Sepolia -> ADA
    const swapAmount = process.env['SWAP_AMOUNT'] || '0.01'; // ETH amount on Sepolia
    const srcChainId = NetworkEnum.ETHEREUM; // Ethereum Sepolia testnet
    const dstChainId = 1815; // Cardano testnet chain ID
    
    // ETH token address on Sepolia (native ETH)
    const srcTokenAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    // ADA native token on Cardano (lovelace is the base unit)
    const dstTokenAddress = 'lovelace'; // Cardano native token

    logger.info('Fetching quote for ETH->ADA swap', {
      srcChainId,
      dstChainId,
      srcTokenAddress,
      dstTokenAddress,
      amount: swapAmount,
      walletAddress,
    });

    // Get quote from the SDK
    const quote = await sdk.getQuote({
      srcChainId,
      dstChainId,
      srcTokenAddress,
      dstTokenAddress,
      amount: ethers.utils.parseEther(swapAmount).toString(),
      walletAddress,
      enableEstimate: true,
    });

    logger.info('Quote received:', {
      quoteId: quote.quoteId,
      srcAmount: quote.srcTokenAmount.toString(),
      dstAmount: quote.dstTokenAmount.toString(),
      presets: Object.keys(quote.presets),
      recommendedPreset: quote.recommendedPreset,
    });

    // Generate hash lock for the order
    const secret = ethers.utils.randomBytes(32);
    const secretHash = ethers.utils.keccak256(secret);
    
    const hashLock: any = {
      hash: secretHash,
      value: ethers.BigNumber.from(swapAmount),
      claimAddress: walletAddress,
      refundAddress: walletAddress,
      getPartsCount: () => 0,
      eq: (other: any) => other.hash === secretHash,
    };

    logger.info('Creating cross-chain order', {
      walletAddress,
      hashLock: hashLock.hash,
    });

    // Create the order
    const preparedOrder = await sdk.createOrder(quote, {
      walletAddress,
      hashLock,
      secretHashes: [secretHash],
    });

    logger.info('Order prepared:', {
      orderHash: preparedOrder.hash,
      quoteId: preparedOrder.quoteId,
    });

    // Submit the order
    const orderInfo = await sdk.submitOrder(
      srcChainId,
      preparedOrder.order,
      preparedOrder.quoteId,
      [secretHash]
    );

    logger.info('Order submitted successfully:', {
      orderHash: orderInfo.orderHash,
      signature: orderInfo.signature,
      extension: orderInfo.extension,
    });

    // Set up event listeners for settlement coordination
    coordinator.on('settlement:initiated', (record) => {
      logger.info('Settlement initiated:', record);
    });

    coordinator.on('settlement:completed', (record) => {
      logger.info('Settlement completed:', record);
    });

    coordinator.on('settlement:failed', (record, error) => {
      logger.error('Settlement failed:', { record, error });
    });

    // Monitor the order status
    const monitorOrderStatus = async () => {
      try {
        const status = await sdk.getOrderStatus(orderInfo.orderHash);
        logger.info('Order status:', status);
        
        // Continue monitoring if order is still active
        if (status.status === 'pending' || status.status === 'executed') {
          setTimeout(monitorOrderStatus, 30000); // Check every 30 seconds
        } else {
          logger.info('Order completed or cancelled, stopping monitoring');
          await cleanup();
        }
      } catch (error) {
        logger.error('Error checking order status:', error);
        setTimeout(monitorOrderStatus, 30000);
      }
    };

    // Start monitoring
    setTimeout(monitorOrderStatus, 10000); // Start monitoring after 10 seconds

    logger.info('ETH->ADA swap initiated successfully. Monitoring settlement...');

  } catch (error) {
    logger.error('Error during ETH->ADA swap test:', error);
    await cleanup();
  }
};

const cleanup = async () => {
  try {
    logger.info('Cleaning up resources...');
    await coordinator.stop();
    await ethereumMonitor.stop();
    await cardanoMonitor.stop();
    logger.info('Cleanup completed');
  } catch (error) {
    logger.error('Error during cleanup:', error);
  }
};

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await cleanup();
  process.exit(0);
});

// Run the test
performEthToAdaSwap().catch(async (error) => {
  logger.error('Fatal error in main process:', error);
  await cleanup();
  process.exit(1);
});
