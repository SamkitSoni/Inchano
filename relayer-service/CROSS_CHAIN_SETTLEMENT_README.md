# Cross-Chain Settlement Coordinator

This document describes the implementation of the Cross-Chain Settlement Coordinator, which coordinates settlement actions between Ethereum and Cardano blockchains using the CardanoBridge for cross-chain operations.

## Overview

The Cross-Chain Settlement Coordinator is designed to automatically monitor escrow events on both Ethereum and Cardano networks and coordinate cross-chain settlements when release events occur.

## Architecture

### Components

1. **CrossChainSettlementCoordinator** - Main coordinator class that orchestrates cross-chain settlements
2. **CardanoBridge** - Bridge implementation for handling cross-chain operations between Ethereum and Cardano
3. **EscrowMonitor** - Monitors Ethereum escrow contracts for events
4. **CardanoEscrowMonitor** - Monitors Cardano escrow scripts for events

### Key Features

- **Automatic Settlement**: Automatically triggers cross-chain settlements when release events are detected
- **Retry Logic**: Implements retry mechanism with configurable max attempts and delays
- **Event Monitoring**: Listens to escrow events from both blockchain networks
- **Settlement Tracking**: Tracks settlement records with status updates
- **Error Handling**: Comprehensive error handling with event emission for monitoring

## Implementation Details

### CrossChainSettlementCoordinator

Located in `src/cross-chain-settlement-coordinator/CrossChainSettlementCoordinator.ts`

#### Configuration
```typescript
export interface CrossChainCoordinatorConfig {
  enableAutoSettlement: boolean;
  settlementDelay?: number; // milliseconds
  maxRetries: number;
  retryDelay: number;
}
```

#### Key Methods
- `start()` - Initializes and starts the coordinator
- `stop()` - Stops the coordinator and removes listeners
- `getStatus()` - Returns current operational status
- `getAllSettlements()` - Returns all settlement records
- `isOperational()` - Checks if coordinator is running and bridge is ready

#### Event Handling
- Listens to `escrow:event` from both Ethereum and Cardano monitors
- Processes only `RELEASE` and `ESCROW_RELEASED` events for settlements
- Creates settlement records and tracks their progress

### CardanoBridge

Located in `src/cardano-bridge/CardanoBridge.ts`

#### Configuration
```typescript
export interface BridgeConfig {
  cardanoNodeUrl: string;
  cardanoNetwork: 'testnet' | 'mainnet';
  ethereumRpcUrl: string;
  ethereumNetwork: 'sepolia' | 'mainnet';
  privateKey: string;
  cardanoWalletSeed: string;
}
```

#### Key Methods
- `initialize()` - Initializes connections to both networks
- `releaseOnCardano()` - Releases funds on Cardano based on Ethereum events
- `releaseOnEthereum()` - Releases funds on Ethereum based on Cardano events
- `getEthereumBalance()` - Queries Ethereum balance
- `getCardanoBalance()` - Queries Cardano balance (placeholder)

#### Events Emitted
- `settlement:ethereum_to_cardano` - When Ethereum to Cardano settlement is initiated
- `settlement:cardano_to_ethereum` - When Cardano to Ethereum settlement is initiated
- `transaction:submitted` - When a transaction is submitted to either network
- `transaction:confirmed` - When an Ethereum transaction is confirmed
- `bridge:error` - When an error occurs in bridge operations

### Settlement Flow

1. **Event Detection**: Monitor detects a release event on source network
2. **Event Processing**: Coordinator validates and processes the event
3. **Settlement Initiation**: Settlement record is created and tracked
4. **Cross-Chain Transaction**: Bridge executes transaction on target network
5. **Confirmation**: Transaction confirmation is monitored and recorded
6. **Retry Logic**: Failed settlements are retried based on configuration

## Testing

### Test Coverage

Both components have comprehensive test suites:

- **CrossChainSettlementCoordinator.test.ts** - 9 test cases covering:
  - Initialization and configuration
  - Event handling for both networks
  - Auto-settlement enable/disable
  - Error handling
  - Status tracking

- **CardanoBridge.test.ts** - 15 test cases covering:
  - Construction and initialization
  - Cardano operations
  - Ethereum operations
  - Error handling
  - Event emission
  - Data validation

### Running Tests

```bash
# Run cross-chain settlement tests only
npm test -- --testPathPattern="cross-chain-settlement-coordinator|cardano-bridge"

# Run all tests
npm test
```

## Usage Example

```typescript
import { CrossChainSettlementCoordinator } from './cross-chain-settlement-coordinator';
import { CardanoBridge } from './cardano-bridge';
import { EscrowMonitor } from './escrow-monitor';
import { CardanoEscrowMonitor } from './cardano-escrow-monitor';

// Initialize components
const ethereumMonitor = new EscrowMonitor(ethereumConfig);
const cardanoMonitor = new CardanoEscrowMonitor(cardanoConfig);
const bridge = new CardanoBridge(bridgeConfig);

// Configure coordinator
const coordinatorConfig = {
  enableAutoSettlement: true,
  maxRetries: 3,
  retryDelay: 5000,
  settlementDelay: 1000
};

// Create and start coordinator
const coordinator = new CrossChainSettlementCoordinator(
  ethereumMonitor,
  cardanoMonitor,
  bridge,
  coordinatorConfig
);

// Setup event listeners
coordinator.on('settlement:completed', (record) => {
  console.log('Settlement completed:', record);
});

coordinator.on('settlement:failed', (record, error) => {
  console.log('Settlement failed:', record, error);
});

// Start the coordinator
await coordinator.start();
```

## Future Enhancements

1. **Real Cardano Integration**: Replace placeholder Cardano operations with actual Cardano SDK integration
2. **Transaction Verification**: Implement cross-chain transaction verification mechanisms
3. **Fee Management**: Add dynamic fee calculation and management
4. **Monitoring Dashboard**: Create a web dashboard for monitoring settlements
5. **Database Persistence**: Add database storage for settlement records
6. **Multi-Asset Support**: Extend support for various token types on both networks

## Security Considerations

1. **Private Key Management**: Ensure secure storage and handling of private keys
2. **Transaction Validation**: Implement thorough validation of cross-chain transactions
3. **Rate Limiting**: Add rate limiting to prevent spam attacks
4. **Access Control**: Implement proper access control for administrative functions
5. **Audit Logging**: Add comprehensive audit logging for all operations

## Dependencies

- **ethers**: Ethereum blockchain interaction
- **winston**: Logging framework
- **ws**: WebSocket support for real-time monitoring
- **jest**: Testing framework
- **typescript**: Type safety and development tooling

## Notes

- The Cardano implementation currently uses placeholder functions and would need real Cardano SDK integration in production
- The bridge uses Sepolia testnet for Ethereum as per user preference rules
- All settlement operations are tracked and can be queried for monitoring purposes
- The system is designed to be resilient with automatic retry logic and comprehensive error handling
