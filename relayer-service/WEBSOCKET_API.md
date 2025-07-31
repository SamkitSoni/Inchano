# Real-time WebSocket API Documentation

## Overview

The DeFi Relayer Service provides a real-time WebSocket API for frontend applications to receive live updates about order status and lifecycle events. The WebSocket server runs on a configurable port (default: 8081) and supports subscription-based messaging.

## Connection

Connect to the WebSocket server at:
```
ws://localhost:8081
```

Environment variable: `WS_PORT` (default: 8081)

## Message Format

All messages follow this JSON structure:

```json
{
  "type": "message_type",
  "data": { ... },
  "timestamp": 1234567890123,
  "clientId": "client_12345_abc123def"
}
```

## Message Types

### Client to Server Messages

#### 1. Ping/Pong
```json
{
  "type": "ping",
  "data": {},
  "timestamp": 1234567890123
}
```

#### 2. Subscribe to Events
```json
{
  "type": "subscribe",
  "data": {
    "subscription": "orders",
    "filters": {
      "maker": "0x1234...",
      "makerAsset": "0xA0b86a33E6C9...",
      "takerAsset": "0xC02aaA39b223...",
      "status": ["active", "pending"],
      "minAmount": "1000000000000000000",
      "maxAmount": "10000000000000000000"
    }
  },
  "timestamp": 1234567890123
}
```

#### 3. Unsubscribe from Events
```json
{
  "type": "unsubscribe",
  "data": {
    "subscription": "orders"
  },
  "timestamp": 1234567890123
}
```

### Server to Client Messages

#### 1. Welcome Message
Sent immediately upon connection:
```json
{
  "type": "ping",
  "data": {
    "clientId": "client_12345_abc123def",
    "message": "Connected to DeFi Relayer WebSocket Service",
    "serverTime": 1234567890123
  },
  "timestamp": 1234567890123
}
```

#### 2. Order Created
```json
{
  "type": "order_created",
  "data": {
    "order": {
      "orderHash": "0xabc123...",
      "maker": "0x1234...",
      "receiver": "0x5678...",
      "makerAsset": "0xA0b86a33E6C9...",
      "takerAsset": "0xC02aaA39b223...",
      "makerAmount": "1000000000000000000",
      "takerAmount": "2000000000000000000",
      "startTime": 1234567890,
      "endTime": 1234571490,
      "startPrice": "2000000000000000000",
      "endPrice": "1000000000000000000",
      "auctionStartTime": 1234567890,
      "auctionEndTime": 1234571490,
      "status": "pending",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  },
  "timestamp": 1234567890123
}
```

#### 3. Order Status Update
```json
{
  "type": "order_update",
  "data": {
    "orderHash": "0xabc123...",
    "order": {
      "orderHash": "0xabc123...",
      "currentPrice": "1800000000000000000",
      "timeRemaining": 3600,
      "progress": 0.5,
      "status": "active",
      "updatedAt": "2024-01-01T12:30:00.000Z"
    },
    "updateType": "status"
  },
  "timestamp": 1234567890123
}
```

#### 4. Order Filled
```json
{
  "type": "order_filled",
  "data": {
    "orderHash": "0xabc123...",
    "order": { ... },
    "updateType": "fill"
  },
  "timestamp": 1234567890123
}
```

#### 5. Order Cancelled
```json
{
  "type": "order_cancelled",
  "data": {
    "orderHash": "0xabc123...",
    "order": { ... },
    "updateType": "cancel"
  },
  "timestamp": 1234567890123
}
```

#### 6. Profitable Opportunities
```json
{
  "type": "profitable_opportunity",
  "data": {
    "opportunities": [
      {
        "orderHash": "0xabc123...",
        "currentPrice": "1500000000000000000",
        "netProfit": "50000000000000000",
        "gasEstimate": "150000",
        "profitMargin": "0.0333",
        "timeRemaining": 1800,
        "auctionProgress": 0.75
      }
    ],
    "count": 1,
    "timestamp": "2024-01-01T12:30:00.000Z",
    "gasPrice": "20000000000"
  },
  "timestamp": 1234567890123
}
```

## Subscription Types

### 1. Orders (`orders`)
Subscribe to all order lifecycle events including creation, updates, fills, and cancellations.

Supported filters:
- `maker`: Filter by maker address
- `makerAsset`: Filter by maker asset address
- `takerAsset`: Filter by taker asset address
- `status`: Filter by order status array
- `minAmount`: Minimum maker amount (in wei)
- `maxAmount`: Maximum maker amount (in wei)

### 2. Profitable Opportunities (`profitable_opportunities`)
Subscribe to real-time profitable arbitrage opportunities.

## Client Examples

### JavaScript/Node.js Client

```javascript
const WebSocket = require('ws');

class DeFiRelayerWebSocketClient {
  constructor(url = 'ws://localhost:8081') {
    this.ws = new WebSocket(url);
    this.clientId = null;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.ws.on('open', () => {
      console.log('Connected to DeFi Relayer WebSocket');
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      this.handleMessage(message);
    });

    this.ws.on('close', () => {
      console.log('Disconnected from WebSocket');
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  handleMessage(message) {
    console.log('Received message:', message);

    switch (message.type) {
      case 'ping':
        if (message.data.clientId) {
          this.clientId = message.data.clientId;
          console.log('Client ID:', this.clientId);
        }
        break;

      case 'order_created':
        console.log('New order created:', message.data.order);
        break;

      case 'order_update':
        console.log('Order updated:', message.data);
        break;

      case 'order_filled':
        console.log('Order filled:', message.data);
        break;

      case 'order_cancelled':
        console.log('Order cancelled:', message.data);
        break;

      case 'profitable_opportunity':
        console.log('Profitable opportunities:', message.data);
        break;
    }
  }

  subscribe(subscription, filters = {}) {
    const message = {
      type: 'subscribe',
      data: { subscription, filters },
      timestamp: Date.now()
    };
    this.ws.send(JSON.stringify(message));
  }

  unsubscribe(subscription) {
    const message = {
      type: 'unsubscribe',
      data: { subscription },
      timestamp: Date.now()
    };
    this.ws.send(JSON.stringify(message));
  }

  ping() {
    const message = {
      type: 'ping',
      data: {},
      timestamp: Date.now()
    };
    this.ws.send(JSON.stringify(message));
  }
}

// Usage example
const client = new DeFiRelayerWebSocketClient();

// Wait for connection and then subscribe
setTimeout(() => {
  // Subscribe to all orders
  client.subscribe('orders');

  // Subscribe to orders from a specific maker
  client.subscribe('orders', {
    maker: '0x1234567890abcdef1234567890abcdef12345678'
  });

  // Subscribe to profitable opportunities
  client.subscribe('profitable_opportunities');
}, 1000);
```

### React Hook Example

```javascript
import { useState, useEffect, useRef } from 'react';

export function useWebSocketClient(url = 'ws://localhost:8081') {
  const [connected, setConnected] = useState(false);
  const [orders, setOrders] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setConnected(true);
      console.log('Connected to DeFi Relayer WebSocket');
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'order_created':
          setOrders(prev => [...prev, message.data.order]);
          break;

        case 'order_update':
          setOrders(prev => prev.map(order => 
            order.orderHash === message.data.orderHash 
              ? { ...order, ...message.data.order }
              : order
          ));
          break;

        case 'order_filled':
        case 'order_cancelled':
          setOrders(prev => prev.map(order => 
            order.orderHash === message.data.orderHash 
              ? { ...order, status: message.data.order.status }
              : order
          ));
          break;

        case 'profitable_opportunity':
          setOpportunities(message.data.opportunities);
          break;
      }
    };

    ws.current.onclose = () => {
      setConnected(false);
      console.log('Disconnected from WebSocket');
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.current?.close();
    };
  }, [url]);

  const subscribe = (subscription, filters = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'subscribe',
        data: { subscription, filters },
        timestamp: Date.now()
      }));
    }
  };

  const unsubscribe = (subscription) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'unsubscribe',
        data: { subscription },
        timestamp: Date.now()
      }));
    }
  };

  return {
    connected,
    orders,
    opportunities,
    subscribe,
    unsubscribe
  };
}
```

## Configuration

### Environment Variables

- `WS_PORT`: WebSocket server port (default: 8081)
- `PRICE_UPDATE_INTERVAL`: Price update interval in milliseconds (default: 30000)
- `ENABLE_REALTIME_UPDATES`: Enable/disable real-time price updates (default: true)

### Real-time Updates

The service automatically broadcasts price updates for active orders every 30 seconds (configurable). It also detects and broadcasts when orders expire.

## Error Handling

The WebSocket service includes comprehensive error handling:

- Invalid message format errors
- Subscription errors
- Connection errors
- Automatic client cleanup for inactive connections

Clients should implement reconnection logic for production use.

## Security Considerations

- The WebSocket server is currently open without authentication
- Consider implementing authentication for production deployments
- Rate limiting may be needed for high-traffic scenarios
- Use secure WebSocket (WSS) in production environments

## Testing

You can test the WebSocket API using tools like:
- [wscat](https://github.com/websockets/wscat): `wscat -c ws://localhost:8081`
- Browser DevTools WebSocket debugging
- Postman WebSocket requests

Example wscat session:
```bash
wscat -c ws://localhost:8081
Connected (press CTRL+C to quit)
> {"type":"subscribe","data":{"subscription":"orders"},"timestamp":1234567890123}
< {"type":"ping","data":{"message":"Subscribed to orders"},"timestamp":1234567890124}
```
