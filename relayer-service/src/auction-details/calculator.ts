import { DutchAuctionOrder, AuctionCalculationResult, ProfitabilityCheck } from './types';

export class AuctionCalculator {
  /**
   * Calculate current price for a Dutch auction order
   */
  static calculateCurrentPrice(order: DutchAuctionOrder, timestamp?: number): string {
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
   * Calculate auction details and profitability
   */
  static calculateAuctionDetails(order: DutchAuctionOrder, timestamp?: number): AuctionCalculationResult {
    const now = timestamp || Math.floor(Date.now() / 1000);
    const { startTime, endTime, startPrice } = order;

    const totalDuration = endTime - startTime;
    const timeElapsed = Math.max(0, now - startTime);
    const timeRemaining = Math.max(0, endTime - now);
    const progress = totalDuration > 0 ? Math.min(1, timeElapsed / totalDuration) : 1;

    const currentPrice = this.calculateCurrentPrice(order, timestamp);
    const startPriceBN = BigInt(startPrice);
    const currentPriceBN = BigInt(currentPrice);
    const priceDecay = startPriceBN > currentPriceBN ? 
      (startPriceBN - currentPriceBN).toString() : '0';

    // Basic profitability check (can be enhanced with gas estimation)
    const gasEstimate = '50000000000000000'; // 0.05 ETH estimate
    const profitCheck = this.checkProfitability(currentPrice, gasEstimate);

    return {
      currentPrice,
      timeElapsed,
      timeRemaining,
      progress,
      priceDecay,
      isProfitable: profitCheck.isProfitable,
      estimatedProfit: profitCheck.estimatedProfit,
      gasEstimate,
      netProfit: profitCheck.netProfit
    };
  }

  /**
   * Check if an order is profitable to fill
   */
  static checkProfitability(currentPrice: string, gasEstimate: string): ProfitabilityCheck {
    const currentPriceBN = BigInt(currentPrice);
    const gasEstimateBN = BigInt(gasEstimate);
    
    // Simple profitability: current price should be higher than gas cost
    const isProfitable = currentPriceBN > gasEstimateBN;
    const netProfit = isProfitable ? (currentPriceBN - gasEstimateBN).toString() : '0';

    return {
      isProfitable,
      estimatedProfit: netProfit,
      currentPrice,
      gasEstimate,
      netProfit
    };
  }

  /**
   * Estimate fill price including slippage
   */
  static estimateFillPrice(order: DutchAuctionOrder, slippagePercent: number = 1): string {
    const currentPrice = this.calculateCurrentPrice(order);
    const currentPriceBN = BigInt(currentPrice);
    const slippageMultiplier = BigInt(Math.floor((100 + slippagePercent) * 10));
    
    return (currentPriceBN * slippageMultiplier / BigInt(1000)).toString();
  }

  /**
   * Check if order is in valid time range
   */
  static isOrderActive(order: DutchAuctionOrder, timestamp?: number): boolean {
    const now = timestamp || Math.floor(Date.now() / 1000);
    return now >= order.startTime && now < order.endTime;
  }

  /**
   * Get time until auction starts (if not started) or ends (if active)
   */
  static getTimeUntilStateChange(order: DutchAuctionOrder, timestamp?: number): number {
    const now = timestamp || Math.floor(Date.now() / 1000);
    
    if (now < order.startTime) {
      return order.startTime - now; // Time until start
    } else if (now < order.endTime) {
      return order.endTime - now; // Time until end
    } else {
      return 0; // Auction ended
    }
  }

  /**
   * Calculate auction details with profitability analysis
   */
  static calculateWithProfitability(order: DutchAuctionOrder, gasPrice: string, timestamp?: number): AuctionCalculationResult {
    const auctionDetails = this.calculateAuctionDetails(order, timestamp);
    const gasEstimate = BigInt(gasPrice) * BigInt('21000'); // Basic gas estimate
    const profitCheck = this.checkProfitability(auctionDetails.currentPrice, gasEstimate.toString());
    
    return {
      ...auctionDetails,
      isProfitable: profitCheck.isProfitable,
      estimatedProfit: profitCheck.estimatedProfit,
      gasEstimate: gasEstimate.toString(),
      netProfit: profitCheck.netProfit
    };
  }
}
