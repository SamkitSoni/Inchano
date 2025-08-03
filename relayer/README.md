# Inchano Relayer Service

A cross-chain relayer service for the Inchano protocol that facilitates atomic swaps between Cardano and Ethereum networks.

## Features

-   Cross-chain communication between Cardano (Preprod) and Ethereum (Sepolia)
-   Integration with deployed Limit Order Protocol contracts
-   Dutch auction coordination
-   RESTful API for monitoring and control
-   Comprehensive logging and error handling

## Prerequisites

-   Node.js 18+
-   npm or yarn
-   Cardano wallet seed phrase
-   Ethereum private key
-   Blockfrost API key for Cardano
-   Ethereum RPC URL (Infura/Alchemy)

## Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## Environment Configuration

Create a `.env` file with the following variables:

```env
# Cardano Configuration
BLOCKFROST_PROJECT_ID=your_blockfrost_project_id_here
CARDANO_NETWORK=preprod
CARDANO_WALLET_SEED_PHRASE=your_cardano_wallet_seed_phrase_here

# Ethereum Configuration
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_infura_key_here
ETHEREUM_PRIVATE_KEY=your_ethereum_private_key_here

# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

## Usage

```bash
# Development mode (with hot reload)
npm run dev

# Build the project
npm run build

# Start production server
npm start

# Run tests
npm test
```

## API Endpoints

### Health & Status

-   `GET /health` - Health check
-   `GET /status` - Complete relayer status
-   `GET /test-connections` - Test contract connections

### Wallet Information

-   `GET /cardano/wallet` - Cardano wallet information
-   `GET /ethereum/wallet` - Ethereum wallet information

### Contract Information

-   `GET /contracts` - All deployed contract addresses and status

## Contract Addresses

### Cardano Preprod Testnet

-   **Limit Order Protocol**: `addr_test1wp203846488426adefdc379e46cc9713d1695f5dd424728694acb07f1e`
-   **Escrow Factory**: `addr_test1w9fbe9d3e7b9cf25f6b36d25ae170beb8a6ac8088a08ebd03311d`

### Ethereum Sepolia Testnet

-   **Limit Order Protocol**: `0x7b728d06b49DB49b0858397fDBe48bC57a814AF0`
-   **Escrow Factory**: `0xB0285B9817B7F798ba7a3AE141023ec0e0088cF0`
-   **Fee Bank**: `0xbf769c11140b8a14604c759B658b8B5221A31772`
-   **Escrow Src**: `0xb5A3Ad6957B0A1E397BB8Fc3Ac86B9698d0c991b`
-   **Escrow Dst**: `0x1217704f22f053284dA591d4a83324B11AD0bD3B`

## Architecture

```
src/
├── config/          # Environment configuration
├── controllers/     # API route handlers
├── services/        # Business logic
│   ├── cardano.service.ts    # Cardano blockchain interaction
│   ├── ethereum.service.ts   # Ethereum blockchain interaction
│   └── relayer.service.ts    # Main relayer coordination
└── utils/           # Utilities and helpers
```

## Development

The relayer service is designed to:

1. **Monitor** both Cardano and Ethereum networks for relevant events
2. **Coordinate** cross-chain atomic swaps
3. **Manage** Dutch auction mechanics
4. **Facilitate** communication between resolvers and makers
5. **Ensure** proper escrow management and fund safety

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Test contract connections
curl http://localhost:3000/test-connections
```

## Troubleshooting

### Common Issues

1. **Blockfrost API errors**: Ensure your project ID is correct and has sufficient quota
2. **Ethereum RPC issues**: Check your RPC URL and ensure it supports Sepolia testnet
3. **Wallet connection issues**: Verify your seed phrase and private key are correctly formatted

### Logs

Logs are stored in the `logs/` directory:

-   `error.log` - Error messages only
-   `combined.log` - All log messages

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details
