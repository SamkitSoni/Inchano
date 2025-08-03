#!/usr/bin/env node

// Test different Cardano networks to find where contracts were deployed
const { BlockFrostAPI } = require("@blockfrost/blockfrost-js");
require("dotenv").config();

async function findDeploymentNetwork() {
    console.log(
        "🌍 Searching Different Cardano Networks for Contract Deployments...\n"
    );

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

    // Check if we have preview network token
    const previewToken = process.env.BLOCKFROST_PREVIEW_PROJECT_ID;
    if (!previewToken) {
        console.log(
            "⚠️  No preview network token found. You may need to create one at:"
        );
        console.log("   https://blockfrost.io/dashboard");
        console.log(
            "   and add BLOCKFROST_PREVIEW_PROJECT_ID to your .env file\n"
        );
    }

    // Test networks we have access to
    const networks = [
        { name: "preprod", token: process.env.BLOCKFROST_PROJECT_ID },
        { name: "preview", token: previewToken },
        // We could also test mainnet but these are test addresses
    ];

    for (const network of networks) {
        if (!network.token) {
            console.log(`⏭️  Skipping ${network.name} - no token configured\n`);
            continue;
        }

        console.log(`🔍 Testing ${network.name.toUpperCase()} network...`);

        try {
            const blockfrost = new BlockFrostAPI({
                projectId: network.token,
                network: network.name,
            });

            // Test network connectivity
            const networkInfo = await blockfrost.network();
            console.log(
                `   ✅ Connected to ${network.name}: ${networkInfo.network}`
            );

            // Test each deployment
            for (const [name, info] of Object.entries(deployments)) {
                console.log(`\n   🔍 Testing ${name}:`);

                // Test transaction
                try {
                    const tx = await blockfrost.txs(info.txHash);
                    console.log(
                        `      ✅ Transaction found! Block: ${tx.block}, Slot: ${tx.slot}`
                    );

                    // Get outputs to see what addresses were created
                    const txUtxos = await blockfrost.txsUtxos(info.txHash);
                    console.log(`      📦 Transaction outputs:`);
                    txUtxos.outputs.forEach((output, i) => {
                        const ada = output.amount.find(
                            (a) => a.unit === "lovelace"
                        );
                        console.log(
                            `         ${i}: ${output.address} (${
                                ada?.quantity || 0
                            } lovelace)`
                        );
                    });

                    // Test if our expected address appears
                    const foundAddress = txUtxos.outputs.find(
                        (output) => output.address === info.address
                    );
                    if (foundAddress) {
                        console.log(
                            `      ✅ Expected address found in outputs!`
                        );
                    } else {
                        console.log(
                            `      ⚠️  Expected address not in outputs - might be derived differently`
                        );
                    }
                } catch (txError) {
                    console.log(
                        `      ❌ Transaction not found: ${txError.message}`
                    );
                }

                // Test address directly
                try {
                    const addressInfo = await blockfrost.addresses(
                        info.address
                    );
                    console.log(
                        `      ✅ Address exists: ${addressInfo.type}, script: ${addressInfo.script}`
                    );
                } catch (addrError) {
                    console.log(
                        `      ❌ Address query failed: ${addrError.message}`
                    );
                }
            }
        } catch (error) {
            console.log(
                `   ❌ Failed to connect to ${network.name}: ${error.message}`
            );
        }

        console.log(""); // Spacing
    }

    console.log("💡 Next Steps:");
    console.log(
        "1. If transactions found on different network, update your service configuration"
    );
    console.log(
        "2. If transactions not found anywhere, contracts may not be deployed yet"
    );
    console.log(
        "3. If addresses differ from transactions, check Cardano address derivation"
    );
    console.log("4. Consider deploying contracts yourself if needed");
}

findDeploymentNetwork().catch(console.error);
