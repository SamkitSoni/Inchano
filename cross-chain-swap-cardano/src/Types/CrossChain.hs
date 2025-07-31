{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE DeriveAnyClass #-}

{-|
Module      : Types.CrossChain
Description : Cross-chain swap type definitions for Cardano
Copyright   : (c) 2025
License     : MIT

This module provides type definitions specific to cross-chain atomic swaps
between Cardano and other blockchains (primarily Ethereum). It includes
types for swap states, chain identifiers, and cross-chain communication.
-}

module Types.CrossChain
    ( -- * Chain Types
      ChainId(..)
    , NetworkType(..)
    , BlockHeight
    , ChainState(..)
      -- * Swap Types
    , SwapId
    , SwapStatus(..)
    , SwapDirection(..)
    , SwapConfig(..)
    , SwapState(..)
    , SwapError(..)
      -- * Asset Types
    , AssetType(..)
    , AssetAmount(..)
    , TokenInfo(..)
      -- * Cross-Chain Communication
    , CrossChainMessage(..)
    , MessageStatus(..)
    , Proof(..)
      -- * Utility Functions
    , isTestnet
    , isMainnet
    , getChainName
    , mkSwapId
    ) where

import GHC.Generics (Generic)
import Data.ByteString (ByteString)
import qualified Data.ByteString as BS
import qualified Data.ByteString.Char8 as BC
import Types.Cardano (Address, Lovelace)

-- | Chain identifier for different blockchains
data ChainId 
    = CardanoMainnet
    | CardanoTestnet        -- ^ Using Sepolia testnet as per user preference
    | EthereumMainnet
    | EthereumSepolia       -- ^ Preferred testnet over deprecated Goerli
    | PolygonMainnet
    | PolygonMumbai
    | BinanceSmartChain
    | AvalancheMainnet
    deriving (Show, Eq, Ord, Enum, Generic)

-- | Network type classification
data NetworkType
    = Mainnet
    | Testnet
    deriving (Show, Eq, Generic)

-- | Type alias for block height/number on any chain
type BlockHeight = Integer

-- | Current state of a blockchain
data ChainState = ChainState
    { chainId :: ChainId
    , currentBlock :: BlockHeight
    , networkType :: NetworkType
    , isOperational :: Bool
    } deriving (Show, Eq, Generic)

-- | Unique identifier for a cross-chain swap
type SwapId = ByteString

-- | Status of a cross-chain swap
data SwapStatus
    = SwapInitiated         -- ^ Swap has been initiated on source chain
    | SwapLocked            -- ^ Funds locked on source chain
    | SwapRevealed          -- ^ Secret revealed, waiting for destination
    | SwapCompleted         -- ^ Successfully completed on both chains
    | SwapCancelled         -- ^ Cancelled and refunded
    | SwapExpired           -- ^ Expired without completion
    | SwapFailed            -- ^ Failed due to error
    deriving (Show, Eq, Ord, Enum, Generic)

-- | Direction of the swap
data SwapDirection
    = CardanoToEthereum     -- ^ Swap from Cardano to Ethereum
    | EthereumToCardano     -- ^ Swap from Ethereum to Cardano
    | CardanoToPolygon      -- ^ Swap from Cardano to Polygon
    | PolygonToCardano      -- ^ Swap from Polygon to Cardano
    deriving (Show, Eq, Generic)

-- | Configuration for a cross-chain swap
data SwapConfig = SwapConfig
    { sourceChain :: ChainId
    , destinationChain :: ChainId
    , sourceAddress :: Address
    , destinationAddress :: Address
    , swapAmount :: AssetAmount
    , timeoutBlocks :: BlockHeight
    , minConfirmations :: Integer
    } deriving (Show, Eq, Generic)

-- | Complete state of a cross-chain swap
data SwapState = SwapState
    { swapId :: SwapId
    , config :: SwapConfig
    , status :: SwapStatus
    , secret :: Maybe ByteString        -- ^ Revealed secret (if any)
    , hashlock :: ByteString           -- ^ Hash of the secret
    , sourceTransaction :: Maybe ByteString  -- ^ Source chain tx hash
    , destTransaction :: Maybe ByteString    -- ^ Destination chain tx hash
    , createdAt :: Integer             -- ^ Creation timestamp
    , expiresAt :: Integer             -- ^ Expiration timestamp
    , lastUpdated :: Integer           -- ^ Last update timestamp
    } deriving (Show, Eq, Generic)

-- | Errors that can occur during cross-chain swaps
data SwapError
    = InvalidChainId
    | UnsupportedSwapDirection
    | InvalidSwapAmount
    | InsufficientBalance
    | SwapAlreadyExists
    | SwapNotFound
    | SwapExpired
    | InvalidSecret
    | ChainNotReachable
    | TransactionFailed
    | InvalidProof
    deriving (Show, Eq, Generic)

-- | Types of assets that can be swapped
data AssetType
    = NativeToken           -- ^ Native blockchain token (ADA, ETH, etc.)
    | ERC20Token ByteString -- ^ ERC20 token with contract address
    | CardanoNative ByteString ByteString -- ^ Cardano native token (policy_id, asset_name)
    deriving (Show, Eq, Generic)

-- | Amount of an asset
data AssetAmount = AssetAmount
    { assetType :: AssetType
    , amount :: Integer
    , decimals :: Integer     -- ^ Number of decimal places
    } deriving (Show, Eq, Generic)

-- | Information about a token
data TokenInfo = TokenInfo
    { tokenSymbol :: ByteString
    , tokenName :: ByteString
    , tokenDecimals :: Integer
    , tokenAddress :: Maybe ByteString  -- ^ Contract address (if applicable)
    } deriving (Show, Eq, Generic)

-- | Messages for cross-chain communication
data CrossChainMessage = CrossChainMessage
    { messageId :: ByteString
    , sourceChain :: ChainId
    , targetChain :: ChainId
    , messageType :: ByteString
    , payload :: ByteString
    , timestamp :: Integer
    } deriving (Show, Eq, Generic)

-- | Status of cross-chain messages
data MessageStatus
    = MessagePending        -- ^ Message created but not sent
    | MessageSent           -- ^ Message sent to bridge
    | MessageConfirmed      -- ^ Message confirmed on target chain
    | MessageFailed         -- ^ Message failed to deliver
    deriving (Show, Eq, Generic)

-- | Cryptographic proof for cross-chain verification
data Proof = Proof
    { proofType :: ByteString    -- ^ Type of proof (merkle, signature, etc.)
    , proofData :: ByteString    -- ^ The actual proof data
    , blockHeight :: BlockHeight -- ^ Block height where proof is valid
    , chainId :: ChainId         -- ^ Chain where proof originates
    } deriving (Show, Eq, Generic)

-- | Utility Functions

-- | Check if a chain ID represents a testnet
isTestnet :: ChainId -> Bool
isTestnet CardanoTestnet = True
isTestnet EthereumSepolia = True  -- Prefer Sepolia over Goerli
isTestnet PolygonMumbai = True
isTestnet _ = False

-- | Check if a chain ID represents a mainnet
isMainnet :: ChainId -> Bool
isMainnet = not . isTestnet

-- | Get human-readable name for a chain
getChainName :: ChainId -> String
getChainName CardanoMainnet = "Cardano Mainnet"
getChainName CardanoTestnet = "Cardano Testnet"
getChainName EthereumMainnet = "Ethereum Mainnet"
getChainName EthereumSepolia = "Ethereum Sepolia Testnet"
getChainName PolygonMainnet = "Polygon Mainnet"
getChainName PolygonMumbai = "Polygon Mumbai Testnet"
getChainName BinanceSmartChain = "Binance Smart Chain"
getChainName AvalancheMainnet = "Avalanche Mainnet"

-- | Create a new swap ID from source and destination addresses
mkSwapId :: Address -> Address -> ByteString -> SwapId
mkSwapId sourceAddr destAddr orderHash = 
    BC.pack $ "swap_" ++ BC.unpack (BS.concat [sourceAddr, destAddr, orderHash])
