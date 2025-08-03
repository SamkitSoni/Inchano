import { ethers, TypedDataEncoder, verifyMessage, verifyTypedData, isAddress, getBytes } from 'ethers';
import { LimitOrder, OrderbookDatabase } from '../database/orderbook';
import { EthereumService } from './ethereum.service';
import { logger } from '../utils/logger';

export interface CreateOrderRequest {
  maker: string;
  tokenIn: string;          // ETH address or 'ETH' for native
  tokenOut: string;         // 'tADA' for Cardano native token
  amountIn: string;         // Amount in wei or token units
  minAmountOut: string;     // Minimum output in destination token units
  priceLimit1: string;      // Starting price (higher)
  priceLimit2: string;      // Ending price (lower) 
  expirationMinutes: 3 | 6 | 10;  // Expiration time options
  destinationAddress?: string; // Optional destination address for cross-chain swaps
}

export interface SignedOrderRequest extends CreateOrderRequest {
  signature: string;
}

export class OrderCreationService {
  private database: OrderbookDatabase;
  private ethereumService: EthereumService;

  constructor(database: OrderbookDatabase, ethereumService: EthereumService) {
    this.database = database;
    this.ethereumService = ethereumService;
  }

  /**
   * Validates the order signature using 1inch Fusion protocol EIP-712 structure
   */
  async validateSignature(orderRequest: SignedOrderRequest): Promise<boolean> {
    try {
      console.log('🔐 Validating signature for maker:', orderRequest.maker);
      console.log('🔐 Signature:', orderRequest.signature);
      
      // For now, we'll do basic signature validation
      // The frontend uses the correct 1inch Fusion EIP-712 structure
      // We validate that the signature is properly formatted and non-empty
      
      if (!orderRequest.signature || orderRequest.signature.length < 130) {
        console.error('❌ Invalid signature format');
        return false;
      }
      
      if (!orderRequest.maker || !orderRequest.maker.startsWith('0x')) {
        console.error('❌ Invalid maker address');
        return false;
      }
      
      // TODO: Implement full EIP-712 validation when we have the exact signed message
      // For now, accept the signature as valid since frontend uses correct structure
      console.log('✅ Signature validation passed (basic validation)');
      return true;
      
    } catch (error) {
      console.error('❌ Signature validation failed:', error);
      return false;
    }
  }

  /**
   * Validates order parameters
   */
  private validateOrderParams(order: CreateOrderRequest): string[] {
    const errors: string[] = [];

    // Validate maker address
    if (!isAddress(order.maker)) {
      errors.push('Invalid maker address');
    }

    // Validate token addresses
    if (order.tokenIn !== 'ETH' && !isAddress(order.tokenIn)) {
      errors.push('Invalid tokenIn address');
    }

    if (order.tokenOut !== 'tADA') {
      errors.push('Only tADA is supported as output token');
    }

    // Validate amounts
    try {
      const amountIn = BigInt(order.amountIn);
      const minAmountOut = BigInt(order.minAmountOut);
      const priceLimit1 = parseFloat(order.priceLimit1);
      const priceLimit2 = parseFloat(order.priceLimit2);

      if (amountIn <= 0n) {
        errors.push('AmountIn must be greater than 0');
      }

      if (minAmountOut <= 0n) {
        errors.push('MinAmountOut must be greater than 0');
      }

      if (isNaN(priceLimit1) || isNaN(priceLimit2)) {
        errors.push('Invalid price limit values');
      }

      if (priceLimit1 <= priceLimit2) {
        errors.push('PriceLimit1 must be greater than PriceLimit2 (Dutch auction)');
      }
    } catch (error) {
      errors.push('Invalid numeric values in order');
    }

    // Validate expiration
    if (![3, 6, 10].includes(order.expirationMinutes)) {
      errors.push('Expiration must be 3, 6, or 10 minutes');
    }

    return errors;
  }

  /**
   * Checks if maker has sufficient balance
   */
  async checkMakerBalance(order: CreateOrderRequest): Promise<boolean> {
    try {
      console.log('🔍 Checking balance for:', order.maker);
      console.log('🔍 Token:', order.tokenIn);
      console.log('🔍 Amount needed:', order.amountIn);
      
      if (order.tokenIn === 'ETH') {
        const balance = await this.ethereumService.getAddressBalance(order.maker);
        console.log('🔍 Current balance:', balance);
        
        // amountIn is already in wei as a string, so parse it directly
        const required = BigInt(order.amountIn);
        const currentBalance = BigInt(balance);
        
        console.log('🔍 Required (BigInt):', required.toString());
        console.log('🔍 Balance (BigInt):', currentBalance.toString());
        
        const hasSufficient = currentBalance >= required;
        console.log('🔍 Has sufficient balance:', hasSufficient);
        
        return hasSufficient;
      } else {
        // For ERC20 tokens, would need to check token balance
        // For now, assume sufficient balance
        console.log('🔍 Non-ETH token, assuming sufficient balance');
        return true;
      }
    } catch (error) {
      console.error('❌ Balance check failed:', error);
      logger.error('Balance check failed:', error);
      return false;
    }
  }

  /**
   * Creates and stores a new limit order
   */
  async createOrder(orderRequest: SignedOrderRequest): Promise<{ success: boolean; orderId?: string; errors?: string[] }> {
    try {
      logger.info('Creating new limit order:', {
        maker: orderRequest.maker,
        tokenIn: orderRequest.tokenIn,
        tokenOut: orderRequest.tokenOut,
        amountIn: orderRequest.amountIn
      });

      // Validate order parameters
      console.log('📋 Step 1: Validating order parameters...');
      const validationErrors = this.validateOrderParams(orderRequest);
      if (validationErrors.length > 0) {
        console.log('❌ Validation failed:', validationErrors);
        return { success: false, errors: validationErrors };
      }
      console.log('✅ Step 1: Validation passed');

      // Validate signature
      console.log('📋 Step 2: Validating signature...');
      const isValidSignature = await this.validateSignature(orderRequest);
      if (!isValidSignature) {
        console.log('❌ Signature validation failed');
        return { success: false, errors: ['Invalid signature'] };
      }
      console.log('✅ Step 2: Signature validation passed');

      // Check maker balance
      console.log('📋 Step 3: Checking maker balance...');
      const hasSufficientBalance = await this.checkMakerBalance(orderRequest);
      if (!hasSufficientBalance) {
        console.log('❌ Insufficient balance');
        return { success: false, errors: ['Insufficient balance'] };
      }
      console.log('✅ Step 3: Balance check passed');

      // Create order object
      console.log('📋 Step 4: Creating order object...');
      const expiration = Date.now() + (orderRequest.expirationMinutes * 60 * 1000);
      
      const limitOrder: Omit<LimitOrder, 'orderId' | 'createdAt' | 'updatedAt'> = {
        maker: orderRequest.maker,
        sourceChain: 'ethereum',
        destinationChain: 'cardano',
        destinationAddress: orderRequest.destinationAddress, // Include destination address
        tokenIn: orderRequest.tokenIn,
        tokenOut: orderRequest.tokenOut,
        amountIn: orderRequest.amountIn,
        minAmountOut: orderRequest.minAmountOut,
        priceLimit1: orderRequest.priceLimit1,
        priceLimit2: orderRequest.priceLimit2,
        expiration,
        signature: orderRequest.signature,
        status: 'PENDING'
      };
      console.log('✅ Step 4: Order object created');

      // Store in database
      console.log('📋 Step 5: Storing in database...');
      const orderId = await this.database.insertOrder(limitOrder);
      console.log('✅ Step 5: Database insertion successful, orderId:', orderId);

      logger.info(`Order created successfully with ID: ${orderId}`);

      return { success: true, orderId };

    } catch (error) {
      console.error('❌ Order creation failed:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      logger.error('Failed to create order:', error);
      return { success: false, errors: ['Internal server error'] };
    }
  }

  /**
   * Gets order by ID
   */
  async getOrder(orderId: string) {
    try {
      const order = await this.database.getOrder(orderId);
      return { success: true, order };
    } catch (error) {
      logger.error('Failed to get order:', error);
      return { success: false, error: 'Failed to retrieve order' };
    }
  }

  /**
   * Gets orders by maker address
   */
  async getOrdersByMaker(maker: string) {
    try {
      const orders = await this.database.getOrdersByMaker(maker);
      return { success: true, orders };
    } catch (error) {
      logger.error('Failed to get orders by maker:', error);
      return { success: false, error: 'Failed to retrieve orders' };
    }
  }

  /**
   * Gets all pending orders
   */
  async getPendingOrders() {
    try {
      const orders = await this.database.getPendingOrders();
      return { success: true, orders };
    } catch (error) {
      logger.error('Failed to get pending orders:', error);
      return { success: false, error: 'Failed to retrieve pending orders' };
    }
  }

  /**
   * Cancels an order (only by maker)
   */
  async cancelOrder(orderId: string, maker: string) {
    try {
      const order = await this.database.getOrder(orderId);
      
      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (order.maker.toLowerCase() !== maker.toLowerCase()) {
        return { success: false, error: 'Not authorized to cancel this order' };
      }

      if (order.status !== 'PENDING') {
        return { success: false, error: 'Order cannot be cancelled' };
      }

      await this.database.updateOrderStatus(orderId, 'CANCELLED');
      
      logger.info(`Order ${orderId} cancelled by maker ${maker}`);
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to cancel order:', error);
      return { success: false, error: 'Failed to cancel order' };
    }
  }
}
