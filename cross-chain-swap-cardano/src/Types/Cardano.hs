{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE DeriveAnyClass #-}

module Types.Cardano
    ( -- * Cardano Types
      Address
    , Lovelace
    , TransactionId
    , CardanoAction(..)
    , CardanoError(..)
    ) where

import GHC.Generics (Generic)
import Data.ByteString (ByteString)

-- | Type alias for Cardano addresses
-- Cardano addresses are represented using ByteString
-- We could consider a newtype for added type safety
-- but for now, keep it simple for integration ease

type Address = ByteString

-- | Type alias for ADA values (in Lovelace)
type Lovelace = Integer

-- | Type alias for Cardano Transaction ID
type TransactionId = ByteString

-- | Custom error types specific to Cardano actions
data CardanoError
    = AddressNotFound
    | InvalidTransaction
    | TimeoutOccured
    deriving (Show, Eq, Generic)

-- | Actions related to Cardano blockchain
-- To be expanded as needed by Cardano contracts
data CardanoAction
    = SubmitTransaction
        { txId :: TransactionId
        , recipient :: Address
        }
    | QueryBalance
        { address :: Address
        }
    deriving (Show, Eq, Generic)

