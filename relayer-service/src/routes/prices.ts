import { Router, Request, Response } from 'express';
import { PriceFeedService } from '../services/PriceFeedService';
import { logger } from '../utils/logger';

export class PricesRoutes {
  private router: Router;
  private priceFeedService: PriceFeedService;

  constructor(priceFeedService: PriceFeedService) {
    this.router = Router();
    this.priceFeedService = priceFeedService;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Get price for a specific asset
    this.router.get('/:asset', this.getPrice.bind(this));
    
    // Get all available prices
    this.router.get('/', this.getAllPrices.bind(this));
  }

  private async getPrice(req: Request, res: Response): Promise<void> {
    try {
      const { asset } = req.params;
      const price = this.priceFeedService.getPrice(asset.toLowerCase());

      if (!price) {
        res.status(404).json({
          error: `Price not found for asset: ${asset}`
        });
        return;
      }

      res.json({
        asset: asset.toLowerCase(),
        price: price.currentPrice,
        timestamp: price.timestamp,
        lastUpdated: new Date(price.timestamp).toISOString()
      });
    } catch (error) {
      logger.error('Error getting price', { 
        asset: req.params['asset'],
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  private async getAllPrices(_req: Request, res: Response): Promise<void> {
    try {
      // Get all available prices from the service
      const allPrices: Record<string, any> = {};
      
      // Since we don't have a method to get all prices, we'll request known assets
      const knownAssets = ['usd-coin', 'cardano']; // CoinGecko IDs
      
      for (const asset of knownAssets) {
        const price = this.priceFeedService.getPrice(asset);
        if (price) {
          allPrices[asset] = {
            price: price.currentPrice,
            timestamp: price.timestamp,
            lastUpdated: new Date(price.timestamp).toISOString()
          };
        }
      }

      res.json({
        prices: allPrices,
        count: Object.keys(allPrices).length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting all prices', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  public getRouter(): Router {
    return this.router;
  }
}
