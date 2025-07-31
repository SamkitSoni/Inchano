import { CardanoMonitorConfig, CardanoEscrowContract } from './types';

// Example escrow contract addresses on Cardano testnet
// These would be replaced with actual deployed script addresses
export const DEFAULT_TESTNET_CONTRACTS: CardanoEscrowContract[] = [
  {
    scriptAddress: 'addr_test1wpag8t6z8m4m4vxf8k9k9k9k9k9k9k9k9k9k9k9k9k9k9k9k9kq5q5q5q',
    scriptHash: '1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef12',
    name: 'Example Cardano Escrow Contract 1',
    description: 'Demo Plutus escrow contract for testing',
    createdAt: new Date(),
    isActive: true
  },
  {
    scriptAddress: 'addr_test1wzxcvbnmasdfghjklqwertyuiopzxcvbnmasdfghjklqwertyui9876543',
    scriptHash: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba09',
    name: 'Example Cardano Escrow Contract 2',
    description: 'Another demo Plutus escrow contract',
    createdAt: new Date(),
    isActive: true,
    policyId: 'abcd1234567890abcdef1234567890abcdef1234567890abcdef' // For native token escrows
  }
];

export const createDefaultCardanoConfig = (ogmiosUrl: string): CardanoMonitorConfig => {
  return {
    ogmiosUrl: ogmiosUrl || 'ws://localhost:1337',
    network: 'testnet',
    contracts: DEFAULT_TESTNET_CONTRACTS,
    enableLogging: process.env['NODE_ENV'] !== 'production',
    syncFromSlot: parseInt(process.env['CARDANO_SYNC_FROM_SLOT'] || '0')
  };
};

export const createProductionCardanoConfig = (
  ogmiosUrl: string,
  contracts: CardanoEscrowContract[],
  kupoUrl?: string
): CardanoMonitorConfig => {
  const config: CardanoMonitorConfig = {
    ogmiosUrl,
    network: 'testnet', // Using testnet as per user preference
    contracts: contracts.filter(c => c.isActive),
    enableLogging: false,
    syncFromSlot: 0
  };
  
  if (kupoUrl) {
    config.kupoUrl = kupoUrl;
  }
  
  return config;
};

// Utility function to validate Cardano addresses
export const validateCardanoAddress = (address: string): boolean => {
  // Basic Cardano address validation (Bech32 format)
  const cardanoAddressRegex = /^addr(_test)?1[a-z0-9]{53,}$/;
  return cardanoAddressRegex.test(address);
};

// Utility function to validate script hash
export const validateScriptHash = (hash: string): boolean => {
  // Cardano script hash validation (56 hex characters)
  const scriptHashRegex = /^[a-fA-F0-9]{56}$/;
  return scriptHashRegex.test(hash);
};

// Utility to load contracts from environment variables
export const loadCardanoContractsFromEnv = (): CardanoEscrowContract[] => {
  const contractsEnv = process.env['CARDANO_ESCROW_CONTRACTS'];
  if (!contractsEnv) {
    return DEFAULT_TESTNET_CONTRACTS;
  }

  try {
    const contractData = JSON.parse(contractsEnv);
    return contractData.map((contract: any, index: number) => ({
      scriptAddress: contract.scriptAddress,
      scriptHash: contract.scriptHash,
      name: contract.name || `Cardano Escrow Contract ${index + 1}`,
      description: contract.description || `Contract loaded from environment`,
      createdAt: new Date(),
      isActive: contract.isActive !== false,
      policyId: contract.policyId
    }));
  } catch (error) {
    console.warn('Failed to load Cardano contracts from environment, using defaults');
    return DEFAULT_TESTNET_CONTRACTS;
  }
};

// Network configuration
export const CARDANO_NETWORK_CONFIG = {
  testnet: {
    magic: 1097911063,
    era: 'babbage'
  },
  mainnet: {
    magic: 764824073,
    era: 'babbage'
  }
};

// Common Ogmios endpoints
export const OGMIOS_ENDPOINTS = {
  local: 'ws://localhost:1337',
  demeter_testnet: 'wss://ogmios-api.testnet.demeter.run',
  demeter_mainnet: 'wss://ogmios-api.mainnet.demeter.run'
};

// Escrow datum structure template
export interface EscrowDatum {
  buyer: string;
  seller: string;
  arbiter?: string;
  amount: string;
  deadline?: number;
  terms?: string;
}

// Escrow redeemer actions
export enum EscrowRedeemerAction {
  FUND = 'Fund',
  RELEASE = 'Release',
  REFUND = 'Refund',
  DISPUTE = 'Dispute',
  RESOLVE = 'Resolve'
}

export const ESCROW_SCRIPT_PURPOSES = {
  SPENDING: 'spend',
  MINTING: 'mint',
  CERTIFYING: 'certificate',
  REWARDING: 'withdrawal'
} as const;
