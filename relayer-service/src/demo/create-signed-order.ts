import { ethers } from 'ethers';
import { getDomainData, LimitOrder } from '../utils/signatureVerification';

// This script demonstrates how to create a valid, signed EIP-712 order
// and send it to the running relayer service.

// IMPORTANT: This requires a private key. For this demonstration, we will use
// a temporary, randomly generated one. Do not use real private keys in production scripts.

async function createAndSendSignedOrder() {
    // 1. Create a temporary wallet for signing
    const wallet = ethers.Wallet.createRandom();
    console.log(`🔑 Using temporary wallet: ${wallet.address}`);

    // 2. Define the order details
    const order: LimitOrder = {
        salt: Math.floor(Date.now() * Math.random()).toString(),
        maker: wallet.address,
        receiver: wallet.address, // Typically the maker or a specified address
        makerAsset: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Sepolia
        takerAsset: '0x0000000000000000000000000000000000000000', // ETH
        makerAmount: ethers.utils.parseUnits('100', 6).toString(),     // 100 USDC
        takerAmount: ethers.utils.parseEther('0.05').toString(),      // 0.05 ETH
        interactions: '0x' // No complex interactions for this order
    };

    // 3. Get the EIP-712 domain for the Ethereum mainnet (as configured in relayer)
    const domain = getDomainData('ethereum');

    // 4. Define the EIP-712 types for the Limit Order
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

    // 5. Sign the EIP-712 typed data with the wallet's private key
    console.log('\n✍️  Signing order with wallet...');
    const signature = await wallet._signTypedData(domain, types, order);
    console.log(`   Signature: ${signature.substring(0, 40)}...`);

    // 6. Prepare the full request body for the relayer
    const requestBody = {
        ...order,
        signature,
        // The relayer's OrderCreationRequest needs these extra fields
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 600, // 10 minutes validity
        startPrice: order.takerAmount,
        endPrice: order.takerAmount, // Not a real Dutch auction, so prices are the same
        auctionStartTime: Math.floor(Date.now() / 1000),
        auctionEndTime: Math.floor(Date.now() / 1000) + 600, // 10 minutes validity
    };

    // 7. Send the signed order to the relayer
    console.log('\n🚀 Sending signed order to relayer at http://127.0.0.1:3000/api/orders...');
    try {
        const response = await fetch('http://127.0.0.1:3000/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const result = await response.json() as any;

        if (response.ok) {
            console.log('\n✅ Order successfully accepted by relayer!');
            console.log('   Order Hash:', result.data?.orderHash);
            console.log('   Status:', result.data?.status);
        } else {
            console.error('\n❌ Relayer rejected the order:');
            console.error('   Status:', response.status);
            console.error('   Error:', result.error);
            console.error('   Full response:', result);
        }
    } catch (error) {
        console.error('\n❌ Failed to connect to the relayer service.');
        console.error('   Please ensure the relayer is running on port 3000.');
        console.error('   Error details:', error);
    }
}

// Run the script
createAndSendSignedOrder();

