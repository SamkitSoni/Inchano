import { createPublicClient, http, parseAbiItem, Log, decodeEventLog } from 'viem';
import { sepolia } from 'viem/chains';
import { OrderbookDatabase, LimitOrder } from '../database/orderbook';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface LopEventData {
  orderId: string;
  maker: string;
  tokenIn: string;
  amountIn: string;
  blockNumber: bigint;
  transactionHash: string;
}

export class LopIntegrationService {
  private publicClient: ReturnType<typeof createPublicClient>;
  private database: OrderbookDatabase;
  private isListening: boolean = false;

  constructor(database: OrderbookDatabase) {
    this.database = database;
    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(config.ethereum.rpcUrl)
    });
  }

  /**
   * Start listening to LOP contract events
   */
  async startEventListening(): Promise<void> {
    if (this.isListening) {
      logger.warn('Event listening already started');
      return;
    }

    try {
      logger.info('Starting LOP contract event listening...');

      // Listen for OrderCreated events
      this.publicClient.watchContractEvent({
        address: config.ethereum.contracts.lopAddress as `0x${string}`,
        abi: [
          parseAbiItem('event OrderCreated(bytes32 indexed orderId, address indexed maker, address tokenIn, uint256 amountIn)')
        ],
        eventName: 'OrderCreated',
        onLogs: (logs) => this.handleOrderCreatedEvents(logs)
      });

      // Listen for OrderFilled events
      this.publicClient.watchContractEvent({
        address: config.ethereum.contracts.lopAddress as `0x${string}`,
        abi: [
          parseAbiItem('event OrderFilled(bytes32 indexed orderId, address indexed taker, uint256 amountOut)')
        ],
        eventName: 'OrderFilled',
        onLogs: (logs) => this.handleOrderFilledEvents(logs)
      });

      // Listen for OrderCancelled events
      this.publicClient.watchContractEvent({
        address: config.ethereum.contracts.lopAddress as `0x${string}`,
        abi: [
          parseAbiItem('event OrderCancelled(bytes32 indexed orderId, address indexed maker)')
        ],
        eventName: 'OrderCancelled',
        onLogs: (logs) => this.handleOrderCancelledEvents(logs)
      });

      this.isListening = true;
      logger.info('LOP contract event listening started successfully');

    } catch (error) {
      logger.error('Failed to start event listening:', error);
      throw error;
    }
  }

  /**
   * Stop listening to contract events
   */
  stopEventListening(): void {
    this.isListening = false;
    logger.info('LOP contract event listening stopped');
  }

  /**
   * Handle OrderCreated events from LOP contract
   */
  private async handleOrderCreatedEvents(logs: any[]): Promise<void> {
    for (const log of logs) {
      try {
        const { args, blockNumber, transactionHash } = log;
        
        if (!args || !args.orderId || !args.maker) {
          logger.warn('Invalid OrderCreated event args:', args);
          continue;
        }

        const orderData: LopEventData = {
          orderId: args.orderId as string,
          maker: args.maker as string,
          tokenIn: args.tokenIn as string,
          amountIn: args.amountIn?.toString() || '0',
          blockNumber: blockNumber || 0n,
          transactionHash: transactionHash || ''
        };

        logger.info('OrderCreated event received:', orderData);

        // Try to find matching order in our database
        const existingOrder = await this.database.getOrder(orderData.orderId);
        
        if (existingOrder) {
          // Update order with on-chain transaction hash
          await this.database.updateOrderStatus(
            orderData.orderId, 
            'PENDING', 
            undefined, 
            orderData.transactionHash
          );
          
          logger.info(`Updated order ${orderData.orderId} with transaction hash`);
        } else {
          logger.warn(`OrderCreated event for unknown order: ${orderData.orderId}`);
        }

      } catch (error) {
        logger.error('Error handling OrderCreated event:', error);
      }
    }
  }

  /**
   * Handle OrderFilled events from LOP contract
   */
  private async handleOrderFilledEvents(logs: any[]): Promise<void> {
    for (const log of logs) {
      try {
        const { args } = log;
        
        if (!args || !args.orderId || !args.taker) {
          logger.warn('Invalid OrderFilled event args:', args);
          continue;
        }

        const orderId = args.orderId as string;
        const taker = args.taker as string;
        const amountOut = args.amountOut?.toString() || '0';

        logger.info(`OrderFilled event: ${orderId} filled by ${taker} for ${amountOut}`);

        // Update order status in database
        await this.database.updateOrderStatus(orderId, 'FULFILLED', taker);

      } catch (error) {
        logger.error('Error handling OrderFilled event:', error);
      }
    }
  }

  /**
   * Handle OrderCancelled events from LOP contract
   */
  private async handleOrderCancelledEvents(logs: any[]): Promise<void> {
    for (const log of logs) {
      try {
        const { args } = log;
        
        if (!args || !args.orderId || !args.maker) {
          logger.warn('Invalid OrderCancelled event args:', args);
          continue;
        }

        const orderId = args.orderId as string;
        const maker = args.maker as string;

        logger.info(`OrderCancelled event: ${orderId} cancelled by ${maker}`);

        // Update order status in database
        await this.database.updateOrderStatus(orderId, 'CANCELLED');

      } catch (error) {
        logger.error('Error handling OrderCancelled event:', error);
      }
    }
  }

  /**
   * Sync historical events from LOP contract with chunked block queries
   */
  async syncHistoricalEvents(fromBlock?: bigint): Promise<void> {
    try {
      const currentBlock = await this.publicClient.getBlockNumber();
      const startBlock = fromBlock || currentBlock - 100n; // Last 100 blocks for initial sync
      const chunkSize = 500n; // Alchemy limit is 500 blocks per request

      logger.info(`Syncing LOP events from block ${startBlock} to ${currentBlock}`);

      let totalOrderCreated = 0;
      let totalOrderFilled = 0;
      let totalOrderCancelled = 0;

      // Process blocks in chunks to respect API limits
      for (let fromChunk = startBlock; fromChunk <= currentBlock; fromChunk += chunkSize) {
        const toChunk = fromChunk + chunkSize - 1n > currentBlock ? currentBlock : fromChunk + chunkSize - 1n;
        
        logger.debug(`Processing chunk: blocks ${fromChunk} to ${toChunk}`);

        try {
          // Get OrderCreated events for this chunk
          const orderCreatedLogs = await this.publicClient.getLogs({
            address: config.ethereum.contracts.lopAddress as `0x${string}`,
            event: parseAbiItem('event OrderCreated(bytes32 indexed orderId, address indexed maker, address tokenIn, uint256 amountIn)'),
            fromBlock: fromChunk,
            toBlock: toChunk
          });

          await this.handleOrderCreatedEvents(orderCreatedLogs);
          totalOrderCreated += orderCreatedLogs.length;

          // Get OrderFilled events for this chunk
          const orderFilledLogs = await this.publicClient.getLogs({
            address: config.ethereum.contracts.lopAddress as `0x${string}`,
            event: parseAbiItem('event OrderFilled(bytes32 indexed orderId, address indexed taker, uint256 amountOut)'),
            fromBlock: fromChunk,
            toBlock: toChunk
          });

          await this.handleOrderFilledEvents(orderFilledLogs);
          totalOrderFilled += orderFilledLogs.length;

          // Get OrderCancelled events for this chunk
          const orderCancelledLogs = await this.publicClient.getLogs({
            address: config.ethereum.contracts.lopAddress as `0x${string}`,
            event: parseAbiItem('event OrderCancelled(bytes32 indexed orderId, address indexed maker)'),
            fromBlock: fromChunk,
            toBlock: toChunk
          });

          await this.handleOrderCancelledEvents(orderCancelledLogs);
          totalOrderCancelled += orderCancelledLogs.length;

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (chunkError) {
          logger.error(`Failed to process chunk ${fromChunk}-${toChunk}:`, chunkError);
          // Continue with next chunk instead of failing entirely
        }
      }

      logger.info(`Historical sync completed. Processed ${totalOrderCreated} OrderCreated, ${totalOrderFilled} OrderFilled, ${totalOrderCancelled} OrderCancelled events`);

    } catch (error) {
      logger.error('Failed to sync historical events:', error);
      throw error;
    }
  }

  /**
   * Reconcile database state with on-chain state
   */
  async reconcileOrderbook(): Promise<void> {
    try {
      logger.info('Starting orderbook reconciliation with on-chain state...');

      const pendingOrders = await this.database.getPendingOrders();
      let reconciled = 0;

      for (const order of pendingOrders) {
        try {
          // Check if order is expired
          if (order.expiration < Date.now()) {
            await this.database.updateOrderStatus(order.orderId, 'EXPIRED');
            reconciled++;
            continue;
          }

          // Here you could add more sophisticated on-chain state checking
          // For now, we'll just handle expiration

        } catch (error) {
          logger.error(`Failed to reconcile order ${order.orderId}:`, error);
        }
      }

      logger.info(`Orderbook reconciliation completed. Reconciled ${reconciled} orders`);

    } catch (error) {
      logger.error('Failed to reconcile orderbook:', error);
      throw error;
    }
  }

  /**
   * Get order status from on-chain (if implemented in contract)
   */
  async getOnChainOrderStatus(orderId: string): Promise<string | null> {
    try {
      // This would query the LOP contract for order status
      // Implementation depends on your contract's interface
      
      // For now, return null as this would need the actual contract ABI
      return null;

    } catch (error) {
      logger.error('Failed to get on-chain order status:', error);
      return null;
    }
  }

  /**
   * Validate order signature against on-chain data
   */
  async validateOrderOnChain(order: LimitOrder): Promise<boolean> {
    try {
      // This would validate the order signature using the LOP contract
      // Implementation depends on your contract's interface
      
      // For now, return true as basic validation is done off-chain
      return true;

    } catch (error) {
      logger.error('Failed to validate order on-chain:', error);
      return false;
    }
  }
}
