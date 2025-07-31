import { ethers } from 'ethers';
import { logger } from './logger';

// Environment variable configuration
const config = {
  protocolName: process.env['LIMIT_ORDER_PROTOCOL_NAME'] || '1inch Limit Order Protocol',
  protocolVersion: process.env['LIMIT_ORDER_PROTOCOL_VERSION'] || '4',
  defaultChainId: parseInt(process.env['DEFAULT_CHAIN_ID'] || '11155111'), // Default to Sepolia
  defaultNetwork: process.env['DEFAULT_NETWORK'] || 'sepolia',
  contracts: {
    ethereum: process.env['ETH_LIMIT_ORDER_CONTRACT'] || '0x1111111254EEB25477B68fb85Ed929f73A960582',
    sepolia: process.env['SEPOLIA_LIMIT_ORDER_CONTRACT'] || '0x7b728d06b49DB49b0858397fDBe48bC57a814AF0'
  },
  chainIds: {
    ethereum: parseInt(process.env['ETH_CHAIN_ID'] || '1'),
    sepolia: parseInt(process.env['SEPOLIA_CHAIN_ID'] || '11155111')
  }
};

// Type definitions for limit orders
export interface LimitOrder {
  salt: string;
  maker: string;
  receiver: string;
  makerAsset: string;
  takerAsset: string;
  makerAmount: string;
  takerAmount: string;
  interactions: string;
}

export interface DutchAuctionOrder {
  orderHash: string;
  maker: string;
  makerAsset: string;
  takerAsset: string;
  startAmount: string;
  endAmount: string;
  startTime: number;
  endTime: number;
  signature: string;
  salt: string;
}

export interface OrderSignature {
  v: number;
  r: string;
  s: string;
}

export type NetworkName = 'ethereum' | 'sepolia';

// EIP-712 type definitions
const LIMIT_ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'interactions', type: 'bytes' }
  ]
};

/**
 * Get domain data for specific network
 */
export function getDomainData(network: NetworkName = 'ethereum') {
  const chainId = config.chainIds[network];
  const verifyingContract = config.contracts[network];

  if (!chainId || !verifyingContract) {
    throw new Error(`Unsupported network: ${network}`);
  }

  return {
    name: config.protocolName,
    version: config.protocolVersion,
    chainId,
    verifyingContract
  };
}

/**
 * Generates EIP-712 hash for a limit order
 */
export function generateOrderHash(order: LimitOrder, network: NetworkName = 'ethereum'): string {
  try {
    const domain = getDomainData(network);

    const orderData = {
      salt: order.salt,
      maker: order.maker,
      receiver: order.receiver,
      makerAsset: order.makerAsset,
      takerAsset: order.takerAsset,
      makerAmount: order.makerAmount,
      takerAmount: order.takerAmount,
      interactions: order.interactions
    };

    const hash = ethers.utils._TypedDataEncoder.hash(domain, LIMIT_ORDER_TYPES, orderData);
    logger.debug('Generated order hash', { hash, order: orderData, network, domain });
    
    return hash;
  } catch (error) {
    logger.error('Failed to generate order hash', { error, order, network });
    throw new Error(`Order hash generation failed: ${error}`);
  }
}

/**
 * Verifies EIP-712 signature for a limit order
 */
export function verifyOrderSignature(
  order: LimitOrder,
  signature: string,
  expectedSigner: string,
  network: NetworkName = 'ethereum'
): boolean {
  try {
    const domain = getDomainData(network);

    const orderData = {
      salt: order.salt,
      maker: order.maker,
      receiver: order.receiver,
      makerAsset: order.makerAsset,
      takerAsset: order.takerAsset,
      makerAmount: order.makerAmount,
      takerAmount: order.takerAmount,
      interactions: order.interactions
    };

    // Recover the signer from the signature
    const recoveredAddress = ethers.utils.verifyTypedData(
      domain,
      LIMIT_ORDER_TYPES,
      orderData,
      signature
    );

    const isValid = recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
    
    logger.debug('Signature verification result', {
      isValid,
      recoveredAddress,
      expectedSigner,
      orderHash: generateOrderHash(order, network),
      network
    });

    return isValid;
  } catch (error) {
    logger.error('Signature verification failed', { 
      error, 
      order, 
      signature, 
      expectedSigner,
      network
    });
    return false;
  }
}

/**
 * Validates the structure and content of a limit order
 */
export function validateOrderData(order: LimitOrder): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (!order.salt || order.salt === '0') {
    errors.push('Invalid or missing salt');
  }

  if (!ethers.utils.isAddress(order.maker)) {
    errors.push('Invalid maker address');
  }

  if (!ethers.utils.isAddress(order.receiver)) {
    errors.push('Invalid receiver address');
  }

  if (!ethers.utils.isAddress(order.makerAsset)) {
    errors.push('Invalid maker asset address');
  }

  if (!ethers.utils.isAddress(order.takerAsset)) {
    errors.push('Invalid taker asset address');
  }

  // Check amounts
  try {
    const makerAmount = ethers.BigNumber.from(order.makerAmount);
    if (makerAmount.lte(0)) {
      errors.push('Maker amount must be greater than 0');
    }
  } catch {
    errors.push('Invalid maker amount format');
  }

  try {
    const takerAmount = ethers.BigNumber.from(order.takerAmount);
    if (takerAmount.lte(0)) {
      errors.push('Taker amount must be greater than 0');
    }
  } catch {
    errors.push('Invalid taker amount format');
  }

  // Validate interactions (should be valid hex)
  if (order.interactions && !ethers.utils.isHexString(order.interactions)) {
    errors.push('Interactions must be valid hex string');
  }

  const isValid = errors.length === 0;
  
  logger.debug('Order validation result', { isValid, errors, order });
  
  return { isValid, errors };
}

/**
 * Converts a Dutch auction order to limit order format
 */
export function convertDutchAuctionToLimitOrder(dutchOrder: DutchAuctionOrder): LimitOrder {
  try {
    // For Dutch auctions, calculate current price based on time progression
    const currentTime = Math.floor(Date.now() / 1000);
    const progress = Math.min(
      Math.max((currentTime - dutchOrder.startTime) / (dutchOrder.endTime - dutchOrder.startTime), 0),
      1
    );
    
    const startAmount = ethers.BigNumber.from(dutchOrder.startAmount);
    const endAmount = ethers.BigNumber.from(dutchOrder.endAmount);
    const currentAmount = startAmount.sub(
      startAmount.sub(endAmount).mul(Math.floor(progress * 10000)).div(10000)
    );

    const limitOrder: LimitOrder = {
      salt: dutchOrder.salt,
      maker: dutchOrder.maker,
      receiver: dutchOrder.maker, // For simplicity, maker is also receiver
      makerAsset: dutchOrder.makerAsset,
      takerAsset: dutchOrder.takerAsset,
      makerAmount: dutchOrder.startAmount, // Original maker amount
      takerAmount: currentAmount.toString(), // Current Dutch auction price
      interactions: '0x' // No interactions for basic orders
    };

    logger.debug('Converted Dutch auction to limit order', {
      dutchOrder: dutchOrder.orderHash,
      limitOrder,
      progress,
      currentAmount: currentAmount.toString()
    });

    return limitOrder;
  } catch (error) {
    logger.error('Failed to convert Dutch auction order', { error, dutchOrder });
    throw new Error(`Dutch auction conversion failed: ${error}`);
  }
}

/**
 * Parses signature string into components
 */
export function parseSignature(signature: string): OrderSignature {
  try {
    // Remove 0x prefix if present
    const cleanSig = signature.startsWith('0x') ? signature.slice(2) : signature;
    
    if (cleanSig.length !== 130) {
      throw new Error('Invalid signature length');
    }

    const r = '0x' + cleanSig.slice(0, 64);
    const s = '0x' + cleanSig.slice(64, 128);
    const v = parseInt(cleanSig.slice(128, 130), 16);

    return { v, r, s };
  } catch (error) {
    logger.error('Failed to parse signature', { error, signature });
    throw new Error(`Signature parsing failed: ${error}`);
  }
}

/**
 * Comprehensive order verification function
 */
export function verifyOrder(
  order: LimitOrder,
  signature: string,
  network: NetworkName = 'ethereum'
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate order structure
  const validation = validateOrderData(order);
  if (!validation.isValid) {
    errors.push(...validation.errors);
  }

  // Verify signature
  try {
    const signatureValid = verifyOrderSignature(order, signature, order.maker, network);
    if (!signatureValid) {
      errors.push('Invalid signature');
    }
  } catch (error) {
    errors.push(`Signature verification failed: ${error}`);
  }

  const isValid = errors.length === 0;
  
  logger.info('Complete order verification', {
    isValid,
    errors,
    orderHash: generateOrderHash(order, network),
    maker: order.maker,
    network
  });

  return { isValid, errors };
}

/**
 * Get network name from chain ID
 */
export function getNetworkFromChainId(chainId: number): NetworkName {
  switch (chainId) {
    case config.chainIds.ethereum:
      return 'ethereum';
    case config.chainIds.sepolia:
      return 'sepolia';
    default:
      logger.warn('Unknown chain ID, defaulting to ethereum', { chainId });
      return 'ethereum';
  }
}

/**
 * Get available networks configuration
 */
export function getAvailableNetworks() {
  return {
    ethereum: {
      chainId: config.chainIds.ethereum,
      contract: config.contracts.ethereum
    },
    sepolia: {
      chainId: config.chainIds.sepolia,
      contract: config.contracts.sepolia
    }
  };
}

/**
 * Validate network configuration
 */
export function validateNetworkConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if all required environment variables are set
  if (!config.protocolName) {
    errors.push('LIMIT_ORDER_PROTOCOL_NAME not configured');
  }

  if (!config.protocolVersion) {
    errors.push('LIMIT_ORDER_PROTOCOL_VERSION not configured');
  }

  // Check contracts
  Object.entries(config.contracts).forEach(([network, contract]) => {
    if (!ethers.utils.isAddress(contract)) {
      errors.push(`Invalid contract address for ${network}: ${contract}`);
    }
  });

  // Check chain IDs
  Object.entries(config.chainIds).forEach(([network, chainId]) => {
    if (!chainId || chainId <= 0) {
      errors.push(`Invalid chain ID for ${network}: ${chainId}`);
    }
  });

  const isValid = errors.length === 0;
  
  if (!isValid) {
    logger.error('Network configuration validation failed', { errors });
  } else {
    logger.info('Network configuration validated successfully', { config });
  }

  return { isValid, errors };
}

// Initialize and validate configuration on module load
const configValidation = validateNetworkConfig();
if (!configValidation.isValid) {
  logger.warn('Signature verification module loaded with configuration errors', {
    errors: configValidation.errors
  });
}
