export interface CardanoEscrowContract {
  scriptAddress: string;
  scriptHash: string;
  name?: string;
  description?: string;
  createdAt: Date;
  isActive: boolean;
  policyId?: string; // For native tokens
}

export interface CardanoEscrowEvent {
  type: CardanoEscrowEventType;
  scriptAddress: string;
  transactionId: string;
  outputIndex: number;
  slot: number;
  blockHeight: number;
  timestamp: Date;
  data: CardanoEscrowEventData;
}

export enum CardanoEscrowEventType {
  ESCROW_CREATED = 'escrow_created',
  ESCROW_FUNDED = 'escrow_funded',
  ESCROW_RELEASED = 'escrow_released',
  ESCROW_REFUNDED = 'escrow_refunded',
  ESCROW_DISPUTED = 'escrow_disputed',
  ESCROW_RESOLVED = 'escrow_resolved',
  ESCROW_CANCELLED = 'escrow_cancelled'
}

export interface CardanoEscrowEventData {
  buyer?: string;
  seller?: string;
  arbiter?: string;
  amount?: string; // Cardano amounts as strings (lovelace)
  assetId?: string; // For native tokens
  escrowId?: string;
  datum?: any; // Smart contract datum
  redeemer?: any; // Smart contract redeemer
  [key: string]: any;
}

export interface CardanoEscrowState {
  scriptAddress: string;
  escrowId: string;
  buyer: string;
  seller: string;
  arbiter?: string | undefined;
  amount: string; // In lovelace
  assetId?: string; // For native tokens
  status: CardanoEscrowStatus;
  createdAt: Date;
  updatedAt: Date;
  utxo?: CardanoUTXO;
  totalDeposits: string;
  totalReleases: string;
  totalRefunds: string;
}

export enum CardanoEscrowStatus {
  CREATED = 'created',
  FUNDED = 'funded',
  DISPUTED = 'disputed',
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

export interface CardanoMonitorConfig {
  ogmiosUrl: string;
  network: 'testnet' | 'mainnet';
  contracts: CardanoEscrowContract[];
  kupoUrl?: string; // Optional Kupo indexer URL
  enableLogging: boolean;
  syncFromSlot?: number; // Start syncing from specific slot
}

export interface CardanoUTXO {
  transactionId: string;
  outputIndex: number;
  address: string;
  amount: {
    lovelace: string;
    assets?: Record<string, string>;
  };
  datum?: any;
  datumHash?: string;
  scriptRef?: any;
}

export interface OgmiosWebSocketMessage {
  type: 'jsonwsp/request' | 'jsonwsp/response' | 'jsonwsp/fault';
  version: string;
  servicename?: string;
  methodname?: string;
  args?: any;
  result?: any;
  fault?: {
    code: string;
    string: string;
  };
  mirror?: any;
}

export interface OgmiosBlock {
  slot: number;
  hash: string;
  height: number;
  transactions: OgmiosTransaction[];
}

export interface OgmiosTransaction {
  id: string;
  inputs: OgmiosTransactionInput[];
  outputs: OgmiosTransactionOutput[];
  fee: string;
  validityInterval?: {
    invalidBefore?: number;
    invalidAfter?: number;
  };
  certificates?: any[];
  withdrawals?: any;
  mint?: any;
  scriptIntegrityHash?: string;
  auxiliaryDataHash?: string;
  witness?: any;
}

export interface OgmiosTransactionInput {
  transactionId: string;
  outputIndex: number;
}

export interface OgmiosTransactionOutput {
  address: string;
  value: {
    lovelace: string;
    [assetId: string]: string;
  };
  datum?: any;
  datumHash?: string;
  scriptReference?: any;
}

export interface CardanoEscrowMonitorEvents {
  'escrow:event': (event: CardanoEscrowEvent) => void;
  'escrow:state_change': (state: CardanoEscrowState) => void;
  'connection:open': () => void;
  'connection:close': () => void;
  'connection:error': (error: Error) => void;
  'monitor:start': () => void;
  'monitor:stop': () => void;
  'sync:progress': (slot: number, blockHeight: number) => void;
}

export interface CardanoAddress {
  payment: string;
  stake?: string;
  network: 'testnet' | 'mainnet';
}

export interface CardanoAsset {
  policyId: string;
  assetName: string;
  quantity: string;
}
