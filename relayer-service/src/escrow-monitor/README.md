# Ethereum Escrow Monitor Service

A real-time monitoring service for Ethereum escrow contracts on the Sepolia testnet using Alchemy's WebSocket connections.

## Features

- **Real-time Monitoring**: WebSocket-based monitoring of escrow contract events
- **Multi-Contract Support**: Monitor multiple escrow contracts simultaneously
- **Event Processing**: Automatic parsing and handling of escrow events
- **State Tracking**: Track escrow states and lifecycle changes
- **Reconnection Handling**: Automatic reconnection with exponential backoff
- **RESTful API**: HTTP endpoints for monitoring management
- **Type-Safe**: Full TypeScript support with comprehensive type definitions

## Supported Events

The monitor tracks the following escrow contract events:

- `EscrowCreated` - New escrow contract creation
- `EscrowFunded` - Escrow funded with tokens/ETH
- `EscrowReleased` - Funds released to seller
- `EscrowRefunded` - Funds refunded to buyer
- `EscrowDisputed` - Dispute raised
- `EscrowResolved` - Dispute resolved
- `EscrowCancelled` - Escrow cancelled

## Configuration

### Environment Variables

```bash
# Required
ALCHEMY_API_KEY=your-alchemy-api-key

# Optional
ESCROW_CONTRACTS=0x1234...,0x5678...  # Comma-separated contract addresses
ESCROW_WEBHOOK_URL=https://your-webhook-endpoint.com/escrow
NODE_ENV=development
```

### Programmatic Configuration

```typescript
import { EscrowMonitor } from './escrow-monitor/EscrowMonitor';

const monitor = new EscrowMonitor({
  alchemyApiKey: 'your-alchemy-api-key',
  network: 'sepolia',
  contracts: [
    {
      address: '0x1234567890123456789012345678901234567890',
      name: 'My Escrow Contract',
      description: 'Production escrow contract',
      createdAt: new Date(),
      isActive: true
    }
  ],
  webhookUrl: 'https://your-webhook-endpoint.com/escrow',
  enableLogging: true
});
```

## Usage

### Starting the Monitor

```typescript
// Start monitoring
await monitor.start();

// Listen for events
monitor.on('escrow:event', (event) => {
  console.log('New escrow event:', event);
});

monitor.on('escrow:state_change', (state) => {
  console.log('Escrow state changed:', state);
});
```

### API Endpoints

The service provides RESTful endpoints for managing the monitor:

#### Get Monitor Status
```http
GET /api/escrow/status
```

Response:
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "connected": true,
    "reconnectAttempts": 0,
    "subscriptions": 2,
    "activeContracts": 2,
    "totalStates": 5
  }
}
```

#### Get All Escrow States
```http
GET /api/escrow/states
```

#### Get Specific Escrow State
```http
GET /api/escrow/states/:contractAddress/:escrowId
```

#### Add Contract to Monitor
```http
POST /api/escrow/contracts
Content-Type: application/json

{
  "address": "0x1234567890123456789012345678901234567890",
  "name": "New Escrow Contract",
  "description": "Description of the contract"
}
```

#### Remove Contract from Monitor
```http
DELETE /api/escrow/contracts/:address
```

#### Start/Stop Monitoring
```http
POST /api/escrow/start
POST /api/escrow/stop
```

## Event Types

### EscrowEvent
```typescript
interface EscrowEvent {
  type: EscrowEventType;
  contractAddress: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: Date;
  data: EscrowEventData;
}
```

### EscrowState
```typescript
interface EscrowState {
  contractAddress: string;
  escrowId: string;
  buyer: string;
  seller: string;
  arbiter?: string;
  amount: BigNumber;
  token: string;
  status: EscrowStatus;
  createdAt: Date;
  updatedAt: Date;
  deposits: BigNumber;
  releases: BigNumber;
  refunds: BigNumber;
}
```

## Error Handling

The monitor includes comprehensive error handling:

- WebSocket connection errors with automatic reconnection
- Invalid contract addresses validation
- Event parsing error recovery
- Graceful shutdown handling

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Architecture

The Escrow Monitor consists of several key components:

1. **EscrowMonitor**: Main monitoring class with WebSocket management
2. **Types**: Comprehensive TypeScript definitions
3. **Config**: Configuration utilities and defaults
4. **Routes**: RESTful API endpoints
5. **Tests**: Comprehensive test coverage

## WebSocket Protocol

The monitor uses Alchemy's WebSocket API with the following message format:

```json
{
  "id": "1",
  "method": "eth_subscribe",
  "params": ["logs", {
    "address": "0x...",
    "topics": ["0x..."]
  }]
}
```

## Performance Considerations

- Event filtering at the WebSocket level reduces bandwidth
- In-memory state tracking for fast queries
- Efficient reconnection with exponential backoff
- Configurable logging levels for production

## Security

- API key validation
- Contract address validation
- Input sanitization on all endpoints
- Rate limiting considerations for production use

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production`
2. Configure proper logging levels
3. Set up webhook endpoints for event notifications
4. Monitor WebSocket connection health
5. Implement proper error alerting

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
