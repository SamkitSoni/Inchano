#!/usr/bin/env node

/**
 * Complete Relayer Service Debug Test
 * 
 * This test systematically checks every component of the relayer service
 * to identify exactly where the signature verification is failing.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { ethers } = require('ethers');
const fetch = require('node-fetch');

// Import relayer components
const relayerPath = path.join(__dirname, '../../relayer-service/dist');
const { OrderProcessingService } = require(path.join(relayerPath, 'services/OrderService'));
const { verifyOrder, generateOrderHash, getDomainData } = require(path.join(relayerPath, 'utils/signatureVerification'));

class RelayerDebugSuite {
    constructor() {
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
        // Generate unique salt for each test run to avoid "Order already exists" error
        const uniqueSalt = Math.floor(Date.now() * Math.random()).toString();
        this.limitOrder = {
            salt: uniqueSalt,
            maker: this.wallet.address,
            receiver: this.wallet.address,
            makerAsset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
            takerAsset: '0x0000000000000000000000000000000000000000',
            makerAmount: '100000000',
            takerAmount: '50000000000000000',
            interactions: '0x'
        };
    }

    async step1_VerifySignatureGeneration() {
        console.log('\n🔍 STEP 1: Verify Signature Generation');
        console.log('=====================================');
        
        try {
            // Generate signature
            const signature = await this.wallet.signTypedData(this.domain, this.types, this.limitOrder);
            console.log(`✅ Signature generated: ${signature}`);
            
            // Verify with ethers v6
            const recovered = ethers.verifyTypedData(this.domain, this.types, this.limitOrder, signature);
            console.log(`✅ Expected signer: ${this.wallet.address}`);
            console.log(`✅ Recovered signer: ${recovered}`);
            console.log(`✅ Verification: ${recovered.toLowerCase() === this.wallet.address.toLowerCase()}`);
            
            return signature;
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            return null;
        }
    }

    async step2_VerifyRelayerDomainConfig() {
        console.log('\n🔍 STEP 2: Verify Relayer Domain Configuration');
        console.log('==============================================');
        
        try {
            const relayerDomain = getDomainData('sepolia');
            console.log(`✅ Relayer domain: ${JSON.stringify(relayerDomain, null, 2)}`);
            
            const domainMatches = JSON.stringify(this.domain) === JSON.stringify(relayerDomain);
            console.log(`✅ Domain configuration matches: ${domainMatches}`);
            
            if (!domainMatches) {
                console.log('❌ MISMATCH FOUND:');
                console.log('   Client domain:', this.domain);
                console.log('   Relayer domain:', relayerDomain);
            }
            
            return relayerDomain;
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            return null;
        }
    }

    async step3_VerifyOrderHashGeneration(relayerDomain) {
        console.log('\n🔍 STEP 3: Verify Order Hash Generation');
        console.log('=======================================');
        
        try {
            const clientHash = ethers.TypedDataEncoder.hash(this.domain, this.types, this.limitOrder);
            console.log(`✅ Client-generated hash: ${clientHash}`);
            
            const relayerHash = generateOrderHash(this.limitOrder, 'sepolia');
            console.log(`✅ Relayer-generated hash: ${relayerHash}`);
            
            const hashMatches = clientHash === relayerHash;
            console.log(`✅ Order hashes match: ${hashMatches}`);
            
            if (!hashMatches) {
                console.log('❌ HASH MISMATCH FOUND - this is likely the root cause!');
            }
            
            return { clientHash, relayerHash, hashMatches };
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            return null;
        }
    }

    async step4_VerifyRelayerSignatureVerification(signature) {
        console.log('\n🔍 STEP 4: Verify Relayer Signature Verification');
        console.log('================================================');
        
        try {
            const verification = verifyOrder(this.limitOrder, signature, 'sepolia');
            console.log(`✅ Relayer verification result: ${JSON.stringify(verification, null, 2)}`);
            
            return verification.isValid;
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            return false;
        }
    }

    async step5_VerifyOrderProcessingService(signature) {
        console.log('\n🔍 STEP 5: Verify OrderProcessingService');
        console.log('========================================');
        
        try {
            const orderParams = {
                maker: this.limitOrder.maker,
                receiver: this.limitOrder.receiver,
                makerAsset: this.limitOrder.makerAsset,
                takerAsset: this.limitOrder.takerAsset,
                makerAmount: this.limitOrder.makerAmount,
                takerAmount: this.limitOrder.takerAmount,
                startPrice: '50000000000000000',
                endPrice: '50000000000000000',
                auctionStartTime: Math.floor(Date.now() / 1000),
                auctionEndTime: Math.floor(Date.now() / 1000) + 600,
                signature: signature,
                salt: this.limitOrder.salt
            };
            
            const service = new OrderProcessingService();
            const result = await service.processLimitOrder(orderParams);
            
            console.log(`✅ OrderProcessingService result: ${JSON.stringify(result, null, 2)}`);
            
            return result.success;
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            return false;
        }
    }

    async step6_VerifyHTTPAPIRequest(signature) {
        console.log('\n🔍 STEP 6: Verify HTTP API Request');
        console.log('==================================');
        
        try {
            const orderData = {
                salt: this.limitOrder.salt,
                maker: this.limitOrder.maker,
                receiver: this.limitOrder.receiver,
                makerAsset: this.limitOrder.makerAsset,
                takerAsset: this.limitOrder.takerAsset,
                makerAmount: this.limitOrder.makerAmount,
                takerAmount: this.limitOrder.takerAmount,
                signature: signature,
                startTime: Math.floor(Date.now() / 1000),
                endTime: Math.floor(Date.now() / 1000) + 600,
                startPrice: '50000000000000000',
                endPrice: '50000000000000000',
                auctionStartTime: Math.floor(Date.now() / 1000),
                auctionEndTime: Math.floor(Date.now() / 1000) + 600
            };

            console.log(`📤 Sending request with data: ${JSON.stringify(orderData, null, 2)}`);

            const response = await fetch('http://localhost:3001/api/orders', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(orderData)
            });

            const result = await response.json();
            
            console.log(`📥 Response status: ${response.status}`);
            console.log(`📥 Response body: ${JSON.stringify(result, null, 2)}`);
            
            return response.ok && result.data;
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            return false;
        }
    }

    async step7_CompareSignatureBytes(signature) {
        console.log('\n🔍 STEP 7: Compare Signature Bytes');
        console.log('==================================');
        
        try {
            // Parse signature components
            const sig = ethers.Signature.from(signature);
            console.log(`✅ Signature components:`);
            console.log(`   r: ${sig.r}`);
            console.log(`   s: ${sig.s}`);
            console.log(`   v: ${sig.v}`);
            console.log(`   Full signature: ${signature}`);
            console.log(`   Length: ${signature.length}`);
            console.log(`   Is valid format: ${/^0x[0-9a-fA-F]{130}$/.test(signature)}`);
            
            return true;
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            return false;
        }
    }

    async runComprehensiveDebug() {
        console.log('🚀 COMPREHENSIVE RELAYER DEBUG SUITE');
        console.log('====================================');
        console.log(`Wallet address: ${this.wallet.address}`);
        console.log(`Test order salt: ${this.limitOrder.salt}`);
        
        const results = {};
        
        // Step 1: Generate signature
        const signature = await this.step1_VerifySignatureGeneration();
        results.signatureGeneration = !!signature;
        
        if (!signature) {
            console.log('\n❌ FATAL: Cannot proceed without valid signature');
            return results;
        }
        
        // Step 2: Verify domain config
        const relayerDomain = await this.step2_VerifyRelayerDomainConfig();
        results.domainConfig = !!relayerDomain;
        
        // Step 3: Verify hash generation
        const hashResult = await this.step3_VerifyOrderHashGeneration(relayerDomain);
        results.hashGeneration = hashResult?.hashMatches || false;
        
        // Step 4: Verify relayer signature verification
        const relayerVerification = await this.step4_VerifyRelayerSignatureVerification(signature);
        results.relayerVerification = relayerVerification;
        
        // Step 5: Verify OrderProcessingService
        const serviceResult = await this.step5_VerifyOrderProcessingService(signature);
        results.orderProcessingService = serviceResult;
        
        // Step 6: Verify HTTP API
        const httpResult = await this.step6_VerifyHTTPAPIRequest(signature);
        results.httpAPI = httpResult;
        
        // Step 7: Compare signature bytes
        const signatureAnalysis = await this.step7_CompareSignatureBytes(signature);
        results.signatureAnalysis = signatureAnalysis;
        
        // Final analysis
        console.log('\n📊 COMPREHENSIVE DEBUG RESULTS');
        console.log('==============================');
        Object.entries(results).forEach(([step, success]) => {
            console.log(`${success ? '✅' : '❌'} ${step}: ${success ? 'PASS' : 'FAIL'}`);
        });
        
        console.log('\n🔍 ROOT CAUSE ANALYSIS');
        console.log('=====================');
        
        if (!results.domainConfig) {
            console.log('❌ ISSUE: Domain configuration mismatch between client and relayer');
        } else if (!results.hashGeneration) {
            console.log('❌ ISSUE: Order hash generation differs between client and relayer');
        } else if (!results.relayerVerification) {
            console.log('❌ ISSUE: Relayer signature verification function is broken');
        } else if (!results.orderProcessingService) {
            console.log('❌ ISSUE: OrderProcessingService has internal problems');
        } else if (!results.httpAPI) {
            console.log('❌ ISSUE: HTTP API layer is corrupting or mishandling requests');
        } else {
            console.log('✅ All components work individually - check for timing or state issues');
        }
        
        return results;
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const debugSuite = new RelayerDebugSuite();
    debugSuite.runComprehensiveDebug()
        .then(results => {
            const allPassed = Object.values(results).every(result => result === true);
            process.exit(allPassed ? 0 : 1);
        })
        .catch(error => {
            console.error('Debug suite failed:', error);
            process.exit(1);
        });
}

module.exports = { RelayerDebugSuite };
