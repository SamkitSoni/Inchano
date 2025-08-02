import { parseEther, parseUnits } from 'viem';
import { useAccount, useSignTypedData } from 'wagmi';
import { CreateOrderRequest } from './api';

// Token addresses on Sepolia testnet
export const TOKEN_ADDRESSES = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native ETH
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
  WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH on Sepolia
} as const;

// Limit Order Protocol contract address on Sepolia
export const LIMIT_ORDER_PROTOCOL_ADDRESS = '0x7b728d06b49DB49b0858397fDBe48bC57a814AF0';

export interface OrderParams {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  maker: string;
  receiver: string;
  startTime?: number;
  endTime?: number;
}

export interface LimitOrder {
  salt: string;
  maker: string;
  receiver: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  makerTraits: string;
}

// EIP-712 domain for Limit Order Protocol
export const DOMAIN = {
  name: 'LimitOrderProtocol',
  version: '4',
  chainId: 11155111, // Sepolia
  verifyingContract: LIMIT_ORDER_PROTOCOL_ADDRESS as `0x${string}`,
} as const;

// EIP-712 types for limit order
export const LIMIT_ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
    { name: 'makerTraits', type: 'uint256' },
  ],
} as const;

export class OrderService {
  static getTokenAddress(symbol: string): string {
    switch (symbol.toUpperCase()) {
      case 'ETH':
        return TOKEN_ADDRESSES.ETH;
      case 'USDC':
        return TOKEN_ADDRESSES.USDC;
      case 'WETH':
        return TOKEN_ADDRESSES.WETH;
      default:
        throw new Error(`Unknown token: ${symbol}`);
    }
  }

  static getTokenDecimals(symbol: string): number {
    switch (symbol.toUpperCase()) {
      case 'ETH':
      case 'WETH':
        return 18;
      case 'USDC':
        return 6;
      default:
        return 18;
    }
  }

  static parseTokenAmount(amount: string, symbol: string): string {
    const decimals = this.getTokenDecimals(symbol);
    if (decimals === 18) {
      return parseEther(amount).toString();
    } else {
      return parseUnits(amount, decimals).toString();
    }
  }

  static generateSalt(): string {
    return Math.floor(Math.random() * 1000000000000000).toString();
  }

  static createLimitOrder(params: OrderParams): LimitOrder {
    const salt = this.generateSalt();
    const makerAsset = this.getTokenAddress(params.fromToken);
    const takerAsset = this.getTokenAddress(params.toToken);
    const makingAmount = this.parseTokenAmount(params.fromAmount, params.fromToken);
    const takingAmount = this.parseTokenAmount(params.toAmount, params.toToken);

    return {
      salt,
      maker: params.maker,
      receiver: params.receiver,
      makerAsset,
      takerAsset,
      makingAmount,
      takingAmount,
      makerTraits: '0', // Basic traits, can be extended
    };
  }

  static calculateDutchAuctionPrices(
    takingAmount: string,
    startTime: number,
    endTime: number,
    startPriceMultiplier: number = 1.1, // 10% higher than market
    endPriceMultiplier: number = 0.9    // 10% lower than market
  ): { startPrice: string; endPrice: string } {
    const baseAmount = BigInt(takingAmount);
    const startPrice = (baseAmount * BigInt(Math.floor(startPriceMultiplier * 1000))) / BigInt(1000);
    const endPrice = (baseAmount * BigInt(Math.floor(endPriceMultiplier * 1000))) / BigInt(1000);

    return {
      startPrice: startPrice.toString(),
      endPrice: endPrice.toString(),
    };
  }
}

// Hook for creating and signing orders
export function useOrderCreation() {
  const { address } = useAccount();
  const { signTypedDataAsync, isPending } = useSignTypedData();

  const createAndSignOrder = async (params: OrderParams): Promise<CreateOrderRequest> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    // Create the limit order
    const limitOrder = OrderService.createLimitOrder({
      ...params,
      maker: address,
    });

    // Sign the order
    const signature = await signTypedDataAsync({
      domain: DOMAIN,
      types: LIMIT_ORDER_TYPES,
      primaryType: 'Order',
      message: {
        salt: BigInt(limitOrder.salt),
        maker: limitOrder.maker as `0x${string}`,
        receiver: limitOrder.receiver as `0x${string}`,
        makerAsset: limitOrder.makerAsset as `0x${string}`,
        takerAsset: limitOrder.takerAsset as `0x${string}`,
        makingAmount: BigInt(limitOrder.makingAmount),
        takingAmount: BigInt(limitOrder.takingAmount),
        makerTraits: BigInt(limitOrder.makerTraits),
      },
    });

    // Calculate Dutch auction parameters
    const now = Math.floor(Date.now() / 1000);
    const startTime = params.startTime || now;
    const endTime = params.endTime || (now + 3600); // 1 hour by default

    const { startPrice, endPrice } = OrderService.calculateDutchAuctionPrices(
      limitOrder.takingAmount,
      startTime,
      endTime
    );

    return {
      limitOrder,
      signature,
      startPrice,
      endPrice,
      startTime,
      endTime,
    };
  };

  return {
    createAndSignOrder,
    isLoading: isPending,
  };
}
