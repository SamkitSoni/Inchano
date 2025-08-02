export interface DutchAuctionOrder {
  orderHash: string;
  maker: string;
  receiver: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  makerAmount: string;
  takerAmount: string;
  salt: string;
  signature: string;
  startPrice: string;
  endPrice: string;
  startTime: number;
  endTime: number;
  auctionStartTime: number;
  auctionEndTime: number;
  status: AuctionStatus;
  createdAt: number;
  updatedAt: number;
}

export enum AuctionStatus {
  CREATED = 'created',
  PENDING = 'pending',
  ACTIVE = 'active',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export interface AuctionDetails {
  orderHash: string;
  currentPrice: string;
  startPrice: string;
  endPrice: string;
  startTime: number;
  endTime: number;
  timeRemaining: number;
  progress: number; // 0-1
  priceDecay: string;
  isProfitable: boolean;
  estimatedProfit: string | undefined;
  nextPriceUpdate?: number;
  isActive: boolean;
  estimatedFillPrice: string;
}

export interface AuctionCalculationResult {
  currentPrice: string;
  timeElapsed: number;
  timeRemaining: number;
  progress: number;
  priceDecay: string;
  isProfitable: boolean;
  estimatedProfit: string | undefined;
  gasEstimate?: string;
  netProfit: string;
}

export interface ProfitabilityCheck {
  isProfitable: boolean;
  estimatedProfit: string;
  currentPrice: string;
  gasEstimate: string;
  netProfit: string;
}
