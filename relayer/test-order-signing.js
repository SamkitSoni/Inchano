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
console.log("Wallet address:", wallet.address);

// EIP-712 domain and types for order signing (must match relayer service)
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

async function createAndTestOrder() {
    try {
        // Create order data
        const orderData = {
            maker: wallet.address,
            tokenIn: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC on Sepolia
            tokenOut: "tADA",
            amountIn: "1000000000000000000", // 1 ETH worth
            minAmountOut: "5000000", // 5 tADA minimum
            priceLimit1: "10000000", // 10 tADA starting price
            priceLimit2: "5000000", // 5 tADA ending price
            expiration: Math.floor(Date.now() / 1000) + 3 * 60, // 3 minutes from now
            sourceChain: "ethereum",
            destinationChain: "cardano",
        };

        console.log("\nOrder data to sign:");
        console.log(JSON.stringify(orderData, null, 2));

        // Sign the order
        console.log("\nSigning order with EIP-712...");
        const signature = await wallet.signTypedData(domain, types, orderData);
        console.log("Signature:", signature);

        // Prepare API request
        const apiOrderData = {
            maker: orderData.maker,
            tokenIn: orderData.tokenIn,
            tokenOut: orderData.tokenOut,
            amountIn: orderData.amountIn,
            minAmountOut: orderData.minAmountOut,
            priceLimit1: orderData.priceLimit1,
            priceLimit2: orderData.priceLimit2,
            expirationMinutes: 3,
            signature: signature,
        };

        console.log("\nSending order to relayer API...");
        const response = await axios.post(
            `${RELAYER_URL}/orders/create`,
            apiOrderData,
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("\nAPI Response:");
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error("\nError creating order:");
        if (error.response) {
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        } else {
            console.error(error.message);
        }
    }
}

// Run the test
createAndTestOrder();
