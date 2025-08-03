#!/usr/bin/env node

// Comprehensive Cardano address format testing
const { BlockFrostAPI } = require("@blockfrost/blockfrost-js");
require("dotenv").config();

async function testAddressFormats() {
    console.log("🔍 Comprehensive Cardano Address Format Testing...\n");

    try {
        // Initialize Blockfrost
        const blockfrost = new BlockFrostAPI({
            projectId: process.env.BLOCKFROST_PROJECT_ID,
            network: "preprod",
        });

        console.log("✅ Blockfrost API initialized for preprod network\n");

        // Test addresses from deployment
        const addresses = {
            "LOP Contract":
                "addr_test1wp203846488426adefdc379e46cc9713d1695f5dd424728694acb07f1e",
            "Escrow Factory":
                "addr_test1w9fbe9d3e7b9cf25f6b36d25ae170beb8a6ac8088a08ebd03311d",
        };

        console.log("📋 Testing deployed contract addresses:\n");

        for (const [name, address] of Object.entries(addresses)) {
            console.log(`🔍 Testing ${name}: ${address}`);

            // Test 1: Direct address query
            try {
                const addressInfo = await blockfrost.addresses(address);
                console.log(`  ✅ Address valid and accessible:`);
                console.log(`     Type: ${addressInfo.type}`);
                console.log(`     Script: ${addressInfo.script || "false"}`);
                console.log(
                    `     Balance: ${
                        addressInfo.amount.find((a) => a.unit === "lovelace")
                            ?.quantity || "0"
                    } lovelace`
                );
                console.log(`     Asset count: ${addressInfo.amount.length}`);
            } catch (error) {
                console.log(`  ❌ Address query failed: ${error.message}`);

                // Test 2: Check if it's an encoding issue
                console.log(`  🔍 Analyzing address format...`);
                console.log(`     Length: ${address.length}`);
                console.log(`     Prefix: ${address.substring(0, 10)}`);
                console.log(
                    `     Network prefix: ${
                        address.startsWith("addr_test1") ? "Testnet" : "Unknown"
                    }`
                );
            }

            // Test 3: Try to get UTXOs for this address
            try {
                const utxos = await blockfrost.addressesUtxos(address);
                console.log(`  ✅ UTXOs found: ${utxos.length}`);
                if (utxos.length > 0) {
                    console.log(
                        `     First UTXO: ${utxos[0].tx_hash}#${utxos[0].output_index}`
                    );
                }
            } catch (error) {
                console.log(`  ❌ UTXO query failed: ${error.message}`);
            }

            console.log("");
        }

        // Test 4: Try some known working testnet addresses for comparison
        console.log(
            "🧪 Testing known working testnet addresses for comparison:\n"
        );

        const knownAddresses = [
            // Cardano Foundation testnet faucet address
            "addr_test1qqr585tvlc7ylnqvz8pyqwauzrdu0mxag3m7q56grgmgu7sxu2hyfhlkwuxupa9d5085eunq2qywy7hvmvej456flknswgndm3",
            // Another common testnet format
            "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwqcyl47r",
        ];

        for (const address of knownAddresses) {
            console.log(
                `🔍 Testing known address: ${address.substring(0, 20)}...`
            );
            try {
                const addressInfo = await blockfrost.addresses(address);
                console.log(
                    `  ✅ Known address works: Type ${
                        addressInfo.type
                    }, Balance: ${
                        addressInfo.amount.find((a) => a.unit === "lovelace")
                            ?.quantity || "0"
                    }`
                );
            } catch (error) {
                console.log(`  ❌ Known address failed: ${error.message}`);
            }
        }

        console.log("\n📊 Address Format Analysis:");
        console.log("Our contract addresses:");
        console.log(`  LOP: ${addresses["LOP Contract"]}`);
        console.log(`  Escrow: ${addresses["Escrow Factory"]}`);
        console.log(
            `  Both start with 'addr_test1w' - this indicates Cardano testnet script addresses`
        );
        console.log(`  Length: ${addresses["LOP Contract"].length} characters`);

        // Test 5: Check the latest transactions to see what valid addresses look like
        console.log("\n🔍 Checking latest blocks for valid address examples:");
        try {
            const latestBlock = await blockfrost.blocksLatest();
            console.log(`Latest block: ${latestBlock.hash}`);

            const blockTxs = await blockfrost.blocksTransactions(
                latestBlock.hash
            );
            if (blockTxs.length > 0) {
                const firstTx = await blockfrost.txs(blockTxs[0]);
                console.log(
                    `First transaction outputs: ${firstTx.output_amount.length} outputs`
                );
            }
        } catch (error) {
            console.log(`Block query error: ${error.message}`);
        }
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        if (error.status_code) {
            console.error("Status code:", error.status_code);
        }
    }
}

testAddressFormats().catch(console.error);
