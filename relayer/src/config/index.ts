import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Cardano
  cardano: {
    network: process.env.CARDANO_NETWORK || 'preprod',
    blockfrostProjectId: process.env.BLOCKFROST_PROJECT_ID || '',
    walletSeedPhrase: process.env.CARDANO_WALLET_SEED_PHRASE || '',
    contracts: {
      lopAddress: process.env.CARDANO_LOP_ADDRESS || '',
      escrowFactoryAddress: process.env.CARDANO_ESCROW_FACTORY_ADDRESS || ''
    }
  },
  
  // Ethereum
  ethereum: {
    rpcUrl: process.env.SEPOLIA_RPC_URL || '',
    privateKey: process.env.ETHEREUM_PRIVATE_KEY || '',
    contracts: {
      lopAddress: process.env.ETHEREUM_LOP_ADDRESS || '',
      escrowFactoryAddress: process.env.ETHEREUM_ESCROW_FACTORY_ADDRESS || '',
      feeBankAddress: process.env.ETHEREUM_FEE_BANK_ADDRESS || '',
      escrowSrcAddress: process.env.ETHEREUM_ESCROW_SRC_ADDRESS || '',
      escrowDstAddress: process.env.ETHEREUM_ESCROW_DST_ADDRESS || '',
      wethAddress: process.env.WETH_ADDRESS || ''
    }
  },
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Validation
export function validateConfig(): void {
  const required = [
    'BLOCKFROST_PROJECT_ID',
    'CARDANO_WALLET_SEED_PHRASE',
    'SEPOLIA_RPC_URL',
    'ETHEREUM_PRIVATE_KEY'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
