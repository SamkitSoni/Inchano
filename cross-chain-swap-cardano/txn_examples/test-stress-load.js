#!/usr/bin/env node

require('dotenv').config();
const { ethers } = require('ethers');

const RELAYER_BASE_URL = process.env.RELAYER_BASE_URL || 'http://localhost:3001/api';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not found in environment variables');
    process.exit(1);
}

const wallet = new ethers.Wallet(PRIVATE_KEY);

// Domain for EIP-712 signing
const domain = {
    name: '1inch Limit Order Protocol',
    version: '4',
    chainId: 11155111,
    verifyingContract: '0x7b728d06b49DB49b0858397fDBe48bC57a814AF0'
};

const orderTypes = {
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

async function createSignedOrder(saltSuffix) {
    const salt = Date.now().toString() + saltSuffix.toString();
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + 600; // 10 minutes

    const order = {
        salt,
        maker: wallet.address,
        receiver: wallet.address,
        makerAsset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
        takerAsset: '0x0000000000000000000000000000000000000000', // ETH
        makerAmount: '100000000', // 100 USDC
        takerAmount: '50000000000000000', // 0.05 ETH
        interactions: '0x'
    };

    const signature = await wallet.signTypedData(domain, orderTypes, order);

    return {
        ...order,
        signature,
        startTime,
        endTime,
        startPrice: order.takerAmount,
        endPrice: order.takerAmount,
        auctionStartTime: startTime,
        auctionEndTime: endTime
    };
}

async function submitOrder(order) {
    const response = await fetch(`${RELAYER_BASE_URL}/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(order)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return await response.json();
}

async function runConcurrentTest(concurrent, totalOrders) {
    console.log(`🚀 STRESS TEST: ${concurrent} concurrent requests, ${totalOrders} total orders`);
    console.log('='.repeat(70));

    const results = {
        success: 0,
        failed: 0,
        errors: {},
        times: [],
        startTime: Date.now()
    };

    const batches = Math.ceil(totalOrders / concurrent);
    
    for (let batch = 0; batch < batches; batch++) {
        const batchStart = Date.now();
        const promises = [];
        const ordersInBatch = Math.min(concurrent, totalOrders - (batch * concurrent));

        console.log(`📦 Batch ${batch + 1}/${batches} - Creating ${ordersInBatch} orders...`);

        for (let i = 0; i < ordersInBatch; i++) {
            const orderIndex = batch * concurrent + i;
            promises.push(
                (async () => {
                    try {
                        const requestStart = Date.now();
                        const order = await createSignedOrder(orderIndex);
                        const response = await submitOrder(order);
                        const requestTime = Date.now() - requestStart;
                        
                        results.times.push(requestTime);
                        results.success++;
                        
                        return {
                            success: true,
                            orderHash: response.data?.orderHash,
                            time: requestTime
                        };
                    } catch (error) {
                        results.failed++;
                        const errorKey = error.message.split(':')[0];
                        results.errors[errorKey] = (results.errors[errorKey] || 0) + 1;
                        
                        return {
                            success: false,
                            error: error.message,
                            time: Date.now() - requestStart
                        };
                    }
                })()
            );
        }

        const batchResults = await Promise.all(promises);
        const batchTime = Date.now() - batchStart;
        const successInBatch = batchResults.filter(r => r.success).length;
        
        console.log(`   ✅ ${successInBatch}/${ordersInBatch} successful (${batchTime}ms)`);

        // Small delay between batches to prevent overwhelming
        if (batch < batches - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    const totalTime = Date.now() - results.startTime;
    
    console.log('\n📊 STRESS TEST RESULTS');
    console.log('='.repeat(70));
    console.log(`Total Orders: ${totalOrders}`);
    console.log(`Successful: ${results.success} (${(results.success/totalOrders*100).toFixed(1)}%)`);
    console.log(`Failed: ${results.failed} (${(results.failed/totalOrders*100).toFixed(1)}%)`);
    console.log(`Total Time: ${totalTime}ms`);
    console.log(`Average Throughput: ${(totalOrders / (totalTime / 1000)).toFixed(2)} orders/sec`);
    
    if (results.times.length > 0) {
        const avgTime = results.times.reduce((a, b) => a + b, 0) / results.times.length;
        const maxTime = Math.max(...results.times);
        const minTime = Math.min(...results.times);
        
        console.log(`Average Response Time: ${avgTime.toFixed(2)}ms`);
        console.log(`Min Response Time: ${minTime}ms`);
        console.log(`Max Response Time: ${maxTime}ms`);
    }
    
    if (Object.keys(results.errors).length > 0) {
        console.log('\n❌ Error Breakdown:');
        Object.entries(results.errors).forEach(([error, count]) => {
            console.log(`   ${error}: ${count}`);
        });
    }

    return results;
}

async function runMemoryTest() {
    console.log('\n🧠 MEMORY USAGE TEST');
    console.log('='.repeat(70));
    
    const initialMemory = process.memoryUsage();
    console.log('Initial Memory:', {
        rss: `${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(initialMemory.external / 1024 / 1024).toFixed(2)} MB`
    });

    // Create many orders in memory
    const orders = [];
    for (let i = 0; i < 1000; i++) {
        orders.push(await createSignedOrder(i));
    }

    const midMemory = process.memoryUsage();
    console.log('After creating 1000 orders:', {
        rss: `${(midMemory.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(midMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(midMemory.external / 1024 / 1024).toFixed(2)} MB`
    });

    // Clear orders and force garbage collection
    orders.length = 0;
    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage();
    console.log('After cleanup:', {
        rss: `${(finalMemory.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(finalMemory.external / 1024 / 1024).toFixed(2)} MB`
    });
}

async function checkRelayerHealth() {
    try {
        const response = await fetch(`${RELAYER_BASE_URL.replace('/api', '')}/health`);
        const health = await response.json();
        
        console.log('🏥 RELAYER HEALTH CHECK');
        console.log('='.repeat(70));
        console.log(`Status: ${health.status}`);
        console.log(`Uptime: ${health.uptime}s`);
        console.log(`Version: ${health.version}`);
        console.log(`Total Requests: ${health.stats?.totalRequests || 'N/A'}`);
        console.log(`Active Connections: ${health.stats?.activeConnections || 'N/A'}`);
        
        if (health.services) {
            console.log('Services:');
            Object.entries(health.services).forEach(([service, status]) => {
                console.log(`  ${service}: ${status}`);
            });
        }
        
        return health.status === 'ok' || health.status === 'healthy';
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        return false;
    }
}

async function main() {
    console.log('🔥 COMPREHENSIVE STRESS TEST SUITE');
    console.log('='.repeat(70));
    console.log(`Wallet: ${wallet.address}`);
    console.log(`Relayer: ${RELAYER_BASE_URL}`);
    console.log('');

    // Health check first
    const isHealthy = await checkRelayerHealth();
    if (!isHealthy) {
        console.error('❌ Relayer is not healthy, aborting tests');
        process.exit(1);
    }

    console.log('\n');

    // Memory test
    await runMemoryTest();

    console.log('\n');

    // Light load test
    await runConcurrentTest(5, 20);

    console.log('\n');

    // Medium load test
    await runConcurrentTest(10, 50);

    console.log('\n');

    // Heavy load test
    await runConcurrentTest(20, 100);

    console.log('\n');

    // Final health check
    console.log('🏁 FINAL HEALTH CHECK');
    console.log('='.repeat(70));
    await checkRelayerHealth();

    console.log('\n🎉 STRESS TEST SUITE COMPLETED!');
}

if (require.main === module) {
    main().catch(console.error);
}
