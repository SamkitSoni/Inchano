import axios from 'axios';
import { logger } from '../utils/logger';

interface PriceData {
  currentPrice: number; // current price of asset in quote currency
  timestamp: number;    // when the price was last updated
}

export class PriceFeedService {
  private readonly updateInterval: number;
  private readonly pairs: string[]; // List of pairs to fetch, e.g., ['usdc', 'ada']
  private prices: Record<string, PriceData> = {};
  private updateIntervalId: NodeJS.Timeout | null = null;

  constructor(pairs: string[], updateInterval: number = 60000) { // Default 60 seconds
    this.pairs = pairs;
    this.updateInterval = updateInterval;
    this.start();
  }

  public start(): void {
    if (this.updateIntervalId) {
      logger.warn('PriceFeedService is already running');
      return;
    }

    this.updatePrices();
    this.updateIntervalId = setInterval(() => this.updatePrices(), this.updateInterval);
    logger.info(`PriceFeedService started with ${this.updateInterval}ms interval`);
  }

  public stop(): void {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
      logger.info('PriceFeedService stopped');
    }
  }

  private async updatePrices(): Promise<void> {
    try {
      const responses = await Promise.all(
        this.pairs.map(pair => this.fetchPrice(pair))
      );

      responses.forEach((priceData, index) => {
        if (priceData) {
          this.prices[this.pairs[index]] = priceData;
          logger.info(`Updated price for ${this.pairs[index]}: $${priceData.currentPrice} at ${new Date(priceData.timestamp)}`);
        }
      });
    } catch (error) {
      logger.error('Failed to update prices', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async fetchPrice(pair: string): Promise<PriceData | null> {
    try {
      const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${pair}&vs_currencies=usd`);
      const timestamp = Date.now();

      if (response.data[pair] && response.data[pair].usd) {
        return { currentPrice: response.data[pair].usd, timestamp };
      }

      return null;
    } catch (error) {
      logger.error(`Failed to fetch price for ${pair}`, { error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  public getPrice(pair: string): PriceData | null {
    return this.prices[pair] || null;
  }
}

