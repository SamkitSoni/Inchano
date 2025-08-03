import { useAccount } from 'wagmi';
import { useState } from 'react';
import { useOrderCreation } from '../lib/orderService';

// Relayer API configuration
const RELAYER_BASE_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3001';

export interface OrderCreationParams {
  tokenIn: string;
  tokenOut: string; // Address for EIP-712 signing
  tokenOutSymbol?: string; // Original symbol for relayer (optional, defaults to tokenOut)
  amountIn: string;
  minAmountOut: string;
  priceLimit1: string;
  priceLimit2: string;
  expirationMinutes: number;
  destinationAddress: string;
}

export interface OrderCreationResult {
  success: boolean;
  orderId?: string;
  message?: string;
  error?: string;
}

export function useRelayerOrderCreation() {
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [validatingSignature, setValidatingSignature] = useState(false);
  const [orderCreationError, setOrderCreationError] = useState<string | null>(null);
  
  const { address } = useAccount();
  const { createAndSignOrder, isLoading: isSigning } = useOrderCreation();

  const createLimitOrder = async (params: OrderCreationParams): Promise<OrderCreationResult> => {
    if (!address) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      setIsCreatingOrder(true);
      setOrderCreationError(null);

      console.log('🔐 Creating and signing limit order...', params);

      // For cross-chain swaps, we need to use an Ethereum escrow contract as receiver
      // The actual destination address will be passed separately to the relayer
      const isEthereumReceiver = params.destinationAddress.startsWith('0x');
      const receiverAddress = isEthereumReceiver 
        ? params.destinationAddress 
        : ESCROW_CONTRACTS.sepolia.ESCROW_SRC; // Use source escrow for ETH->Cardano swaps

      console.log('🏠 Using receiver address for EIP-712:', receiverAddress, 'isCrossChain:', !isEthereumReceiver);

      // Step 1: Create and sign the order using EIP-712
      const signedOrder = await createAndSignOrder({
        maker: address,
        receiver: receiverAddress, // Use Ethereum-compatible address for signing
        fromToken: params.tokenIn, // Pass addresses directly since they're already resolved
        toToken: params.tokenOut,
        fromAmount: params.amountIn,
        toAmount: params.minAmountOut,
        startTime: Math.floor(Date.now() / 1000), // Now
        endTime: Math.floor(Date.now() / 1000) + (params.expirationMinutes * 60),
      });

      console.log('✅ Order signed successfully:', signedOrder);

      // Step 2: Show signature validation state
      setValidatingSignature(true);

      // Step 3: Send to relayer in the correct 1inch format
      const relayerOrderData = {
        limitOrder: signedOrder.limitOrder,
        signature: signedOrder.signature
      };

      console.log('📡 Sending order to relayer in 1inch format...', relayerOrderData);

      const response = await fetch(`${RELAYER_BASE_URL}/orders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(relayerOrderData)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.errors?.join(', ') || 'Order creation failed');
      }

      console.log('🎉 Order created successfully in relayer:', result);

      return {
        success: true,
        orderId: result.orderId,
        message: result.message || 'Order created successfully'
      };

    } catch (error) {
      console.error('❌ Order creation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setOrderCreationError(errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setIsCreatingOrder(false);
      setValidatingSignature(false);
    }
  };

  return {
    createLimitOrder,
    isCreatingOrder,
    validatingSignature,
    isSigning,
    orderCreationError,
    isLoading: isCreatingOrder || isSigning || validatingSignature
  };
}

// Token addresses for each network
const TOKEN_ADDRESSES = {
  sepolia: {
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    // Cross-chain token representation - using a properly formatted address for tADA
    ADA: '0x0000000000000000000000000000000000000002', // Valid placeholder for cross-chain tADA
  }
};

// Cross-chain escrow contracts
const ESCROW_CONTRACTS = {
  sepolia: {
    ESCROW_SRC: '0xb5A3Ad6957B0A1E397BB8Fc3Ac86B9698d0c991b', // Source escrow for ETH->Cardano
    ESCROW_DST: '0x1217704f22f053284dA591d4a83324B11AD0bD3B', // Destination escrow for Cardano->ETH
  }
};

// Cardano token mappings
export const CARDANO_TOKENS = {
  tADA: 'tADA',
  tUSDC: 'tUSDC'
};

// Helper function to get token address
export function getTokenAddress(symbol: string, network: 'sepolia' = 'sepolia'): string {
  console.log('🏷️ Getting token address for symbol:', symbol, 'network:', network);
  
  if (!symbol) {
    throw new Error('Token symbol is required');
  }
  
  if (symbol === 'ETH') return TOKEN_ADDRESSES[network].ETH;
  if (symbol === 'ADA' || symbol === 'tADA') return TOKEN_ADDRESSES[network].ADA; // Use placeholder for cross-chain
  
  const tokenMap = TOKEN_ADDRESSES[network] as Record<string, string>;
  const address = tokenMap[symbol];
  
  if (!address) {
    throw new Error(`Unknown token: ${symbol}`);
  }
  
  console.log('✅ Token address found:', address, 'for symbol:', symbol);
  return address;
}

// Helper function to calculate price limits for Dutch auction
export function calculatePriceLimits(
  amountIn: string,
  minAmountOut: string,
  slippageTolerance: number = 0.5
): { priceLimit1: string; priceLimit2: string } {
  const amountInBig = BigInt(amountIn);
  const minAmountOutBig = BigInt(minAmountOut);
  
  // priceLimit1 should be higher (starting price)
  // priceLimit2 should be lower (ending price)
  const slippageMultiplier = Math.floor((1 + slippageTolerance / 100) * 1000);
  const discountMultiplier = Math.floor((1 - slippageTolerance / 100) * 1000);
  
  const priceLimit1 = (minAmountOutBig * BigInt(slippageMultiplier)) / BigInt(1000);
  const priceLimit2 = (minAmountOutBig * BigInt(discountMultiplier)) / BigInt(1000);
  
  return {
    priceLimit1: priceLimit1.toString(),
    priceLimit2: priceLimit2.toString()
  };
}
