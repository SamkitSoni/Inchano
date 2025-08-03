const axios = require("axios");

async function testSimpleOrderCreation() {
    try {
        const orderRequest = {
            limitOrder: {
                salt: "123456789",
                maker: "0x1234567890123456789012345678901234567890",
                receiver: "0x1234567890123456789012345678901234567890",
                makerAsset: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                takerAsset: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                makingAmount: "1000000000000000000", // 1 ETH
                takingAmount: "1000000000000000000000", // 1000 tokens
                makerTraits: "0x0",
            },
            signature:
                "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
        };

        console.log("📋 Testing SIMPLE order creation with:", orderRequest);

        const response = await axios.post(
            "http://localhost:3001/orders/create",
            orderRequest,
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ SUCCESS:", response.data);
    } catch (error) {
        console.error("❌ Error:", error.response?.data || error.message);
    }
}

testSimpleOrderCreation();
