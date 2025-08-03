import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { ETHToCardanoOrder, OrderStatus, OrderPriceLimits, OrderExpiration, OrderValidation, ResolverCommitment } from '../types/orders';
import { EthereumService } from './ethereum.service';
import { CardanoService } from './cardano.service';
import { logger } from '../utils/logger';

export class OrderService extends EventEmitter {
  private orders: Map<string, ETHToCardanoOrder> = new Map();
  private orderStatuses: Map<string, OrderStatus> = new Map();
  private resolverCommitments: Map<string, ResolverCommitment[]> = new Map();
  private ethereumService: EthereumService;
  private cardanoService: CardanoService;

  constructor(ethereumService: EthereumService, cardanoService: CardanoService) {
    super();
    this.ethereumService = ethereumService;
    this.cardanoService = cardanoService;
  }

  /**
   * Create a new ETH to Cardano swap order
   */
  async createETHToCardanoOrder(params: {
    maker: string;
    sourceAmount: string;
    priceLimits: OrderPriceLimits;
    expiration: OrderExpiration;
    cardanoDestinationAddress: string;
    sourceToken?: string; // Default to ETH
  }): Promise<ETHToCardanoOrder> {
    try {
      logger.info('Creating ETH to Cardano order', params);

      const orderId = this.generateOrderId();
      const now = Date.now();
      const expirationTimestamp = this.calculateExpiration(params.expiration);

      // Create order object
      const order: ETHToCardanoOrder = {
        id: orderId,
        maker: params.maker,
        sourceChain: 'ethereum',
        destinationChain: 'cardano',
        sourceToken: params.sourceToken || 'ETH',
        destinationToken: 'tADA',
        sourceAmount: params.sourceAmount,
        minDestinationAmount: this.calculateMinDestination(params.sourceAmount, params.priceLimits.endPrice),
        maxDestinationAmount: this.calculateMaxDestination(params.sourceAmount, params.priceLimits.startPrice),
        currentPrice: params.priceLimits.startPrice,
        startPrice: params.priceLimits.startPrice,
        endPrice: params.priceLimits.endPrice,
        expiration: expirationTimestamp,
        createdAt: now,
        cardanoDestinationAddress: params.cardanoDestinationAddress,
        signature: '', // Will be set after signing
        orderHash: ''   // Will be set after hashing
      };

      // Generate order hash for signing
      order.orderHash = await this.generateOrderHash(order);
      
      // For now, we'll simulate signature - in real implementation, maker would sign
      order.signature = await this.simulateOrderSigning(order);

      // Validate order
      const validation = await this.validateOrder(order);
      if (!validation.isValidSignature || validation.errors.length > 0) {
        throw new Error(`Order validation failed: ${validation.errors.join(', ')}`);
      }

      // Store order
      this.orders.set(orderId, order);
      this.orderStatuses.set(orderId, {
        id: orderId,
        status: 'PENDING',
        updatedAt: now
      });

      logger.info(`Order created successfully: ${orderId}`);
      this.emit('orderCreated', order);

      return order;
    } catch (error) {
      logger.error('Failed to create order:', error);
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): ETHToCardanoOrder | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get order status
   */
  getOrderStatus(orderId: string): OrderStatus | undefined {
    return this.orderStatuses.get(orderId);
  }

  /**
   * Get all pending orders
   */
  getPendingOrders(): ETHToCardanoOrder[] {
    const pendingOrders: ETHToCardanoOrder[] = [];
    for (const [orderId, order] of this.orders) {
      const status = this.orderStatuses.get(orderId);
      if (status?.status === 'PENDING') {
        pendingOrders.push(order);
      }
    }
    return pendingOrders;
  }

  /**
   * Update order status
   */
  updateOrderStatus(orderId: string, newStatus: OrderStatus['status'], additionalData?: Partial<OrderStatus>): void {
    const currentStatus = this.orderStatuses.get(orderId);
    if (!currentStatus) {
      throw new Error(`Order ${orderId} not found`);
    }

    const updatedStatus: OrderStatus = {
      ...currentStatus,
      status: newStatus,
      updatedAt: Date.now(),
      ...additionalData
    };

    this.orderStatuses.set(orderId, updatedStatus);
    logger.info(`Order ${orderId} status updated to ${newStatus}`);
    this.emit('orderStatusUpdated', orderId, updatedStatus);
  }

  /**
   * Accept order by resolver
   */
  async acceptOrder(orderId: string, resolver: string, commitment: Omit<ResolverCommitment, 'orderId' | 'committedAt'>): Promise<void> {
    const order = this.orders.get(orderId);
    const status = this.orderStatuses.get(orderId);

    if (!order || !status) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (status.status !== 'PENDING') {
      throw new Error(`Order ${orderId} is not in pending status`);
    }

    // Check if order is expired
    if (Date.now() > order.expiration) {
      this.updateOrderStatus(orderId, 'EXPIRED');
      throw new Error(`Order ${orderId} has expired`);
    }

    // Record resolver commitment
    const resolverCommitment: ResolverCommitment = {
      ...commitment,
      resolver,
      orderId,
      committedAt: Date.now()
    };

    if (!this.resolverCommitments.has(orderId)) {
      this.resolverCommitments.set(orderId, []);
    }
    this.resolverCommitments.get(orderId)!.push(resolverCommitment);

    // Update order status
    this.updateOrderStatus(orderId, 'ACCEPTED', {
      acceptedBy: resolver,
      acceptedAt: Date.now()
    });

    logger.info(`Order ${orderId} accepted by resolver ${resolver}`);
    this.emit('orderAccepted', orderId, resolver, resolverCommitment);
  }

  /**
   * Calculate current Dutch auction price
   */
  calculateCurrentPrice(order: ETHToCardanoOrder): string {
    const now = Date.now();
    const timeElapsed = now - order.createdAt;
    const totalDuration = order.expiration - order.createdAt;
    const progress = Math.min(timeElapsed / totalDuration, 1);

    const startPrice = parseFloat(order.startPrice);
    const endPrice = parseFloat(order.endPrice);
    const currentPrice = startPrice - (startPrice - endPrice) * progress;

    return currentPrice.toFixed(8);
  }

  /**
   * Update order prices (Dutch auction mechanism)
   */
  updateOrderPrices(): void {
    for (const [orderId, order] of this.orders) {
      const status = this.orderStatuses.get(orderId);
      if (status?.status === 'PENDING') {
        const newPrice = this.calculateCurrentPrice(order);
        if (newPrice !== order.currentPrice) {
          order.currentPrice = newPrice;
          this.emit('priceUpdated', orderId, newPrice);
        }

        // Check if expired
        if (Date.now() > order.expiration) {
          this.updateOrderStatus(orderId, 'EXPIRED');
        }
      }
    }
  }

  /**
   * Start Dutch auction price updates
   */
  startPriceUpdates(intervalMs: number = 5000): NodeJS.Timeout {
    return setInterval(() => {
      this.updateOrderPrices();
    }, intervalMs);
  }

  // Private helper methods
  private generateOrderId(): string {
    return `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private calculateExpiration(expiration: OrderExpiration): number {
    const durations = {
      '3min': 3 * 60 * 1000,
      '6min': 6 * 60 * 1000,
      '10min': 10 * 60 * 1000
    };
    return Date.now() + durations[expiration.duration];
  }

  private calculateMinDestination(sourceAmount: string, endPrice: string): string {
    return (parseFloat(sourceAmount) * parseFloat(endPrice)).toFixed(8);
  }

  private calculateMaxDestination(sourceAmount: string, startPrice: string): string {
    return (parseFloat(sourceAmount) * parseFloat(startPrice)).toFixed(8);
  }

  private async generateOrderHash(order: ETHToCardanoOrder): Promise<string> {
    const orderData = {
      maker: order.maker,
      sourceChain: order.sourceChain,
      destinationChain: order.destinationChain,
      sourceToken: order.sourceToken,
      destinationToken: order.destinationToken,
      sourceAmount: order.sourceAmount,
      minDestinationAmount: order.minDestinationAmount,
      maxDestinationAmount: order.maxDestinationAmount,
      expiration: order.expiration,
      cardanoDestinationAddress: order.cardanoDestinationAddress
    };

    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(orderData)));
  }

  private async simulateOrderSigning(order: ETHToCardanoOrder): Promise<string> {
    // In real implementation, this would be signed by the maker's private key
    // For testing, we'll create a mock signature
    const message = `Sign order ${order.orderHash}`;
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(message));
  }

  private async validateOrder(order: ETHToCardanoOrder): Promise<OrderValidation> {
    const errors: string[] = [];
    let isValidSignature = true;
    let hasBalanceSufficient = true;
    let isExpirationValid = true;
    let isPriceRangeValid = true;

    // Validate expiration
    if (order.expiration <= Date.now()) {
      isExpirationValid = false;
      errors.push('Order expiration is in the past');
    }

    // Validate price range
    const startPrice = parseFloat(order.startPrice);
    const endPrice = parseFloat(order.endPrice);
    if (startPrice <= endPrice) {
      isPriceRangeValid = false;
      errors.push('Start price must be higher than end price for Dutch auction');
    }

    // Validate amounts
    if (parseFloat(order.sourceAmount) <= 0) {
      errors.push('Source amount must be positive');
    }

    // Validate Cardano address format
    if (!order.cardanoDestinationAddress.startsWith('addr_test1')) {
      errors.push('Invalid Cardano testnet address format');
    }

    return {
      isValidSignature,
      hasBalanceSufficient,
      isExpirationValid,
      isPriceRangeValid,
      errors
    };
  }
}
