const { ethers } = require("ethers");
const axios = require("axios");

// Load environment variables
require("dotenv").config();

const PRIVATE_KEY = process.env.ETHEREUM_PRIVATE_KEY;
const RELAYER_URL = "http://localhost:3001";

if (!PRIVATE_KEY) {
    console.error("ETHEREUM_PRIVATE_KEY not found in environment variables");
    process.exit(1);
}

// Create wallet from private key
const wallet = new ethers.Wallet(PRIVATE_KEY);
console.log("🔐 Wallet address:", wallet.address);

// EIP-712 domain and types for order signing (matching relayer service)
const domain = {
    name: "Inchano Limit Order Protocol",
    version: "1",
    chainId: 11155111, // Sepolia
    verifyingContract: "0x7b728d06b49DB49b0858397fDBe48bC57a814AF0", // LOP contract
};

const types = {
    LimitOrder: [
        { name: "maker", type: "address" },
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "string" },
        { name: "amountIn", type: "uint256" },
        { name: "minAmountOut", type: "uint256" },
        { name: "priceLimit1", type: "uint256" },
        { name: "priceLimit2", type: "uint256" },
        { name: "expiration", type: "uint256" },
        { name: "sourceChain", type: "string" },
        { name: "destinationChain", type: "string" },
    ],
};

async function testCompleteOrderFlow() {
    console.log("\n🚀 TESTING COMPLETE ETH → tADA ORDER FLOW");
    console.log("===========================================\n");

    try {
        // Step 1: Test relayer health
        console.log("1️⃣ Testing relayer health...");
        const healthResponse = await axios.get(`${RELAYER_URL}/health`);
        console.log("✅ Relayer is healthy:", healthResponse.data);

        // Step 2: Create order data (simulating frontend)
        console.log("\n2️⃣ Creating order parameters...");
        const amountInEth = "0.1"; // 0.1 ETH
        const amountInWei = ethers.parseEther(amountInEth).toString();
        const minAmountOutTada = "50"; // 50 tADA
        const minAmountOutMicroTada = (
            parseFloat(minAmountOutTada) * 1000000
        ).toString(); // 6 decimals

        // Calculate price limits for Dutch auction (10% spread)
        const priceLimit1 = (
            (BigInt(minAmountOutMicroTada) * BigInt(110)) /
            BigInt(100)
        ).toString(); // 10% higher
        const priceLimit2 = (
            (BigInt(minAmountOutMicroTada) * BigInt(90)) /
            BigInt(100)
        ).toString(); // 10% lower

        const orderData = {
            maker: wallet.address,
            tokenIn: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC on Sepolia
            tokenOut: "tADA",
            amountIn: amountInWei,
            minAmountOut: minAmountOutMicroTada,
            priceLimit1: priceLimit1,
            priceLimit2: priceLimit2,
            expiration: Math.floor(Date.now() / 1000) + 6 * 60, // 6 minutes from now
            sourceChain: "ethereum",
            destinationChain: "cardano",
        };

        console.log("📋 Order parameters:");
        console.log(`   Amount In: ${amountInEth} ETH (${amountInWei} wei)`);
        console.log(
            `   Min Amount Out: ${minAmountOutTada} tADA (${minAmountOutMicroTada} micro-tADA)`
        );
        console.log(`   Price Limit 1 (Start): ${priceLimit1} micro-tADA`);
        console.log(`   Price Limit 2 (End): ${priceLimit2} micro-tADA`);
        console.log(
            `   Expiration: ${new Date(
                orderData.expiration * 1000
            ).toLocaleString()}`
        );

        // Step 3: Sign the order (simulating wallet signature)
        console.log("\n3️⃣ Signing order with EIP-712...");
        const signature = await wallet.signTypedData(domain, types, orderData);
        console.log("✅ Order signed successfully");
        console.log("🔐 Signature:", signature);

        // Step 4: Send to relayer for validation
        console.log("\n4️⃣ Sending order to relayer for validation...");
        const relayerOrderData = {
            maker: orderData.maker,
            tokenIn: orderData.tokenIn,
            tokenOut: orderData.tokenOut,
            amountIn: orderData.amountIn,
            minAmountOut: orderData.minAmountOut,
            priceLimit1: orderData.priceLimit1,
            priceLimit2: orderData.priceLimit2,
            expirationMinutes: 6,
            signature: signature,
        };

        const response = await axios.post(
            `${RELAYER_URL}/orders/create`,
            relayerOrderData,
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ Order created successfully in relayer!");
        console.log("📝 Response:", JSON.stringify(response.data, null, 2));

        const orderId = response.data.orderId;

        // Step 5: Verify order in database
        console.log("\n5️⃣ Verifying order in database...");
        const orderResponse = await axios.get(
            `${RELAYER_URL}/orders/${orderId}`
        );

        if (orderResponse.data.success) {
            console.log("✅ Order found in database:");
            const order = orderResponse.data.order;
            console.log(`   Order ID: ${order.orderId}`);
            console.log(`   Maker: ${order.maker}`);
            console.log(`   Status: ${order.status}`);
            console.log(`   Token In: ${order.tokenIn}`);
            console.log(`   Token Out: ${order.tokenOut}`);
            console.log(`   Amount In: ${order.amountIn}`);
            console.log(`   Min Amount Out: ${order.minAmountOut}`);
        }

        // Step 6: Check resolver endpoint
        console.log("\n6️⃣ Checking resolver endpoint...");
        const resolverResponse = await axios.get(
            `${RELAYER_URL}/resolver/orders`
        );

        if (resolverResponse.data.success) {
            console.log("✅ Order available for resolvers:");
            console.log(`   Total orders: ${resolverResponse.data.count}`);
            console.log(
                `   Order IDs: ${resolverResponse.data.orders
                    .map((o) => o.orderId)
                    .join(", ")}`
            );
        }

        // Step 7: Test order lifecycle (optional cancel)
        console.log("\n7️⃣ Testing order cancellation...");
        const cancelResponse = await axios.post(
            `${RELAYER_URL}/orders/${orderId}/cancel`,
            {
                maker: wallet.address,
                reason: "Testing order lifecycle",
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        if (cancelResponse.data.success) {
            console.log("✅ Order cancelled successfully");

            // Verify cancellation
            const cancelledOrderResponse = await axios.get(
                `${RELAYER_URL}/orders/${orderId}`
            );
            if (cancelledOrderResponse.data.success) {
                console.log(
                    `   Order status: ${cancelledOrderResponse.data.order.status}`
                );
            }
        }

        console.log("\n🎉 COMPLETE ORDER FLOW TEST SUCCESSFUL!");
        console.log("==========================================");
        console.log("✅ Order creation with EIP-712 signature");
        console.log("✅ Signature validation by relayer");
        console.log("✅ Order storage in hybrid orderbook");
        console.log("✅ Order available for Dutch auction");
        console.log("✅ Order lifecycle management");
        console.log("\n🚀 Ready for frontend integration and Dutch auction!");
    } catch (error) {
        console.error("\n❌ TEST FAILED:");
        if (error.response) {
            console.error("Response status:", error.response.status);
            console.error(
                "Response data:",
                JSON.stringify(error.response.data, null, 2)
            );
        } else {
            console.error("Error message:", error.message);
        }
    }
}

// Run the test
testCompleteOrderFlow();
