import { ethers } from 'ethers';
import { 
  verifyOrder, 
  generateOrderHash, 
  validateOrderData,
  parseSignature,
  getNetworkFromChainId,
  LimitOrder,
  NetworkName
} from '../signatureVerification';

describe('Signature Verification', () => {
  let wallet: ethers.Wallet;
  let validOrder: LimitOrder;
  let validSignature: string;

  beforeAll(() => {
    // Create a test wallet
    wallet = ethers.Wallet.createRandom();
    
    validOrder = {
      salt: '12345',
      maker: wallet.address,
      receiver: wallet.address,
      makerAsset: '0xA0b86a33E6441b8b4C862d2B9b8a9E0C6C59D8C0',
      takerAsset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      makerAmount: ethers.utils.parseEther('100').toString(),
      takerAmount: ethers.utils.parseEther('0.1').toString(),
      interactions: '0x'
    };
  });

  describe('generateOrderHash', () => {
    it('should generate a valid hash for a limit order', () => {
      const orderHash = generateOrderHash(validOrder, 'ethereum');
      expect(orderHash).toBeDefined();
      expect(orderHash.length).toBe(66); // 0x + 64 hex chars
      expect(orderHash.startsWith('0x')).toBe(true);
    });

    it('should generate consistent hashes for the same order', () => {
      const hash1 = generateOrderHash(validOrder, 'ethereum');
      const hash2 = generateOrderHash(validOrder, 'ethereum');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different networks', () => {
      const ethHash = generateOrderHash(validOrder, 'ethereum');
      const sepoliaHash = generateOrderHash(validOrder, 'sepolia');
      expect(ethHash).not.toBe(sepoliaHash);
    });

    it('should throw error for unsupported network', () => {
      expect(() => {
        generateOrderHash(validOrder, 'unsupported' as NetworkName);
      }).toThrow('Unsupported network: unsupported');
    });
  });

  describe('validateOrderData', () => {
    it('should validate a valid order', () => {
      const result = validateOrderData(validOrder);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject order with invalid maker address', () => {
      const invalidOrder = { ...validOrder, maker: 'invalid_address' };
      const result = validateOrderData(invalidOrder);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid maker address');
    });

    it('should reject order with zero maker amount', () => {
      const invalidOrder = { ...validOrder, makerAmount: '0' };
      const result = validateOrderData(invalidOrder);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Maker amount must be greater than 0');
    });

    it('should reject order with invalid taker amount format', () => {
      const invalidOrder = { ...validOrder, takerAmount: 'invalid' };
      const result = validateOrderData(invalidOrder);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid taker amount format');
    });

    it('should reject order with missing salt', () => {
      const invalidOrder = { ...validOrder, salt: '' };
      const result = validateOrderData(invalidOrder);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid or missing salt');
    });

    it('should reject order with invalid interactions', () => {
      const invalidOrder = { ...validOrder, interactions: 'not_hex' };
      const result = validateOrderData(invalidOrder);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Interactions must be valid hex string');
    });
  });

  describe('parseSignature', () => {
    const validSigString = '0x' + '1'.repeat(64) + '2'.repeat(64) + '1b';

    it('should parse a valid signature', () => {
      const parsed = parseSignature(validSigString);
      expect(parsed.v).toBe(27);
      expect(parsed.r).toBe('0x' + '1'.repeat(64));
      expect(parsed.s).toBe('0x' + '2'.repeat(64));
    });

    it('should parse signature without 0x prefix', () => {
      const sigWithoutPrefix = '1'.repeat(64) + '2'.repeat(64) + '1b';
      const parsed = parseSignature(sigWithoutPrefix);
      expect(parsed.v).toBe(27);
      expect(parsed.r).toBe('0x' + '1'.repeat(64));
      expect(parsed.s).toBe('0x' + '2'.repeat(64));
    });

    it('should throw error for invalid signature length', () => {
      const invalidSig = '0x' + '1'.repeat(100);
      expect(() => parseSignature(invalidSig)).toThrow('Invalid signature length');
    });
  });

  describe('getNetworkFromChainId', () => {
    it('should return ethereum for chain ID 1', () => {
      expect(getNetworkFromChainId(1)).toBe('ethereum');
    });

    it('should return sepolia for chain ID 11155111', () => {
      expect(getNetworkFromChainId(11155111)).toBe('sepolia');
    });


    it('should return ethereum for unknown chain ID', () => {
      expect(getNetworkFromChainId(999999)).toBe('ethereum');
    });
  });

  describe('verifyOrder', () => {
    it('should reject order with invalid signature', () => {
      const mockSignature = '0x' + '0'.repeat(130);
      const result = verifyOrder(validOrder, mockSignature, 'ethereum');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid signature');
    });

    it('should reject order with invalid data and signature', () => {
      const invalidOrder = { ...validOrder, maker: 'invalid' };
      const mockSignature = '0x' + '0'.repeat(130);
      const result = verifyOrder(invalidOrder, mockSignature, 'ethereum');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain('Invalid maker address');
      expect(result.errors).toContain('Invalid signature');
    });
  });
});
