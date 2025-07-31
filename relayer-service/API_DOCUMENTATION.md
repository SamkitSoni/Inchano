# API Documentation

This document describes the REST API endpoints provided by the Relayer Service.

## Base URL
```
http://localhost:3000
```

## Authentication
Currently, no authentication is required for the API endpoints. In production, JWT-based authentication should be implemented.

## Health Check

### GET /health
Returns the comprehensive health status of the service including system metrics and service status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456,
  "version": "1.0.0",
  "environment": "development",
  "memory": {
    "rss": 45678912,
    "heapTotal": 28311552,
    "heapUsed": 18567296,
    "external": 1234567,
    "arrayBuffers": 123456
  },
  "services": {
    "escrowMonitor": "healthy",
    "webSocket": "healthy",
    "priceUpdater": "healthy"
  },
  "metrics": {
    "totalRequests": 1234,
    "totalErrors": 5,
    "activeConnections": 12
  }
}
```

## Orders API

### POST /api/orders
Create a new Dutch auction order.

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
  "endTime": 1640998800,
  "startPrice": "2000000000000000000",
  "endPrice": "1500000000000000000",
  "auctionStartTime": 1640995200,
  "auctionEndTime": 1640997000,
  "salt": "0x1234567890abcdef",
  "signature": "0x1234567890abcdef..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderHash": "0xabcdef1234567890...",
    "order": {
      "orderHash": "0xabcdef1234567890...",
      "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
      "status": "pending",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "message": "Order created successfully"
  }
}
```

### GET /api/orders
Retrieve a list of orders with optional filtering and pagination.

**Query Parameters:**
- `maker` (optional): Filter by maker address
- `status` (optional): Filter by order status (pending, active, filled, cancelled, expired)
- `makerAsset` (optional): Filter by maker asset address
- `takerAsset` (optional): Filter by taker asset address
- `limit` (optional): Number of orders to return (default: 50, max: 100)
- `offset` (optional): Number of orders to skip (default: 0)
- `sortBy` (optional): Sort field (createdAt, price, endTime)
- `sortOrder` (optional): Sort order (asc, desc)

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "orderHash": "0xabcdef1234567890...",
        "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
        "receiver": "0x842d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
        "makerAsset": "0xA0b86a33E6b2d8D1e7c3e4F5a6B7c8D9E0f1a2b3",
        "takerAsset": "0xB1c97b44F7d1f9e8c4e5F6a7B8c9D0e1F2a3b4c5",
        "makerAmount": "1000000000000000000",
        "takerAmount": "2000000000000000000",
        "startPrice": "2000000000000000000",
        "endPrice": "1500000000000000000",
        "status": "active",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "limit": 50,
      "offset": 0,
      "total": 1,
      "hasMore": false
    }
  }
}
```

### GET /api/orders/:orderHash
Retrieve a specific order by its hash.

**Response:**
```json
{
  "success": true,
  "data": {
    "order": {
      "orderHash": "0xabcdef1234567890...",
      "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
      "receiver": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
      "makerAsset": "0xA0b86a33E6b2d8D1e7c3e4F5a6B7c8D9E0f1a2b3",
      "takerAsset": "0xB1c97b44F7d1f9e8c4e5F6a7B8c9D0e1F2a3b4c5",
      "makerAmount": "1000000000000000000",
      "takerAmount": "2000000000000000000",
      "startTime": 1640995200,
      "endTime": 1640998800,
      "startPrice": "2000000000000000000",
      "endPrice": "1500000000000000000",
      "auctionStartTime": 1640995200,
      "auctionEndTime": 1640997000,
      "status": "active",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### PATCH /api/orders/:orderHash
Update an existing order's status or signature.

**Request Body:**
```json
{
  "status": "active",
  "signature": "0xnewsignature..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order": {
      "orderHash": "0xabcdef1234567890...",
      "status": "active",
      "updatedAt": "2024-01-01T00:01:00.000Z"
    },
    "message": "Order updated successfully"
  }
}
```

### DELETE /api/orders/:orderHash
Cancel an existing order.

**Response:**
```json
{
  "success": true,
  "data": {
    "orderHash": "0xabcdef1234567890...",
    "message": "Order cancelled successfully"
  }
}
```

### GET /api/orders/:orderHash/status
Get real-time status and auction details for a specific order.

**Response:**
```json
{
  "success": true,
  "data": {
    "orderHash": "0xabcdef1234567890...",
    "status": "active",
    "currentPrice": "1750000000000000000",
    "timeRemaining": 1200,
    "progress": 0.33,
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### GET /api/orders/:orderHash/auction
Get detailed auction information including price decay and timing.

**Response:**
```json
{
  "success": true,
  "data": {
    "orderHash": "0xabcdef1234567890...",
    "currentPrice": "1750000000000000000",
    "timeRemaining": 1200,
    "priceDecayRate": "277777777777777",
    "nextPriceUpdate": 1640996260,
    "isActive": true,
    "progress": 0.33,
    "estimatedFillPrice": "1750000000000000000"
  }
}
```

### GET /api/orders/profitable/opportunities
Get orders that present profitable opportunities for resolvers.

**Query Parameters:**
- `gasPrice` (optional): Gas price in wei for profitability calculation (default: 20000000000)
- `minProfitMargin` (optional): Minimum profit margin as decimal (default: 0.01)

**Response:**
```json
{
  "success": true,
  "data": {
    "opportunities": [
      {
        "orderHash": "0xabcdef1234567890...",
        "order": {
          "orderHash": "0xabcdef1234567890...",
          "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
          "status": "active"
        },
        "profitability": {
          "currentPrice": "1750000000000000000",
          "netProfit": "50000000000000000",
          "gasEstimate": "150000",
          "profitMargin": "0.0286",
          "timeRemaining": 1200
        },
        "auctionProgress": 0.33
      }
    ],
    "count": 1,
    "gasPrice": "20000000000",
    "minProfitMargin": 0.01,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### POST /api/orders/:orderHash/fill
Submit a fill transaction for an order.

**Request Body:**
```json
{
  "txHash": "0xfilled1234567890...",
  "fillAmount": "1750000000000000000",
  "resolver": "0x123456789abcdef123456789abcdef1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderHash": "0xabcdef1234567890...",
    "txHash": "0xfilled1234567890...",
    "fillAmount": "1750000000000000000",
    "resolver": "0x123456789abcdef123456789abcdef1234567890",
    "message": "Order fill submitted successfully"
  }
}
```

### GET /api/orders/stats/metrics
Get comprehensive order statistics and metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalOrders": 1234,
    "activeOrders": 56,
    "filledOrders": 1100,
    "cancelledOrders": 67,
    "expiredOrders": 11,
    "averageFillRate": 0.8916,
    "totalVolume": "2500000000000000000000",
    "averageAuctionDuration": 892.45,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Escrow Monitoring API

### GET /api/escrow/status
Get the status of the escrow monitoring service.

**Response:**
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "network": "sepolia",
    "connectedToProvider": true,
    "lastBlockProcessed": 12345678,
    "activeContracts": 5,
    "totalStates": 123
  }
}
```

### GET /api/escrow/states
Get all escrow states being monitored.

**Response:**
```json
{
  "success": true,
  "data": {
    "states": [
      {
        "contractAddress": "0xcontract123...",
        "escrowId": "1",
        "buyer": "0xbuyer123...",
        "seller": "0xseller123...",
        "amount": "1000000000000000000",
        "status": "active",
        "deposits": "1000000000000000000",
        "releases": "0",
        "refunds": "0",
        "lastUpdated": "2024-01-01T00:00:00.000Z"
      }
    ],
    "count": 1
  }
}
```

### GET /api/escrow/states/:contractAddress/:escrowId
Get a specific escrow state.

**Response:**
```json
{
  "success": true,
  "data": {
    "contractAddress": "0xcontract123...",
    "escrowId": "1",
    "buyer": "0xbuyer123...",
    "seller": "0xseller123...",
    "amount": "1000000000000000000",
    "status": "active",
    "deposits": "1000000000000000000",
    "releases": "0",
    "refunds": "0",
    "lastUpdated": "2024-01-01T00:00:00.000Z"
  }
}
```

### GET /api/escrow/contracts
Get all contracts being monitored.

**Response:**
```json
{
  "success": true,
  "data": {
    "contracts": [
      {
        "address": "0xcontract123...",
        "name": "Main Escrow Contract",
        "description": "Primary escrow contract for DeFi operations",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "isActive": true
      }
    ],
    "count": 1
  }
}
```

### POST /api/escrow/contracts
Add a new contract to monitor.

**Request Body:**
```json
{
  "address": "0xnewcontract123...",
  "name": "New Escrow Contract",
  "description": "Description of the new contract"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Contract added successfully",
    "contract": {
      "address": "0xnewcontract123...",
      "name": "New Escrow Contract",
      "description": "Description of the new contract",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "isActive": true
    }
  }
}
```

### DELETE /api/escrow/contracts/:address
Remove a contract from monitoring.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Contract removed successfully"
  }
}
```

### POST /api/escrow/start
Start the escrow monitoring service.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Monitor started successfully"
  }
}
```

### POST /api/escrow/stop
Stop the escrow monitoring service.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Monitor stopped successfully"
  }
}
```

## Metrics API

### GET /metrics
Get Prometheus-formatted metrics for monitoring and alerting.

**Response:**
```
# HELP relayer_service_http_requests_total Total number of HTTP requests
# TYPE relayer_service_http_requests_total counter
relayer_service_http_requests_total{method="GET",route="/health",status_code="200"} 1234

# HELP relayer_service_errors_total Total number of errors
# TYPE relayer_service_errors_total counter
relayer_service_errors_total{type="validation_error"} 5

# HELP relayer_service_websocket_connections_total Current number of WebSocket connections
# TYPE relayer_service_websocket_connections_total gauge
relayer_service_websocket_connections_total 12

# HELP relayer_service_health_status Health status of the service (1 = healthy, 0 = unhealthy)
# TYPE relayer_service_health_status gauge
relayer_service_health_status 1
```

## WebSocket API

The service provides WebSocket connectivity at `ws://localhost:8081` for real-time updates.

### Connection
```javascript
const ws = new WebSocket('ws://localhost:8081');
```

### Message Types

#### Heartbeat
**Send:**
```json
{
  "type": "heartbeat"
}
```

**Receive:**
```json
{
  "type": "heartbeat_response",
  "data": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "status": "ok"
  }
}
```

#### Order Created
**Receive:**
```json
{
  "type": "order_created",
  "data": {
    "orderHash": "0xabcdef1234567890...",
    "maker": "0x742d35Cc6634C0532925a3b8D0C1c2E8c2e8e8C8",
    "status": "pending",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Order Updated
**Receive:**
```json
{
  "type": "order_updated",
  "data": {
    "orderHash": "0xabcdef1234567890...",
    "status": "active",
    "updateType": "status",
    "updatedAt": "2024-01-01T00:01:00.000Z"
  }
}
```

#### Price Update
**Receive:**
```json
{
  "type": "price_update",
  "data": {
    "orderHash": "0xabcdef1234567890...",
    "currentPrice": "1750000000000000000",
    "timeRemaining": 1200,
    "progress": 0.33,
    "timestamp": "2024-01-01T00:01:00.000Z"
  }
}
```

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created (for POST requests)
- `400`: Bad Request (validation errors)
- `404`: Not Found
- `409`: Conflict (duplicate resource)
- `500`: Internal Server Error

### Common Error Types

#### Validation Errors
```json
{
  "success": false,
  "error": "Missing required field: maker"
}
```

#### Not Found Errors
```json
{
  "success": false,
  "error": "Order not found"
}
```

#### Conflict Errors
```json
{
  "success": false,
  "error": "Order already exists"
}
```

#### Business Logic Errors
```json
{
  "success": false,
  "error": "Cannot cancel filled order"
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse:
- **Default Limit**: 100 requests per minute per IP
- **Headers**: Rate limit information is included in response headers
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Time when rate limit resets

## CORS Policy

The API supports Cross-Origin Resource Sharing (CORS) with the following policy:
- **Allowed Origins**: All origins in development (`*`)
- **Allowed Methods**: GET, POST, PATCH, DELETE, OPTIONS
- **Allowed Headers**: Content-Type, Authorization
- **Credentials**: Not supported in current version

## Pagination

Endpoints that return lists support pagination:
- **limit**: Maximum number of items to return (default: 50, max: 100)
- **offset**: Number of items to skip (default: 0)
- **Response includes**:
  - `total`: Total number of items available
  - `hasMore`: Boolean indicating if more items are available

## Filtering and Sorting

List endpoints support filtering and sorting:
- **Filtering**: Use query parameters to filter results
- **Sorting**: Use `sortBy` and `sortOrder` parameters
- **Available sort fields**: Varies by endpoint (commonly: createdAt, price, endTime)
- **Sort orders**: `asc` (ascending), `desc` (descending)

## Data Types

### Addresses
All Ethereum addresses are represented as hexadecimal strings with `0x` prefix and are 42 characters long.

### Amounts
All token amounts are represented as strings in wei (smallest unit). For example:
- 1 ETH = "1000000000000000000"
- 0.5 ETH = "500000000000000000"

### Timestamps
Timestamps are represented as:
- **Unix timestamps**: Seconds since epoch (for blockchain compatibility)
- **ISO strings**: For API responses (e.g., "2024-01-01T00:00:00.000Z")

### Order Hashes
Order hashes are 66-character hexadecimal strings with `0x` prefix.

### Signatures
Signatures are hexadecimal strings with `0x` prefix, typically 132 characters long.

## Best Practices

### API Usage
1. **Use pagination** for list endpoints to avoid large responses
2. **Implement retry logic** with exponential backoff for failed requests
3. **Cache responses** where appropriate to reduce API calls
4. **Use WebSocket** for real-time updates instead of polling
5. **Validate data** on client side before sending requests

### Error Handling
1. **Check `success` field** in all responses
2. **Implement proper error handling** for all status codes
3. **Log errors** for debugging and monitoring
4. **Show user-friendly messages** instead of raw error responses

### Performance
1. **Use appropriate filters** to reduce response sizes
2. **Implement client-side caching** for frequently accessed data
3. **Use WebSocket subscriptions** instead of frequent polling
4. **Batch operations** when possible to reduce API calls
