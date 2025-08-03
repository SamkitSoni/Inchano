#!/usr/bin/env node

// Test script for Blockfrost integration
const { BlockFrostAPI } = require("@blockfrost/blockfrost-js");
require("dotenv").config();

async function testBlockfrost() {
    console.log("🔧 Testing Blockfrost Integration...\n");

    try {
        // Initialize Blockfrost
        const blockfrost = new BlockFrostAPI({
            projectId: process.env.BLOCKFROST_PROJECT_ID,
            network: "preprod",
        });

        console.log("✅ Blockfrost API initialized");

        // Test network connection
        const network = await blockfrost.network();
        console.log("✅ Network connected:", {
            maxSupply: network.supply.max,
            totalSupply: network.supply.total,
            circulatingSupply: network.supply.circulating,
        });

        // Test latest epoch
        const epoch = await blockfrost.epochsLatest();
        console.log("✅ Latest epoch:", epoch.epoch);

        // Test contract addresses
        const lopAddress =
            "addr_test1wp203846488426adefdc379e46cc9713d1695f5dd424728694acb07f1e";
        const escrowAddress =
            "addr_test1w9fbe9d3e7b9cf25f6b36d25ae170beb8a6ac8088a08ebd03311d";

        console.log("\n🏛️ Testing Contract Addresses:");

        try {
            const lopInfo = await blockfrost.addresses(lopAddress);
            console.log("✅ LOP Contract accessible:", {
                type: lopInfo.type,
                script: lopInfo.script,
                balance:
                    lopInfo.amount.find((a) => a.unit === "lovelace")
                        ?.quantity || "0",
            });
        } catch (error) {
            console.log("❌ LOP Contract error:", error.message);
        }

        try {
            const escrowInfo = await blockfrost.addresses(escrowAddress);
            console.log("✅ Escrow Contract accessible:", {
                type: escrowInfo.type,
                script: escrowInfo.script,
                balance:
                    escrowInfo.amount.find((a) => a.unit === "lovelace")
                        ?.quantity || "0",
            });
        } catch (error) {
            console.log("❌ Escrow Contract error:", error.message);
        }

        console.log("\n🎉 Blockfrost integration test completed!");
    } catch (error) {
        console.error("❌ Blockfrost test failed:", error.message);
        process.exit(1);
    }
}

testBlockfrost().catch(console.error);
