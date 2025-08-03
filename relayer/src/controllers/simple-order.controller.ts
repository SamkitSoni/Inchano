import { Request, Response } from 'express';
import { SimpleOrderService } from '../services/simple-order.service';

export class SimpleOrderController {
  // POST /orders/create - Just accept any signed order
  static async createOrder(req: Request, res: Response) {
    try {
      console.log('📋 Received order creation request:', req.body);
      
      const { limitOrder, signature } = req.body;
      
      if (!limitOrder || !signature) {
        return res.status(400).json({
          success: false,
          error: 'Missing limitOrder or signature'
        });
      }
      
      // Store the order
      const orderId = SimpleOrderService.addOrder(limitOrder, signature);
      
      console.log(`✅ Order created with ID: ${orderId}`);
      
      res.json({
        success: true,
        orderId,
        message: 'Order created successfully'
      });
      
    } catch (error) {
      console.error('❌ Order creation failed:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
  
  // GET /orders/:id
  static async getOrder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const order = SimpleOrderService.getOrder(id);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }
      
      res.json({
        success: true,
        order
      });
      
    } catch (error) {
      console.error('❌ Get order failed:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
  
  // GET /orders/pending
  static async getPendingOrders(req: Request, res: Response) {
    try {
      const orders = SimpleOrderService.getPendingOrders();
      
      res.json({
        success: true,
        orders,
        count: orders.length
      });
      
    } catch (error) {
      console.error('❌ Get pending orders failed:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}
