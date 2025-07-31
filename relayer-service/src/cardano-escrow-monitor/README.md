# Cardano Escrow Monitor Service

A comprehensive service for monitoring Cardano testnet escrow smart contracts using Ogmios WebSocket connections. This service provides real-time monitoring of Plutus-based escrow contracts on the Cardano blockchain.

## Features

- **Real-time Monitoring**: Uses Ogmios WebSocket connections for live blockchain data
- **Multi-Contract Support**: Monitor multiple escrow contracts simultaneously
- **Event Detection**: Detects and categorizes escrow-related events
- **State Management**: Tracks the complete lifecycle of escrow transactions
- **Automatic Reconnection**: Handles connection failures with exponential backoff
- **Chain Synchronization**: Syncs with the Cardano blockchain from a specified slot
- **Type-Safe**: Fully typed with TypeScript for better development experience
- **Testnet Ready**: Configured for Cardano testnet (Sepolia equivalent)

## Architecture

### Core Components

1. **CardanoEscrowMonitor**: Main monitoring service class
2. **Types & Interfaces**: Comprehensive type definitions for Cardano-specific data
3. **Configuration**: Flexible configuration management
4. **Event System**: Type-safe event emitter for real-time notifications

### Event Types

- `ESCROW_CREATED`: New escrow contract instance created
- `ESCROW_FUNDED`: Funds deposited into escrow
- `ESCROW_RELEASED`: Funds released to seller
- `ESCROW_REFUNDED`: Funds returned to buyer
- `ESCROW_DISPUTED`: Escrow entered dispute state
- `ESCROW_RESOLVED`: Dispute resolved by arbiter
- `ESCROW_CANCELLED`: Escrow contract cancelled

### Escrow States

- `CREATED`: Initial state after contract creation
- `FUNDED`: Escrow has received funds
- `DISPUTED`: Under dispute resolution
- `COMPLETED`: Successfully completed
- `REFUNDED`: Funds returned to buyer
- `CANCELLED`: Contract cancelled

## Installation

```bash
# Install dependencies (already included in main package.json)
npm install

# Build the project
npm run build
```

## Configuration

### Basic Configuration

```typescript
import { createDefaultCardanoConfig } from './src/cardano-escrow-monitor';

const config = createDefaultCardanoConfig('ws://localhost:1337');
```

### Production Configuration

```typescript
import { createProductionCardanoConfig } from './src/cardano-escrow-monitor';

const contracts = [
  {
    scriptAddress: 'addr_test1wp...',
    scriptHash: 'abc123...',
    name: 'My Escrow Contract',
    description: 'Production escrow contract',
    createdAt: new Date(),
    isActive: true
  }
];

const config = createProductionCardanoConfig(
  'wss://ogmios-api.testnet.demeter.run',
  contracts,
  'https://kupo-api.testnet.demeter.run' // Optional Kupo indexer
);
```

### Environment Variables

```bash
# Ogmios WebSocket URL
OGMIOS_URL=ws://localhost:1337

# Kupo indexer URL (optional)
KUPO_URL=http://localhost:1442

# Cardano contracts (JSON array)
CARDANO_ESCROW_CONTRACTS='[{"scriptAddress":"addr_test1...","scriptHash":"abc123..."}]'

# Sync from specific slot (optional)
CARDANO_SYNC_FROM_SLOT=1000000
```

## Usage

### Basic Usage

```typescript
import { CardanoEscrowMonitor, createDefaultCardanoConfig } from './src/cardano-escrow-monitor';

async function main() {
  // Create configuration
  const config = createDefaultCardanoConfig('ws://localhost:1337');
  
  // Create monitor instance
  const monitor = new CardanoEscrowMonitor(config);
  
  // Set up event listeners
  monitor.on('escrow:event', (event) => {
    console.log('Escrow event:', event.type, event.scriptAddress);
  });
  
  monitor.on('escrow:state_change', (state) => {
    console.log('State change:', state.escrowId, state.status);
  });
  
  // Start monitoring
  await monitor.start();
  
  // Monitor will run continuously until stopped
  // await monitor.stop();
}

main().catch(console.error);
```

### Event Handling

```typescript
monitor.on('monitor:start', () => {
  console.log('Monitor started successfully');
});

monitor.on('connection:open', () => {
  console.log('Connected to Ogmios');
});

monitor.on('sync:progress', (slot, blockHeight) => {
  console.log(`Synced to slot ${slot}, block ${blockHeight}`);
});

monitor.on('escrow:event', (event) => {
  switch (event.type) {
    case CardanoEscrowEventType.ESCROW_CREATED:
      console.log('New escrow created:', event.data);
      break;
    case CardanoEscrowEventType.ESCROW_FUNDED:
      console.log('Escrow funded:', event.data.amount, 'lovelace');
      break;
    // Handle other event types...
  }
});
```

### Contract Management

```typescript
// Add new contract to monitor
monitor.addContract({
  scriptAddress: 'addr_test1...',
  scriptHash: 'def456...',
  name: 'New Escrow Contract',
  createdAt: new Date(),
  isActive: true
});

// Remove contract from monitoring
monitor.removeContract('addr_test1...');

// Get all active contracts
const contracts = monitor.getActiveContracts();

// Get monitor status
const status = monitor.getConnectionStatus();
console.log('Connected:', status.connected);
console.log('Current Slot:', status.currentSlot);
```

### State Queries

```typescript
// Get specific escrow state
const state = monitor.getEscrowState(scriptAddress, escrowId);

// Get all tracked escrow states
const allStates = monitor.getAllEscrowStates();

// Filter by status
const activeEscrows = allStates.filter(s => 
  s.status === CardanoEscrowStatus.FUNDED || 
  s.status === CardanoEscrowStatus.DISPUTED
);
```

## Demo

Run the interactive demo to see the monitor in action:

```bash
# Run demo
npm run demo:cardano

# Or run built version
npm run build && node dist/demo/cardano-escrow-demo.js
```

The demo provides:
- Real-time event monitoring
- Interactive CLI commands
- Status monitoring
- Contract management examples

## Testing

```bash
# Run Cardano-specific tests
npm test -- --testPathPattern=cardano

# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## Ogmios Integration

This service integrates with [Ogmios](https://ogmios.dev/), a lightweight bridge interface for Cardano. Ogmios provides:

- WebSocket API for real-time blockchain data
- Chain synchronization protocol
- Block and transaction streaming
- Local state queries

### Supported Ogmios Versions

- Ogmios v5.x and v6.x
- Cardano Node v1.35.x+
- Babbage era support

### Chain Sync Protocol

The monitor uses Ogmios's chain-sync protocol:

1. **FindIntersect**: Establishes sync point
2. **NextBlock**: Requests next block in sequence
3. **RollForward**: Processes new blocks
4. **RollBackward**: Handles chain rollbacks

## Advanced Features

### Custom Event Detection

Extend event detection by overriding the `determineEventType` method:

```typescript
class CustomCardanoMonitor extends CardanoEscrowMonitor {
  protected determineEventType(transaction, output, context) {
    // Custom logic for event type detection
    // Analyze datum, redeemer, script context
    return super.determineEventType(transaction, output, context);
  }
}
```

### Datum Analysis

For production use, implement proper datum parsing:

```typescript
private parseDatum(datum: any): EscrowDatum {
  // Parse CBOR-encoded datum
  // Extract buyer, seller, amount, deadline, etc.
  return {
    buyer: datum.fields[0],
    seller: datum.fields[1],
    amount: datum.fields[2],
    deadline: datum.fields[3]
  };
}
```

### Redeemer Analysis

Analyze redeemers to determine transaction actions:

```typescript
private parseRedeemer(redeemer: any): EscrowRedeemerAction {
  // Parse redeemer to determine action
  switch (redeemer.constructor) {
    case 0: return EscrowRedeemerAction.FUND;
    case 1: return EscrowRedeemerAction.RELEASE;
    case 2: return EscrowRedeemerAction.REFUND;
    // etc.
  }
}
```

## Integration Examples

### Express.js Integration

```typescript
import express from 'express';
import { CardanoEscrowMonitor } from './src/cardano-escrow-monitor';

const app = express();
const monitor = new CardanoEscrowMonitor(config);

app.get('/cardano/status', (req, res) => {
  res.json(monitor.getConnectionStatus());
});

app.get('/cardano/escrows', (req, res) => {
  res.json(monitor.getAllEscrowStates());
});

await monitor.start();
app.listen(3000);
```

### Database Integration

```typescript
monitor.on('escrow:state_change', async (state) => {
  await database.escrowStates.upsert({
    id: `${state.scriptAddress}-${state.escrowId}`,
    ...state
  });
});
```

## Performance Considerations

- **Memory Usage**: States are kept in memory; implement persistence for production
- **Event Volume**: Consider event batching for high-volume contracts
- **Network**: WebSocket connections may require reconnection handling
- **Indexing**: Use Kupo for efficient UTXO queries

## Troubleshooting

### Common Issues

1. **Connection Failures**
   ```
   Error: Connection refused
   ```
   - Ensure Ogmios is running on the specified URL
   - Check network connectivity
   - Verify WebSocket URL format

2. **Invalid Addresses**
   ```
   Error: Invalid contract address
   ```
   - Use proper Bech32 format: `addr_test1...`
   - Verify address is for correct network (testnet/mainnet)

3. **Sync Issues**
   ```
   No intersection found
   ```
   - Start sync from genesis or known valid slot
   - Check node synchronization status

### Debugging

Enable debug logging:

```typescript
const config = createDefaultCardanoConfig(ogmiosUrl);
config.enableLogging = true;
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit pull request

## License

MIT License - see LICENSE file for details.

## Links

- [Ogmios Documentation](https://ogmios.dev/)
- [Cardano Developer Portal](https://developers.cardano.org/)
- [Plutus Documentation](https://plutus.readthedocs.io/)
- [Kupo Indexer](https://github.com/CardanoSolutions/kupo)

## Support

For issues and questions:
- Create GitHub issue
- Check Ogmios community channels
- Review Cardano Stack Exchange
