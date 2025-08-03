// Simple in-memory storage for demo - no complex database needed for now
export interface LimitOrder {
  orderId: string;
  maker: string;
  data: any;
  signature: string;
  status: 'PENDING' | 'ACCEPTED' | 'FULFILLED';
  createdAt: number;
  updatedAt: number;
}

// In-memory storage
const orders = new Map<string, LimitOrder>();

export class OrderbookDatabase {
  private initialized: boolean = false;

  constructor(dbPath?: string) {
    // Simple in-memory setup
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    console.log('✅ Simple database initialized');
    this.initialized = true;
  }

  async insertOrder(order: Omit<LimitOrder, 'orderId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const orderId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const now = Date.now();
    
    const fullOrder: LimitOrder = {
      ...order,
      orderId,
      createdAt: now,
      updatedAt: now
    };

    orders.set(orderId, fullOrder);
    console.log(`✅ Order inserted with ID: ${orderId}`);
    return orderId;
  }

  async getOrder(orderId: string): Promise<LimitOrder | null> {
    return orders.get(orderId) || null;
  }

  async updateOrderStatus(orderId: string, status: LimitOrder['status']): Promise<void> {
    const order = orders.get(orderId);
    if (order) {
      order.status = status;
      order.updatedAt = Date.now();
      orders.set(orderId, order);
    }
  }

  async getPendingOrders(): Promise<LimitOrder[]> {
    return Array.from(orders.values()).filter(order => order.status === 'PENDING');
  }

  async getOrdersByMaker(maker: string): Promise<LimitOrder[]> {
    return Array.from(orders.values()).filter(order => order.maker === maker);
  }

  async getOrdersForResolver(chains?: string[], minProfit?: number): Promise<LimitOrder[]> {
    return Array.from(orders.values()).filter(order => order.status === 'PENDING');
  }

  async expireOldOrders(): Promise<void> {
    // Simple cleanup if needed
  }

  async close(): Promise<void> {
    console.log('✅ Database closed');
  }
}
