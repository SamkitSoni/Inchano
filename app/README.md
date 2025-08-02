# Inchano App

Professional cross-chain swap interface between Ethereum and Cardano networks.

## Features

-   🔄 Cross-chain swaps between Ethereum (Sepolia) and Cardano (Preprod)
-   💼 Multi-wallet support (MetaMask, WalletConnect, Coinbase Wallet for Ethereum)
-   🔐 CIP-30 compatible Cardano wallets (Nami, Eternl, Flint)
-   🎨 Modern, responsive UI with glass morphism design
-   ⚡ Built with Next.js 14, TypeScript, and Tailwind CSS
-   🔗 Powered by 1inch Fusion technology

## Supported Tokens

### Ethereum (Sepolia)

-   ETH (Ethereum)
-   USDC (USD Coin)

### Cardano (Preprod)

-   ADA (Cardano)

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Environment Variables

Create a `.env.local` file:

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

## Technology Stack

-   **Framework**: Next.js 14 with App Router
-   **Language**: TypeScript
-   **Styling**: Tailwind CSS
-   **Ethereum Integration**: Wagmi + Viem
-   **Cardano Integration**: CIP-30 compatible wallets
-   **UI Components**: Radix UI primitives
-   **Icons**: Lucide React

## License

MIT License
