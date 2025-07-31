# Cardano-Specific Type Definitions

This document describes the Cardano-specific type definitions added to the cross-chain swap protocol.

## Overview

The type system is organized into three main modules:

1. **Types.Cardano** - Basic Cardano blockchain types
2. **Types.CrossChain** - Cross-chain swap specific types
3. **Types** - Main module that re-exports all types

## Types.Cardano

Basic types for interacting with the Cardano blockchain:

### Core Types

- `Address` - Type alias for Cardano addresses (ByteString)
- `Lovelace` - Type alias for ADA values in Lovelace (Integer)
- `TransactionId` - Type alias for Cardano transaction IDs (ByteString)

### Error Types

- `CardanoError` - Errors specific to Cardano operations:
  - `AddressNotFound`
  - `InvalidTransaction`
  - `TimeoutOccured`

### Action Types

- `CardanoAction` - Actions that can be performed on Cardano:
  - `SubmitTransaction` - Submit a transaction
  - `QueryBalance` - Query an address balance

## Types.CrossChain

Comprehensive types for cross-chain atomic swaps:

### Chain Types

- `ChainId` - Supported blockchain identifiers:
  - `CardanoMainnet`, `CardanoTestnet`
  - `EthereumMainnet`, `EthereumSepolia` (preferred over deprecated Goerli)
  - `PolygonMainnet`, `PolygonMumbai`
  - `BinanceSmartChain`, `AvalancheMainnet`

- `NetworkType` - Classification: `Mainnet` or `Testnet`
- `BlockHeight` - Type alias for block numbers (Integer)
- `ChainState` - Current state of a blockchain

### Swap Types

- `SwapId` - Unique identifier for swaps (ByteString)
- `SwapStatus` - Current status of a swap:
  - `SwapInitiated`, `SwapLocked`, `SwapRevealed`
  - `SwapCompleted`, `SwapCancelled`, `SwapExpired`, `SwapFailed`

- `SwapDirection` - Direction of the swap:
  - `CardanoToEthereum`, `EthereumToCardano`
  - `CardanoToPolygon`, `PolygonToCardano`

- `SwapConfig` - Configuration for a cross-chain swap
- `SwapState` - Complete state of a cross-chain swap
- `SwapError` - Errors that can occur during swaps

### Asset Types

- `AssetType` - Types of assets that can be swapped:
  - `NativeToken` - Native blockchain tokens (ADA, ETH, etc.)
  - `ERC20Token ByteString` - ERC20 tokens with contract address
  - `CardanoNative ByteString ByteString` - Cardano native tokens

- `AssetAmount` - Amount of an asset with decimals
- `TokenInfo` - Metadata about tokens

### Cross-Chain Communication

- `CrossChainMessage` - Messages for cross-chain communication
- `MessageStatus` - Status of cross-chain messages
- `Proof` - Cryptographic proofs for cross-chain verification

### Utility Functions

- `isTestnet :: ChainId -> Bool` - Check if chain is testnet
- `isMainnet :: ChainId -> Bool` - Check if chain is mainnet  
- `getChainName :: ChainId -> String` - Get human-readable chain name
- `mkSwapId :: Address -> Address -> ByteString -> SwapId` - Create swap ID

## Design Decisions

### Testnet Preference

Following user preference, the system uses Sepolia testnet instead of the deprecated Goerli testnet for Ethereum testing.

### Type Safety

- Uses `newtype` wrappers where appropriate for type safety
- Leverages Haskell's type system to prevent common errors
- All types derive `Show`, `Eq`, and `Generic` for debugging and serialization

### Cross-Chain Compatibility

- Uses `ByteString` for addresses and transaction IDs for flexibility
- Supports multiple blockchain networks
- Designed for extensibility to additional chains

### Error Handling

- Comprehensive error types for different failure modes
- Clear separation between blockchain-specific and swap-specific errors
- Error types are exhaustive and well-documented

## Usage Examples

```haskell
import Types

-- Create a swap configuration
let config = SwapConfig
    { sourceChain = CardanoTestnet
    , destinationChain = EthereumSepolia  -- Using preferred testnet
    , sourceAddress = "cardano_address_here"
    , destinationAddress = "ethereum_address_here"
    , swapAmount = AssetAmount NativeToken 1000000 6  -- 1 ADA
    , timeoutBlocks = 100
    , minConfirmations = 6
    }

-- Check if a chain is testnet
if isTestnet CardanoTestnet 
    then putStrLn "Using testnet"
    else putStrLn "Using mainnet"

-- Get chain name
putStrLn $ getChainName EthereumSepolia  -- "Ethereum Sepolia Testnet"
```

## Future Extensions

The type system is designed to be extensible for:

- Additional blockchain networks
- New asset types (NFTs, multi-asset tokens)
- Enhanced cross-chain communication protocols
- Advanced proof systems and verification methods
