import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../utils/logger';
import {
  CardanoMonitorConfig,
  CardanoEscrowEvent,
  CardanoEscrowEventType,
  CardanoEscrowState,
  CardanoEscrowContract,
  CardanoEscrowStatus,
  OgmiosWebSocketMessage,
  OgmiosTransaction,
  OgmiosTransactionOutput,
  CardanoEscrowMonitorEvents
} from './types';

export class CardanoEscrowMonitor extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: CardanoMonitorConfig;
  private isConnected: boolean = false;
  private escrowStates: Map<string, CardanoEscrowState> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;
  private currentSlot: number = 0;
  private messageId: number = 1;

  constructor(config: CardanoMonitorConfig) {
    super();
    this.config = config;
    this.validateConfig();
    this.setMaxListeners(20);
  }

  private validateConfig(): void {
    if (!this.config.ogmiosUrl) {
      throw new Error('Ogmios URL is required');
    }
    if (!this.config.contracts || this.config.contracts.length === 0) {
      throw new Error('At least one contract must be provided');
    }
  }

  public async start(): Promise<void> {
    if (this.isConnected) {
      logger.warn('Cardano Monitor is already running');
      return;
    }

    try {
      await this.connect();
      await this.initializeChainSync();
      this.emit('monitor:start');
      logger.info('Cardano Escrow Monitor started successfully');
    } catch (error) {
      logger.error('Failed to start Cardano monitor:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isConnected) {
      logger.warn('Monitor is not running');
      return;
    }

    try {
      this.disconnect();
      this.emit('monitor:stop');
      logger.info('Cardano Escrow Monitor stopped successfully');
    } catch (error) {
      logger.error('Failed to stop Cardano monitor:', error);
      throw error;
    }
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ogmiosUrl = this.config.ogmiosUrl;
      logger.info(`Connecting to Ogmios WebSocket: ${ogmiosUrl}`);

      this.ws = new WebSocket(ogmiosUrl);

      this.ws.on('open', () => {
        logger.info('WebSocket connection to Ogmios established');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connection:open');
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: OgmiosWebSocketMessage = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.error('Failed to parse Ogmios message:', error);
        }
      });

      this.ws.on('close', (code: number, reason: string) => {
        logger.warn(`Ogmios WebSocket connection closed: ${code} - ${reason}`);
        this.isConnected = false;
        this.emit('connection:close');
        this.handleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        logger.error('Ogmios WebSocket error:', error);
        this.emit('connection:error', error);
        if (!this.isConnected) {
          reject(error);
        }
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Ogmios WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Stopping monitor.');
      return;
    }

    this.reconnectAttempts++;
    logger.info(`Attempting to reconnect to Ogmios (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(async () => {
      try {
        await this.connect();
        await this.initializeChainSync();
        logger.info('Successfully reconnected to Ogmios');
      } catch (error) {
        logger.error('Reconnection failed:', error);
        this.handleReconnect();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private sendMessage(message: OgmiosWebSocketMessage): void {
    if (!this.ws || !this.isConnected) {
      throw new Error('WebSocket is not connected');
    }

    const messageStr = JSON.stringify(message);
    if (this.config.enableLogging) {
      logger.debug('Sending Ogmios message:', messageStr);
    }
    this.ws.send(messageStr);
  }

  private async initializeChainSync(): Promise<void> {
    // Initialize chain synchronization
    const findIntersectMessage: OgmiosWebSocketMessage = {
      type: 'jsonwsp/request',
      version: '1.0',
      servicename: 'ogmios',
      methodname: 'FindIntersect',
      args: {
        points: this.config.syncFromSlot ? [{ slot: this.config.syncFromSlot }] : ['origin']
      },
      mirror: { id: this.generateId() }
    };

    this.sendMessage(findIntersectMessage);
  }

  private generateId(): string {
    return (this.messageId++).toString();
  }

  private async handleMessage(message: OgmiosWebSocketMessage): Promise<void> {
    try {
      if (message.type === 'jsonwsp/response') {
        await this.handleResponse(message);
      } else if (message.type === 'jsonwsp/fault') {
        logger.error('Ogmios WebSocket fault:', message.fault);
      }
    } catch (error) {
      logger.error('Error handling Ogmios message:', error);
    }
  }

  private async handleResponse(message: OgmiosWebSocketMessage): Promise<void> {
    if (!message.result) return;

    const { result } = message;

    // Handle different types of responses
    if (result.IntersectionFound) {
      logger.info('Chain intersection found, starting sync...');
      this.requestNextBlock();
    } else if (result.RollForward) {
      await this.handleRollForward(result.RollForward);
    } else if (result.RollBackward) {
      await this.handleRollBackward(result.RollBackward);
    }
  }

  private requestNextBlock(): void {
    const nextBlockMessage: OgmiosWebSocketMessage = {
      type: 'jsonwsp/request',
      version: '1.0',
      servicename: 'ogmios',
      methodname: 'NextBlock',
      args: {},
      mirror: { id: this.generateId() }
    };

    this.sendMessage(nextBlockMessage);
  }

  private async handleRollForward(rollForward: any): Promise<void> {
    const { block } = rollForward;
    
    if (block && block.transactions) {
      this.currentSlot = block.slot || this.currentSlot;
      this.emit('sync:progress', this.currentSlot, block.height || 0);
      
      for (const transaction of block.transactions) {
        await this.processTransaction(transaction, block);
      }
    }

    // Request next block
    this.requestNextBlock();
  }

  private async handleRollBackward(rollBackward: any): Promise<void> {
    const { point } = rollBackward;
    logger.warn('Chain rollback detected:', point);
    
    // Handle rollback by reverting states if necessary
    // This is a simplified implementation
    this.requestNextBlock();
  }

  private async processTransaction(transaction: OgmiosTransaction, block: any): Promise<void> {
    if (!transaction.outputs) return;

    // Check each output for escrow-related transactions
    for (let outputIndex = 0; outputIndex < transaction.outputs.length; outputIndex++) {
      const output = transaction.outputs[outputIndex];
      await this.analyzeOutput(transaction, output, outputIndex, block);
    }

    // Check inputs for spending from escrow addresses
    if (transaction.inputs) {
      for (const input of transaction.inputs) {
        await this.analyzeInput(transaction, input, block);
      }
    }
  }

  private async analyzeOutput(
    transaction: OgmiosTransaction,
    output: OgmiosTransactionOutput,
    outputIndex: number,
    block: any
  ): Promise<void> {
    // Check if output is sent to any of our monitored escrow addresses
    const contract = this.config.contracts.find(c => 
      c.isActive && c.scriptAddress === output.address
    );

    if (!contract) return;

    // Determine event type based on transaction context
    const eventType = this.determineEventType(transaction, output, 'output');
    
    if (eventType) {
      const event: CardanoEscrowEvent = {
        type: eventType,
        scriptAddress: contract.scriptAddress,
        transactionId: transaction.id,
        outputIndex,
        slot: block.slot || 0,
        blockHeight: block.height || 0,
        timestamp: new Date(),
        data: {
          amount: output.value.lovelace,
          assets: this.extractAssets(output.value),
          datum: output.datum,
          datumHash: output.datumHash
        }
      };

      await this.updateEscrowState(event, contract);
      this.emit('escrow:event', event);

      if (this.config.enableLogging) {
        logger.info('Cardano escrow event detected:', {
          type: event.type,
          contract: event.scriptAddress,
          txId: event.transactionId,
          slot: event.slot
        });
      }
    }
  }

  private async analyzeInput(
    _transaction: OgmiosTransaction,
    _input: any,
    _block: any
  ): Promise<void> {
    // This would require looking up the input's original output
    // For now, we'll implement a simplified version
    // In production, you'd use Kupo or similar indexer for this
  }

  private determineEventType(
    _transaction: OgmiosTransaction,
    output: OgmiosTransactionOutput,
    context: 'input' | 'output'
  ): CardanoEscrowEventType | null {
    // Simplified event type determination
    // In production, this would analyze the transaction's redeemer and datum
    
    if (context === 'output') {
      if (output.datum || output.datumHash) {
        return CardanoEscrowEventType.ESCROW_CREATED;
      }
      return CardanoEscrowEventType.ESCROW_FUNDED;
    } else {
      // For inputs, we'd analyze the redeemer to determine the action
      return CardanoEscrowEventType.ESCROW_RELEASED;
    }
  }

  private extractAssets(value: any): Record<string, string> {
    const assets: Record<string, string> = {};
    
    Object.keys(value).forEach(key => {
      if (key !== 'lovelace') {
        assets[key] = value[key];
      }
    });

    return assets;
  }

  private async updateEscrowState(
    event: CardanoEscrowEvent,
    _contract: CardanoEscrowContract
  ): Promise<void> {
    const stateKey = `${event.scriptAddress}-${event.transactionId}-${event.outputIndex}`;
    let state = this.escrowStates.get(stateKey);

    if (!state && event.type === CardanoEscrowEventType.ESCROW_CREATED) {
      // Create new escrow state
      state = {
        scriptAddress: event.scriptAddress,
        escrowId: event.transactionId,
        buyer: '', // Would be extracted from datum
        seller: '', // Would be extracted from datum
        amount: event.data.amount || '0',
        status: CardanoEscrowStatus.CREATED,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        totalDeposits: '0',
        totalReleases: '0',
        totalRefunds: '0'
      };
      
      // Set optional fields only if they exist
      if (event.data.arbiter) {
        state.arbiter = event.data.arbiter;
      }
      if (event.data.assetId) {
        state.assetId = event.data.assetId;
      }
    }

    if (!state) return;

    // Update state based on event type
    switch (event.type) {
      case CardanoEscrowEventType.ESCROW_FUNDED:
        state.status = CardanoEscrowStatus.FUNDED;
        state.totalDeposits = this.addAmounts(state.totalDeposits, event.data.amount || '0');
        break;
      case CardanoEscrowEventType.ESCROW_RELEASED:
        state.status = CardanoEscrowStatus.COMPLETED;
        state.totalReleases = this.addAmounts(state.totalReleases, event.data.amount || '0');
        break;
      case CardanoEscrowEventType.ESCROW_REFUNDED:
        state.status = CardanoEscrowStatus.REFUNDED;
        state.totalRefunds = this.addAmounts(state.totalRefunds, event.data.amount || '0');
        break;
      case CardanoEscrowEventType.ESCROW_DISPUTED:
        state.status = CardanoEscrowStatus.DISPUTED;
        break;
      case CardanoEscrowEventType.ESCROW_CANCELLED:
        state.status = CardanoEscrowStatus.CANCELLED;
        break;
    }

    state.updatedAt = event.timestamp;
    this.escrowStates.set(stateKey, state);
    this.emit('escrow:state_change', state);
  }

  private addAmounts(amount1: string, amount2: string): string {
    return (BigInt(amount1) + BigInt(amount2)).toString();
  }

  // Public methods for external access
  public getEscrowState(scriptAddress: string, escrowId: string): CardanoEscrowState | undefined {
    const stateKey = `${scriptAddress}-${escrowId}`;
    return this.escrowStates.get(stateKey);
  }

  public getAllEscrowStates(): CardanoEscrowState[] {
    return Array.from(this.escrowStates.values());
  }

  public getActiveContracts(): CardanoEscrowContract[] {
    return this.config.contracts.filter(c => c.isActive);
  }

  public addContract(contract: CardanoEscrowContract): void {
    this.config.contracts.push(contract);
  }

  public removeContract(scriptAddress: string): void {
    this.config.contracts = this.config.contracts.filter(c => 
      c.scriptAddress !== scriptAddress
    );
  }

  public isRunning(): boolean {
    return this.isConnected;
  }

  public getCurrentSlot(): number {
    return this.currentSlot;
  }

  public getConnectionStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    currentSlot: number;
    monitoredContracts: number;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      currentSlot: this.currentSlot,
      monitoredContracts: this.config.contracts.filter(c => c.isActive).length
    };
  }
}

// Type-safe event emitter interface
export interface CardanoEscrowMonitor {
  on<K extends keyof CardanoEscrowMonitorEvents>(event: K, listener: CardanoEscrowMonitorEvents[K]): this;
  emit<K extends keyof CardanoEscrowMonitorEvents>(event: K, ...args: Parameters<CardanoEscrowMonitorEvents[K]>): boolean;
}

