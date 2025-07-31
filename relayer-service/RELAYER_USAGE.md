# Relayer Service - Order Processing

This document explains how the relayer service processes limit orders and manages Dutch auctions.

## Flow Overview

1. **User Creates and Signs Order**: User creates a limit order with EIP-712 signature
2. **Relayer Processes Order**: Relayer verifies signature and stores the order
3. **Dutch Auction Starts**: At the scheduled time, the Dutch auction begins
4. **Price Updates**: Auction price decreases over time according to the configured decay
5. **Order Filling**: Resolvers can fill orders when profitable
6. **Completion**: Order is marked as filled, cancelled, or expired

## Key Components

### OrderProcessingService

The main service that handles:
- Order verification and storage
- Dutch auction scheduling and management
- Price calculations
- Order lifecycle management

### API Endpoints

- `POST /orders` - Create a new limit order
- `GET /orders/:hash` - Get order details
- `GET /orders/:hash/status` - Get current auction status and price
- `POST /orders/:hash/fill` - Fill an order
- `DELETE /orders/:hash` - Cancel an order

## Order Creation Example

```javascript
const orderData = {
  maker: "0x...", // User's address
  receiver: "0x...", // Receiver address (can be same as maker)
  makerAsset: "0x...", // Token being sold
  takerAsset: "0x...", // Token being bought
  makerAmount: "1000000000000000000", // Amount selling (in wei)
  takerAmount: "100000000000000000", // Amount buying (in wei)
  startPrice: "110000000000000000", // Starting auction price
  endPrice: "90000000000000000", // Ending auction price
  auctionStartTime: Math.floor(Date.now() / 1000) + 300, // Start in 5 minutes
  auctionEndTime: Math.floor(Date.now() / 1000) + 3600, // End in 1 hour
  signature: "0x..." // EIP-712 signature
};

const response = await fetch('/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(orderData)
});
```

## Environment Variables

Make sure to set these environment variables:

```bash
SEPOLIA_LIMIT_ORDER_CONTRACT=0x7b728d06b49DB49b0858397fDBe48bC57a814AF0
ETH_LIMIT_ORDER_CONTRACT=0x1111111254EEB25477B68fb85Ed929f73A960582
DEFAULT_CHAIN_ID=11155111  # Sepolia
SEPOLIA_CHAIN_ID=11155111
ETH_CHAIN_ID=1
```

## Order States

- `PENDING`: Order received but not yet verified
- `VERIFIED`: Order verified and waiting for auction start
- `AUCTION_ACTIVE`: Dutch auction is running
- `FILLED`: Order has been filled by a resolver
- `CANCELLED`: Order was cancelled by the maker
- `EXPIRED`: Auction ended without being filled
- `FAILED`: Order processing failed

## WebSocket Events

Subscribe to real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:8081');

ws.send(JSON.stringify({
  type: 'subscribe',
  data: {
    subscription: 'orders'
  }
}));

// Listen for order updates
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'order_created') {
    console.log('New order:', message.data.order);
  }
};
```

## Testing

Run the test suite:

```bash
npm test src/services/__tests__/OrderService.test.ts
```

## Integration

The OrderProcessingService integrates with:
- Signature verification utilities
- WebSocket service for real-time updates
- Auction calculator for price updates
- Contract submission service for blockchain interaction
