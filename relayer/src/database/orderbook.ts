import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
        this.db.exec(`ALTER TABLE orders ADD COLUMN destinationAddress TEXT`, (alterErr) => {
          // Ignore error if column already exists
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            logger.error('Failed to add destinationAddress column:', alterErr);
          } else {
            logger.info('Database migration: destinationAddress column ensured');
          }

          this.db.exec(createIndexes, (indexErr) => {
            if (indexErr) {
              logger.error('Failed to create indexes:', indexErr);
              reject(indexErr);
              return;
            }

            this.initialized = true;
            logger.info('Database initialized successfully');
            resolve();
          });
        });
      });
    });
  }

export interface LimitOrder {
  orderId: string;
  maker: string;
  sourceChain: 'ethereum' | 'cardano';
  destinationChain: 'ethereum' | 'cardano';
  destinationAddress?: string; // Optional destination address for cross-chain swaps
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  priceLimit1: string;  // Starting price (higher)
  priceLimit2: string;  // Ending price (lower)
  expiration: number;   // Unix timestamp
  signature: string;
  status: 'PENDING' | 'ACCEPTED' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED';
  acceptedBy?: string;  // Resolver address
  createdAt: number;
  updatedAt: number;
  txHash?: string;      // On-chain transaction hash
}

export interface OrderbookEntry extends LimitOrder {
  profitability?: number;
  gasEstimate?: string;
}

export class OrderbookDatabase {
  private db: sqlite3.Database;
  private initialized: boolean = false;

  constructor(dbPath: string = './orderbook.db') {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('Failed to connect to SQLite database:', err);
        throw err;
      }
      logger.info('Connected to SQLite orderbook database');
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      const createOrdersTable = `
        CREATE TABLE IF NOT EXISTS orders (
          orderId TEXT PRIMARY KEY,
          maker TEXT NOT NULL,
          sourceChain TEXT NOT NULL,
          destinationChain TEXT NOT NULL,
          destinationAddress TEXT,
          tokenIn TEXT NOT NULL,
          tokenOut TEXT NOT NULL,
          amountIn TEXT NOT NULL,
          minAmountOut TEXT NOT NULL,
          priceLimit1 TEXT NOT NULL,
          priceLimit2 TEXT NOT NULL,
          expiration INTEGER NOT NULL,
          signature TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          acceptedBy TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          txHash TEXT,
          profitability REAL,
          gasEstimate TEXT
        )
      `;

      const createIndexes = `
        CREATE INDEX IF NOT EXISTS idx_maker ON orders(maker);
        CREATE INDEX IF NOT EXISTS idx_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_expiration ON orders(expiration);
        CREATE INDEX IF NOT EXISTS idx_chains ON orders(sourceChain, destinationChain);
        CREATE INDEX IF NOT EXISTS idx_created ON orders(createdAt);
      `;

      this.db.exec(createOrdersTable, (err) => {
        if (err) {
          logger.error('Failed to create orders table:', err);
          reject(err);
          return;
        }

        this.db.exec(createIndexes, (indexErr) => {
          if (indexErr) {
            logger.error('Failed to create indexes:', indexErr);
            reject(indexErr);
            return;
          }

          this.initialized = true;
          logger.info('Orderbook database initialized successfully');
          resolve();
        });
      });
    });
  }

  async insertOrder(order: Omit<LimitOrder, 'orderId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const orderId = uuidv4();
    const now = Date.now();
    
    const fullOrder: LimitOrder = {
      ...order,
      orderId,
      createdAt: now,
      updatedAt: now
    };

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO orders (
          orderId, maker, sourceChain, destinationChain, destinationAddress, tokenIn, tokenOut,
          amountIn, minAmountOut, priceLimit1, priceLimit2, expiration,
          signature, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        fullOrder.orderId, fullOrder.maker, fullOrder.sourceChain, fullOrder.destinationChain,
        fullOrder.destinationAddress || null, fullOrder.tokenIn, fullOrder.tokenOut, fullOrder.amountIn, fullOrder.minAmountOut,
        fullOrder.priceLimit1, fullOrder.priceLimit2, fullOrder.expiration,
        fullOrder.signature, fullOrder.status, fullOrder.createdAt, fullOrder.updatedAt
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to insert order:', err);
          reject(err);
          return;
        }
        
        logger.info(`Order inserted with ID: ${orderId}`);
        resolve(orderId);
      });
    });
  }

  async getOrder(orderId: string): Promise<OrderbookEntry | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM orders WHERE orderId = ?';
      
      this.db.get(sql, [orderId], (err, row: any) => {
        if (err) {
          logger.error('Failed to get order:', err);
          reject(err);
          return;
        }
        
        resolve(row || null);
      });
    });
  }

  async updateOrderStatus(orderId: string, status: LimitOrder['status'], acceptedBy?: string, txHash?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let sql = 'UPDATE orders SET status = ?, updatedAt = ?';
      let params: any[] = [status, Date.now()];

      if (acceptedBy) {
        sql += ', acceptedBy = ?';
        params.push(acceptedBy);
      }

      if (txHash) {
        sql += ', txHash = ?';
        params.push(txHash);
      }

      sql += ' WHERE orderId = ?';
      params.push(orderId);

      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('Failed to update order:', err);
          reject(err);
          return;
        }
        
        logger.info(`Order ${orderId} status updated to ${status}`);
        resolve();
      });
    });
  }

  async getPendingOrders(): Promise<OrderbookEntry[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM orders 
        WHERE status = 'PENDING' AND expiration > ? 
        ORDER BY createdAt DESC
      `;
      
      this.db.all(sql, [Date.now()], (err, rows: any[]) => {
        if (err) {
          logger.error('Failed to get pending orders:', err);
          reject(err);
          return;
        }
        
        resolve(rows || []);
      });
    });
  }

  async getOrdersByMaker(maker: string): Promise<OrderbookEntry[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM orders WHERE maker = ? ORDER BY createdAt DESC';
      
      this.db.all(sql, [maker], (err, rows: any[]) => {
        if (err) {
          logger.error('Failed to get orders by maker:', err);
          reject(err);
          return;
        }
        
        resolve(rows || []);
      });
    });
  }

  async getOrdersForResolver(chains?: string[], minProfit?: number): Promise<OrderbookEntry[]> {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT * FROM orders 
        WHERE status = 'PENDING' AND expiration > ?
      `;
      let params: any[] = [Date.now()];

      if (chains && chains.length > 0) {
        const placeholders = chains.map(() => '?').join(',');
        sql += ` AND sourceChain IN (${placeholders})`;
        params.push(...chains);
      }

      if (minProfit !== undefined) {
        sql += ' AND profitability >= ?';
        params.push(minProfit);
      }

      sql += ' ORDER BY profitability DESC, createdAt ASC';

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          logger.error('Failed to get orders for resolver:', err);
          reject(err);
          return;
        }
        
        resolve(rows || []);
      });
    });
  }

  async expireOldOrders(): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE orders 
        SET status = 'EXPIRED', updatedAt = ? 
        WHERE status = 'PENDING' AND expiration <= ?
      `;
      
      const now = Date.now();
      
      this.db.run(sql, [now, now], function(err) {
        if (err) {
          logger.error('Failed to expire old orders:', err);
          reject(err);
          return;
        }
        
        logger.info(`Expired ${this.changes} orders`);
        resolve(this.changes);
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          logger.error('Error closing database:', err);
        } else {
          logger.info('Database connection closed');
        }
        resolve();
      });
    });
  }
}
