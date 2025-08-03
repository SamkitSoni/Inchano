#!/usr/bin/env node

// Deep dive into Cardano address analysis
const { BlockFrostAPI } = require("@blockfrost/blockfrost-js");
require("dotenv").config();

async function analyzeAddresses() {
    console.log("🔬 Deep Analysis of Cardano Address Issues...\n");

    // Test both preprod and mainnet
    const networks = ["preprod", "mainnet"];

    const addresses = {
        "LOP Contract":
            "addr_test1wp203846488426adefdc379e46cc9713d1695f5dd424728694acb07f1e",
        "Escrow Factory":
            "addr_test1w9fbe9d3e7b9cf25f6b36d25ae170beb8a6ac8088a08ebd03311d",
    };

    for (const network of networks) {
        console.log(`🌍 Testing ${network.toUpperCase()} network:\n`);

        try {
            const blockfrost = new BlockFrostAPI({
                projectId: process.env.BLOCKFROST_PROJECT_ID,
                network: network,
            });

            // Test network connection
            const networkInfo = await blockfrost.network();
            console.log(
                `✅ Connected to ${network}, circulating supply: ${networkInfo.supply.circulating}`
            );

            // Test our addresses on this network
            for (const [name, address] of Object.entries(addresses)) {
                console.log(`\n🔍 Testing ${name} on ${network}:`);
                try {
                    const addressInfo = await blockfrost.addresses(address);
                    console.log(`  ✅ SUCCESS! Address found on ${network}:`);
                    console.log(`     Type: ${addressInfo.type}`);
                    console.log(`     Script: ${addressInfo.script}`);
                    console.log(
                        `     Balance: ${
                            addressInfo.amount.find(
                                (a) => a.unit === "lovelace"
                            )?.quantity || "0"
                        } lovelace`
                    );

                    // Also try to get UTXOs
                    try {
                        const utxos = await blockfrost.addressesUtxos(address);
                        console.log(`     UTXOs: ${utxos.length}`);
                    } catch (utxoError) {
                        console.log(`     UTXO error: ${utxoError.message}`);
                    }
                } catch (error) {
                    console.log(
                        `  ❌ Not found on ${network}: ${error.message}`
                    );
                }
            }
        } catch (error) {
            console.log(`❌ Failed to connect to ${network}: ${error.message}`);
        }

        console.log("\n" + "=".repeat(60) + "\n");
    }

    // Additional analysis
    console.log("🔍 Address Structure Analysis:\n");

    for (const [name, address] of Object.entries(addresses)) {
        console.log(`${name}:`);
        console.log(`  Full address: ${address}`);
        console.log(`  Length: ${address.length}`);
        console.log(`  Network part: ${address.substring(0, 10)}`);
        console.log(`  Address part: ${address.substring(10)}`);
        console.log(
            `  Starts with script prefix: ${
                address.startsWith("addr_test1w") ? "YES" : "NO"
            }`
        );

        // Check if this looks like a valid bech32 address
        const isValidFormat = /^addr_test1[0-9a-z]+$/.test(address);
        console.log(`  Valid bech32 format: ${isValidFormat ? "YES" : "NO"}`);
        console.log("");
    }

    // Test if these might be preview network addresses
    console.log("💡 Potential Issues:");
    console.log(
        "1. These addresses might be from Preview network (not preprod)"
    );
    console.log("2. The contracts might not be deployed yet");
    console.log("3. There might be a different Blockfrost project ID needed");
    console.log("4. The addresses might be from a local testnet");

    // Let's also check what a typical transaction looks like
    console.log(
        "\n🔍 Checking recent transactions for address format examples..."
    );
    try {
        const blockfrost = new BlockFrostAPI({
            projectId: process.env.BLOCKFROST_PROJECT_ID,
            network: "preprod",
        });

        const latestBlock = await blockfrost.blocksLatest();
        console.log(`Latest block hash: ${latestBlock.hash}`);
        console.log(`Block height: ${latestBlock.height}`);
        console.log(`Slot: ${latestBlock.slot}`);
    } catch (error) {
        console.log(`Block info error: ${error.message}`);
    }
}

analyzeAddresses().catch(console.error);
