#!/usr/bin/env node

// Test Preview network specifically
const { BlockFrostAPI } = require("@blockfrost/blockfrost-js");
require("dotenv").config();

async function testPreviewNetwork() {
    console.log("🌅 Testing Cardano PREVIEW Network...\n");

    try {
        // Try preview network (different from preprod)
        const blockfrost = new BlockFrostAPI({
            projectId: process.env.BLOCKFROST_PROJECT_ID,
            network: "preview", // This is the key!
        });

        console.log("✅ Blockfrost API initialized for PREVIEW network");

        // Test network connection
        const network = await blockfrost.network();
        console.log("✅ Preview network connected:", {
            maxSupply: network.supply.max,
            circulatingSupply: network.supply.circulating,
        });

        // Test our contract addresses on preview
        const addresses = {
            "LOP Contract":
                "addr_test1wp203846488426adefdc379e46cc9713d1695f5dd424728694acb07f1e",
            "Escrow Factory":
                "addr_test1w9fbe9d3e7b9cf25f6b36d25ae170beb8a6ac8088a08ebd03311d",
        };

        console.log("\n🏛️ Testing Contract Addresses on PREVIEW:");

        for (const [name, address] of Object.entries(addresses)) {
            console.log(`\n🔍 Testing ${name}:`);
            try {
                const addressInfo = await blockfrost.addresses(address);
                console.log(`  ✅ SUCCESS! Contract found on PREVIEW network:`);
                console.log(`     Type: ${addressInfo.type}`);
                console.log(`     Script: ${addressInfo.script}`);
                console.log(
                    `     Balance: ${
                        addressInfo.amount.find((a) => a.unit === "lovelace")
                            ?.quantity || "0"
                    } lovelace`
                );
                console.log(`     Total assets: ${addressInfo.amount.length}`);

                // Get UTXOs
                try {
                    const utxos = await blockfrost.addressesUtxos(address);
                    console.log(`     UTXOs: ${utxos.length}`);
                    if (utxos.length > 0) {
                        console.log(
                            `     First UTXO: ${utxos[0].tx_hash.substring(
                                0,
                                20
                            )}...#${utxos[0].output_index}`
                        );
                        console.log(
                            `     UTXO amount: ${
                                utxos[0].amount.find(
                                    (a) => a.unit === "lovelace"
                                )?.quantity || "0"
                            } lovelace`
                        );
                    }
                } catch (utxoError) {
                    console.log(`     UTXO query: ${utxoError.message}`);
                }
            } catch (error) {
                console.log(`  ❌ Not found on preview: ${error.message}`);
            }
        }

        console.log("\n🎉 Preview network test completed!");
    } catch (error) {
        console.error("❌ Preview network test failed:", error.message);
        console.log("\n💡 If this fails, the addresses might be from:");
        console.log("   - A local development network");
        console.log("   - A private testnet");
        console.log("   - Generated but not yet deployed");
        console.log("   - Need a different Blockfrost project configuration");
    }
}

testPreviewNetwork().catch(console.error);
