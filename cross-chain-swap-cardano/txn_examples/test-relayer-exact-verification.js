#!/usr/bin/env node

/**
 * Test that mimics the exact signature verification process used by the relayer
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import the exact verification functions from the relayer
const relayerPath = path.join(__dirname, '../../relayer-service/dist/utils/signatureVerification');
const { verifyOrderSignature, generateOrderHash, getDomainData } = require(relayerPath);

// Import ethers v5 from relayer and v6 for comparison
const ethersV5Path = path.join(__dirname, '../../relayer-service/node_modules/ethers');
const { ethers: ethersV5 } = require(ethersV5Path);
const { ethers: ethersV6 } = require('ethers');

class RelayerExactVerificationTest {
    constructor() {
        this.walletV5 = new ethersV5.Wallet(process.env.ETHEREUM_PRIVATE_KEY);
        this.walletV6 = new ethersV6.Wallet(process.env.ETHEREUM_PRIVATE_KEY);
        
        // Get the exact domain data from the relayer
        this.domain = getDomainData('sepolia');
        
        this.testOrder = {
            salt: '123123123',
            maker: this.walletV5.address,
            receiver: this.walletV5.address,
            makerAsset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
            takerAsset: '0x0000000000000000000000000000000000000000', // ETH
            makerAmount: '100000000', // 100 USDC
            takerAmount: '50000000000000000', // 0.05 ETH
            interactions: '0x'
        };
    }

    async testSignatureWithRelayerVerification() {
        console.log('🔄 Testing signature generation and relayer verification...');
        console.log(`Domain used by relayer: ${JSON.stringify(this.domain, null, 2)}`);
        
        try {
            // Generate order hash using relayer's method
            const orderHash = generateOrderHash(this.testOrder, 'sepolia');
            console.log(`Order hash (from relayer): ${orderHash}`);
            
            // Test ethers v5 signature
            console.log('\\n--- Ethers v5 signature test ---');
            const v5Signature = await this.walletV5._signTypedData(
                this.domain, 
                {
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
                }, 
                this.testOrder
            );
            
            console.log(`v5 Signature: ${v5Signature}`);
            
            // Test with relayer's verification function
            const v5RelayerVerified = verifyOrderSignature(
                this.testOrder,
                v5Signature,
                this.walletV5.address,
                'sepolia'
            );
            console.log(`Relayer verification result: ${v5RelayerVerified}`);
            
            // Test ethers v6 signature  
            console.log('\\n--- Ethers v6 signature test ---');
            const v6Signature = await this.walletV6.signTypedData(
                this.domain,
                {
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
                },
                this.testOrder
            );
            
            console.log(`v6 Signature: ${v6Signature}`);
            
            // Test with relayer's verification function
            const v6RelayerVerified = verifyOrderSignature(
                this.testOrder,
                v6Signature, 
                this.walletV6.address,
                'sepolia'
            );
            console.log(`Relayer verification result: ${v6RelayerVerified}`);
            
            // Show comparison
            console.log('\\n--- Comparison ---');
            console.log(`v5 and v6 signatures match: ${v5Signature === v6Signature}`);
            console.log(`v5 relayer verified: ${v5RelayerVerified}`);
            console.log(`v6 relayer verified: ${v6RelayerVerified}`);
            
            // If both failed, let's debug more
            if (!v5RelayerVerified && !v6RelayerVerified) {
                console.log('\\n--- Deep debugging ---');
                
                // Try manual verification with ethers v5 utils
                try {
                    const manualV5Recovered = ethersV5.utils.verifyTypedData(
                        this.domain,
                        {
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
                        },
                        this.testOrder,
                        v5Signature
                    );
                    console.log(`Manual v5 recovery result: ${manualV5Recovered}`);
                    console.log(`Manual v5 matches wallet: ${manualV5Recovered.toLowerCase() === this.walletV5.address.toLowerCase()}`);
                } catch (error) {
                    console.log(`Manual v5 verification error: ${error.message}`);
                }
            }
            
            return v5RelayerVerified || v6RelayerVerified;
            
        } catch (error) {
            console.log(`Error: ${error.message}`);
            console.log(error.stack);
            return false;
        }
    }

    async runTest() {
        console.log('🧪 RELAYER EXACT VERIFICATION TEST');
        console.log('==================================');
        console.log(`Wallet address: ${this.walletV5.address}`);
        
        const success = await this.testSignatureWithRelayerVerification();
        
        console.log('\\n📊 RESULTS');
        console.log('==========');
        console.log(`Relayer verification: ${success ? 'SUCCESS' : 'FAILED'}`);
        
        if (success) {
            console.log('\\n🎉 SUCCESS! We found a working signature method.');
        } else {
            console.log('\\n⚠️  Still failing. The issue might be deeper in the relayer logic.');
        }
        
        return success;
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const test = new RelayerExactVerificationTest();
    test.runTest()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test failed:', error);
            process.exit(1);
        });
}

module.exports = { RelayerExactVerificationTest };
