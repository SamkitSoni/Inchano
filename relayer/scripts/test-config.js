#!/usr/bin/env node

// Simple test script to verify basic functionality without requiring real credentials
const { config } = require("../dist/config");

console.log("🔧 Testing Inchano Relayer Configuration...\n");

// Test configuration loading
console.log("📋 Configuration:");
console.log(`  Port: ${config.port}`);
console.log(`  Node Environment: ${config.nodeEnv}`);
console.log(`  Log Level: ${config.logLevel}`);

console.log("\n🪙 Cardano Configuration:");
console.log(`  Network: ${config.cardano.network}`);
console.log(`  LOP Address: ${config.cardano.contracts.lopAddress}`);
console.log(
    `  Escrow Factory: ${config.cardano.contracts.escrowFactoryAddress}`
);

console.log("\n⚡ Ethereum Configuration:");
console.log(`  LOP Address: ${config.ethereum.contracts.lopAddress}`);
console.log(
    `  Escrow Factory: ${config.ethereum.contracts.escrowFactoryAddress}`
);
console.log(`  Fee Bank: ${config.ethereum.contracts.feeBankAddress}`);
console.log(`  Escrow Src: ${config.ethereum.contracts.escrowSrcAddress}`);
console.log(`  Escrow Dst: ${config.ethereum.contracts.escrowDstAddress}`);
console.log(`  WETH: ${config.ethereum.contracts.wethAddress}`);

console.log("\n✅ Configuration test completed!");
console.log("\n📝 Next steps:");
console.log("  1. Add your real Blockfrost Project ID to .env");
console.log("  2. Add your real Cardano wallet seed phrase to .env");
console.log("  3. Add your real Ethereum RPC URL to .env");
console.log("  4. Add your real Ethereum private key to .env");
console.log("  5. Run: npm run dev");
console.log("\n🚀 Then test the API endpoints:");
console.log("  curl http://localhost:3000/health");
console.log("  curl http://localhost:3000/status");
console.log("  curl http://localhost:3000/test-connections");
