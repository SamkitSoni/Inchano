#!/usr/bin/env node

/**
 * Direct Signature Compatibility Test
 * 
 * This script tests different signature methods to ensure compatibility
 * between ethers v6 (client) and ethers v5 (relayer).
 */

const { ethers } = require('ethers');
const fetch = require('node-fetch');
const path = require('path');

// Load .env from parent directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

class SignatureCompatibilityTest {
    constructor() {
        this.relayerBaseUrl = 'http://localhost:3001';
        this.wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY);
        this.domain = {
            name: '1inch Limit Order Protocol',
            version: '4',
            chainId: 11155111, // Sepolia
            verifyingContract: '0x7b728d06b49DB49b0858397fDBe48bC57a814AF0'
        };
        this.types = {
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
        this.testOrder = {
            salt: '123456789',
            maker: this.wallet.address,
            receiver: this.wallet.address,
            makerAsset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
            takerAsset: '0x0000000000000000000000000000000000000000', // ETH
            makerAmount: '100000000', // 100 USDC
            takerAmount: '50000000000000000', // 0.05 ETH
            interactions: '0x'
        };
    }

    async testSignatureMethod1_StandardEthersV6() {
        console.log('\n🔄 Method 1: Standard ethers v6 signTypedData');
        try {
            const signature = await this.wallet.signTypedData(this.domain, this.types, this.testOrder);
            console.log(`   Signature: ${signature}`);
            
            // Verify with ethers v6
            const recovered = ethers.verifyTypedData(this.domain, this.types, this.testOrder, signature);
            console.log(`   Expected: ${this.wallet.address}`);
            console.log(`   Recovered: ${recovered}`);
            console.log(`   Match: ${recovered.toLowerCase() === this.wallet.address.toLowerCase()}`);
            
            return signature;
        } catch (error) {
            console.log(`   Error: ${error.message}`);
            return null;
        }
    }

    async testSignatureMethod2_TypedDataHash() {
        console.log('\n🔄 Method 2: Using TypedDataEncoder.hash');
        try {
            const hash = ethers.TypedDataEncoder.hash(this.domain, this.types, this.testOrder);
            const signature = await this.wallet.signMessage(ethers.getBytes(hash));
            console.log(`   Hash: ${hash}`);
            console.log(`   Signature: ${signature}`);
            
            // Test verification with standard method
            try {
                const recovered = ethers.verifyTypedData(this.domain, this.types, this.testOrder, signature);
                console.log(`   Recovered: ${recovered}`);
                console.log(`   Match: ${recovered.toLowerCase() === this.wallet.address.toLowerCase()}`);
            } catch (verifyError) {
                console.log(`   Verification failed: ${verifyError.message}`);
            }
            
            return signature;
        } catch (error) {
            console.log(`   Error: ${error.message}`);
            return null;
        }
    }

    async testSignatureMethod3_ManualV5Style() {
        console.log('\n🔄 Method 3: Manual ethers v5 style');
        try {
            // Manual construction as ethers v5 would do it
            const domainSeparator = ethers.TypedDataEncoder.hashDomain(this.domain);
            const structHash = ethers.keccak256(ethers.TypedDataEncoder.encode(this.types, 'Order', this.testOrder));
            
            const digest = ethers.keccak256(
                ethers.concat([
                    '0x1901',
                    domainSeparator,
                    structHash
                ])
            );
            
            const signature = await this.wallet.signMessage(ethers.getBytes(digest));
            
            console.log(`   Domain separator: ${domainSeparator}`);
            console.log(`   Struct hash: ${structHash}`);
            console.log(`   Digest: ${digest}`);
            console.log(`   Signature: ${signature}`);
            
            // Test verification
            try {
                const recovered = ethers.verifyTypedData(this.domain, this.types, this.testOrder, signature);
                console.log(`   Recovered: ${recovered}`);
                console.log(`   Match: ${recovered.toLowerCase() === this.wallet.address.toLowerCase()}`);
            } catch (verifyError) {
                console.log(`   Standard verification failed: ${verifyError.message}`);
                
                // Try manual verification
                const manualRecovered = ethers.recoverAddress(digest, signature);
                console.log(`   Manual recovered: ${manualRecovered}`);
                console.log(`   Manual match: ${manualRecovered.toLowerCase() === this.wallet.address.toLowerCase()}`);
            }
            
            return signature;
        } catch (error) {
            console.log(`   Error: ${error.message}`);
            return null;
        }
    }

    async testWithRelayer(signature, methodName) {
        console.log(`\n🌐 Testing ${methodName} with relayer...`);
        try {
            const orderData = {
                ...this.testOrder,
                signature,
                startTime: Math.floor(Date.now() / 1000),
                endTime: Math.floor(Date.now() / 1000) + 600,
                startPrice: '50000000000000000',
                endPrice: '50000000000000000',
                auctionStartTime: Math.floor(Date.now() / 1000),
                auctionEndTime: Math.floor(Date.now() / 1000) + 600
            };

            const response = await fetch(`${this.relayerBaseUrl}/api/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            const result = await response.json();
            
            if (response.ok && result.data) {
                console.log(`   ✅ SUCCESS: Order created with hash ${result.data.orderHash}`);
                return true;
            } else {
                console.log(`   ❌ FAILED: ${result.error || 'Unknown error'}`);
                return false;
            }
        } catch (error) {
            console.log(`   ❌ ERROR: ${error.message}`);
            return false;
        }
    }

    async runFullCompatibilityTest() {
        console.log('🧪 SIGNATURE COMPATIBILITY TEST SUITE');
        console.log('=====================================');
        console.log(`Wallet address: ${this.wallet.address}`);
        console.log(`Domain: ${JSON.stringify(this.domain, null, 2)}`);
        
        // Test different signature methods
        const method1Sig = await this.testSignatureMethod1_StandardEthersV6();
        const method2Sig = await this.testSignatureMethod2_TypedDataHash();
        const method3Sig = await this.testSignatureMethod3_ManualV5Style();
        
        console.log('\n🌐 RELAYER COMPATIBILITY TESTS');
        console.log('===============================');
        
        const results = [];
        
        if (method1Sig) {
            const success = await this.testWithRelayer(method1Sig, 'Method 1 (Standard v6)');
            results.push({ method: 'Standard ethers v6', success });
        }
        
        if (method2Sig) {
            const success = await this.testWithRelayer(method2Sig, 'Method 2 (Hash)');
            results.push({ method: 'TypedDataEncoder.hash', success });
        }
        
        if (method3Sig) {
            const success = await this.testWithRelayer(method3Sig, 'Method 3 (Manual v5)');
            results.push({ method: 'Manual v5 style', success });
        }
        
        console.log('\n📊 RESULTS SUMMARY');
        console.log('==================');
        results.forEach((result, index) => {
            console.log(`${result.success ? '✅' : '❌'} ${result.method}: ${result.success ? 'WORKS' : 'FAILED'}`);
        });
        
        const workingMethods = results.filter(r => r.success);
        if (workingMethods.length > 0) {
            console.log(`\n🎉 Found ${workingMethods.length} working method(s)!`);
        } else {
            console.log('\n⚠️  No methods worked with the relayer. Need further debugging.');
        }
        
        return workingMethods.length > 0;
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const test = new SignatureCompatibilityTest();
    test.runFullCompatibilityTest()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test failed:', error);
            process.exit(1);
        });
}

module.exports = { SignatureCompatibilityTest };
