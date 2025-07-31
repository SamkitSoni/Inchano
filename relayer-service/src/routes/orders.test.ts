import request from 'supertest';
import express from 'express';
import { OrdersRoutes } from './orders';
import { AuctionStatus } from '../auction-details/types';

describe('Orders API', () => {
  let app: express.Application;
  let ordersRouter: OrdersRoutes;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    ordersRouter = new OrdersRoutes();
    app.use('/api/orders', ordersRouter.getRouter());
  });

  const sampleOrderData = {
    maker: '0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8',
    receiver: '0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8',
    makerAsset: '0xA0b86a33E6b2d8D1e7c3e4F5a6B7c8D9E0f1a2b3',
    takerAsset: '0xB1c97b44F7d1f9e8c4e5F6a7B8c9D0e1F2a3b4c5',
    makerAmount: '1000000000000000000',
    takerAmount: '2000000000000000000',
    startTime: Math.floor(Date.now() / 1000),
    endTime: Math.floor(Date.now() / 1000) + 3600,
    startPrice: '2000000000000000000',
    endPrice: '1800000000000000000',
    auctionStartTime: Math.floor(Date.now() / 1000),
    auctionEndTime: Math.floor(Date.now() / 1000) + 3600,
    signature: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12'
  };

  describe('POST /api/orders', () => {
    it('should create a new order', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send(sampleOrderData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orderHash).toBeDefined();
      expect(response.body.data.order.maker).toBe(sampleOrderData.maker);
      expect(response.body.data.order.status).toBe('pending');
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteData = { ...sampleOrderData };
      delete (incompleteData as any).maker;

      const response = await request(app)
        .post('/api/orders')
        .send(incompleteData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required field: maker');
    });
  });

  describe('GET /api/orders', () => {
    beforeEach(async () => {
      // Create a sample order
      await request(app)
        .post('/api/orders')
        .send(sampleOrderData);
    });

    it('should return list of orders', async () => {
      const response = await request(app)
        .get('/api/orders')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orders).toBeInstanceOf(Array);
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should filter orders by maker', async () => {
      const response = await request(app)
        .get(`/api/orders?maker=${sampleOrderData.maker}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orders.length).toBeGreaterThan(0);
      expect(response.body.data.orders[0].maker).toBe(sampleOrderData.maker);
    });

    it('should apply pagination', async () => {
      const response = await request(app)
        .get('/api/orders?limit=1&offset=0')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pagination.limit).toBe(1);
      expect(response.body.data.pagination.offset).toBe(0);
    });
  });

  describe('GET /api/orders/:orderHash', () => {
    let orderHash: string;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/orders')
        .send(sampleOrderData);
      orderHash = createResponse.body.data.orderHash;
    });

    it('should return order by hash', async () => {
      const response = await request(app)
        .get(`/api/orders/${orderHash}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.order.orderHash).toBe(orderHash);
    });

    it('should return 404 for non-existent order', async () => {
      const response = await request(app)
        .get('/api/orders/0x999999999999999999999999999999999999999999999999999999999999999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Order not found');
    });
  });

  describe('PATCH /api/orders/:orderHash', () => {
    let orderHash: string;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/orders')
        .send(sampleOrderData);
      orderHash = createResponse.body.data.orderHash;
    });

    it('should update order status', async () => {
      const response = await request(app)
        .patch(`/api/orders/${orderHash}`)
        .send({ status: AuctionStatus.ACTIVE })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.order.status).toBe(AuctionStatus.ACTIVE);
    });

    it('should return 404 for non-existent order', async () => {
      const response = await request(app)
        .patch('/api/orders/0x999999999999999999999999999999999999999999999999999999999999999')
        .send({ status: AuctionStatus.ACTIVE })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/orders/:orderHash', () => {
    let orderHash: string;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/orders')
        .send(sampleOrderData);
      orderHash = createResponse.body.data.orderHash;
    });

    it('should cancel order', async () => {
      const response = await request(app)
        .delete(`/api/orders/${orderHash}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Order cancelled successfully');
    });

    it('should return 404 for non-existent order', async () => {
      const response = await request(app)
        .delete('/api/orders/0x999999999999999999999999999999999999999999999999999999999999999')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/orders/:orderHash/status', () => {
    let orderHash: string;

    beforeEach(async () => {
      const createResponse = await request(app)
        .post('/api/orders')
        .send(sampleOrderData);
      orderHash = createResponse.body.data.orderHash;
    });

    it('should return order status with auction details', async () => {
      const response = await request(app)
        .get(`/api/orders/${orderHash}/status`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orderHash).toBe(orderHash);
      expect(response.body.data.status).toBeDefined();
      expect(response.body.data.currentPrice).toBeDefined();
      expect(response.body.data.timeRemaining).toBeDefined();
      expect(response.body.data.progress).toBeDefined();
    });
  });

  describe('GET /api/orders/profitable/opportunities', () => {
    beforeEach(async () => {
      // Create and activate an order
      const createResponse = await request(app)
        .post('/api/orders')
        .send(sampleOrderData);
      
      const orderHash = createResponse.body.data.orderHash;
      await request(app)
        .patch(`/api/orders/${orderHash}`)
        .send({ status: AuctionStatus.ACTIVE });
    });

    it('should return profitable opportunities', async () => {
      const response = await request(app)
        .get('/api/orders/profitable/opportunities')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.opportunities).toBeInstanceOf(Array);
      expect(response.body.data.count).toBeDefined();
      expect(response.body.data.gasPrice).toBeDefined();
      expect(response.body.data.minProfitMargin).toBeDefined();
    });

    it('should apply gas price and profit margin filters', async () => {
      const response = await request(app)
        .get('/api/orders/profitable/opportunities?gasPrice=30000000000&minProfitMargin=0.05')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.gasPrice).toBe('30000000000');
      expect(response.body.data.minProfitMargin).toBe(0.05);
    });
  });

  describe('GET /api/orders/stats/metrics', () => {
    beforeEach(async () => {
      // Create a few orders with different statuses
      const createResponse1 = await request(app)
        .post('/api/orders')
        .send(sampleOrderData);
      
      const createResponse2 = await request(app)
        .post('/api/orders')
        .send({ ...sampleOrderData, maker: '0x999999999999999999999999999999999999999999' });

      // Update statuses
      await request(app)
        .patch(`/api/orders/${createResponse1.body.data.orderHash}`)
        .send({ status: AuctionStatus.ACTIVE });
      
      await request(app)
        .patch(`/api/orders/${createResponse2.body.data.orderHash}`)
        .send({ status: AuctionStatus.FILLED });
    });

    it('should return order metrics', async () => {
      const response = await request(app)
        .get('/api/orders/stats/metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalOrders).toBeDefined();
      expect(response.body.data.activeOrders).toBeDefined();
      expect(response.body.data.filledOrders).toBeDefined();
      expect(response.body.data.cancelledOrders).toBeDefined();
      expect(response.body.data.expiredOrders).toBeDefined();
      expect(response.body.data.averageFillRate).toBeDefined();
      expect(response.body.data.totalVolume).toBeDefined();
      expect(response.body.data.averageAuctionDuration).toBeDefined();
      expect(response.body.data.timestamp).toBeDefined();
    });
  });
});
