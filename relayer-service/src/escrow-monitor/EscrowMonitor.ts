import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { BigNumber, ethers } from 'ethers';
import { logger } from '../utils/logger';
import {
  MonitorConfig,
  EscrowContract,
  EscrowEvent,
  EscrowEventType,
  EscrowState,
  EscrowStatus,
  WebSocketMessage,
  AlchemyWebSocketResponse,
  EscrowMonitorEvents
} from './types';

export class EscrowMonitor extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: MonitorConfig;
  private subscriptions: Map<string, string> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;
  private isConnected: boolean = false;
  private escrowStates: Map<string, EscrowState> = new Map();
  private messageId: number = 1;

  // Common Escrow Contract ABI events (can be extended)
  private readonly ESCROW_EVENTS = [
    'event EscrowCreated(uint256 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount, address token)',
    'event EscrowFunded(uint256 indexed escrowId, uint256 amount)',
    'event EscrowReleased(uint256 indexed escrowId, uint256 amount)',
    'event EscrowRefunded(uint256 indexed escrowId, uint256 amount)',
    'event EscrowDisputed(uint256 indexed escrowId, address indexed disputer)',
    'event EscrowResolved(uint256 indexed escrowId, uint256 buyerAmount, uint256 sellerAmount)',
    'event EscrowCancelled(uint256 indexed escrowId)'
  ];

  constructor(config: MonitorConfig) {
    super();
    this.config = config;
    this.validateConfig();
    
    // Type the EventEmitter to support our custom events
    this.setMaxListeners(20);
  }

  private validateConfig(): void {
    if (!this.config.alchemyApiKey) {
      throw new Error('Alchemy API Key is required');
    }
    if (!this.config.contracts || this.config.contracts.length === 0) {
      throw new Error('At least one contract address must be provided');
    }
    for (const contract of this.config.contracts) {
      if (!ethers.utils.isAddress(contract.address)) {
        throw new Error(`Invalid contract address: ${contract.address}`);
      }
    }
  }

  private getWebSocketUrl(): string {
    const baseUrl = this.config.network === 'sepolia' 
      ? 'wss://eth-sepolia.g.alchemy.com/v2'
      : `wss://eth-${this.config.network}.g.alchemy.com/v2`;
    return `${baseUrl}/${this.config.alchemyApiKey}`;
  }

  private generateId(): string {
    return (this.messageId++).toString();
  }

  private createLogFilter(contractAddress: string): any {
    const eventTopics = this.ESCROW_EVENTS.map(eventSig => {
      const iface = new ethers.utils.Interface([eventSig]);
      const eventFragment = Object.values(iface.events)[0];
      return iface.getEventTopic(eventFragment);
    });

    return {
      address: contractAddress,
      topics: [eventTopics] // Any of these event topics
    };
  }

  public async start(): Promise<void> {
    if (this.isConnected) {
      logger.warn('Monitor is already running');
      return;
    }

    try {
      await this.connect();
      await this.subscribeToContracts();
      this.emit('monitor:start');
      logger.info('Escrow Monitor started successfully');
    } catch (error) {
      logger.error('Failed to start monitor:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isConnected) {
      logger.warn('Monitor is not running');
      return;
    }

    try {
      await this.unsubscribeAll();
      this.disconnect();
      this.emit('monitor:stop');
      logger.info('Escrow Monitor stopped successfully');
    } catch (error) {
      logger.error('Failed to stop monitor:', error);
      throw error;
    }
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.getWebSocketUrl();
      logger.info(`Connecting to Alchemy WebSocket: ${wsUrl.replace(this.config.alchemyApiKey, '[API_KEY]')}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        logger.info('WebSocket connection established');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connection:open');
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: AlchemyWebSocketResponse = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.error('Failed to parse WebSocket message:', error);
        }
      });

      this.ws.on('close', (code: number, reason: string) => {
        logger.warn(`WebSocket connection closed: ${code} - ${reason}`);
        this.isConnected = false;
        this.emit('connection:close');
        this.handleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        logger.error('WebSocket error:', error);
        this.emit('connection:error', error);
        if (!this.isConnected) {
          reject(error);
        }
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.subscriptions.clear();
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Stopping monitor.');
      return;
    }

    this.reconnectAttempts++;
    logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(async () => {
      try {
        await this.connect();
        await this.subscribeToContracts();
        logger.info('Successfully reconnected and resubscribed');
      } catch (error) {
        logger.error('Reconnection failed:', error);
        this.handleReconnect();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private sendMessage(message: WebSocketMessage): void {
    if (!this.ws || !this.isConnected) {
      throw new Error('WebSocket is not connected');
    }

    const messageStr = JSON.stringify(message);
    logger.debug('Sending WebSocket message:', messageStr);
    this.ws.send(messageStr);
  }

  private async subscribeToContracts(): Promise<void> {
    for (const contract of this.config.contracts) {
      if (!contract.isActive) continue;

      try {
        await this.subscribeToContract(contract);
        logger.info(`Successfully subscribed to contract: ${contract.address}`);
      } catch (error) {
        logger.error(`Failed to subscribe to contract ${contract.address}:`, error);
      }
    }
  }

  private async subscribeToContract(contract: EscrowContract): Promise<void> {
    const filter = this.createLogFilter(contract.address);
    const subscriptionId = this.generateId();

    const message: WebSocketMessage = {
      id: subscriptionId,
      method: 'eth_subscribe',
      params: ['logs', filter]
    };

    this.sendMessage(message);
    this.subscriptions.set(subscriptionId, contract.address);
  }

  private async unsubscribeAll(): Promise<void> {
    const unsubscribePromises = Array.from(this.subscriptions.keys()).map(subId => {
      const message: WebSocketMessage = {
        id: this.generateId(),
        method: 'eth_unsubscribe',
        params: [subId]
      };

      this.sendMessage(message);
      return subId;
    });

    this.subscriptions.clear();
    logger.info(`Unsubscribed from ${unsubscribePromises.length} subscriptions`);
  }

  private handleMessage(message: AlchemyWebSocketResponse): void {
    if (message.method === 'eth_subscription' && message.params) {
      this.handleLogEvent(message.params.result);
    } else if (message.id && message.result) {
      logger.debug(`Subscription confirmed: ${message.id}`);
    } else if (message.error) {
      logger.error('WebSocket error:', message.error);
    }
  }

  private async handleLogEvent(log: any): Promise<void> {
    try {
      const contractAddress = log.address.toLowerCase();
      const contract = this.config.contracts.find(c => 
        c.address.toLowerCase() === contractAddress
      );

      if (!contract) {
        logger.warn(`Received log for unknown contract: ${contractAddress}`);
        return;
      }

      const event = await this.parseLogEvent(log, contract);
      if (event) {
        await this.updateEscrowState(event);
        this.emit('escrow:event', event);
        
        if (this.config.enableLogging) {
          logger.info('Escrow event detected:', {
            type: event.type,
            contract: event.contractAddress,
            txHash: event.transactionHash,
            blockNumber: event.blockNumber
          });
        }
      }
    } catch (error) {
      logger.error('Failed to handle log event:', error);
    }
  }

  private async parseLogEvent(log: any, contract: EscrowContract): Promise<EscrowEvent | null> {
    try {
      const iface = new ethers.utils.Interface(this.ESCROW_EVENTS);
      const parsedLog = iface.parseLog(log);
      
      const eventType = this.mapEventType(parsedLog.name);
      if (!eventType) return null;

      const timestamp = new Date(); // In production, you'd get this from block data

      return {
        type: eventType,
        contractAddress: contract.address,
        transactionHash: log.transactionHash,
        blockNumber: parseInt(log.blockNumber, 16),
        timestamp,
        data: this.extractEventData(parsedLog, eventType)
      };
    } catch (error) {
      logger.error('Failed to parse log event:', error);
      return null;
    }
  }

  private mapEventType(eventName: string): EscrowEventType | null {
    const mapping: Record<string, EscrowEventType> = {
      'EscrowCreated': EscrowEventType.CONTRACT_CREATED,
      'EscrowFunded': EscrowEventType.DEPOSIT,
      'EscrowReleased': EscrowEventType.RELEASE,
      'EscrowRefunded': EscrowEventType.REFUND,
      'EscrowDisputed': EscrowEventType.DISPUTE,
      'EscrowResolved': EscrowEventType.RESOLVE,
      'EscrowCancelled': EscrowEventType.CONTRACT_CANCELLED
    };

    return mapping[eventName] || null;
  }

  private extractEventData(parsedLog: ethers.utils.LogDescription, eventType: EscrowEventType): any {
    const data: any = {};

    // Extract common fields
    if (parsedLog.args['escrowId']) {
      data.escrowId = parsedLog.args['escrowId'].toString();
    }
    if (parsedLog.args['buyer']) {
      data.buyer = parsedLog.args['buyer'];
    }
    if (parsedLog.args['seller']) {
      data.seller = parsedLog.args['seller'];
    }
    if (parsedLog.args['amount']) {
      data.amount = parsedLog.args['amount'];
    }
    if (parsedLog.args['token']) {
      data.token = parsedLog.args['token'];
    }

    // Extract event-specific fields
    switch (eventType) {
      case EscrowEventType.DISPUTE:
        if (parsedLog.args['disputer']) {
          data.disputer = parsedLog.args['disputer'];
        }
        break;
      case EscrowEventType.RESOLVE:
        if (parsedLog.args['buyerAmount']) {
          data.buyerAmount = parsedLog.args['buyerAmount'];
        }
        if (parsedLog.args['sellerAmount']) {
          data.sellerAmount = parsedLog.args['sellerAmount'];
        }
        break;
    }

    return data;
  }

  private async updateEscrowState(event: EscrowEvent): Promise<void> {
    const stateKey = `${event.contractAddress}-${event.data.escrowId}`;
    let state = this.escrowStates.get(stateKey);

    if (!state && event.type === EscrowEventType.CONTRACT_CREATED) {
      // Create new escrow state
      state = {
        contractAddress: event.contractAddress,
        escrowId: event.data.escrowId || '0',
        buyer: event.data.buyer || ethers.constants.AddressZero,
        seller: event.data.seller || ethers.constants.AddressZero,
        arbiter: event.data.arbiter,
        amount: event.data.amount || BigNumber.from(0),
        token: event.data.token || ethers.constants.AddressZero,
        status: EscrowStatus.CREATED,
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        deposits: BigNumber.from(0),
        releases: BigNumber.from(0),
        refunds: BigNumber.from(0)
      };
    }

    if (!state) return;

    // Update state based on event type
    switch (event.type) {
      case EscrowEventType.DEPOSIT:
        state.status = EscrowStatus.FUNDED;
        state.deposits = state.deposits.add(event.data.amount || 0);
        break;
      case EscrowEventType.RELEASE:
        state.status = EscrowStatus.COMPLETED;
        state.releases = state.releases.add(event.data.amount || 0);
        break;
      case EscrowEventType.REFUND:
        state.status = EscrowStatus.REFUNDED;
        state.refunds = state.refunds.add(event.data.amount || 0);
        break;
      case EscrowEventType.DISPUTE:
        state.status = EscrowStatus.DISPUTED;
        break;
      case EscrowEventType.CONTRACT_CANCELLED:
        state.status = EscrowStatus.CANCELLED;
        break;
    }

    state.updatedAt = event.timestamp;
    this.escrowStates.set(stateKey, state);
    this.emit('escrow:state_change', state);
  }

  // Public methods for external access
  public getEscrowState(contractAddress: string, escrowId: string): EscrowState | undefined {
    const stateKey = `${contractAddress}-${escrowId}`;
    return this.escrowStates.get(stateKey);
  }

  public getAllEscrowStates(): EscrowState[] {
    return Array.from(this.escrowStates.values());
  }

  public getActiveContracts(): EscrowContract[] {
    return this.config.contracts.filter(c => c.isActive);
  }

  public addContract(contract: EscrowContract): void {
    this.config.contracts.push(contract);
    if (this.isConnected && contract.isActive) {
      this.subscribeToContract(contract).catch(error => {
        logger.error(`Failed to subscribe to new contract ${contract.address}:`, error);
      });
    }
  }

  public removeContract(address: string): void {
    this.config.contracts = this.config.contracts.filter(c => 
      c.address.toLowerCase() !== address.toLowerCase()
    );
    // Note: This doesn't unsubscribe from existing subscriptions
    // In production, you'd want to track and unsubscribe properly
  }

  public isRunning(): boolean {
    return this.isConnected;
  }

  public getConnectionStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    subscriptions: number;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: this.subscriptions.size
    };
  }
}

// Type-safe event emitter interface
export interface EscrowMonitor {
  on<K extends keyof EscrowMonitorEvents>(event: K, listener: EscrowMonitorEvents[K]): this;
  emit<K extends keyof EscrowMonitorEvents>(event: K, ...args: Parameters<EscrowMonitorEvents[K]>): boolean;
}
