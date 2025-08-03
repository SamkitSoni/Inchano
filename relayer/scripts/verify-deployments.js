#!/usr/bin/env node

// Test using transaction hashes to verify deployment
const { BlockFrostAPI } = require("@blockfrost/blockfrost-js");
require("dotenv").config();

async function verifyDeploymentTransactions() {
    console.log("🔗 Verifying Contract Deployment via Transaction Hashes...\n");

    try {
        const blockfrost = new BlockFrostAPI({
            projectId: process.env.BLOCKFROST_PROJECT_ID,
            network: "preprod",
        });

        console.log("✅ Connected to preprod network");

        // Test the deployment transactions
        const deployments = {
            "LOP Contract": {
                txHash: "f9334a96b2c866b0a6e7375ecda06f5f94e4200e5057fbeda473674a5814c69a",
                address:
                    "addr_test1wp203846488426adefdc379e46cc9713d1695f5dd424728694acb07f1e",
            },
            "Escrow Factory": {
                txHash: "41efde0905993b26e9d5134fe17285b028520a469c34cc8b0d1dd455f7f95d92",
                address:
                    "addr_test1w9fbe9d3e7b9cf25f6b36d25ae170beb8a6ac8088a08ebd03311d",
            },
        };

        for (const [name, info] of Object.entries(deployments)) {
            console.log(`\n🔍 Verifying ${name}:`);
            console.log(`   Transaction: ${info.txHash}`);
            console.log(`   Address: ${info.address}`);

            try {
                // Get transaction details
                const tx = await blockfrost.txs(info.txHash);
                console.log(`   ✅ Transaction found:`);
                console.log(`      Block: ${tx.block}`);
                console.log(`      Slot: ${tx.slot}`);
                console.log(`      Fee: ${tx.fee} lovelace`);
                console.log(`      Size: ${tx.size} bytes`);
                console.log(`      Outputs: ${tx.output_amount.length}`);

                // Get transaction outputs to see if our address appears
                const txUtxos = await blockfrost.txsUtxos(info.txHash);
                console.log(
                    `      Transaction UTXOs: ${txUtxos.outputs.length} outputs`
                );

                // Check if our script address appears in outputs
                const foundInOutputs = txUtxos.outputs.find(
                    (output) => output.address === info.address
                );
                if (foundInOutputs) {
                    console.log(
                        `      ✅ Script address found in transaction outputs!`
                    );
                    console.log(
                        `         Amount: ${
                            foundInOutputs.amount.find(
                                (a) => a.unit === "lovelace"
                            )?.quantity || "0"
                        } lovelace`
                    );
                } else {
                    console.log(`      ❌ Script address not found in outputs`);
                    console.log(`      Available addresses:`);
                    txUtxos.outputs.forEach((output, i) => {
                        console.log(
                            `         Output ${i}: ${output.address.substring(
                                0,
                                20
                            )}...`
                        );
                    });
                }
            } catch (error) {
                console.log(`   ❌ Transaction not found: ${error.message}`);
            }
        }

        // Test if the issue is with script address format
        console.log("\n🔍 Testing Script Address Querying Methods...\n");

        for (const [name, info] of Object.entries(deployments)) {
            console.log(`Testing ${name} address: ${info.address}`);

            // Method 1: Direct address query
            try {
                const addressInfo = await blockfrost.addresses(info.address);
                console.log(
                    `  ✅ Direct query works: ${addressInfo.type}, ${addressInfo.script}`
                );
            } catch (error) {
                console.log(`  ❌ Direct query failed: ${error.message}`);
            }

            // Method 2: Address UTXOs query
            try {
                const utxos = await blockfrost.addressesUtxos(info.address);
                console.log(`  ✅ UTXO query works: ${utxos.length} UTXOs`);
            } catch (error) {
                console.log(`  ❌ UTXO query failed: ${error.message}`);
            }

            // Method 3: Try script-specific endpoints if available
            try {
                // Some Blockfrost versions have script-specific endpoints
                if (blockfrost.scripts) {
                    // Extract script hash from address (this might not work, just testing)
                    console.log(`  🔍 Script endpoint available, testing...`);
                }
            } catch (error) {
                console.log(`  ℹ️  Script endpoint not available`);
            }
        }

        console.log("\n💡 Summary:");
        console.log("If transactions exist but addresses fail, it could mean:");
        console.log("1. Script addresses need special handling");
        console.log('2. The scripts were deployed but not yet "active"');
        console.log(
            "3. Blockfrost has different endpoints for script addresses"
        );
        console.log(
            "4. The addresses might be script hashes that need conversion"
        );
    } catch (error) {
        console.error("❌ Verification failed:", error.message);
    }
}

verifyDeploymentTransactions().catch(console.error);
