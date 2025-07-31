import { BigNumber } from 'ethers';

export interface CrossChainSettlementData {
  escrowId: string;
  buyer: string;
  seller: string;
  amount: string | BigNumber;
  token?: string;
  assetId?: string;
  transactionHash: string;
  blockNumber?: number;
  slot?: number;
  network: 'ethereum' | 'cardano';
}

export interface CardanoTransactionInput {
  transactionId: string;
  outputIndex: number;
}

export interface CardanoTransactionOutput {
  address: string;
  amount: string;
  assets?: Record<string, string>;
  datum?: any;
  datumHash?: string;
}

export interface CardanoTransaction {
  inputs: CardanoTransactionInput[];
  outputs: CardanoTransactionOutput[];
  fee: string;
  ttl?: number;
  metadata?: any;
}

export interface EthereumTransactionData {
  to: string;
  value: string;
  data: string;
  gasLimit: string;
  gasPrice: string;
}

export interface BridgeConfig {
  cardanoNodeUrl: string;
  cardanoNetwork: 'testnet' | 'mainnet';
  ethereumRpcUrl: string;
  ethereumNetwork: 'sepolia' | 'mainnet';
  privateKey: string;
  cardanoWalletSeed: string;
}

export interface CrossChainBridgeEvents {
  'settlement:ethereum_to_cardano': (data: CrossChainSettlementData) => void;
  'settlement:cardano_to_ethereum': (data: CrossChainSettlementData) => void;
  'transaction:submitted': (txHash: string, network: 'ethereum' | 'cardano') => void;
  'transaction:confirmed': (txHash: string, network: 'ethereum' | 'cardano') => void;
  'bridge:error': (error: Error, operation: string) => void;
}
