import { DutchAuctionOrder, ProfitabilityCheck } from './types';

/**
 * Calculate current price for a Dutch auction order
 */
export function calculateCurrentPrice(order: DutchAuctionOrder, timestamp?: number): string {
  const now = timestamp || Math.floor(Date.now() / 1000);
  const { startPrice, endPrice, startTime, endTime } = order;

  // If auction hasn't started, return start price
  if (now < startTime) {
    return startPrice;
  }

  // If auction has ended, return end price
  if (now >= endTime) {
    return endPrice;
  }

  // Calculate linear interpolation between start and end price
  const totalDuration = endTime - startTime;
  const elapsed = now - startTime;
  const progress = elapsed / totalDuration;

  const startPriceBN = BigInt(startPrice);
  const endPriceBN = BigInt(endPrice);
  const priceDiff = startPriceBN - endPriceBN;
  const priceReduction = (priceDiff * BigInt(Math.floor(progress * 1000))) / BigInt(1000);
  
  return (startPriceBN - priceReduction).toString();
}

/**
 * Calculate price decay rate for a Dutch auction
 */
export function calculatePriceDecayRate(order: DutchAuctionOrder): string {
  const startPriceBN = BigInt(order.startPrice);
  const endPriceBN = BigInt(order.endPrice);
  const duration = order.endTime - order.startTime;
  
  if (duration <= 0) return '0';
  
  const totalDecay = startPriceBN - endPriceBN;
  const decayPerSecond = totalDecay / BigInt(duration);
  
  return decayPerSecond.toString();
}

/**
 * Calculate auction progress (0-1)
 */
export function calculateAuctionProgress(order: DutchAuctionOrder, timestamp?: number): number {
  const now = timestamp || Math.floor(Date.now() / 1000);
  const totalDuration = order.endTime - order.startTime;
  
  if (totalDuration <= 0) return 1;
  if (now < order.startTime) return 0;
  if (now >= order.endTime) return 1;
  
  const elapsed = now - order.startTime;
  return elapsed / totalDuration;
}

/**
 * Check if an order is profitable to fill
 */
export function isProfitable(
  order: DutchAuctionOrder, 
  timestamp?: number, 
  gasPrice?: string, 
  minProfitMargin?: number
): boolean {
  const currentPrice = calculateCurrentPrice(order, timestamp);
  const currentPriceBN = BigInt(currentPrice);
  
  // Default gas estimate (can be improved with actual gas estimation)
  const gasEstimate = gasPrice ? BigInt(gasPrice) : BigInt('50000000000000000'); // 0.05 ETH
  const minMargin = minProfitMargin || 0.05; // 5% minimum profit margin
  
  const minProfitBN = (currentPriceBN * BigInt(Math.floor(minMargin * 1000))) / BigInt(1000);
  const requiredPrice = gasEstimate + minProfitBN;
  
  return currentPriceBN > requiredPrice;
}

/**
 * Estimate profit from filling an order
 */
export function estimateProfit(
  order: DutchAuctionOrder, 
  gasPrice: string, 
  timestamp?: number
): ProfitabilityCheck {
  const currentPrice = calculateCurrentPrice(order, timestamp);
  const currentPriceBN = BigInt(currentPrice);
  const gasEstimateBN = BigInt(gasPrice);
  
  const isProfitableFlag = currentPriceBN > gasEstimateBN;
  const netProfit = isProfitableFlag ? (currentPriceBN - gasEstimateBN).toString() : '0';
  
  return {
    isProfitable: isProfitableFlag,
    estimatedProfit: netProfit,
    currentPrice,
    gasEstimate: gasPrice,
    netProfit
  };
}

/**
 * Format price for display (converts wei to eth)
 */
export function formatPrice(priceWei: string, decimals: number = 18): string {
  const priceBN = BigInt(priceWei);
  const divisor = BigInt(10 ** decimals);
  const wholePart = priceBN / divisor;
  const fractionalPart = priceBN % divisor;
  
  // Convert fractional part to decimal string
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFractional = fractionalStr.replace(/0+$/, '');
  
  if (trimmedFractional.length === 0) {
    return wholePart.toString();
  }
  
  return `${wholePart.toString()}.${trimmedFractional}`;
}

/**
 * Check if order has expired
 */
export function isOrderExpired(order: DutchAuctionOrder, timestamp?: number): boolean {
  const now = timestamp || Math.floor(Date.now() / 1000);
  return now >= order.endTime;
}

/**
 * Check if order has started
 */
export function isOrderStarted(order: DutchAuctionOrder, timestamp?: number): boolean {
  const now = timestamp || Math.floor(Date.now() / 1000);
  return now >= order.startTime;
}

/**
 * Get time remaining in auction
 */
export function getTimeRemaining(order: DutchAuctionOrder, timestamp?: number): number {
  const now = timestamp || Math.floor(Date.now() / 1000);
  return Math.max(0, order.endTime - now);
}
