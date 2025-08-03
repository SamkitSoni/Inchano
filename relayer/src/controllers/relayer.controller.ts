import { Request, Response, Router, Express } from 'express';
import express from 'express';
import cors from 'cors';
import { CardanoService } from '../services/cardano.service';
import { EthereumService } from '../services/ethereum.service';
import { OrderCreationService, CreateOrderRequest, SignedOrderRequest } from '../services/order-creation.service';
import { LopIntegrationService } from '../services/lop-integration.service';
import { WebSocketService } from '../services/websocket.service';
import { OrderbookDatabase } from '../database/simple-db';
import { SimpleOrderService } from '../services/simple-order.service';
import { logger } from '../utils/logger';

export class RelayerController {
  private app: Express;
  private router: Router;
  private cardanoService: CardanoService;
  private ethereumService: EthereumService;
  private database: OrderbookDatabase;
  private orderCreationService: OrderCreationService;
  private lopIntegrationService: LopIntegrationService;
  private wsService: WebSocketService | null = null;

  constructor() {
    this.app = express();
    this.router = Router();
    this.cardanoService = new CardanoService();
    this.ethereumService = new EthereumService();
    this.database = new OrderbookDatabase();
    this.orderCreationService = new OrderCreationService(this.database, this.ethereumService);
    this.lopIntegrationService = new LopIntegrationService(this.database);
    this.setupMiddleware();
    this.initializeRoutes();
  }

  public initializeWebSocket(server: any): void {
    this.wsService = new WebSocketService();
    this.wsService.initialize(server);
    logger.info('WebSocket service initialized');
  }

  private setupMiddleware(): void {
    // Enable CORS
    this.app.use(cors());
    
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing relayer service...');
      
      // Initialize database
      await this.database.initialize();
      
      // Initialize services
      await this.cardanoService.initialize();
      await this.ethereumService.initialize();
      
      // Initialize SimpleOrderService with blockchain clients
      SimpleOrderService.initialize();
      
      // Start LOP event listening
      await this.lopIntegrationService.startEventListening();
      
      // Sync historical events
      await this.lopIntegrationService.syncHistoricalEvents();
      
      // Start periodic reconciliation
      this.startPeriodicTasks();
      
      // Mount routes
      this.app.use('/', this.router);
      
      logger.info('Relayer service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize relayer service:', error);
      throw error;
    }
  }

  public getApp(): Express {
    return this.app;
  }

  private startPeriodicTasks(): void {
    // Expire old orders every 5 minutes
    setInterval(async () => {
      try {
        await this.database.expireOldOrders();
      } catch (error) {
        logger.error('Failed to expire old orders:', error);
      }
    }, 5 * 60 * 1000);

    // Reconcile orderbook every 10 minutes
    setInterval(async () => {
      try {
        await this.lopIntegrationService.reconcileOrderbook();
      } catch (error) {
        logger.error('Failed to reconcile orderbook:', error);
      }
    }, 10 * 60 * 1000);

    logger.info('Periodic tasks started');
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.router.get('/health', this.getHealth.bind(this));
    
    // Status endpoint
    this.router.get('/status', this.getStatus.bind(this));
    
    // Test connections endpoint
    this.router.get('/test-connections', this.testConnections.bind(this));
    
    // Cardano endpoints
    this.router.get('/cardano/wallet', this.getCardanoWallet.bind(this));
    this.router.get('/cardano/contracts', this.getCardanoContracts.bind(this));
    
    // Ethereum endpoints
    this.router.get('/ethereum/wallet', this.getEthereumWallet.bind(this));
    this.router.get('/ethereum/contracts', this.getEthereumContracts.bind(this));
    
    // Cross-chain operation endpoints
    this.router.post('/swap/initiate', this.initiateSwap.bind(this));
    this.router.get('/swap/:orderId', this.getSwapStatus.bind(this));
    
    // Order management endpoints - SIMPLE VERSION
    this.router.post('/orders/create', this.createOrderSimple.bind(this));
    this.router.get('/orders/:orderId', this.getOrderSimple.bind(this));
    this.router.get('/orders/pending', this.getPendingOrdersSimple.bind(this));
    
    // Resolver endpoints
    this.router.get('/resolver/orders', this.getOrdersForResolver.bind(this));
  }

  private async getHealth(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'inchano-relayer',
        version: '1.0.0'
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(500).json({ error: 'Health check failed' });
    }
  }

  private async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = {
        service: 'inchano-relayer',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        networks: {
          cardano: {
            network: 'preprod',
            status: 'connected'
          },
          ethereum: {
            network: 'sepolia',
            status: 'connected'
          }
        },
        contracts: {
          cardano: {
            limitOrderProtocol: 'addr_test1w9f069f153ac688ac08c97da0a29e7c061ba21dadae384edcfa2369fc',
            escrowFactory: 'addr_test1w1e0a111161ed6495ef29fac0c4209838724c26680d0420af26d5bcec'
          },
          ethereum: {
            limitOrderProtocol: process.env.ETHEREUM_LOP_ADDRESS,
            escrowFactory: process.env.ETHEREUM_ESCROW_FACTORY_ADDRESS
          }
        }
      };

      res.json(status);
    } catch (error) {
      logger.error('Status check failed:', error);
      res.status(500).json({ error: 'Status check failed' });
    }
  }

  private async testConnections(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Testing network connections...');

      // Test Cardano connection
      const cardanoTest = await this.cardanoService.getWalletBalance().catch(error => ({
        error: error.message
      }));

      // Test Ethereum connection
      const ethereumTest = await this.ethereumService.getWalletBalance().catch(error => ({
        error: error.message
      }));

      const results = {
        timestamp: new Date().toISOString(),
        tests: {
          cardano: cardanoTest,
          ethereum: ethereumTest
        }
      };

      res.json(results);
    } catch (error) {
      logger.error('Connection test failed:', error);
      res.status(500).json({ error: 'Connection test failed' });
    }
  }

  private async getCardanoWallet(req: Request, res: Response): Promise<void> {
    try {
      const walletInfo = await this.cardanoService.getWalletBalance();
      res.json(walletInfo);
    } catch (error) {
      logger.error('Failed to get Cardano wallet info:', error);
      res.status(500).json({ error: 'Failed to get Cardano wallet info' });
    }
  }

  private async getCardanoContracts(req: Request, res: Response): Promise<void> {
    try {
      const [lopInfo, escrowInfo] = await Promise.all([
        this.cardanoService.checkLimitOrderProtocol().catch(error => ({ error: error.message })),
        this.cardanoService.checkEscrowFactory().catch(error => ({ error: error.message }))
      ]);

      res.json({
        limitOrderProtocol: lopInfo,
        escrowFactory: escrowInfo
      });
    } catch (error) {
      logger.error('Failed to get Cardano contract info:', error);
      res.status(500).json({ error: 'Failed to get Cardano contract info' });
    }
  }

  private async getEthereumWallet(req: Request, res: Response): Promise<void> {
    try {
      const walletInfo = await this.ethereumService.getWalletBalance();
      res.json(walletInfo);
    } catch (error) {
      logger.error('Failed to get Ethereum wallet info:', error);
      res.status(500).json({ error: 'Failed to get Ethereum wallet info' });
    }
  }

  private async getEthereumContracts(req: Request, res: Response): Promise<void> {
    try {
      const [lopInfo, escrowInfo] = await Promise.all([
        this.ethereumService.checkLimitOrderProtocol().catch(error => ({ error: error.message })),
        this.ethereumService.checkEscrowFactory().catch(error => ({ error: error.message }))
      ]);

      res.json({
        limitOrderProtocol: lopInfo,
        escrowFactory: escrowInfo
      });
    } catch (error) {
      logger.error('Failed to get Ethereum contract info:', error);
      res.status(500).json({ error: 'Failed to get Ethereum contract info' });
    }
  }

  private async initiateSwap(req: Request, res: Response): Promise<void> {
    try {
      // This would be the main cross-chain swap logic
      const { sourceChain, destinationChain, amount, orderData } = req.body;
      
      logger.info('Initiating cross-chain swap:', { sourceChain, destinationChain, amount });
      
      // For now, return a mock response
      const swapId = `swap_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      res.json({
        swapId,
        status: 'initiated',
        sourceChain,
        destinationChain,
        amount,
        timestamp: new Date().toISOString(),
        message: 'Cross-chain swap initiated successfully'
      });
    } catch (error) {
      logger.error('Failed to initiate swap:', error);
      res.status(500).json({ error: 'Failed to initiate swap' });
    }
  }

  private async getSwapStatus(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      
      // For now, return a mock status
      res.json({
        orderId,
        status: 'pending',
        progress: {
          step: 1,
          totalSteps: 3,
          description: 'Waiting for source chain confirmation'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get swap status:', error);
      res.status(500).json({ error: 'Failed to get swap status' });
    }
  }

  // ================== ORDER MANAGEMENT ENDPOINTS ==================

  private async createOrder(req: Request, res: Response): Promise<void> {
    try {
      const orderRequest: SignedOrderRequest = req.body;
      
      // Validate required fields
      const requiredFields = ['maker', 'tokenIn', 'tokenOut', 'amountIn', 'minAmountOut', 'priceLimit1', 'priceLimit2', 'expirationMinutes', 'signature'];
      const missingFields = requiredFields.filter(field => !orderRequest[field as keyof SignedOrderRequest]);
      
      if (missingFields.length > 0) {
        res.status(400).json({ 
          success: false, 
          errors: [`Missing required fields: ${missingFields.join(', ')}`] 
        });
        return;
      }

      logger.info('Creating new order:', {
        maker: orderRequest.maker,
        tokenIn: orderRequest.tokenIn,
        tokenOut: orderRequest.tokenOut,
        amountIn: orderRequest.amountIn
      });

      const result = await this.orderCreationService.createOrder(orderRequest);
      
      if (result.success) {
        // Broadcast order creation to WebSocket clients
        if (this.wsService && result.orderId) {
          this.wsService.broadcastOrderCreated(result.orderId, {
            maker: orderRequest.maker,
            tokenIn: orderRequest.tokenIn,
            tokenOut: orderRequest.tokenOut,
            amountIn: orderRequest.amountIn,
            minAmountOut: orderRequest.minAmountOut,
            priceLimit1: orderRequest.priceLimit1,
            priceLimit2: orderRequest.priceLimit2
          });
        }

        res.status(201).json({
          success: true,
          orderId: result.orderId,
          message: 'Order created successfully'
        });
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('Failed to create order:', error);
      res.status(500).json({ 
        success: false, 
        errors: ['Internal server error'] 
      });
    }
  }

  private async getOrder(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      
      const result = await this.orderCreationService.getOrder(orderId);
      
      if (result.success) {
        res.json({
          success: true,
          order: result.order
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }
    } catch (error) {
      logger.error('Failed to get order:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to retrieve order' 
      });
    }
  }

  private async getOrdersByMaker(req: Request, res: Response): Promise<void> {
    try {
      const { address } = req.params;
      
      const result = await this.orderCreationService.getOrdersByMaker(address);
      
      if (result.success) {
        res.json({
          success: true,
          orders: result.orders
        });
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      logger.error('Failed to get orders by maker:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to retrieve orders' 
      });
    }
  }

  private async getPendingOrders(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.orderCreationService.getPendingOrders();
      
      if (result.success) {
        res.json({
          success: true,
          orders: result.orders,
          count: result.orders?.length || 0
        });
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      logger.error('Failed to get pending orders:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to retrieve pending orders' 
      });
    }
  }

  private async cancelOrder(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      const { maker } = req.body;
      
      if (!maker) {
        res.status(400).json({
          success: false,
          error: 'Maker address is required'
        });
        return;
      }
      
      const result = await this.orderCreationService.cancelOrder(orderId, maker);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Order cancelled successfully'
        });
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('Failed to cancel order:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to cancel order' 
      });
    }
  }

  private async getOrdersForResolver(req: Request, res: Response): Promise<void> {
    try {
      const { chains, minProfit } = req.query;
      
      const chainsArray = chains ? (chains as string).split(',') : undefined;
      const minProfitNum = minProfit ? parseFloat(minProfit as string) : undefined;
      
      const orders = await this.database.getOrdersForResolver(chainsArray, minProfitNum);
      
      res.json({
        success: true,
        orders,
        count: orders.length,
        filters: {
          chains: chainsArray,
          minProfit: minProfitNum
        }
      });
    } catch (error) {
      logger.error('Failed to get orders for resolver:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to retrieve orders for resolver' 
      });
    }
  }

  // SIMPLE ORDER METHODS - NO COMPLEX VALIDATION
  private async createOrderSimple(req: Request, res: Response): Promise<void> {
    try {
      logger.info('📋 SIMPLE: Received order creation request:', {
        maker: req.body.limitOrder?.maker,
        tokenIn: req.body.limitOrder?.tokenIn,
        tokenOut: req.body.limitOrder?.tokenOut,
        amountIn: req.body.limitOrder?.amountIn
      });
      
      const { limitOrder, signature } = req.body;
      
      if (!limitOrder || !signature) {
        logger.error('❌ SIMPLE: Missing required fields', { limitOrder: !!limitOrder, signature: !!signature });
        res.status(400).json({
          success: false,
          error: 'Missing limitOrder or signature'
        });
        return;
      }
      
      logger.info('🔄 SIMPLE: Processing order with SimpleOrderService...');
      
      // Use SimpleOrderService to store and submit order - FIXED: Added await
      const orderId = await SimpleOrderService.addOrder(limitOrder, signature);
      
      logger.info(`✅ SIMPLE: Order processed successfully with ID: ${orderId}`);
      
      // Broadcast to WebSocket clients if available
      if (this.wsService) {
        logger.info('📡 SIMPLE: Broadcasting order creation to WebSocket clients');
        this.wsService.broadcastOrderCreated(orderId, {
          maker: limitOrder.maker,
          tokenIn: limitOrder.tokenIn,
          tokenOut: limitOrder.tokenOut,
          amountIn: limitOrder.amountIn,
          minAmountOut: limitOrder.amountOut,
          timestamp: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        orderId,
        message: 'Order created and submitted successfully',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('❌ SIMPLE: Order creation failed:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  private async getOrderSimple(req: Request, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      
      res.json({
        success: true,
        order: { id: orderId, status: 'PENDING', message: 'Simple order retrieval' }
      });
      
    } catch (error) {
      console.error('❌ SIMPLE: Get order failed:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
  
  private async getPendingOrdersSimple(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        success: true,
        orders: [],
        count: 0,
        message: 'Simple pending orders'
      });
      
    } catch (error) {
      console.error('❌ SIMPLE: Get pending orders failed:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}
