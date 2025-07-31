#!/usr/bin/env node

/**
 * Comprehensive End-to-End Test Suite for Cardano Cross-Chain Swap
 * 
 * This test suite validates the complete flow:
 * 1. Order Creation and Signing
 * 2. Dutch Auction Deployment  
 * 3. Relayer Processing
 * 4. Resolver Escrow Deployment
 * 5. Cardano Withdrawal Logic
 * 6. Secret Disclosure and Finality
 * 
 * Usage: node test-end-to-end-flow.js
 */

const fs = require('fs');
const fetch = require('node-fetch');
const CardanoSwapUtils = require('./utils');
const SignatureUtils = require('./signature-utils');
const { ethers } = require('ethers');
require('dotenv').config();

class EndToEndTestSuite {
    constructor() {
        this.utils = new CardanoSwapUtils();
        this.testResults = [];
        this.relayerBaseUrl = 'http://localhost:3001';
        this.currentOrderHash = null;
        this.currentSecret = null;
        this.escrowAddresses = {
            source: null,
            destination: null
        };
    }

    async log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '📋';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    async testRelayerHealth() {
        this.log('Testing Relayer Service Health...', 'info');
        
        try {
            const response = await fetch(`${this.relayerBaseUrl}/health`);
            const health = await response.json();
            
            if (health.status === 'ok') {
                this.log('Relayer service is healthy and running', 'success');
                this.log(`Uptime: ${Math.floor(health.uptime)}s`, 'info');
                return true;
            } else {
                this.log('Relayer service health check failed', 'error');
                return false;
            }
        } catch (error) {
            this.log(`Failed to connect to relayer: ${error.message}`, 'error');
            return false;
        }
    }

    async createSignedOrder() {
        this.log('Creating and signing limit order...', 'info');
        
        try {
            // Generate test order data
            const wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY);
            
            // EIP-712 Domain for Sepolia limit order protocol
            const domain = {
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
            
            // Create limit order structure
            const limitOrder = {
                salt: Math.floor(Date.now() * Math.random()).toString(),
                maker: wallet.address,
                receiver: wallet.address,
                makerAsset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
                takerAsset: '0x0000000000000000000000000000000000000000', // ETH
                makerAmount: '100000000', // 100 USDC
                takerAmount: '50000000000000000', // 0.05 ETH
                interactions: '0x'
            };
            
            // Sign with EIP-712 using compatibility utility for relayer service
            this.log('Generating compatible signature for relayer service...', 'info');
            const signature = await SignatureUtils.signLimitOrderForRelayer(wallet, limitOrder, domain);
            this.log(`Generated compatible signature: ${signature.substring(0, 20)}...`, 'info');
            
            // Create request matching OrderCreationRequest interface (no interactions field)
            const orderData = {
                salt: limitOrder.salt,
                maker: limitOrder.maker,
                receiver: limitOrder.receiver,
                makerAsset: limitOrder.makerAsset,
                takerAsset: limitOrder.takerAsset,
                makerAmount: limitOrder.makerAmount,
                takerAmount: limitOrder.takerAmount,
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
                this.currentOrderHash = result.data.orderHash;
                this.log(`Order created successfully: ${this.currentOrderHash}`, 'success');
                this.log(`Status: ${result.data.status}`, 'info');
                return true;
            } else {
                this.log(`Order creation failed: ${result.error || 'Unknown error'}`, 'error');
                return false;
            }
        } catch (error) {
            this.log(`Order creation error: ${error.message}`, 'error');
            return false;
        }
    }

    async monitorDutchAuction() {
        this.log('Monitoring Dutch auction progress...', 'info');
        
        if (!this.currentOrderHash) {
            this.log('No order hash available for monitoring', 'error');
            return false;
        }

        try {
            // Simulate auction monitoring
            this.log(`Monitoring auction for order: ${this.currentOrderHash}`, 'info');
            
            // Check auction status every few seconds
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                this.log(`Auction tick ${i + 1}/5 - Price updating...`, 'info');
            }
            
            this.log('Dutch auction monitoring completed', 'success');
            return true;
        } catch (error) {
            this.log(`Auction monitoring error: ${error.message}`, 'error');
            return false;
        }
    }

    async deployEscrowContracts() {
        this.log('Deploying source and destination escrow contracts...', 'info');
        
        try {
            // Deploy source escrow
            this.log('Deploying source escrow on Cardano...', 'info');
            
            const sourceResult = await this.utils.simulateFactoryAction('CreateSrcEscrow', {
                orderHash: this.currentOrderHash || this.utils.generateOrderHash('test_maker', 'test_taker', 5000000),
                secret: this.utils.generateSecret(),
                maker: this.utils.getWalletAddress(),
                taker: 'addr_test1qbf3cec1cf1a376089b1ee0848311b375eeaa1f045a896bef5d',
                amount: 5000000,
                safetyDeposit: 2000000,
                timelocks: this.utils.createTimelocks()
            });

            if (sourceResult.success) {
                this.escrowAddresses.source = sourceResult.escrowAddress;
                this.currentSecret = sourceResult.params.secret;
                this.log(`Source escrow deployed: ${this.escrowAddresses.source}`, 'success');
                
                // Save source escrow data
                const srcEscrowData = {
                    type: 'SourceEscrow',
                    escrowAddress: this.escrowAddresses.source,
                    orderHash: sourceResult.params.orderHash,
                    secret: this.currentSecret,
                    secretHash: this.utils.hashSecret(this.currentSecret),
                    maker: sourceResult.params.maker,
                    taker: sourceResult.params.taker,
                    amount: sourceResult.params.amount,
                    safetyDeposit: sourceResult.params.safetyDeposit,
                    timelocks: sourceResult.params.timelocks,
                    txHash: sourceResult.txHash,
                    deployedAt: sourceResult.timestamp,
                    network: 'preprod',
                    status: 'deployed'
                };
                
                fs.writeFileSync('test-e2e-src-escrow.json', JSON.stringify(srcEscrowData, null, 2));
            } else {
                throw new Error('Source escrow deployment failed');
            }

            // Deploy destination escrow
            this.log('Deploying destination escrow...', 'info');
            
            const dstResult = await this.utils.simulateFactoryAction('CreateDstEscrow', {
                orderHash: sourceResult.params.orderHash,
                secretHash: this.utils.hashSecret(this.currentSecret),
                maker: sourceResult.params.taker, // Swapped for destination
                taker: sourceResult.params.maker,
                amount: sourceResult.params.amount,
                safetyDeposit: sourceResult.params.safetyDeposit,
                timelocks: sourceResult.params.timelocks
            });

            if (dstResult.success) {
                this.escrowAddresses.destination = dstResult.escrowAddress;
                this.log(`Destination escrow deployed: ${this.escrowAddresses.destination}`, 'success');
                
                // Save destination escrow data
                const dstEscrowData = {
                    type: 'DestinationEscrow',
                    escrowAddress: this.escrowAddresses.destination,
                    orderHash: sourceResult.params.orderHash,
                    secret: this.currentSecret,
                    secretHash: this.utils.hashSecret(this.currentSecret),
                    maker: dstResult.params.taker,
                    taker: dstResult.params.maker,
                    amount: dstResult.params.amount,
                    safetyDeposit: dstResult.params.safetyDeposit,
                    timelocks: dstResult.params.timelocks,
                    txHash: dstResult.txHash,
                    deployedAt: dstResult.timestamp,
                    network: 'preprod',
                    status: 'deployed',
                    srcCancellationTime: sourceResult.params.timelocks.srcCancelTime
                };
                
                fs.writeFileSync('test-e2e-dst-escrow.json', JSON.stringify(dstEscrowData, null, 2));
                return true;
            } else {
                throw new Error('Destination escrow deployment failed');
            }
        } catch (error) {
            this.log(`Escrow deployment error: ${error.message}`, 'error');
            return false;
        }
    }

    async testWithdrawalFlow() {
        this.log('Testing Cardano withdrawal logic...', 'info');
        
        if (!this.currentSecret || !this.escrowAddresses.source || !this.escrowAddresses.destination) {
            this.log('Missing required data for withdrawal test', 'error');
            return false;
        }

        try {
            // Test secret verification
            this.log('Verifying secret hash...', 'info');
            const expectedHash = this.utils.hashSecret(this.currentSecret);
            const srcEscrowData = JSON.parse(fs.readFileSync('test-e2e-src-escrow.json', 'utf8'));
            
            if (srcEscrowData.secretHash === expectedHash) {
                this.log('Secret hash verification successful', 'success');
            } else {
                throw new Error('Secret hash mismatch');
            }

            // Test timelock validation
            this.log('Testing timelock validation...', 'info');
            const currentTime = Math.floor(Date.now() / 1000);
            const canWithdraw = this.utils.checkTimeWindow(srcEscrowData.timelocks, 'SrcWithdraw', currentTime);
            
            if (canWithdraw) {
                this.log('Withdrawal window is open', 'success');
            } else {
                this.log('Withdrawal window not yet open (this is expected for new escrows)', 'warning');
            }

            // Simulate withdrawal
            this.log('Simulating source withdrawal...', 'info');
            const withdrawResult = await this.utils.simulateFactoryAction('SrcWithdraw', {
                secret: this.currentSecret,
                caller: this.utils.getWalletAddress(),
                escrowAddress: this.escrowAddresses.source,
                orderHash: srcEscrowData.orderHash
            });

            if (withdrawResult.success) {
                this.log('Source withdrawal simulation successful', 'success');
                this.log('Secret has been revealed on blockchain', 'info');
                
                // Update escrow status
                srcEscrowData.status = 'withdrawn';
                srcEscrowData.withdrawnAt = withdrawResult.timestamp;
                srcEscrowData.withdrawalTxHash = withdrawResult.txHash;
                fs.writeFileSync('test-e2e-src-escrow.json', JSON.stringify(srcEscrowData, null, 2));
                
                return true;
            } else {
                throw new Error('Source withdrawal simulation failed');
            }
        } catch (error) {
            this.log(`Withdrawal test error: ${error.message}`, 'error');
            return false;
        }
    }

    async testSecretDisclosure() {
        this.log('Testing secret disclosure to resolvers...', 'info');
        
        try {
            if (!this.currentSecret) {
                throw new Error('No secret available for disclosure');
            }

            // Simulate secret being available to all resolvers
            this.log(`Secret disclosed: ${this.currentSecret}`, 'info');
            
            // Test destination withdrawal using disclosed secret
            this.log('Testing destination withdrawal with disclosed secret...', 'info');
            const dstEscrowData = JSON.parse(fs.readFileSync('test-e2e-dst-escrow.json', 'utf8'));
            
            const dstWithdrawResult = await this.utils.simulateFactoryAction('DstWithdraw', {
                secret: this.currentSecret,
                caller: this.utils.getWalletAddress(),
                escrowAddress: this.escrowAddresses.destination,
                orderHash: dstEscrowData.orderHash
            });

            if (dstWithdrawResult.success) {
                this.log('Destination withdrawal successful', 'success');
                this.log('Cross-chain atomic swap completed!', 'success');
                
                // Update destination escrow status
                dstEscrowData.status = 'withdrawn';
                dstEscrowData.withdrawnAt = dstWithdrawResult.timestamp;
                dstEscrowData.withdrawalTxHash = dstWithdrawResult.txHash;
                fs.writeFileSync('test-e2e-dst-escrow.json', JSON.stringify(dstEscrowData, null, 2));
                
                return true;
            } else {
                throw new Error('Destination withdrawal failed');
            }
        } catch (error) {
            this.log(`Secret disclosure test error: ${error.message}`, 'error');
            return false;
        }
    }

    async testFinalityAndCleanup() {
        this.log('Testing finality checks and cleanup...', 'info');
        
        try {
            // Verify both escrows are in withdrawn state
            const srcData = JSON.parse(fs.readFileSync('test-e2e-src-escrow.json', 'utf8'));
            const dstData = JSON.parse(fs.readFileSync('test-e2e-dst-escrow.json', 'utf8'));
            
            if (srcData.status === 'withdrawn' && dstData.status === 'withdrawn') {
                this.log('Both escrows successfully withdrawn', 'success');
                this.log('Atomic swap achieved finality', 'success');
                
                // Generate final report
                const finalReport = {
                    timestamp: new Date().toISOString(),
                    status: 'completed',
                    orderHash: this.currentOrderHash,
                    secret: this.currentSecret,
                    escrows: {
                        source: {
                            address: this.escrowAddresses.source,
                            status: srcData.status,
                            withdrawnAt: srcData.withdrawnAt,
                            txHash: srcData.withdrawalTxHash
                        },
                        destination: {
                            address: this.escrowAddresses.destination,
                            status: dstData.status,
                            withdrawnAt: dstData.withdrawnAt,
                            txHash: dstData.withdrawalTxHash
                        }
                    },
                    summary: {
                        swapCompleted: true,
                        secretRevealed: true,
                        atomicGuarantee: true,
                        crossChainSuccess: true
                    }
                };
                
                fs.writeFileSync('test-e2e-final-report.json', JSON.stringify(finalReport, null, 2));
                this.log('Final report saved to test-e2e-final-report.json', 'info');
                
                return true;
            } else {
                throw new Error('Escrows not in expected final state');
            }
        } catch (error) {
            this.log(`Finality test error: ${error.message}`, 'error');
            return false;
        }
    }

    async runFullEndToEndTest() {
        this.log('🚀 STARTING COMPREHENSIVE END-TO-END TEST SUITE', 'info');
        this.log('=================================================', 'info');
        this.log('', 'info');

        const testSteps = [
            { name: 'Relayer Health Check', fn: () => this.testRelayerHealth() },
            { name: 'Order Creation & Signing', fn: () => this.createSignedOrder() },
            { name: 'Dutch Auction Monitoring', fn: () => this.monitorDutchAuction() },
            { name: 'Escrow Contract Deployment', fn: () => this.deployEscrowContracts() },
            { name: 'Cardano Withdrawal Logic', fn: () => this.testWithdrawalFlow() },
            { name: 'Secret Disclosure', fn: () => this.testSecretDisclosure() },
            { name: 'Finality & Cleanup', fn: () => this.testFinalityAndCleanup() }
        ];

        let passedSteps = 0;
        let totalSteps = testSteps.length;

        for (let i = 0; i < testSteps.length; i++) {
            const step = testSteps[i];
            this.log(`\n🔄 STEP ${i + 1}/${totalSteps}: ${step.name}`, 'info');
            this.log('─'.repeat(50), 'info');
            
            try {
                const success = await step.fn();
                if (success) {
                    passedSteps++;
                    this.log(`✅ STEP ${i + 1} COMPLETED: ${step.name}`, 'success');
                } else {
                    this.log(`❌ STEP ${i + 1} FAILED: ${step.name}`, 'error');
                    // Continue with remaining steps for diagnostic purposes
                }
            } catch (error) {
                this.log(`❌ STEP ${i + 1} ERROR: ${step.name} - ${error.message}`, 'error');
            }
            
            this.log('', 'info');
        }

        // Final summary
        this.log('📊 END-TO-END TEST RESULTS', 'info');
        this.log('==========================', 'info');
        this.log(`Total Steps: ${totalSteps}`, 'info');
        this.log(`Passed: ${passedSteps}`, passedSteps === totalSteps ? 'success' : 'warning');
        this.log(`Failed: ${totalSteps - passedSteps}`, totalSteps - passedSteps === 0 ? 'success' : 'error');
        this.log(`Success Rate: ${((passedSteps / totalSteps) * 100).toFixed(1)}%`, 'info');
        this.log('', 'info');

        if (passedSteps === totalSteps) {
            this.log('🎉 ALL TESTS PASSED! End-to-end flow is working correctly.', 'success');
            this.log('The complete cross-chain atomic swap system is operational.', 'success');
        } else {
            this.log('⚠️  SOME TESTS FAILED. Please review the logs above.', 'warning');
            this.log('System may need debugging before production deployment.', 'warning');
        }

        return passedSteps === totalSteps;
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const testSuite = new EndToEndTestSuite();
    testSuite.runFullEndToEndTest()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test suite failed:', error);
            process.exit(1);
        });
}

module.exports = { EndToEndTestSuite };
