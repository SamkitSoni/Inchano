# DeFi Relayer Service API Documentation

This document provides comprehensive documentation for the RESTful API endpoints that allow dApps to interact with the relayer service for order management and status updates.

## Base URL
```
http://localhost:3000/api
```

## Authentication
Currently, the API doesn't require authentication. In production, implement appropriate authentication mechanisms (API keys, JWT tokens, etc.).

## Common Response Format

All API responses follow this standard format:

```json
{
  "success": boolean,
  "data": object | array,
  "error": string (only present if success is false),
  "timestamp": string (ISO 8601)
}
```

## Order Management Endpoints

### 1. Create Order

Creates a new Dutch auction order in the relayer service.

**Endpoint:** `POST /api/orders`

**Request Body:**
```json
{
  "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
  "receiver": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
  "makerAsset": "0xA0b86a33E6b2d8D1e7c3e4F5a6B7c8D9E0f1a2b3",
  "takerAsset": "0xB1c97b44F7d1f9e8c4e5F6a7B8c9D0e1F2a3b4c5",
  "makerAmount": "1000000000000000000",
  "takerAmount": "2000000000000000000",
  "startTime": 1640995200,
  "endTime": 1641081600,
  "startPrice": "2000000000000000000",
  "endPrice": "1800000000000000000",
  "auctionStartTime": 1640995200,
  "auctionEndTime": 1641081600,
  "salt": "123456789",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderHash": "0x1234567890abcdef...",
    "order": {
      "orderHash": "0x1234567890abcdef...",
      "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
      "status": "pending",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "message": "Order created successfully"
  }
}
```

### 2. Get Orders

Retrieves a list of orders with optional filtering and pagination.

**Endpoint:** `GET /api/orders`

**Query Parameters:**
- `maker` (optional): Filter by maker address
- `status` (optional): Filter by order status (`pending`, `active`, `filled`, `expired`, `cancelled`)
- `makerAsset` (optional): Filter by maker asset address
- `takerAsset` (optional): Filter by taker asset address
- `limit` (optional): Number of orders to return (default: 50, max: 100)
- `offset` (optional): Number of orders to skip (default: 0)
- `sortBy` (optional): Sort by field (`createdAt`, `price`, `endTime`)
- `sortOrder` (optional): Sort direction (`asc`, `desc`)

**Example Request:**
```
GET /api/orders?maker=0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8&status=active&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "orderHash": "0x1234567890abcdef...",
        "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
        "status": "active",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "limit": 10,
      "offset": 0,
      "total": 25,
      "hasMore": true
    }
  }
}
```

### 3. Get Order by Hash

Retrieves a specific order by its hash.

**Endpoint:** `GET /api/orders/:orderHash`

**Response:**
```json
{
  "success": true,
  "data": {
    "order": {
      "orderHash": "0x1234567890abcdef...",
      "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
      "makerAsset": "0xA0b86a33E6b2d8D1e7c3e4F5a6B7c8D9E0f1a2b3",
      "takerAsset": "0xB1c97b44F7d1f9e8c4e5F6a7B8c9D0e1F2a3b4c5",
      "makerAmount": "1000000000000000000",
      "takerAmount": "2000000000000000000",
      "status": "active",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### 4. Update Order

Updates order status or signature.

**Endpoint:** `PATCH /api/orders/:orderHash`

**Request Body:**
```json
{
  "status": "active",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order": {
      "orderHash": "0x1234567890abcdef...",
      "status": "active",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "message": "Order updated successfully"
  }
}
```

### 5. Cancel Order

Cancels an active order.

**Endpoint:** `DELETE /api/orders/:orderHash`

**Response:**
```json
{
  "success": true,
  "data": {
    "orderHash": "0x1234567890abcdef...",
    "message": "Order cancelled successfully"
  }
}
```

## Order Status and Auction Endpoints

### 6. Get Order Status

Retrieves real-time order status with auction details.

**Endpoint:** `GET /api/orders/:orderHash/status`

**Response:**
```json
{
  "success": true,
  "data": {
    "orderHash": "0x1234567890abcdef...",
    "status": "active",
    "currentPrice": "1900000000000000000",
    "timeRemaining": 3600,
    "progress": 0.5,
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 7. Get Auction Details

Retrieves detailed auction information for an order.

**Endpoint:** `GET /api/orders/:orderHash/auction`

**Response:**
```json
{
  "success": true,
  "data": {
    "orderHash": "0x1234567890abcdef...",
    "currentPrice": "1900000000000000000",
    "timeRemaining": 3600,
    "priceDecayRate": "55555555555555",
    "nextPriceUpdate": 1640998800,
    "isActive": true,
    "progress": 0.5,
    "estimatedFillPrice": "1900000000000000000"
  }
}
```

### 8. Get Profitable Opportunities

Retrieves orders that are currently profitable for resolvers to fill.

**Endpoint:** `GET /api/orders/profitable/opportunities`

**Query Parameters:**
- `gasPrice` (optional): Gas price in wei for profitability calculation (default: 20 gwei)
- `minProfitMargin` (optional): Minimum profit margin percentage (default: 0.01 = 1%)

**Response:**
```json
{
  "success": true,
  "data": {
    "opportunities": [
      {
        "orderHash": "0x1234567890abcdef...",
        "order": {
          "orderHash": "0x1234567890abcdef...",
          "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
          "status": "active"
        },
        "profitability": {
          "currentPrice": "1900000000000000000",
          "netProfit": "50000000000000000",
          "gasEstimate": "150000",
          "profitMargin": "0.0263",
          "timeRemaining": 3600
        },
        "auctionProgress": 0.5
      }
    ],
    "count": 1,
    "gasPrice": "20000000000",
    "minProfitMargin": 0.01,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### 9. Submit Order Fill

Submits a transaction hash for order fulfillment.

**Endpoint:** `POST /api/orders/:orderHash/fill`

**Request Body:**
```json
{
  "txHash": "0xabcdef1234567890...",
  "fillAmount": "1900000000000000000",
  "resolver": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderHash": "0x1234567890abcdef...",
    "txHash": "0xabcdef1234567890...",
    "fillAmount": "1900000000000000000",
    "resolver": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
    "message": "Order fill submitted successfully"
  }
}
```

### 10. Get Order Metrics

Retrieves statistics and metrics about orders in the system.

**Endpoint:** `GET /api/orders/stats/metrics`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalOrders": 150,
    "activeOrders": 25,
    "filledOrders": 100,
    "cancelledOrders": 20,
    "expiredOrders": 5,
    "averageFillRate": 0.6667,
    "totalVolume": "50000000000000000000",
    "averageAuctionDuration": 1800.5,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## WebSocket API

For real-time updates, connect to the WebSocket endpoint:

**WebSocket URL:** `ws://localhost:8081`

### WebSocket Message Format

All WebSocket messages follow this format:

```json
{
  "type": "message_type",
  "data": {},
  "timestamp": 1640995200000,
  "clientId": "client_1640995200000_abc123"
}
```

### Subscription Messages

**Subscribe to Order Updates:**
```json
{
  "type": "subscribe",
  "data": {
    "subscription": "orders",
    "filters": {
      "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
      "status": ["active", "pending"],
      "minAmount": "1000000000000000000"
    }
  },
  "timestamp": 1640995200000
}
```

**Subscribe to Profitable Opportunities:**
```json
{
  "type": "subscribe",
  "data": {
    "subscription": "profitable_opportunities",
    "filters": {
      "minProfitMargin": 0.02
    }
  },
  "timestamp": 1640995200000
}
```

**Unsubscribe:**
```json
{
  "type": "unsubscribe",
  "data": {
    "subscription": "orders"
  },
  "timestamp": 1640995200000
}
```

### WebSocket Events

**Order Created:**
```json
{
  "type": "order_created",
  "data": {
    "order": {
      "orderHash": "0x1234567890abcdef...",
      "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
      "status": "pending"
    }
  },
  "timestamp": 1640995200000
}
```

**Order Updated:**
```json
{
  "type": "order_update",
  "data": {
    "orderHash": "0x1234567890abcdef...",
    "order": {
      "status": "active"
    },
    "updateType": "status"
  },
  "timestamp": 1640995200000
}
```

**Order Filled:**
```json
{
  "type": "order_filled",
  "data": {
    "orderHash": "0x1234567890abcdef...",
    "order": {
      "status": "filled"
    },
    "updateType": "fill"
  },
  "timestamp": 1640995200000
}
```

**Profitable Opportunity:**
```json
{
  "type": "profitable_opportunity",
  "data": {
    "opportunity": {
      "orderHash": "0x1234567890abcdef...",
      "profitability": {
        "currentPrice": "1900000000000000000",
        "netProfit": "50000000000000000",
        "profitMargin": "0.0263"
      }
    }
  },
  "timestamp": 1640995200000
}
```

## Error Handling

### HTTP Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors, missing fields)
- `404`: Not Found (order doesn't exist)
- `409`: Conflict (order already exists)
- `500`: Internal Server Error

### Error Response Format

```json
{
  "success": false,
  "error": {
    "message": "Order not found",
    "stack": "Error stack trace (development only)"
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/orders/0x1234567890abcdef"
}
```

## Rate Limiting

(To be implemented in production)

- API endpoints: 100 requests per minute per IP
- WebSocket connections: 10 connections per IP
- WebSocket messages: 60 messages per minute per connection

## Examples

### JavaScript/TypeScript Client

```typescript
// REST API Usage
const createOrder = async (orderData) => {
  const response = await fetch('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderData),
  });
  
  const result = await response.json();
  return result;
};

// WebSocket Usage
const ws = new WebSocket('ws://localhost:8081');

ws.onopen = () => {
  // Subscribe to order updates
  ws.send(JSON.stringify({
    type: 'subscribe',
    data: {
      subscription: 'orders',
      filters: { status: ['active'] }
    },
    timestamp: Date.now()
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

### cURL Examples

```bash
# Create an order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
    "receiver": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
    "makerAsset": "0xA0b86a33E6b2d8D1e7c3e4F5a6B7c8D9E0f1a2b3",
    "takerAsset": "0xB1c97b44F7d1f9e8c4e5F6a7B8c9D0e1F2a3b4c5",
    "makerAmount": "1000000000000000000",
    "takerAmount": "2000000000000000000",
    "startTime": 1640995200,
    "endTime": 1641081600,
    "startPrice": "2000000000000000000",
    "endPrice": "1800000000000000000",
    "auctionStartTime": 1640995200,
    "auctionEndTime": 1641081600,
    "signature": "0x..."
  }'

# Get orders with filters
curl "http://localhost:3000/api/orders?status=active&limit=10"

# Get profitable opportunities
curl "http://localhost:3000/api/orders/profitable/opportunities?minProfitMargin=0.02"

# Get order metrics
curl "http://localhost:3000/api/orders/stats/metrics"
```

## Integration with Existing Services

The RESTful API is designed to integrate seamlessly with the existing relayer service components:

1. **Fusion Order Gateway**: Orders from the 1inch Fusion+ WebSocket API are automatically added to the order management system
2. **Auction Monitor**: Real-time price calculations and profitability analysis
3. **Escrow Monitor**: Integration with escrow contract monitoring for order settlement
4. **WebSocket Broadcasting**: Real-time updates are broadcast to subscribed dApp clients

This comprehensive API enables dApps to:
- Submit and manage orders
- Monitor order status and auction progress
- Receive real-time updates via WebSocket
- Identify profitable opportunities for order resolution
- Access detailed metrics and analytics
