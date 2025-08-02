import { MonitorConfig, EscrowContract } from './types';

// Example escrow contract addresses on Sepolia testnet
// These would be replaced with actual deployed contract addresses
export const DEFAULT_SEPOLIA_CONTRACTS: EscrowContract[] = [
  {
    address: '0x1234567890123456789012345678901234567890',
    name: 'Example Escrow Contract 1',
    description: 'Demo escrow contract for testing',
    createdAt: new Date(),
    isActive: true
  },
  {
    address: '0x0987654321098765432109876543210987654321',
    name: 'Example Escrow Contract 2',
    description: 'Another demo escrow contract',
    createdAt: new Date(),
    isActive: true
  }
];

export const createDefaultConfig = (alchemyApiKey: string): MonitorConfig => {
  return {
    alchemyApiKey,
    network: 'sepolia',
    contracts: DEFAULT_SEPOLIA_CONTRACTS,
    enableLogging: process.env['NODE_ENV'] !== 'production'
  };
};

export const createProductionConfig = (
  alchemyApiKey: string,
  contracts: EscrowContract[],
  webhookUrl?: string
): MonitorConfig => {
  return {
    alchemyApiKey,
    network: 'sepolia',
    contracts: contracts.filter(c => c.isActive),
    webhookUrl,
    enableLogging: false
  };
};

// Utility function to validate contract addresses
export const validateContractAddress = (address: string): boolean => {
  // Basic Ethereum address validation
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethAddressRegex.test(address);
};

// Utility to load contracts from environment variables
export const loadContractsFromEnv = (): EscrowContract[] => {
  const contractsEnv = process.env['ESCROW_CONTRACTS'];
  if (!contractsEnv) {
    console.warn('No ESCROW_CONTRACTS configured, using demo contracts for development');
    return DEFAULT_SEPOLIA_CONTRACTS;
  }

  try {
    const contractAddresses = contractsEnv.split(',');
    return contractAddresses.map((address, index) => ({
      address: address.trim(),
      name: `Escrow Contract ${index + 1}`,
      description: `Contract loaded from environment: ${address}`,
      createdAt: new Date(),
      isActive: true
    }));
  } catch (error) {
    console.warn('Failed to load contracts from environment, using defaults');
    return DEFAULT_SEPOLIA_CONTRACTS;
  }
};
