import { EscrowMonitor } from '../escrow-monitor/EscrowMonitor';
import { CardanoEscrowMonitor } from '../cardano-escrow-monitor/CardanoEscrowMonitor';
import { CardanoBridge } from '../cardano-bridge/CardanoBridge';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { EscrowEvent, EscrowEventType } from '../escrow-monitor/types';
import { CardanoEscrowEvent, CardanoEscrowEventType } from '../cardano-escrow-monitor/types';
import { CrossChainSettlementData } from '../cardano-bridge/types';

export interface CrossChainCoordinatorConfig {
  enableAutoSettlement: boolean;
  settlementDelay?: number; // milliseconds
  maxRetries: number;
  retryDelay: number;
}

export interface SettlementRecord {
  id: string;
  sourceNetwork: 'ethereum' | 'cardano';
  targetNetwork: 'ethereum' | 'cardano';
  sourceTransactionHash: string;
  targetTransactionHash?: string;
  status: 'pending' | 'completed' | 'failed' | 'retrying';
  attempts: number;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface CrossChainCoordinatorEvents {
  'settlement:initiated': (record: SettlementRecord) => void;
  'settlement:completed': (record: SettlementRecord) => void;
  'settlement:failed': (record: SettlementRecord, error: Error) => void;
  'coordinator:error': (error: Error) => void;
}

export class CrossChainSettlementCoordinator extends EventEmitter {
  private ethereumMonitor: EscrowMonitor;
  private cardanoMonitor: CardanoEscrowMonitor;
  private bridge: CardanoBridge;
  private config: CrossChainCoordinatorConfig;
  private settlements: Map<string, SettlementRecord> = new Map();
  private isRunning: boolean = false;

  constructor(
    ethereumMonitor: EscrowMonitor,
    cardanoMonitor: CardanoEscrowMonitor,
    bridge: CardanoBridge,
    config: CrossChainCoordinatorConfig
  ) {
    super();
    this.ethereumMonitor = ethereumMonitor;
    this.cardanoMonitor = cardanoMonitor;
    this.bridge = bridge;
    this.config = config;
    this.setMaxListeners(20);
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('CrossChainSettlementCoordinator is already running');
      return;
    }

    try {
      if (!this.bridge.isReady()) {
        await this.bridge.initialize();
      }

      this.setupListeners();
      this.isRunning = true;
      logger.info('CrossChainSettlementCoordinator started successfully');
    } catch (error) {
      logger.error('Failed to start CrossChainSettlementCoordinator:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('CrossChainSettlementCoordinator is not running');
      return;
    }

    this.removeAllListeners();
    this.isRunning = false;
    logger.info('CrossChainSettlementCoordinator stopped');
  }

  private setupListeners(): void {
    this.ethereumMonitor.on('escrow:event', this.handleEthereumEvent.bind(this));
    this.cardanoMonitor.on('escrow:event', this.handleCardanoEvent.bind(this));
    this.bridge.on('bridge:error', this.handleBridgeError.bind(this));
  }

  private async handleEthereumEvent(event: EscrowEvent): Promise<void> {
    try {
      logger.info('Handling Ethereum escrow event:', {
        type: event.type,
        contractAddress: event.contractAddress,
        transactionHash: event.transactionHash
      });

      if (!this.shouldProcessEvent(event.type, 'ethereum')) {
        return;
      }

      const settlementData = this.createSettlementDataFromEthereum(event);
      await this.initiateSettlement(settlementData, 'ethereum', 'cardano');
    } catch (error) {
      logger.error('Error handling Ethereum event:', error);
      this.emit('coordinator:error', error as Error);
    }
  }

  private async handleCardanoEvent(event: CardanoEscrowEvent): Promise<void> {
    try {
      logger.info('Handling Cardano escrow event:', {
        type: event.type,
        scriptAddress: event.scriptAddress,
        transactionId: event.transactionId
      });

      if (!this.shouldProcessEvent(event.type, 'cardano')) {
        return;
      }

      const settlementData = this.createSettlementDataFromCardano(event);
      await this.initiateSettlement(settlementData, 'cardano', 'ethereum');
    } catch (error) {
      logger.error('Error handling Cardano event:', error);
      this.emit('coordinator:error', error as Error);
    }
  }

  private shouldProcessEvent(eventType: string, network: 'ethereum' | 'cardano'): boolean {
    if (!this.config.enableAutoSettlement) {
      return false;
    }

    // Only process release events for cross-chain settlement
    if (network === 'ethereum') {
      return eventType === EscrowEventType.RELEASE;
    } else {
      return eventType === CardanoEscrowEventType.ESCROW_RELEASED;
    }
  }

  private createSettlementDataFromEthereum(event: EscrowEvent): CrossChainSettlementData {
    const data: CrossChainSettlementData = {
      escrowId: event.data.escrowId || '0',
      buyer: event.data.buyer || '',
      seller: event.data.seller || '',
      amount: event.data.amount || '0',
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
      network: 'ethereum'
    };
    
    if (event.data.token) {
      data.token = event.data.token;
    }
    
    return data;
  }

  private createSettlementDataFromCardano(event: CardanoEscrowEvent): CrossChainSettlementData {
    const data: CrossChainSettlementData = {
      escrowId: event.data.escrowId || event.transactionId,
      buyer: event.data.buyer || '',
      seller: event.data.seller || '',
      amount: event.data.amount || '0',
      transactionHash: event.transactionId,
      slot: event.slot,
      network: 'cardano'
    };
    
    if (event.data.assetId) {
      data.assetId = event.data.assetId;
    }
    
    return data;
  }

  private async initiateSettlement(
    data: CrossChainSettlementData,
    sourceNetwork: 'ethereum' | 'cardano',
    targetNetwork: 'ethereum' | 'cardano'
  ): Promise<void> {
    const settlementId = this.generateSettlementId(data);
    
    const record: SettlementRecord = {
      id: settlementId,
      sourceNetwork,
      targetNetwork,
      sourceTransactionHash: data.transactionHash,
      status: 'pending',
      attempts: 0,
      createdAt: new Date()
    };

    this.settlements.set(settlementId, record);
    this.emit('settlement:initiated', record);

    if (this.config.settlementDelay && this.config.settlementDelay > 0) {
      setTimeout(() => {
        this.executeSettlement(settlementId, data, targetNetwork);
      }, this.config.settlementDelay);
    } else {
      await this.executeSettlement(settlementId, data, targetNetwork);
    }
  }

  private async executeSettlement(
    settlementId: string,
    data: CrossChainSettlementData,
    targetNetwork: 'ethereum' | 'cardano'
  ): Promise<void> {
    const record = this.settlements.get(settlementId);
    if (!record) {
      logger.error(`Settlement record not found: ${settlementId}`);
      return;
    }

    record.attempts++;
    record.status = 'retrying';

    try {
      let txHash: string;
      
      if (targetNetwork === 'cardano') {
        txHash = await this.bridge.releaseOnCardano(data);
      } else {
        txHash = await this.bridge.releaseOnEthereum(data);
      }

      record.targetTransactionHash = txHash;
      record.status = 'completed';
      record.completedAt = new Date();
      
      this.emit('settlement:completed', record);
      logger.info(`Settlement completed: ${settlementId} -> ${txHash}`);
    } catch (error) {
      logger.error(`Settlement failed (attempt ${record.attempts}/${this.config.maxRetries}):`, error);
      
      if (record.attempts >= this.config.maxRetries) {
        record.status = 'failed';
        record.error = (error as Error).message;
        this.emit('settlement:failed', record, error as Error);
      } else {
        // Retry after delay
        setTimeout(() => {
          this.executeSettlement(settlementId, data, targetNetwork);
        }, this.config.retryDelay);
      }
    }
  }

  private handleBridgeError(error: Error, operation: string): void {
    logger.error(`Bridge error in operation ${operation}:`, error);
    this.emit('coordinator:error', error);
  }

  private generateSettlementId(data: CrossChainSettlementData): string {
    const timestamp = Date.now();
    const hash = data.transactionHash.slice(0, 8);
    return `settlement_${data.network}_${hash}_${timestamp}`;
  }

  // Public methods for monitoring and management
  public getSettlementRecord(id: string): SettlementRecord | undefined {
    return this.settlements.get(id);
  }

  public getAllSettlements(): SettlementRecord[] {
    return Array.from(this.settlements.values());
  }

  public getPendingSettlements(): SettlementRecord[] {
    return Array.from(this.settlements.values()).filter(s => 
      s.status === 'pending' || s.status === 'retrying'
    );
  }

  public getCompletedSettlements(): SettlementRecord[] {
    return Array.from(this.settlements.values()).filter(s => s.status === 'completed');
  }

  public getFailedSettlements(): SettlementRecord[] {
    return Array.from(this.settlements.values()).filter(s => s.status === 'failed');
  }

  public getStatus(): {
    running: boolean;
    totalSettlements: number;
    pendingSettlements: number;
    completedSettlements: number;
    failedSettlements: number;
  } {
    return {
      running: this.isRunning,
      totalSettlements: this.settlements.size,
      pendingSettlements: this.getPendingSettlements().length,
      completedSettlements: this.getCompletedSettlements().length,
      failedSettlements: this.getFailedSettlements().length
    };
  }

  public isOperational(): boolean {
    return this.isRunning && this.bridge.isReady();
  }
}

// Type-safe event emitter interface
export interface CrossChainSettlementCoordinator {
  on<K extends keyof CrossChainCoordinatorEvents>(event: K, listener: CrossChainCoordinatorEvents[K]): this;
  emit<K extends keyof CrossChainCoordinatorEvents>(event: K, ...args: Parameters<CrossChainCoordinatorEvents[K]>): boolean;
}
