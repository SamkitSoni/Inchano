import { BigNumber } from 'ethers';

export interface EscrowContract {
  address: string;
  name?: string;
  description?: string;
  createdAt: Date;
  isActive: boolean;
}

export interface EscrowEvent {
  type: EscrowEventType;
  contractAddress: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: Date;
  data: EscrowEventData;
}

export enum EscrowEventType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  RELEASE = 'release',
  REFUND = 'refund',
  DISPUTE = 'dispute',
  RESOLVE = 'resolve',
  CONTRACT_CREATED = 'contract_created',
  CONTRACT_CANCELLED = 'contract_cancelled'
}

export interface EscrowEventData {
  buyer?: string;
  seller?: string;
  arbiter?: string;
  amount?: BigNumber;
  token?: string;
  escrowId?: string;
  reason?: string;
  [key: string]: any;
}

export interface EscrowState {
  contractAddress: string;
  escrowId: string;
  buyer: string;
  seller: string;
  arbiter?: string | undefined;
  amount: BigNumber;
  token: string;
  status: EscrowStatus;
  createdAt: Date;
  updatedAt: Date;
  deposits: BigNumber;
  releases: BigNumber;
  refunds: BigNumber;
}

export enum EscrowStatus {
  CREATED = 'created',
  FUNDED = 'funded',
  DISPUTED = 'disputed',
  COMPLETED = 'completed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

export interface MonitorConfig {
  alchemyApiKey: string;
  network: 'sepolia' | 'mainnet' | 'polygon' | 'arbitrum';
  contracts: EscrowContract[];
  webhookUrl?: string | undefined;
  enableLogging: boolean;
}

export interface WebSocketMessage {
  id: string;
  method: string;
  params: any[];
}

export interface AlchemyWebSocketResponse {
  jsonrpc: string;
  id?: string;
  method?: string;
  params?: {
    subscription: string;
    result: any;
  };
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

export interface EscrowMonitorEvents {
  'escrow:event': (event: EscrowEvent) => void;
  'escrow:state_change': (state: EscrowState) => void;
  'connection:open': () => void;
  'connection:close': () => void;
  'connection:error': (error: Error) => void;
  'monitor:start': () => void;
  'monitor:stop': () => void;
}
