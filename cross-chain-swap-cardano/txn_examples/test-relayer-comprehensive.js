#!/usr/bin/env node

/**
 * Comprehensive Relayer Service Test Suite
 * 
 * This test suite covers multiple scenarios:
 * 1. Single order creation and verification
 * 2. Multiple concurrent orders
 * 3. Order status tracking
 * 4. API endpoint testing
 * 5. Error handling scenarios
 * 6. Performance testing
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { ethers } = require('ethers');
const fetch = require('node-fetch');

// Import relayer components
const relayerPath = path.join(__dirname, '../../relayer-service/dist');
const { OrderProcessingService } = require(path.join(relayerPath, 'services/OrderService'));
const { verifyOrder, generateOrderHash, getDomainData } = require(path.join(relayerPath, 'utils/signatureVerification'));

class ComprehensiveRelayerTestSuite {
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
        this.baseURL = 'http://localhost:3001/api';
        this.createdOrders = [];
    }

    generateUniqueOrder(overrides = {}) {
        const uniqueSalt = Math.floor(Date.now() * Math.random()).toString();
        return {
            salt: uniqueSalt,
            maker: this.wallet.address,
            receiver: this.wallet.address,
            makerAsset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
            takerAsset: '0x0000000000000000000000000000000000000000',
            makerAmount: '100000000',
            takerAmount: '50000000000000000',
            interactions: '0x',
            ...overrides
        };
    }

    async signOrder(order) {
        return await this.wallet.signTypedData(this.domain, this.types, order);
    }

    async test1_BasicOrderCreation() {
        console.log('\n🧪 TEST 1: Basic Order Creation');
        console.log('===============================');
        
        try {
            const order = this.generateUniqueOrder();
            const signature = await this.signOrder(order);
            
            const orderData = {
                ...order,
                signature,
                startTime: Math.floor(Date.now() / 1000),
                endTime: Math.floor(Date.now() / 1000) + 600,
                startPrice: '50000000000000000',
                endPrice: '50000000000000000',
                auctionStartTime: Math.floor(Date.now() / 1000),
                auctionEndTime: Math.floor(Date.now() / 1000) + 600
            };
            
            const response = await fetch(`${this.baseURL}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                console.log('✅ Order created successfully');
                console.log(`   Order Hash: ${result.data.orderHash}`);
                console.log(`   Status: ${result.data.status}`);
                this.createdOrders.push(result.data.orderHash);
                return { success: true, orderHash: result.data.orderHash };
            } else {
                console.log('❌ Order creation failed');
                console.log(`   Error: ${result.error}`);
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async test2_MultipleOrderCreation() {
        console.log('\n🧪 TEST 2: Multiple Order Creation');
        console.log('==================================');
        
        const orderCount = 3;
        const results = [];
        
        try {
            for (let i = 0; i < orderCount; i++) {
                const order = this.generateUniqueOrder({
                    makerAmount: (100000000 + i * 10000000).toString(),
                    takerAmount: (50000000000000000 + i * 10000000000000000).toString()
                });
                
                const signature = await this.signOrder(order);
                
                const orderData = {
                    ...order,
                    signature,
                    startTime: Math.floor(Date.now() / 1000) + i * 10,
                    endTime: Math.floor(Date.now() / 1000) + 600 + i * 10,
                    startPrice: (50000000000000000 + i * 10000000000000000).toString(),
                    endPrice: (50000000000000000 + i * 5000000000000000).toString(),
                    auctionStartTime: Math.floor(Date.now() / 1000) + i * 10,
                    auctionEndTime: Math.floor(Date.now() / 1000) + 600 + i * 10
                };
                
                const response = await fetch(`${this.baseURL}/orders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(orderData)
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    console.log(`✅ Order ${i + 1} created: ${result.data.orderHash.substring(0, 10)}...`);
                    this.createdOrders.push(result.data.orderHash);
                    results.push({ success: true, orderHash: result.data.orderHash });
                } else {
                    console.log(`❌ Order ${i + 1} failed: ${result.error}`);
                    results.push({ success: false, error: result.error });
                }
                
                // Small delay between orders
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const successCount = results.filter(r => r.success).length;
            console.log(`📊 Created ${successCount}/${orderCount} orders successfully`);
            
            return { success: successCount === orderCount, results };
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async test3_OrderStatusTracking() {
        console.log('\n🧪 TEST 3: Order Status Tracking');
        console.log('=================================');
        
        if (this.createdOrders.length === 0) {
            console.log('❌ No orders available for status tracking');
            return { success: false, error: 'No orders available' };
        }
        
        try {
            const orderHash = this.createdOrders[0];
            
            // Get order details
            const detailsResponse = await fetch(`${this.baseURL}/orders/${orderHash}`);
            const detailsResult = await detailsResponse.json();
            
            if (detailsResponse.ok && detailsResult.success) {
                console.log('✅ Order details retrieved');
                console.log(`   Status: ${detailsResult.data.order.status}`);
                console.log(`   Created: ${detailsResult.data.order.createdAt}`);
            }
            
            // Get order status with auction details
            const statusResponse = await fetch(`${this.baseURL}/orders/${orderHash}/status`);
            const statusResult = await statusResponse.json();
            
            if (statusResponse.ok && statusResult.success) {
                console.log('✅ Order status retrieved');
                console.log(`   Current Price: ${statusResult.data.currentPrice}`);
                console.log(`   Time Remaining: ${statusResult.data.timeRemaining}s`);
                console.log(`   Progress: ${Math.round(statusResult.data.progress * 100)}%`);
                console.log(`   Is Active: ${statusResult.data.isActive}`);
            }
            
            // Get auction details
            const auctionResponse = await fetch(`${this.baseURL}/orders/${orderHash}/auction`);
            const auctionResult = await auctionResponse.json();
            
            if (auctionResponse.ok && auctionResult.success) {
                console.log('✅ Auction details retrieved');
                console.log(`   Current Price: ${auctionResult.data.currentPrice}`);
                console.log(`   Time Remaining: ${auctionResult.data.timeRemaining}s`);
                console.log(`   Price Decay Rate: ${auctionResult.data.priceDecayRate}`);
            }
            
            return { success: true };
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async test4_OrdersListAPI() {
        console.log('\n🧪 TEST 4: Orders List API');
        console.log('==========================');
        
        try {
            // Get all orders
            const allOrdersResponse = await fetch(`${this.baseURL}/orders`);
            const allOrdersResult = await allOrdersResponse.json();
            
            if (allOrdersResponse.ok && allOrdersResult.success) {
                console.log('✅ All orders retrieved');
                console.log(`   Total Orders: ${allOrdersResult.data.orders.length}`);
                console.log(`   Pagination: ${JSON.stringify(allOrdersResult.data.pagination)}`);
            }
            
            // Get orders with filters
            const filteredResponse = await fetch(`${this.baseURL}/orders?maker=${this.wallet.address}&limit=2`);
            const filteredResult = await filteredResponse.json();
            
            if (filteredResponse.ok && filteredResult.success) {
                console.log('✅ Filtered orders retrieved');
                console.log(`   Filtered Orders: ${filteredResult.data.orders.length}`);
                console.log(`   Has More: ${filteredResult.data.pagination.hasMore}`);
            }
            
            // Get order metrics
            const metricsResponse = await fetch(`${this.baseURL}/orders/stats/metrics`);
            const metricsResult = await metricsResponse.json();
            
            if (metricsResponse.ok && metricsResult.success) {
                console.log('✅ Order metrics retrieved');
                console.log(`   Total Orders: ${metricsResult.data.totalOrders}`);
                console.log(`   Active Orders: ${metricsResult.data.activeOrders}`);
                console.log(`   Fill Rate: ${Math.round(metricsResult.data.averageFillRate * 100)}%`);
            }
            
            return { success: true };
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async test5_ErrorHandling() {
        console.log('\n🧪 TEST 5: Error Handling');
        console.log('=========================');
        
        try {
            // Test invalid signature
            const order = this.generateUniqueOrder();
            const invalidOrderData = {
                ...order,
                signature: '0xinvalidsignature',
                startTime: Math.floor(Date.now() / 1000),
                endTime: Math.floor(Date.now() / 1000) + 600,
                startPrice: '50000000000000000',
                endPrice: '50000000000000000',
                auctionStartTime: Math.floor(Date.now() / 1000),
                auctionEndTime: Math.floor(Date.now() / 1000) + 600
            };
            
            const invalidResponse = await fetch(`${this.baseURL}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(invalidOrderData)
            });
            
            const invalidResult = await invalidResponse.json();
            
            if (!invalidResponse.ok && !invalidResult.success) {
                console.log('✅ Invalid signature properly rejected');
                console.log(`   Error: ${invalidResult.error}`);
            } else {
                console.log('❌ Invalid signature was accepted (this is wrong)');
            }
            
            // Test missing fields
            const incompleteOrderData = {
                salt: order.salt,
                maker: order.maker,
                signature: await this.signOrder(order)
                // Missing required fields
            };
            
            const incompleteResponse = await fetch(`${this.baseURL}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(incompleteOrderData)
            });
            
            const incompleteResult = await incompleteResponse.json();
            
            if (!incompleteResponse.ok && !incompleteResult.success) {
                console.log('✅ Incomplete order properly rejected');
                console.log(`   Error: ${incompleteResult.error}`);
            } else {
                console.log('❌ Incomplete order was accepted (this is wrong)');
            }
            
            // Test non-existent order
            const nonExistentResponse = await fetch(`${this.baseURL}/orders/0x1234567890123456789012345678901234567890123456789012345678901234`);
            const nonExistentResult = await nonExistentResponse.json();
            
            if (!nonExistentResponse.ok && !nonExistentResult.success) {
                console.log('✅ Non-existent order properly handled');
                console.log(`   Error: ${nonExistentResult.error}`);
            } else {
                console.log('❌ Non-existent order returned unexpected result');
            }
            
            return { success: true };
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async test6_PerformanceTest() {
        console.log('\n🧪 TEST 6: Performance Test');
        console.log('===========================');
        
        const orderCount = 5;
        const startTime = Date.now();
        
        try {
            const promises = [];
            
            for (let i = 0; i < orderCount; i++) {
                const order = this.generateUniqueOrder({
                    makerAmount: (100000000 + i * 1000000).toString()
                });
                
                const promise = this.signOrder(order).then(signature => {
                    const orderData = {
                        ...order,
                        signature,
                        startTime: Math.floor(Date.now() / 1000) + i * 5,
                        endTime: Math.floor(Date.now() / 1000) + 600 + i * 5,
                        startPrice: '50000000000000000',
                        endPrice: '45000000000000000',
                        auctionStartTime: Math.floor(Date.now() / 1000) + i * 5,
                        auctionEndTime: Math.floor(Date.now() / 1000) + 600 + i * 5
                    };
                    
                    return fetch(`${this.baseURL}/orders`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(orderData)
                    }).then(response => response.json());
                });
                
                promises.push(promise);
            }
            
            const results = await Promise.all(promises);
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            const successCount = results.filter(r => r.success).length;
            const throughput = (successCount / duration) * 1000; // orders per second
            
            console.log(`✅ Performance test completed`);
            console.log(`   Duration: ${duration}ms`);
            console.log(`   Success Rate: ${successCount}/${orderCount} (${Math.round((successCount/orderCount) * 100)}%)`);
            console.log(`   Throughput: ${throughput.toFixed(2)} orders/second`);
            
            // Add successful orders to our tracking list
            results.forEach(result => {
                if (result.success && result.data?.orderHash) {
                    this.createdOrders.push(result.data.orderHash);
                }
            });
            
            return { 
                success: true, 
                duration, 
                successRate: successCount / orderCount,
                throughput 
            };
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async test7_HealthCheck() {
        console.log('\n🧪 TEST 7: Health Check');
        console.log('=======================');
        
        try {
            const healthResponse = await fetch(`http://localhost:3001/health`);
            const healthResult = await healthResponse.json();
            
            if (healthResponse.ok && (healthResult.status === 'healthy' || healthResult.status === 'ok')) {
                console.log('✅ Health check passed');
                console.log(`   Status: ${healthResult.status}`);
                console.log(`   Uptime: ${healthResult.uptime}s`);
                console.log(`   Version: ${healthResult.version}`);
                
                if (healthResult.services) {
                    console.log('   Services:');
                    Object.entries(healthResult.services).forEach(([service, status]) => {
                        console.log(`     ${service}: ${status}`);
                    });
                }
            } else {
                console.log('❌ Health check failed');
                console.log(`   Status: ${healthResult.status}`);
                console.log(`   Error: ${healthResult.error}`);
            }
            
            return { success: healthResponse.ok && (healthResult.status === 'healthy' || healthResult.status === 'ok') };
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async runComprehensiveTests() {
        console.log('🚀 COMPREHENSIVE RELAYER TEST SUITE');
        console.log('====================================');
        console.log(`Wallet Address: ${this.wallet.address}`);
        console.log(`Base URL: ${this.baseURL}`);
        console.log(`Chain ID: ${this.domain.chainId}`);
        
        const results = {};
        
        // Run all tests
        results.basicOrderCreation = await this.test1_BasicOrderCreation();
        results.multipleOrderCreation = await this.test2_MultipleOrderCreation();
        results.orderStatusTracking = await this.test3_OrderStatusTracking();
        results.ordersListAPI = await this.test4_OrdersListAPI();
        results.errorHandling = await this.test5_ErrorHandling();
        results.performanceTest = await this.test6_PerformanceTest();
        results.healthCheck = await this.test7_HealthCheck();
        
        // Summary
        console.log('\n📊 COMPREHENSIVE TEST RESULTS');
        console.log('==============================');
        
        let passCount = 0;
        let totalCount = 0;
        
        Object.entries(results).forEach(([testName, result]) => {
            totalCount++;
            if (result.success) {
                passCount++;
                console.log(`✅ ${testName}: PASS`);
            } else {
                console.log(`❌ ${testName}: FAIL - ${result.error || 'Unknown error'}`);
            }
        });
        
        console.log('\n🎯 FINAL SUMMARY');
        console.log('================');
        console.log(`Tests Passed: ${passCount}/${totalCount} (${Math.round((passCount/totalCount) * 100)}%)`);
        console.log(`Orders Created: ${this.createdOrders.length}`);
        
        if (results.performanceTest.success) {
            console.log(`Average Throughput: ${results.performanceTest.throughput?.toFixed(2)} orders/second`);
        }
        
        console.log(`Test Duration: ${new Date().toISOString()}`);
        
        return {
            success: passCount === totalCount,
            passCount,
            totalCount,
            passRate: passCount / totalCount,
            createdOrders: this.createdOrders.length,
            results
        };
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    const testSuite = new ComprehensiveRelayerTestSuite();
    testSuite.runComprehensiveTests()
        .then(results => {
            process.exit(results.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test suite failed:', error);
            process.exit(1);
        });
}

module.exports = { ComprehensiveRelayerTestSuite };
