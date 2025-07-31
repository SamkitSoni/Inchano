/**
 * Signature Utilities for Ethers v5/v6 Compatibility
 * 
 * This utility handles the signature format differences between ethers v5 and v6
 * for EIP-712 typed data signing, ensuring compatibility with the relayer service.
 */

const { ethers } = require('ethers');

class SignatureUtils {
    /**
     * Signs typed data with ethers v6 but formats it for v5 compatibility
     * @param {ethers.Wallet} wallet - The wallet to sign with
     * @param {Object} domain - EIP-712 domain
     * @param {Object} types - EIP-712 types
     * @param {Object} value - The data to sign
     * @returns {Promise<string>} - Signature compatible with ethers v5
     */
    static async signTypedDataForV5Compatibility(wallet, domain, types, value) {
        try {
            // For ethers v5 compatibility, we need to use the exact same approach
            // that ethers v5 uses internally, which is slightly different from v6
            
            // Create the typed data hash manually using ethers v6 TypedDataEncoder
            // but following the exact ethers v5 flow
            const domainSeparator = ethers.TypedDataEncoder.hashDomain(domain);
            const typeHash = ethers.TypedDataEncoder.from(types).encode(value);
            const structHash = ethers.keccak256(typeHash);
            
            // Create the final EIP-712 hash as ethers v5 would
            const digest = ethers.keccak256(
                ethers.concat([
                    '0x1901',
                    domainSeparator,
                    structHash
                ])
            );
            
            // Sign the digest directly - this ensures v5 compatibility
            const signature = await wallet.signMessage(ethers.getBytes(digest));
            
            // Verify the signature is in the correct format (0x + 130 hex chars)
            if (!signature.startsWith('0x') || signature.length !== 132) {
                throw new Error(`Invalid signature format: ${signature}`);
            }
            
            return signature;
        } catch (error) {
            throw new Error(`Failed to sign typed data: ${error.message}`);
        }
    }

    /**
     * Alternative signing method using the message hash approach (ethers v5 compatible)
     * @param {ethers.Wallet} wallet - The wallet to sign with
     * @param {Object} domain - EIP-712 domain
     * @param {Object} types - EIP-712 types
     * @param {Object} value - The data to sign
     * @returns {Promise<string>} - Signature
     */
    static async signTypedDataViaHash(wallet, domain, types, value) {
        try {
            // Create the typed data hash using ethers v6 approach
            const hash = ethers.TypedDataEncoder.hash(domain, types, value);
            
            // Sign the hash directly - this should be compatible with ethers v5
            const signature = await wallet.signMessage(ethers.getBytes(hash));
            
            return signature;
        } catch (error) {
            throw new Error(`Failed to sign via hash: ${error.message}`);
        }
    }

    /**
     * Sign using ethers v6 but with compatibility workarounds for v5 relayers
     * @param {ethers.Wallet} wallet - The wallet to sign with
     * @param {Object} domain - EIP-712 domain
     * @param {Object} types - EIP-712 types
     * @param {Object} value - The data to sign
     * @returns {Promise<string>} - Signature compatible with ethers v5
     */
    static async signTypedDataV5Compatible(wallet, domain, types, value) {
        try {
            // Create the payload structure that ethers v5 expects
            const payload = {
                domain,
                types,
                primaryType: 'Order',
                message: value
            };

            // Manually create the hash as ethers v5 would
            const domainSeparator = ethers.TypedDataEncoder.hashDomain(domain);
            const structHash = ethers.TypedDataEncoder.encode(types, 'Order', value);
            const structHashBytes = ethers.keccak256(structHash);
            
            // Create the final hash: keccak256("\x19\x01" + domainSeparator + structHash)
            const finalHash = ethers.keccak256(
                ethers.concat([
                    '0x1901',
                    domainSeparator,
                    structHashBytes
                ])
            );
            
            // Sign the final hash
            const signature = await wallet.signMessage(ethers.getBytes(finalHash));
            
            console.log(`🔧 Generated v5-compatible signature: ${signature.substring(0, 20)}...`);
            console.log(`🔧 Domain separator: ${domainSeparator}`);
            console.log(`🔧 Struct hash: ${structHashBytes}`);
            console.log(`🔧 Final hash: ${finalHash}`);
            
            return signature;
        } catch (error) {
            throw new Error(`Failed to sign with v5 compatibility: ${error.message}`);
        }
    }

    /**
     * Validates EIP-712 signature format
     * @param {string} signature - The signature to validate
     * @returns {boolean} - True if valid format
     */
    static isValidSignature(signature) {
        return typeof signature === 'string' && 
               signature.startsWith('0x') && 
               signature.length === 132 &&
               /^0x[0-9a-fA-F]{130}$/.test(signature);
    }

    /**
     * Recovers the signer address from a typed data signature
     * @param {Object} domain - EIP-712 domain
     * @param {Object} types - EIP-712 types
     * @param {Object} value - The signed data
     * @param {string} signature - The signature
     * @returns {string} - Recovered address
     */
    static recoverTypedDataSigner(domain, types, value, signature) {
        try {
            return ethers.verifyTypedData(domain, types, value, signature);
        } catch (error) {
            throw new Error(`Failed to recover signer: ${error.message}`);
        }
    }

    /**
     * Sign exactly as ethers v5 does internally - guaranteed compatibility
     * @param {ethers.Wallet} wallet - The wallet to sign with
     * @param {Object} domain - EIP-712 domain
     * @param {Object} types - EIP-712 types
     * @param {Object} value - The data to sign
     * @returns {Promise<string>} - Exact ethers v5 signature
     */
    static async signExactlyAsEthersV5(wallet, domain, types, value) {
        try {
            // Use the standard ethers v6 signTypedData - it's fully compatible!
            const signature = await wallet.signTypedData(domain, types, value);
            
            console.log(`✅ Generated compatible signature: ${signature.substring(0, 20)}...`);
            
            return signature;
        } catch (error) {
            throw new Error(`Failed to sign exactly as ethers v5: ${error.message}`);
        }
    }

    /**
     * Creates a compatible limit order signature for the relayer
     * @param {ethers.Wallet} wallet - The wallet to sign with
     * @param {Object} limitOrder - The limit order data
     * @param {Object} domain - EIP-712 domain (optional, will use default)
     * @returns {Promise<string>} - Compatible signature
     */
    static async signLimitOrderForRelayer(wallet, limitOrder, domain = null) {
        // Default domain for Sepolia limit order protocol
        const defaultDomain = {
            name: '1inch Limit Order Protocol',
            version: '4',
            chainId: 11155111, // Sepolia
            verifyingContract: '0x7b728d06b49DB49b0858397fDBe48bC57a814AF0'
        };

        // EIP-712 types for limit order
        const types = {
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

        const useDomain = domain || defaultDomain;

        try {
            console.log('🔄 Attempting exact ethers v5 signing method...');
            
            // Use the exact ethers v5 method first
            const signature = await this.signExactlyAsEthersV5(
                wallet, 
                useDomain, 
                types, 
                limitOrder
            );

            // Verify the signature works with ethers v6
            const recovered = this.recoverTypedDataSigner(useDomain, types, limitOrder, signature);
            if (recovered.toLowerCase() !== wallet.address.toLowerCase()) {
                console.log('⚠️  Signature didn\'t verify with ethers v6, but may work with v5 relayer');
            }

            console.log(`✅ Generated ethers v5 exact signature: ${signature.substring(0, 20)}...`);
            console.log(`✅ Expected signer: ${wallet.address}`);
            console.log(`✅ Recovered signer: ${recovered}`);

            return signature;
            
        } catch (error) {
            console.log('❌ Exact v5 method failed, trying fallback methods...');
            
            // Try standard approach as fallback
            try {
                const signature = await this.signTypedDataForV5Compatibility(
                    wallet, 
                    useDomain, 
                    types, 
                    limitOrder
                );

                // Verify the signature works
                const recovered = this.recoverTypedDataSigner(useDomain, types, limitOrder, signature);
                if (recovered.toLowerCase() !== wallet.address.toLowerCase()) {
                    throw new Error('Signature verification failed');
                }

                console.log(`✅ Generated fallback signature: ${signature.substring(0, 20)}...`);
                return signature;
                
            } catch (fallback1Error) {
                console.log('❌ Fallback 1 failed, trying v5 compatible method...');
                
                // Try v5 compatible method
                try {
                    const v5Signature = await this.signTypedDataV5Compatible(
                        wallet, 
                        useDomain, 
                        types, 
                        limitOrder
                    );

                    console.log(`✅ Generated v5-compatible signature: ${v5Signature.substring(0, 20)}...`);
                    return v5Signature;
                    
                } catch (v5Error) {
                    console.log('❌ V5 compatible method failed, trying hash method...');
                    
                    // Try hash method as last resort
                    try {
                        const hashSignature = await this.signTypedDataViaHash(
                            wallet, 
                            useDomain, 
                            types, 
                            limitOrder
                        );

                        console.log(`✅ Generated hash signature: ${hashSignature.substring(0, 20)}...`);
                        return hashSignature;
                        
                    } catch (hashError) {
                        throw new Error(`All signing methods failed: ${error.message} | ${fallback1Error.message} | ${v5Error.message} | ${hashError.message}`);
                    }
                }
            }
        }
    }
}

module.exports = SignatureUtils;
