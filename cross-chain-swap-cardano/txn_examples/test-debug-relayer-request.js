#!/usr/bin/env node

/**
 * Debug the exact request being sent to the relayer
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { ethers } = require('ethers');
const fetch = require('node-fetch');

async function debugRelayerRequest() {
    console.log('🔍 DEBUGGING RELAYER REQUEST');
    console.log('============================');
    
    const wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY);
    console.log(`Wallet address: ${wallet.address}`);
    
    const domain = {
        name: '1inch Limit Order Protocol',
        version: '4',
        chainId: 11155111, // Sepolia
        verifyingContract: '0x7b728d06b49DB49b0858397fDBe48bC57a814AF0'
    };
    
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
    
    const limitOrder = {
        salt: '111222333',
        maker: wallet.address,
        receiver: wallet.address,
        makerAsset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
        takerAsset: '0x0000000000000000000000000000000000000000', // ETH
        makerAmount: '100000000', // 100 USDC
        takerAmount: '50000000000000000', // 0.05 ETH
        interactions: '0x'
    };
    
    console.log('\\nLimit Order Data:');
    console.log(JSON.stringify(limitOrder, null, 2));
    
    // Generate signature
    const signature = await wallet.signTypedData(domain, types, limitOrder);
    console.log(`\\nGenerated signature: ${signature}`);
    
    // Verify locally
    const recovered = ethers.verifyTypedData(domain, types, limitOrder, signature);
    console.log(`Expected signer: ${wallet.address}`);
    console.log(`Recovered signer: ${recovered}`);
    console.log(`Verification: ${recovered.toLowerCase() === wallet.address.toLowerCase() ? 'SUCCESS' : 'FAILED'}`);
    
    // Create the exact request payload (matching OrderCreationRequest interface)
    // Note: interactions field is NOT included because it's hardcoded by the OrderService
    const orderData = {
        salt: limitOrder.salt,
        maker: limitOrder.maker,
        receiver: limitOrder.receiver,
        makerAsset: limitOrder.makerAsset,
        takerAsset: limitOrder.takerAsset,
        makerAmount: limitOrder.makerAmount,
        takerAmount: limitOrder.takerAmount,
        signature: signature,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 600,
        startPrice: '50000000000000000',
        endPrice: '50000000000000000',
        auctionStartTime: Math.floor(Date.now() / 1000),
        auctionEndTime: Math.floor(Date.now() / 1000) + 600
    };
    
    console.log('\\nComplete Order Data being sent:');
    console.log(JSON.stringify(orderData, null, 2));
    
    // Test with relayer
    try {
        console.log('\\n🌐 Sending request to relayer...');
        const response = await fetch('http://localhost:3001/api/orders', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        console.log(`Response status: ${response.status}`);
        console.log(`Response headers:`, Object.fromEntries(response.headers));
        
        const result = await response.json();
        console.log('\\nResponse body:');
        console.log(JSON.stringify(result, null, 2));
        
        if (response.ok && result.data) {
            console.log(`\\n✅ SUCCESS: Order created with hash ${result.data.orderHash}`);
            return true;
        } else {
            console.log(`\\n❌ FAILED: ${result.error || 'Unknown error'}`);
            return false;
        }
    } catch (error) {
        console.log(`\\n❌ REQUEST ERROR: ${error.message}`);
        return false;
    }
}

if (require.main === module) {
    debugRelayerRequest()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Debug failed:', error);
            process.exit(1);
        });
}
