# Inchano - Cross-Chain DeFi Protocol with Dutch Auction Integration

A comprehensive cross-chain DeFi protocol that extends 1inch Fusion+ capabilities to enable atomic swaps between Cardano and Ethereum networks using Dutch auction mechanisms.

## 🌟 Overview

Inchano is a next-generation cross-chain DeFi protocol that facilitates seamless atomic swaps between Cardano and Ethereum blockchains. Built on top of 1inch Fusion+ technology, it implements Dutch auction mechanisms to optimize trade execution and provide MEV protection.

### Key Features

- 🔄 **Cross-Chain Atomic Swaps**: Secure token exchanges between Cardano and Ethereum
- 📈 **Dutch Auction Integration**: Dynamic pricing with 1inch Fusion+ protocol
- ⚡ **Real-time Order Broadcasting**: WebSocket-based order distribution to resolvers
- 🛡️ **MEV Protection**: Advanced mechanisms to prevent front-running
- 🔍 **Escrow Monitoring**: Real-time tracking of cross-chain transactions
- 🎯 **Resolver Network**: Decentralized execution through resolver participants

## 🏗️ Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend UI   │    │  Relayer Core   │    │ Gateway Service │
│    (Next.js)    │◄──►│   (Node.js)     │◄──►│   (Fusion+)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Smart Contracts │    │  Escrow Monitor │    │ Resolver Network│
│  (Cardano/ETH)  │    │   (WebSocket)   │    │  (WebSocket)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```



## 📦 Project Structure

```
Inchano/
├── app/                          # Frontend Application (Next.js)
│   ├── src/
│   │   ├── components/           # React components
│   │   │   ├── dutch-auction-animation.tsx
│   │   │   └── client-only.tsx
│   │   └── app/
│   │       └── resolver/         # Resolver UI components
│
├── relayer/                      # Core Relayer Service (Node.js/TypeScript)
│   ├── src/
│   │   ├── controllers/          # API route handlers
│   │   ├── services/             # Business logic
│   │   │   ├── cardano.service.ts
│   │   │   ├── ethereum.service.ts
│   │   │   └── lop-integration.service.ts
│   │   ├── database/             # Order management
│   │   └── utils/                # Utilities and logging
│   └── scripts/                  # Deployment and testing
│
├── relayer-service/              # Advanced Service Components
│   ├── src/
│   │   ├── gateway/              # Fusion+ Order Gateway
│   │   ├── escrow-monitor/       # Cross-chain monitoring
│   │   ├── services/             # Order processing
│   │   └── routes/               # API endpoints
│
├── limit-order-protocol-cardano/ # Cardano Smart Contracts (Haskell)
│   ├── src/
│   │   └── Contracts/            # Plutus smart contracts
│   ├── scripts/                  # Deployment scripts
│   └── app/                      # CLI deployment tools
│
├── cross-chain-swap-cardano/     # Cross-Chain Escrow (Haskell)
│   ├── src/
│   │   └── Contracts/            # Escrow contracts
│   ├── txn_examples/             # Transaction examples
│   └── deployment/               # Contract deployments
│
└── resolver/                     # Resolver Implementation
    └── fusion-resolver-example/  # Reference resolver
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ (for JavaScript/TypeScript components)
- **Haskell Stack** (for Cardano smart contracts)
- **Cardano Node** access (Preprod testnet)
- **Ethereum Node** access (Sepolia testnet)
- **Blockfrost API** key
- **Infura/Alchemy** API key

### Environment Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Inchano
   ```

2. **Install dependencies**
   ```bash
   # Relayer service
   cd relayer && npm install
   
   # Frontend application
   cd ../app && npm install
   ```

3. **Configure environment variables**

   Required variables:
   ```env
   # Cardano Configuration
   BLOCKFROST_PROJECT_ID=your_blockfrost_project_id
   CARDANO_NETWORK=preprod
   CARDANO_WALLET_SEED_PHRASE=your_cardano_wallet_seed

   # Ethereum Configuration
   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_key
   ETHEREUM_PRIVATE_KEY=0xYourPrivateKey

   # Service Configuration
   PORT=3000
   NODE_ENV=development
   ```

### Quick Start

1. **Start the relayer service**
   ```bash
   cd relayer
   PORT=3001 && npm run dev
   ```


2. **Run the frontend**
   ```bash
   cd app
   npm run dev
   ```

3. **Deploy smart contracts** (if needed)
   ```bash
   cd limit-order-protocol-cardano
   npm run deploy
   
   cd ../cross-chain-swap-cardano
   npm run deploy
   ```

## 🔧 Core Components

### 1. Relayer Service (`/relayer`)

The heart of the Inchano protocol, handling cross-chain coordination and order management.

**Key Features:**
- Cross-chain communication between Cardano and Ethereum
- Dutch auction coordination with 1inch Fusion+
- RESTful API for monitoring and control
- WebSocket integration for real-time updates

**API Endpoints:**
- `GET /health` - Service health check
- `GET /status` - Network and contract status
- `POST /swap/initiate` - Initiate cross-chain swaps
- `GET /cardano/wallet` - Cardano wallet information
- `GET /ethereum/wallet` - Ethereum wallet information

### 2. Fusion+ Gateway (`/relayer-service/src/gateway`)

WebSocket gateway connecting to 1inch Fusion+ for order broadcasting and resolver coordination.

**Features:**
- Real-time order streaming from 1inch Fusion+
- Resolver network broadcasting
- Dutch auction monitoring
- Profitability analysis

### 3. Escrow Monitor (`/relayer-service/src/escrow-monitor`)

Real-time monitoring service for Ethereum escrow contracts.

**Capabilities:**
- WebSocket-based event monitoring
- Multi-contract support
- State tracking and lifecycle management
- Automatic reconnection handling

### 4. Smart Contracts

#### Cardano Contracts (`/limit-order-protocol-cardano`, `/cross-chain-swap-cardano`)
- **Limit Order Protocol**: Handles order creation and matching on Cardano
- **Escrow Factory**: Manages cross-chain swap escrows
- **Base Escrow**: Atomic swap primitives

#### Ethereum Integration
- Integration with existing 1inch Fusion+ contracts
- Custom escrow contracts for cross-chain operations

### 5. Frontend Application (`/app`)

Next.js-based user interface for interacting with the protocol.

**Components:**
- Dutch auction visualization
- Order creation and management
- Cross-chain swap interface
- Real-time price monitoring
- 
## 🔄 Order Flow

### Dutch Auction Process

1. **Order Creation**: User creates a Dutch auction order with start/end prices
2. **Price Decay**: Price automatically decreases over time
3. **Resolver Detection**: Resolvers monitor for profitable opportunities
4. **Execution**: Best resolver executes the order at optimal price
5. **Settlement**: Funds are settled atomically

### Cross-Chain Swap Process

1. **Initiation**: User initiates cross-chain swap
2. **Escrow Creation**: Source and destination escrows are created
3. **Monitoring**: Both chains are monitored for state changes
4. **Coordination**: Relayer coordinates the atomic swap
5. **Completion**: Funds are released on both chains simultaneously

## 🧪 Testing

### Unit Tests
```bash
# Test relayer service
cd relayer && npm test

# Test gateway service
cd relayer-service && npm test
```

### Integration Tests
```bash
# Test cross-chain functionality
cd relayer && npm run test:integration

# Test contract interactions
npm run test:contracts
```

### End-to-End Testing
```bash
# Full protocol test
npm run test:e2e
```

## 📈 Monitoring and Logging

- **Winston Logging**: Comprehensive logging across all services
- **Health Checks**: Built-in health monitoring endpoints
- **Error Tracking**: Detailed error reporting and recovery
- **Performance Metrics**: Real-time performance monitoring

## 🔒 Security

- **Private Key Management**: Secure storage and handling
- **Contract Validation**: Thorough contract address verification
- **Network Security**: Secure RPC connections
- **Audit Trail**: Complete transaction logging


## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


**Built with ❤️ by the Inchano Team**

*Bridging the gap between Cardano and Ethereum ecosystems through innovative cross-chain DeFi solutions.*
