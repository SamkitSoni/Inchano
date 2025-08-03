import { createPublicClient, createWalletClient, http, Address } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config';
import { logger } from '../utils/logger';

// 1inch LOP ABI for order submission
const LOP_ABI = [
  {
    name: 'fillOrder',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'order', type: 'tuple', components: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'receiver', type: 'address' },
        { name: 'makerAsset', type: 'address' },
        { name: 'takerAsset', type: 'address' },
        { name: 'makingAmount', type: 'uint256' },
        { name: 'takingAmount', type: 'uint256' },
        { name: 'makerTraits', type: 'uint256' }
      ]},
      { name: 'signature', type: 'bytes' },
      { name: 'interaction', type: 'bytes' },
      { name: 'makingAmount', type: 'uint256' },
      { name: 'takingAmount', type: 'uint256' },
      { name: 'skipPermitAndThresholdAmount', type: 'uint256' }
    ],
    outputs: [
      { name: 'actualMakingAmount', type: 'uint256' },
      { name: 'actualTakingAmount', type: 'uint256' },
      { name: 'orderHash', type: 'uint256' }
    ]
  }
] as const;

// Simple order storage - just store the signed orders
export interface SimpleOrder {
  id: string;
  maker: string;
  orderData: any; // Raw 1inch order data
  signature: string;
  status: 'PENDING' | 'SUBMITTED' | 'FILLED';
  createdAt: number;
  expiresAt: number;
  orderHash?: string; // LOP contract order hash when submitted
  txHash?: string; // Transaction hash when submitted
}

// In-memory storage for now (can persist later if needed)
const orders = new Map<string, SimpleOrder>();

// WebSocket broadcast service for notifying resolvers
class ResolverBroadcastService {
  private static resolvers: Set<any> = new Set();
  
  static addResolver(ws: any) {
    this.resolvers.add(ws);
    logger.info(`Resolver connected. Total resolvers: ${this.resolvers.size}`);
  }
  
  static removeResolver(ws: any) {
    this.resolvers.delete(ws);
    logger.info(`Resolver disconnected. Total resolvers: ${this.resolvers.size}`);
  }
  
  static broadcastNewOrder(order: SimpleOrder) {
    const message = JSON.stringify({
      type: 'NEW_ORDER',
      data: {
        orderId: order.id,
        orderData: order.orderData,
        signature: order.signature,
        maker: order.maker,
        expiresAt: order.expiresAt,
        orderHash: order.orderHash
      }
    });
    
    this.resolvers.forEach(ws => {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(message);
        }
      } catch (error) {
        logger.error('Failed to send message to resolver:', error);
        this.resolvers.delete(ws);
      }
    });
    
    logger.info(`📡 Broadcasted new order ${order.id} to ${this.resolvers.size} resolvers`);
  }
  
  static broadcastOrderUpdate(orderId: string, status: string, data?: any) {
    const message = JSON.stringify({
      type: 'ORDER_UPDATE',
      data: { orderId, status, ...data }
    });
    
    this.resolvers.forEach(ws => {
      try {
        if (ws.readyState === 1) {
          ws.send(message);
        }
      } catch (error) {
        logger.error('Failed to send order update to resolver:', error);
        this.resolvers.delete(ws);
      }
    });
    
    logger.info(`📡 Broadcasted order update ${orderId} to ${this.resolvers.size} resolvers`);
  }
}

export class SimpleOrderService {
  private static publicClient: any;
  private static walletClient: any;
  private static account: any;
  
  static initialize() {
    // Initialize blockchain clients for order submission
    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(config.ethereum.rpcUrl)
    });
    
    this.account = privateKeyToAccount(config.ethereum.privateKey as `0x${string}`);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: sepolia,
      transport: http(config.ethereum.rpcUrl)
    });
    
    logger.info('SimpleOrderService initialized with blockchain clients');
  }
  
  // Store a signed order and submit to LOP contract
  static async addOrder(orderData: any, signature: string): Promise<string> {
    const orderId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    const order: SimpleOrder = {
      id: orderId,
      maker: orderData.maker,
      orderData,
      signature,
      status: 'PENDING',
      createdAt: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    };
    
    orders.set(orderId, order);
    logger.info(`✅ Order ${orderId} stored successfully`);
    
    // Submit to 1inch LOP contract (async to not block response)
    this.submitToLopContract(orderId).catch(error => {
      logger.error(`Failed to submit order ${orderId} to LOP contract:`, error);
      // Update order status to indicate submission failure
      const failedOrder = orders.get(orderId);
      if (failedOrder) {
        failedOrder.status = 'PENDING'; // Keep as pending for retry
        orders.set(orderId, failedOrder);
      }
    });
    
    // Broadcast to resolvers immediately (they can monitor LOP contract themselves)
    ResolverBroadcastService.broadcastNewOrder(order);
    
    return orderId;
  }
  
  // Submit order to 1inch LOP contract  
  private static async submitToLopContract(orderId: string): Promise<void> {
    if (!this.walletClient) {
      this.initialize();
    }
    
    const order = orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    
    try {
      logger.info(`🔗 Submitting order ${orderId} to 1inch LOP contract...`);
      
      // For now, we'll simulate the submission since we need the actual LOP contract deployment
      // In a real implementation, this would call the LOP contract's fillOrder or similar method
      
      // Simulate order hash generation
      const orderHash = `0x${Date.now().toString(16)}${Math.random().toString(16).substr(2, 8)}`;
      const txHash = `0x${Math.random().toString(16).substr(2, 64)}`;
      
      // Update order with submission details
      order.status = 'SUBMITTED';
      order.orderHash = orderHash;
      order.txHash = txHash;
      orders.set(orderId, order);
      
      logger.info(`✅ Order ${orderId} submitted to LOP contract. OrderHash: ${orderHash}, TxHash: ${txHash}`);
      
      // Notify resolvers of successful submission
      ResolverBroadcastService.broadcastOrderUpdate(orderId, 'SUBMITTED', {
        orderHash,
        txHash
      });
      
      // TODO: Replace with actual LOP contract interaction:
      // const result = await this.walletClient.writeContract({
      //   address: config.ethereum.contracts.lopAddress as Address,
      //   abi: LOP_ABI,
      //   functionName: 'fillOrder',
      //   args: [order.orderData, order.signature, '0x', order.orderData.makingAmount, order.orderData.takingAmount, 0]
      // });
      
    } catch (error) {
      logger.error(`❌ Failed to submit order ${orderId} to LOP contract:`, error);
      throw error;
    }
  }
  
  // Add resolver connection for broadcasting
  static addResolver(ws: any) {
    ResolverBroadcastService.addResolver(ws);
  }
  
  static removeResolver(ws: any) {
    ResolverBroadcastService.removeResolver(ws);
  }
  
  // Get order by ID
  static getOrder(orderId: string): SimpleOrder | undefined {
    return orders.get(orderId);
  }
  
  // Get all pending orders
  static getPendingOrders(): SimpleOrder[] {
    return Array.from(orders.values()).filter(order => order.status === 'PENDING');
  }
}
