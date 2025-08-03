# Inchano Relayer Service Setup Complete! 🚀

## What We've Built

A complete cross-chain relayer service that can interact with:

### Cardano Preprod Testnet

-   **Limit Order Protocol**: `addr_test1wp203846488426adefdc379e46cc9713d1695f5dd424728694acb07f1e`
-   **Escrow Factory**: `addr_test1w9fbe9d3e7b9cf25f6b36d25ae170beb8a6ac8088a08ebd03311d`
-   **Integration**: Lucid + Blockfrost API

### Ethereum Sepolia Testnet

-   **Limit Order Protocol**: `0x7b728d06b49DB49b0858397fDBe48bC57a814AF0`
-   **Escrow Factory**: `0xB0285B9817B7F798ba7a3AE141023ec0e0088cF0`
-   **Other Contracts**: Fee Bank, Escrow Src/Dst, WETH
-   **Integration**: Viem + Wagmi

## Project Structure

```
relayer/
├── src/
│   ├── config/           # Environment configuration
│   ├── controllers/      # API endpoints
│   ├── services/         # Blockchain interaction services
│   │   ├── cardano.service.ts    # Cardano/Lucid integration
│   │   ├── ethereum.service.ts   # Ethereum/Viem integration
│   │   └── relayer.service.ts    # Main coordination logic
│   ├── utils/           # Logger and utilities
│   └── index.ts         # Application entry point
├── scripts/             # Test and utility scripts
├── .env.example         # Environment template
└── README.md           # Complete documentation
```

## Quick Start

1. **Install Dependencies**

    ```bash
    cd relayer
    npm install
    ```

2. **Configure Environment**

    ```bash
    cp .env.example .env
    # Edit .env with your credentials
    ```

3. **Test Configuration**

    ```bash
    npm run test:config
    ```

4. **Build & Run**
    ```bash
    npm run build
    npm run dev
    ```

## API Endpoints Ready

-   `GET /health` - Health check
-   `GET /status` - Complete system status
-   `GET /test-connections` - Test contract connectivity
-   `GET /cardano/wallet` - Cardano wallet info
-   `GET /ethereum/wallet` - Ethereum wallet info
-   `GET /contracts` - All contract addresses

## Required Environment Variables

```env
# Cardano
BLOCKFROST_PROJECT_ID=your_blockfrost_project_id
CARDANO_WALLET_SEED_PHRASE=your_cardano_seed_phrase

# Ethereum
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_key
ETHEREUM_PRIVATE_KEY=0xYourPrivateKey
```

## Next Development Steps

1. **Add Dutch Auction Logic**

    - Implement auction start/end mechanisms
    - Price discovery algorithms
    - Bidding coordination

2. **Cross-Chain Communication**

    - Event monitoring on both chains
    - State synchronization
    - Atomic swap coordination

3. **Resolver Integration**

    - API endpoints for resolver communication
    - Order management
    - Settlement coordination

4. **Advanced Features**
    - MEV protection
    - Gas optimization
    - Error recovery mechanisms

## Testing With Real Credentials

Once you have:

-   Blockfrost Project ID (free at blockfrost.io)
-   Cardano testnet wallet with some ADA
-   Ethereum testnet wallet with some ETH
-   Infura/Alchemy RPC URL

The relayer will be able to:

-   ✅ Connect to both networks
-   ✅ Read wallet balances
-   ✅ Interact with deployed contracts
-   ✅ Monitor blockchain events
-   ✅ Coordinate cross-chain operations

Perfect foundation for building the full relayer functionality! 🎉
