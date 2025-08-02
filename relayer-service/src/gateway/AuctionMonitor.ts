import { EventEmitter } from 'events';
import winston from 'winston';
import { 
    calculateCurrentPrice,
    calculatePriceDecayRate,
    calculateAuctionProgress,
    isProfitable
} from '../auction-details/utils';
import { DutchAuctionOrder as AuctionDetailsOrder } from '../auction-details/types';

interface DutchAuctionOrder {
    orderHash: string;
    maker: string;
    receiver: string;
    makerAsset: string;
    takerAsset: string;
    makerAmount: string;
    takerAmount: string;
    startTime: number;
    endTime: number;
    startPrice: string;
    endPrice: string;
    auctionStartTime: number;
    auctionEndTime: number;
    salt: string;
    signature: string;
}

interface AuctionDetails {
    orderHash: string;
    currentPrice: string;
    timeRemaining: number;
    priceDecayRate: string;
    nextPriceUpdate: number;
    isActive: boolean;
    progress: number;
    estimatedFillPrice: string;
}

interface AuctionConfig {
    priceUpdateInterval: number;
    maxSlippage: number;
    minProfitMargin: number;
    gasBuffer: number;
}

interface ProfitabilityResult {
    currentPrice: string;
    isProfitable: boolean;
    gasEstimate: string;
    netProfit: string;
    executionTime: number;
}

class AuctionMonitor extends EventEmitter {
    private orders: Map<string, DutchAuctionOrder> = new Map();
    private intervalId: NodeJS.Timeout | null = null;
    private logger: winston.Logger;
    private config: AuctionConfig;

    constructor(config: AuctionConfig) {
        super();
        
        this.config = config;
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'auction-monitor.log' })
            ]
        });
    }

    public start(): void {
        if (this.intervalId) {
            this.logger.warn('Auction monitor is already running');
            return;
        }

        this.logger.info('Starting auction monitor...');
        this.intervalId = setInterval(() => {
            this.updateAuctions();
        }, this.config.priceUpdateInterval);

        this.emit('monitor_started');
    }

    public stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.logger.info('Auction monitor stopped');
            this.emit('monitor_stopped');
        }
    }

    public addOrder(order: DutchAuctionOrder): void {
        this.orders.set(order.orderHash, order);
        this.logger.info('Order added to monitoring:', { orderHash: order.orderHash });
        this.emit('order_added', order);
    }

    public removeOrder(orderHash: string): void {
        if (this.orders.delete(orderHash)) {
            this.logger.info('Order removed from monitoring:', { orderHash });
            this.emit('order_removed', orderHash);
        }
    }

    public isMonitoring(orderHash: string): boolean {
        return this.orders.has(orderHash);
    }

    public getActiveOrderCount(): number {
        return this.orders.size;
    }

    public getOrderDetails(orderHash: string): AuctionDetails | null {
        const order = this.orders.get(orderHash);
        if (!order) return null;

        return this.calculateAuctionDetails(order);
    }

    private updateAuctions(): void {
        const currentTime = Math.floor(Date.now() / 1000);
        const updatedOrders: AuctionDetails[] = [];

        this.orders.forEach((order, orderHash) => {
            const details = this.calculateAuctionDetails(order);
            updatedOrders.push(details);

            // Check if order has expired
            if (currentTime > order.endTime) {
                this.removeOrder(orderHash);
                this.emit('order_expired', order);
                return;
            }

            // Emit price update event
            this.emit('price_update', details);

            // Check profitability
            const gasPrice = '20000000000'; // 20 gwei - should be fetched from network
            const profitability = this.calculateWithProfitability(order, gasPrice);
            
            if (profitability.isProfitable) {
                this.emit('profitable_opportunity', {
                    order,
                    profitability,
                    details
                });
            }
        });

        if (updatedOrders.length > 0) {
            this.emit('orders_updated', updatedOrders);
        }
    }

    public calculateAuctionDetails(order: DutchAuctionOrder): AuctionDetails {
        const currentTime = Math.floor(Date.now() / 1000);
        const currentPrice = this.calculateCurrentPrice(order, currentTime);
        const progress = this.calculateAuctionProgress(order, currentTime);
        const timeRemaining = Math.max(0, order.endTime - currentTime);
        const priceDecayRate = this.calculatePriceDecayRate(order);
        const isActive = currentTime >= order.startTime && currentTime <= order.endTime;

        return {
            orderHash: order.orderHash,
            currentPrice,
            timeRemaining,
            priceDecayRate,
            nextPriceUpdate: currentTime + Math.floor(this.config.priceUpdateInterval / 1000),
            isActive,
            progress,
            estimatedFillPrice: this.estimateFillPrice(order, currentTime)
        };
    }

    public calculateCurrentPrice(order: DutchAuctionOrder, currentTime: number): string {
        // Use the corrected implementation from auction-details utils
        return calculateCurrentPrice(order as unknown as AuctionDetailsOrder, currentTime);
    }

    public calculatePriceDecayRate(order: DutchAuctionOrder): string {
        // Use the corrected implementation from auction-details utils
        return calculatePriceDecayRate(order as unknown as AuctionDetailsOrder);
    }

    public calculateAuctionProgress(order: DutchAuctionOrder, currentTime: number): number {
        // Use the corrected implementation from auction-details utils
        return calculateAuctionProgress(order as unknown as AuctionDetailsOrder, currentTime);
    }

    public getAuctionStatus(order: DutchAuctionOrder, currentTime: number): 'pending' | 'active' | 'expired' {
        if (currentTime < order.startTime) return 'pending';
        if (currentTime > order.endTime) return 'expired';
        return 'active';
    }

    public isProfitable(order: DutchAuctionOrder, currentTime: number, gasPrice: string): boolean {
        // Use the corrected implementation from auction-details utils
        return isProfitable(order as unknown as AuctionDetailsOrder, currentTime, gasPrice, this.config.minProfitMargin);
    }

    public calculateWithProfitability(order: DutchAuctionOrder, gasPrice: string): ProfitabilityResult {
        const currentTime = Math.floor(Date.now() / 1000);
        const currentPrice = this.calculateCurrentPrice(order, currentTime);
        const gasEstimate = this.estimateGasCost(gasPrice);
        const expectedProfit = this.calculateExpectedProfit(order, currentPrice);
        const netProfit = (BigInt(expectedProfit) - BigInt(gasEstimate)).toString();
        const isProfitable = this.isProfitable(order, currentTime, gasPrice);

        return {
            currentPrice,
            isProfitable,
            gasEstimate,
            netProfit,
            executionTime: currentTime
        };
    }

    public calculateOptimalExecutionTime(order: DutchAuctionOrder, gasPrice: string, targetProfitMargin: number): number {
        const gasCost = this.estimateGasCost(gasPrice);
        const requiredProfit = BigInt(gasCost) * BigInt(Math.floor((1 + targetProfitMargin) * 1000)) / BigInt(1000);
        
        // Binary search for optimal time
        let low = order.startTime;
        let high = order.endTime;
        let optimalTime = order.startTime;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const priceAtMid = this.calculateCurrentPrice(order, mid);
            const profitAtMid = this.calculateExpectedProfit(order, priceAtMid);

            if (BigInt(profitAtMid) >= requiredProfit) {
                optimalTime = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return Math.min(optimalTime, order.endTime);
    }

    public calculateBatch(orders: DutchAuctionOrder[], gasPrice: string): ProfitabilityResult[] {
        return orders.map(order => this.calculateWithProfitability(order, gasPrice));
    }

    public calculateEfficiencyMetrics(order: DutchAuctionOrder): {
        priceDecayRate: string;
        timeUtilization: number;
        priceUtilization: number;
        efficiency: number;
    } {
        const currentTime = Math.floor(Date.now() / 1000);
        const priceDecayRate = this.calculatePriceDecayRate(order);
        const progress = this.calculateAuctionProgress(order, currentTime);
        const currentPrice = this.calculateCurrentPrice(order, currentTime);
        
        const startPrice = BigInt(order.startPrice);
        const endPrice = BigInt(order.endPrice);
        const currentPriceBig = BigInt(currentPrice);
        
        const priceUtilization = startPrice > endPrice 
            ? Number((startPrice - currentPriceBig) * BigInt(1000) / (startPrice - endPrice)) / 1000
            : 0;

        const efficiency = (progress + priceUtilization) / 2;

        return {
            priceDecayRate,
            timeUtilization: progress,
            priceUtilization,
            efficiency: Math.max(0, Math.min(1, efficiency))
        };
    }

    private estimateGasCost(gasPrice: string): string {
        const estimatedGasUnits = 150000; // Typical gas for complex DeFi transaction
        return (BigInt(gasPrice) * BigInt(estimatedGasUnits) * BigInt(Math.floor((1 + this.config.gasBuffer) * 1000)) / BigInt(1000)).toString();
    }

    private calculateExpectedProfit(order: DutchAuctionOrder, currentPrice: string): string {
        // Simplified profit calculation - would need more complex logic in production
        const makerAmount = BigInt(order.makerAmount);
        const takerAmount = BigInt(order.takerAmount);
        const currentPriceBig = BigInt(currentPrice);
        
        // Calculate potential arbitrage profit
        const expectedReturn = makerAmount * currentPriceBig / takerAmount;
        const profit = expectedReturn > makerAmount ? expectedReturn - makerAmount : BigInt(0);
        
        return profit.toString();
    }

    private estimateFillPrice(order: DutchAuctionOrder, _currentTime: number): string {
        // Estimate when the order might be filled based on current market conditions
        const timeToOptimal = this.calculateOptimalExecutionTime(order, '20000000000', this.config.minProfitMargin);
        return this.calculateCurrentPrice(order, timeToOptimal);
    }

    public getAllActiveOrders(): DutchAuctionOrder[] {
        return Array.from(this.orders.values());
    }

    public getProfitableOpportunities(gasPrice: string = '20000000000'): Array<{
        order: DutchAuctionOrder;
        profitability: ProfitabilityResult;
        details: AuctionDetails;
    }> {
        const opportunities: Array<{
            order: DutchAuctionOrder;
            profitability: ProfitabilityResult;
            details: AuctionDetails;
        }> = [];

        this.orders.forEach((order) => {
            const profitability = this.calculateWithProfitability(order, gasPrice);
            if (profitability.isProfitable) {
                const details = this.calculateAuctionDetails(order);
                opportunities.push({ order, profitability, details });
            }
        });

        return opportunities.sort((a, b) => {
            return BigInt(b.profitability.netProfit) > BigInt(a.profitability.netProfit) ? 1 : -1;
        });
    }

    public updateConfiguration(newConfig: Partial<AuctionConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.logger.info('Configuration updated:', newConfig);
    }

    public clearAllOrders(): void {
        const count = this.orders.size;
        this.orders.clear();
        this.logger.info('All orders cleared:', { count });
        this.emit('all_orders_cleared', count);
    }
}

export { AuctionMonitor, DutchAuctionOrder, AuctionDetails, AuctionConfig, ProfitabilityResult };
