// Cardano Configuration - Updated 2025-08-02T21:54:58.496Z
export const cardanoConfig = {
  network: 'preprod',
  blockfrost: {
    projectId: process.env.BLOCKFROST_PROJECT_ID!,
    baseUrl: 'https://cardano-preprod.blockfrost.io/api/v0'
  },
  contracts: {
    limitOrderProtocol: {
      address: 'addr_test1w9f069f153ac688ac08c97da0a29e7c061ba21dadae384edcfa2369fc',
      scriptHash: '9f069f153ac688ac08c97da0a29e7c061ba21dadae384edcfa2369fc',
      deploymentTx: '7801f3b5eaf20656dbbc2fce5f5442a66faeb26eb73e0667ba9e23f72a5f8eff'
    },
    escrowFactory: {
      address: 'addr_test1w1e0a111161ed6495ef29fac0c4209838724c26680d0420af26d5bcec',
      scriptHash: '1e0a111161ed6495ef29fac0c4209838724c26680d0420af26d5bcec',
      deploymentTx: '42aab5b4d82d151d8831c3cd787e814548738eaeb2d23112c6d1424147112c1c',
      lopIntegration: 'addr_test1w9f069f153ac688ac08c97da0a29e7c061ba21dadae384edcfa2369fc'
    }
  },
  wallet: {
    seedPhrase: process.env.CARDANO_WALLET_SEED_PHRASE!
  }
};

export default cardanoConfig;
