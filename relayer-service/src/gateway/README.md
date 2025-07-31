# Fusion+ Order Broadcasting Gateway

A real-time WebSocket gateway that connects to the 1inch Fusion+ protocol and broadcasts order events to resolver networks. This gateway enables efficient order discovery and execution for DeFi resolvers.

## Architecture

### Components

1. **FusionOrderGateway**: Main WebSocket gateway class that handles connections to both 1inch Fusion+ and resolver clients
2. **AuctionMonitor**: Monitors Dutch auction orders and calculates profitability opportunities
3. **GatewayApplication**: Main application orchestrator with CLI interface

### Flow Diagram

```
1inch Fusion+ WebSocket → FusionOrderGateway → AuctionMonitor → Resolver Clients
                                            ↓
                                      Real-time Broadcasting
```

## Features

### Core Functionality
- **Real-time Order Streaming**: Connects to 1inch Fusion+ WebSocket for live order events
- **Resolver Broadcasting**: Distributes order events to connected resolver clients
- **Auction Monitoring**: Tracks Dutch auction pricing and profitability
- **Connection Management**: Handles reconnections, heartbeats, and health monitoring
- **Error Resilience**: Robust error handling and graceful degradation

### Order Event Types
- `order_created`: New Fusion+ order available
- `order_filled`: Order has been executed
- `order_cancelled`: Order has been cancelled
- `order_balance_change`: Maker balance updated
- `order_allowance_change`: Maker allowance updated
- `active_orders`: Bulk active orders response

### Auction Features
- Dutch auction price calculation
- Profitability analysis with gas cost estimation
- Optimal execution time calculation
- Real-time price decay monitoring
- Batch order processing

## Installation

### Prerequisites
- Node.js >= 16.x
- TypeScript
- 1inch Fusion SDK access

### Setup
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_PORT` | 8080 | WebSocket server port for resolver connections |
| `LOG_LEVEL` | info | Logging level (debug, info, warn, error) |
| `PRICE_UPDATE_INTERVAL` | 5000 | Price update interval in milliseconds |
| `MAX_SLIPPAGE` | 0.05 | Maximum allowed slippage (5%) |
| `MIN_PROFIT_MARGIN` | 0.01 | Minimum profit margin required (1%) |
| `GAS_BUFFER` | 0.2 | Gas estimation buffer (20%) |

### Example Configuration
```bash
# Development
WS_PORT=8080 LOG_LEVEL=debug node dist/gateway/gateway-app.js

# Production
WS_PORT=9090 LOG_LEVEL=info MIN_PROFIT_MARGIN=0.02 node dist/gateway/gateway-app.js
```

## Usage

### Starting the Gateway

#### Command Line
```bash
# Start with default configuration
node dist/gateway/gateway-app.js

# Start with custom configuration
WS_PORT=9090 LOG_LEVEL=debug node dist/gateway/gateway-app.js

# Show help
node dist/gateway/gateway-app.js --help

# Show status
node dist/gateway/gateway-app.js --status

# Show configuration
node dist/gateway/gateway-app.js --config
```

#### Programmatic Usage
```typescript
import GatewayApplication from './gateway/gateway-app';

const app = new GatewayApplication();

// Start the gateway
await app.start();

// Get status
const status = app.getStatus();
console.log('Gateway status:', status);

// Update auction configuration
app.updateAuctionConfig({
    minProfitMargin: 0.02,
    gasBuffer: 0.25
});

// Get profitable opportunities
const opportunities = app.getProfitableOpportunities();

// Shutdown gracefully
await app.shutdown('manual');
```

### Connecting Resolvers

Resolvers connect to the gateway via WebSocket on the configured port:

```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
    console.log('Connected to Fusion+ Gateway');
    
    // Send ping
    ws.send(JSON.stringify({ type: 'ping' }));
    
    // Subscribe to orders
    ws.send(JSON.stringify({ type: 'subscribe_orders' }));
    
    // Request active orders
    ws.send(JSON.stringify({ type: 'get_active_orders' }));
});

ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    
    switch (message.type) {
        case 'welcome':
            console.log('Resolver ID:', message.data.resolverId);
            break;
            
        case 'order_created':
            console.log('New order:', message.data);
            break;
            
        case 'profitable_opportunity':
            console.log('Profitable order found:', message.data);
            break;
            
        case 'active_orders':
            console.log('Active orders:', message.data);
            break;
    }
});
```

## API Reference

### Gateway Events

#### Incoming Messages (from Resolvers)
```typescript
// Ping message
{
    type: 'ping'
}

// Subscribe to order events
{
    type: 'subscribe_orders'
}

// Request active orders
{
    type: 'get_active_orders',
    params: { limit?: number, page?: number }
}
```

#### Outgoing Messages (to Resolvers)
```typescript
// Welcome message
{
    type: 'welcome',
    timestamp: Date,
    data: {
        resolverId: string,
        status: 'connected'
    }
}

// Order event
{
    type: 'order_created' | 'order_filled' | 'order_cancelled',
    timestamp: Date,
    data: OrderEventData
}

// Profitable opportunity
{
    type: 'profitable_opportunity',
    timestamp: Date,
    data: {
        order: DutchAuctionOrder,
        profitability: ProfitabilityResult,
        details: AuctionDetails
    }
}

// Active orders response
{
    type: 'active_orders',
    timestamp: Date,
    data: ActiveOrdersResponse
}
```

### Order Data Structure

```typescript
interface DutchAuctionOrder {
    orderHash: string;
    maker: string;
    receiver: string;
    makerAsset: string;
    takerAsset: string;
    makerAmount: string;
    takerAmount: string;
    startTime: number;
    endTime: number;
    startPrice: string;
    endPrice: string;
    auctionStartTime: number;
    auctionEndTime: number;
    salt: string;
    signature: string;
}

interface ProfitabilityResult {
    currentPrice: string;
    isProfitable: boolean;
    gasEstimate: string;
    netProfit: string;
    executionTime: number;
}

interface AuctionDetails {
    orderHash: string;
    currentPrice: string;
    timeRemaining: number;
    priceDecayRate: string;
    nextPriceUpdate: number;
    isActive: boolean;
    progress: number;
    estimatedFillPrice: string;
}
```

## Monitoring and Logging

### Log Levels
- **ERROR**: Connection failures, critical errors
- **WARN**: Reconnection attempts, non-critical issues  
- **INFO**: Order events, resolver connections/disconnections
- **DEBUG**: Detailed message flows, price updates

### Metrics
The gateway provides real-time status information:

```typescript
{
    gateway: {
        isConnected: boolean,
        reconnectAttempts: number,
        connectedResolvers: number,
        resolvers: ResolverInfo[]
    },
    auctionMonitor: {
        activeOrders: number,
        profitableOpportunities: number
    },
    uptime: number,
    memoryUsage: NodeJS.MemoryUsage,
    timestamp: string
}
```

### Health Checks
- **WebSocket Heartbeat**: 30-second ping/pong with resolvers
- **Connection Monitoring**: Automatic detection of inactive resolvers
- **Reconnection Logic**: Exponential backoff for 1inch WebSocket reconnections

## Testing

### Unit Tests
```bash
# Run all tests
npm test

# Run gateway-specific tests
npm test src/gateway/FusionOrderGateway.test.ts

# Run tests with coverage
npm test -- --coverage
```

### Integration Testing
```bash
# Start test gateway
WS_PORT=8081 LOG_LEVEL=debug node dist/gateway/gateway-app.js

# Connect test resolver
node test-client.js ws://localhost:8081
```

### Load Testing
The gateway supports multiple concurrent resolver connections. Test with:
```bash
# Simulate 100 concurrent resolvers
node load-test.js --resolvers=100 --duration=60s
```

## Performance

### Benchmarks
- **Order Processing**: ~1000 orders/second
- **Resolver Broadcasting**: ~500 concurrent connections
- **Memory Usage**: ~50MB baseline + ~1KB per connection
- **Latency**: <10ms order event propagation

### Optimization Tips
1. Adjust `PRICE_UPDATE_INTERVAL` based on requirements
2. Use appropriate `LOG_LEVEL` for production
3. Monitor memory usage with many connections
4. Consider load balancing for >1000 resolvers

## Security

### Connection Security
- WebSocket connections are unencrypted by default
- Consider using WSS (WebSocket Secure) for production
- Implement authentication if needed
- Rate limiting for message handling

### Best Practices
- Run with restricted user privileges
- Monitor for unusual connection patterns
- Log security-relevant events
- Keep dependencies updated

## Troubleshooting

### Common Issues

#### Connection Problems
```bash
# Check if 1inch WebSocket is accessible
curl -I wss://api.1inch.dev/fusion-plus/ws

# Verify port availability
netstat -an | grep 8080

# Test resolver connection
wscat -c ws://localhost:8080
```

#### High Memory Usage
```bash
# Monitor memory usage
node --inspect dist/gateway/gateway-app.js

# Analyze heap dumps
node --heap-prof dist/gateway/gateway-app.js
```

#### Order Processing Issues
```bash
# Enable debug logging
LOG_LEVEL=debug node dist/gateway/gateway-app.js

# Check order validation
npm test src/gateway/AuctionMonitor.test.ts
```

### Error Codes
- `ECONNREFUSED`: Cannot connect to 1inch WebSocket
- `EADDRINUSE`: WebSocket port already in use
- `ENOMEM`: Insufficient memory for operations
- `EPIPE`: Resolver connection broken

## Contributing

### Development Setup
```bash
# Fork and clone the repository
git clone https://github.com/your-fork/defi-united-fusion-extension.git
cd defi-united-fusion-extension/relayer-service

# Install dependencies
npm install

# Start development server
npm run dev
```

### Code Style
- TypeScript with strict mode
- ESLint configuration
- Prettier formatting
- Jest for testing

### Pull Request Process
1. Create feature branch
2. Add comprehensive tests
3. Update documentation
4. Submit PR with description

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions  
- **Documentation**: This README and inline code docs
- **Community**: Discord/Telegram (links in main repo)

---

For more information about the broader DeFi United Fusion Extension project, see the main repository README.
