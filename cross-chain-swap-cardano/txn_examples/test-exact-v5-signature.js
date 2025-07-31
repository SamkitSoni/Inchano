#!/usr/bin/env node

/**
 * Test script to generate signatures using exact ethers v5 method
 * by temporarily using relayer's ethers v5 installation
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import ethers v5 from the relayer service
const ethersV5Path = path.join(__dirname, '../../relayer-service/node_modules/ethers');
const { ethers: ethersV5 } = require(ethersV5Path);

// Also import ethers v6 for comparison
const { ethers: ethersV6 } = require('ethers');

class ExactV5SignatureTest {
    constructor() {
        // Create wallets with both versions
        this.walletV5 = new ethersV5.Wallet(process.env.ETHEREUM_PRIVATE_KEY);
        this.walletV6 = new ethersV6.Wallet(process.env.ETHEREUM_PRIVATE_KEY);
        
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
            salt: '987654321',
            maker: this.walletV5.address,
            receiver: this.walletV5.address,
            makerAsset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
            takerAsset: '0x0000000000000000000000000000000000000000', // ETH
            makerAmount: '100000000', // 100 USDC
            takerAmount: '50000000000000000', // 0.05 ETH
            interactions: '0x'
        };
    }

    async testEthersV5Signature() {
        console.log('🔄 Testing signature with ethers v5 (_signTypedData)...');
        try {
            // Use the exact method that ethers v5 uses internally
            const signature = await this.walletV5._signTypedData(this.domain, this.types, this.testOrder);
            
            console.log(`   Signature: ${signature}`);
            console.log(`   Length: ${signature.length}`);
            
            // Verify with ethers v5
            const recoveredV5 = ethersV5.utils.verifyTypedData(this.domain, this.types, this.testOrder, signature);
            console.log(`   Expected: ${this.walletV5.address}`);
            console.log(`   Recovered (v5): ${recoveredV5}`);
            console.log(`   Match (v5): ${recoveredV5.toLowerCase() === this.walletV5.address.toLowerCase()}`);
            
            // Also test with ethers v6 verification
            try {
                const recoveredV6 = ethersV6.verifyTypedData(this.domain, this.types, this.testOrder, signature);
                console.log(`   Recovered (v6): ${recoveredV6}`);
                console.log(`   Match (v6): ${recoveredV6.toLowerCase() === this.walletV5.address.toLowerCase()}`);
            } catch (v6Error) {
                console.log(`   V6 verification failed: ${v6Error.message}`);
            }
            
            return signature;
        } catch (error) {
            console.log(`   Error: ${error.message}`);
            return null;
        }
    }

    async testEthersV6SignatureForComparison() {
        console.log('\\n🔄 Testing signature with ethers v6 (signTypedData)...');
        try {
            const signature = await this.walletV6.signTypedData(this.domain, this.types, this.testOrder);
            
            console.log(`   Signature: ${signature}`);
            console.log(`   Length: ${signature.length}`);
            
            // Verify with ethers v6
            const recoveredV6 = ethersV6.verifyTypedData(this.domain, this.types, this.testOrder, signature);
            console.log(`   Expected: ${this.walletV6.address}`);
            console.log(`   Recovered (v6): ${recoveredV6}`);
            console.log(`   Match (v6): ${recoveredV6.toLowerCase() === this.walletV6.address.toLowerCase()}`);
            
            // Also test with ethers v5 verification
            try {
                const recoveredV5 = ethersV5.utils.verifyTypedData(this.domain, this.types, this.testOrder, signature);
                console.log(`   Recovered (v5): ${recoveredV5}`);
                console.log(`   Match (v5): ${recoveredV5.toLowerCase() === this.walletV6.address.toLowerCase()}`);
            } catch (v5Error) {
                console.log(`   V5 verification failed: ${v5Error.message}`);
            }
            
            return signature;
        } catch (error) {
            console.log(`   Error: ${error.message}`);
            return null;
        }
    }

    async testWithRelayer(signature, methodName) {
        console.log(`\\n🌐 Testing ${methodName} with relayer...`);
        try {
            const fetch = require('node-fetch');
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

            const response = await fetch('http://localhost:3001/api/orders', {
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

    async runTest() {
        console.log('🧪 EXACT ETHERS V5 SIGNATURE TEST');
        console.log('=================================');
        console.log(`Wallet address: ${this.walletV5.address}`);
        console.log(`Ethers v5 version: ${ethersV5.version}`);
        console.log(`Ethers v6 version: ${ethersV6.version}`);
        
        // Test both signature methods
        const v5Signature = await this.testEthersV5Signature();
        const v6Signature = await this.testEthersV6SignatureForComparison();
        
        // Test with relayer
        console.log('\\n🌐 RELAYER COMPATIBILITY TESTS');
        console.log('===============================');
        
        let v5Success = false;
        let v6Success = false;
        
        if (v5Signature) {
            v5Success = await this.testWithRelayer(v5Signature, 'Ethers v5 (_signTypedData)');
        }
        
        if (v6Signature) {
            v6Success = await this.testWithRelayer(v6Signature, 'Ethers v6 (signTypedData)');
        }
        
        console.log('\\n📊 RESULTS');
        console.log('==========');
        console.log(`✅ Ethers v5 signature: ${v5Success ? 'WORKS' : 'FAILED'}`);
        console.log(`✅ Ethers v6 signature: ${v6Success ? 'WORKS' : 'FAILED'}`);
        
        if (v5Success) {
            console.log('\\n🎉 SUCCESS! Ethers v5 signature works with the relayer.');
            console.log('We can now use this method for generating compatible signatures.');
        } else if (v6Success) {
            console.log('\\n🎉 SUCCESS! Ethers v6 signature works with the relayer.');
        } else {
            console.log('\\n⚠️  Neither signature method worked. Need further investigation.');
        }
        
        return v5Success || v6Success;
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const test = new ExactV5SignatureTest();
    test.runTest()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test failed:', error);
            process.exit(1);
        });
}

module.exports = { ExactV5SignatureTest };
