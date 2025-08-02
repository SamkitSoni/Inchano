/**
 * API client for communicating with the relayer service
 */

export interface DutchAuctionOrder {
  orderHash: string;
  maker: string;
  receiver: string;
  makerAsset: string;
  takerAsset: string;
  makingAmount: string;
  takingAmount: string;
  salt: string;
  signature: string;
  startPrice: string;
  endPrice: string;
  startTime: number;
  endTime: number;
  status: 'created' | 'active' | 'filled' | 'cancelled' | 'expired';
  createdAt: number;
  updatedAt: number;
}

export interface CreateOrderRequest {
  limitOrder: {
    salt: string;
    maker: string;
    receiver: string;
    makerAsset: string;
    takerAsset: string;
    makingAmount: string;
    takingAmount: string;
    makerTraits: string;
  };
  signature: string;
  startPrice: string;
  endPrice: string;
  startTime: number;
  endTime: number;
}

export interface OrderListResponse {
  orders: DutchAuctionOrder[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class RelayerApiClient {
  private baseUrl: string;
  private wsUrl: string;

  constructor() {
    // Default to localhost for development, can be configured via environment variables
    this.baseUrl = process.env.NEXT_PUBLIC_RELAYER_BASE_URL || 'http://localhost:3002';
    this.wsUrl = process.env.NEXT_PUBLIC_RELAYER_WS_URL || 'ws://localhost:8082';
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('API request failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  // Health check
  async getHealth() {
    return this.request<{ status: string; uptime: number; services: any }>('/health');
  }

  // Order management
  async createOrder(orderData: CreateOrderRequest) {
    return this.request<{ orderHash: string; order: DutchAuctionOrder }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  }

  async getOrders(params: {
    page?: number;
    limit?: number;
    status?: string;
    maker?: string;
  } = {}) {
    const queryString = new URLSearchParams(
      Object.entries(params).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = String(value);
        }
        return acc;
      }, {} as Record<string, string>)
    ).toString();

    const endpoint = queryString ? `/api/orders?${queryString}` : '/api/orders';
    return this.request<OrderListResponse>(endpoint);
  }

  async getOrder(orderHash: string) {
    return this.request<DutchAuctionOrder>(`/api/orders/${orderHash}`);
  }

  async cancelOrder(orderHash: string) {
    return this.request<{ message: string }>(`/api/orders/${orderHash}/cancel`, {
      method: 'POST',
    });
  }

  // WebSocket connection for real-time updates
  createWebSocketConnection(): WebSocket {
    return new WebSocket(this.wsUrl);
  }
}

export const relayerApi = new RelayerApiClient();

// WebSocket message types
export interface WebSocketMessage {
  type: 'order_created' | 'order_updated' | 'order_filled' | 'order_cancelled' | 'profitable_opportunity' | 'heartbeat' | 'welcome';
  data?: any;
  timestamp?: number;
}

// Order status update event
export interface OrderUpdateEvent {
  orderHash: string;
  order: DutchAuctionOrder;
  updateType: 'status' | 'fill' | 'cancel';
}

// Profitable opportunity event
export interface ProfitableOpportunityEvent {
  orderHash: string;
  order: DutchAuctionOrder;
  estimatedProfit: string;
  currentPrice: string;
  gasEstimate: string;
}
