const axios = require("axios");

async function testOrderCreation() {
    try {
        const orderRequest = {
            maker: "0x1234567890123456789012345678901234567890", // Test address
            tokenIn: "ETH",
            tokenOut: "tADA",
            amountIn: "1000000000000000000", // 1 ETH in wei
            minAmountOut: "1000000000000000000000", // 1000 tADA
            priceLimit1: 3000.0, // Higher starting price (Dutch auction starts high)
            priceLimit2: 2500.0, // Lower ending price (Dutch auction ends low)
            destinationAddress:
                "addr_test1qz0x1234567890123456789012345678901234567890123456789012345678901234567890",
            expirationMinutes: 6, // Valid expiration time
            signature:
                "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
        };

        console.log("📋 Testing order creation with:", orderRequest);

        const response = await axios.post(
            "http://localhost:3001/orders/create",
            orderRequest,
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ Response:", response.data);
    } catch (error) {
        console.error("❌ Error:", error.response?.data || error.message);
    }
}

testOrderCreation();
