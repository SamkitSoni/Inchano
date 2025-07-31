#!/usr/bin/env node

/**
 * Demo script for the Ethereum Escrow Monitor Service
 * This script demonstrates how to use the EscrowMonitor to monitor
 * escrow contracts on Sepolia testnet using Alchemy WebSockets
 */

import { EscrowMonitor } from '../escrow-monitor/EscrowMonitor';
import { EscrowContract } from '../escrow-monitor/types';
import { logger } from '../utils/logger';

// Configuration for the demo
const DEMO_CONFIG = {
  alchemyApiKey: process.env['ALCHEMY_API_KEY'] || 'demo-key',
  network: 'sepolia' as const,
  contracts: [
    {
      address: '0x1234567890123456789012345678901234567890',
      name: 'Demo Escrow Contract 1',
      description: 'First demo escrow contract for testing',
      createdAt: new Date(),
      isActive: true
    },
    {
      address: '0x0987654321098765432109876543210987654321',
      name: 'Demo Escrow Contract 2', 
      description: 'Second demo escrow contract for testing',
      createdAt: new Date(),
      isActive: true
    }
  ] as EscrowContract[],
  enableLogging: true
};

class EscrowMonitorDemo {
  private monitor: EscrowMonitor;

  constructor() {
    console.log('🚀 Initializing Ethereum Escrow Monitor Demo...\n');
    
    // Create the monitor instance
    this.monitor = new EscrowMonitor(DEMO_CONFIG);
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Connection events
    this.monitor.on('connection:open', () => {
      console.log('✅ WebSocket connection established');
    });

    this.monitor.on('connection:close', () => {
      console.log('❌ WebSocket connection closed');
    });

    this.monitor.on('connection:error', (error) => {
      console.log('🔥 WebSocket connection error:', error.message);
    });

    // Monitor lifecycle events
    this.monitor.on('monitor:start', () => {
      console.log('🎯 Escrow Monitor started successfully');
      this.displayStatus();
    });

    this.monitor.on('monitor:stop', () => {
      console.log('⏹️  Escrow Monitor stopped');
    });

    // Escrow events
    this.monitor.on('escrow:event', (event) => {
      console.log('\n📦 New Escrow Event Detected:');
      console.log(`   Type: ${event.type}`);
      console.log(`   Contract: ${event.contractAddress}`);
      console.log(`   TX Hash: ${event.transactionHash}`);
      console.log(`   Block: ${event.blockNumber}`);
      console.log(`   Time: ${event.timestamp.toISOString()}`);
      
      if (event.data.escrowId) {
        console.log(`   Escrow ID: ${event.data.escrowId}`);
      }
      if (event.data.buyer) {
        console.log(`   Buyer: ${event.data.buyer}`);
      }
      if (event.data.seller) {
        console.log(`   Seller: ${event.data.seller}`);
      }
      if (event.data.amount) {
        console.log(`   Amount: ${event.data.amount.toString()} wei`);
      }
      console.log('');
    });

    this.monitor.on('escrow:state_change', (state) => {
      console.log('\n🔄 Escrow State Changed:');
      console.log(`   Contract: ${state.contractAddress}`);
      console.log(`   Escrow ID: ${state.escrowId}`);
      console.log(`   Status: ${state.status}`);
      console.log(`   Buyer: ${state.buyer}`);
      console.log(`   Seller: ${state.seller}`);
      console.log(`   Amount: ${state.amount.toString()} wei`);
      console.log(`   Deposits: ${state.deposits.toString()} wei`);
      console.log(`   Releases: ${state.releases.toString()} wei`);
      console.log(`   Refunds: ${state.refunds.toString()} wei`);
      console.log(`   Updated: ${state.updatedAt.toISOString()}`);
      console.log('');
    });
  }

  private displayStatus(): void {
    const status = this.monitor.getConnectionStatus();
    const contracts = this.monitor.getActiveContracts();
    const states = this.monitor.getAllEscrowStates();

    console.log('\n📊 Monitor Status:');
    console.log(`   Connected: ${status.connected}`);
    console.log(`   Subscriptions: ${status.subscriptions}`);
    console.log(`   Reconnect Attempts: ${status.reconnectAttempts}`);
    console.log(`   Active Contracts: ${contracts.length}`);
    console.log(`   Tracked Escrows: ${states.length}`);
    console.log('');

    if (contracts.length > 0) {
      console.log('📋 Monitored Contracts:');
      contracts.forEach((contract, index) => {
        console.log(`   ${index + 1}. ${contract.name || 'Unnamed Contract'}`);
        console.log(`      Address: ${contract.address}`);
        console.log(`      Description: ${contract.description || 'No description'}`);
        console.log(`      Active: ${contract.isActive}`);
        console.log('');
      });
    }
  }

  private displayHelp(): void {
    console.log('\n📚 Available Commands:');
    console.log('   start    - Start monitoring escrow contracts');
    console.log('   stop     - Stop monitoring');
    console.log('   status   - Show current status');
    console.log('   states   - Show all escrow states');
    console.log('   add      - Add a new contract to monitor');
    console.log('   help     - Show this help message');
    console.log('   exit     - Exit the demo');
    console.log('');
  }

  public async start(): Promise<void> {
    console.log('🌟 Ethereum Escrow Monitor Demo');
    console.log('================================\n');
    
    if (!DEMO_CONFIG.alchemyApiKey || DEMO_CONFIG.alchemyApiKey === 'demo-key') {
      console.log('⚠️  WARNING: No Alchemy API key provided!');
      console.log('   Set ALCHEMY_API_KEY environment variable to connect to actual Sepolia testnet');
      console.log('   For now, running in demo mode...\n');
    }

    this.displayHelp();

    // Start the monitor
    try {
      console.log('🔄 Starting Escrow Monitor...');
      await this.monitor.start();
    } catch (error) {
      console.error('❌ Failed to start monitor:', error);
      console.log('\n💡 This is expected if no valid Alchemy API key is provided');
      console.log('   The demo shows the structure and API of the service\n');
    }

    // Setup interactive CLI
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (data) => {
      const command = data.toString().trim().toLowerCase();
      this.handleCommand(command);
    });

    console.log('💬 Type "help" for available commands, or "exit" to quit\n');
  }

  private async handleCommand(command: string): Promise<void> {
    switch (command) {
      case 'start':
        try {
          await this.monitor.start();
          console.log('✅ Monitor started');
        } catch (error) {
          console.log('❌ Failed to start:', (error as Error).message);
        }
        break;

      case 'stop':
        try {
          await this.monitor.stop();
          console.log('⏹️  Monitor stopped');
        } catch (error) {
          console.log('❌ Failed to stop:', (error as Error).message);
        }
        break;

      case 'status':
        this.displayStatus();
        break;

      case 'states':
        const states = this.monitor.getAllEscrowStates();
        if (states.length === 0) {
          console.log('📭 No escrow states tracked yet');
        } else {
          console.log(`\n📦 Tracked Escrow States (${states.length}):`);
          states.forEach((state, index) => {
            console.log(`   ${index + 1}. Escrow ${state.escrowId} on ${state.contractAddress}`);
            console.log(`      Status: ${state.status}`);
            console.log(`      Amount: ${state.amount.toString()} wei`);
            console.log(`      Last Updated: ${state.updatedAt.toISOString()}`);
          });
        }
        console.log('');
        break;

      case 'add':
        console.log('🔧 Adding new contract (demo)...');
        const newContract: EscrowContract = {
          address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          name: 'Demo Added Contract',
          description: 'Contract added via CLI demo',
          createdAt: new Date(),
          isActive: true
        };
        this.monitor.addContract(newContract);
        console.log(`✅ Added contract: ${newContract.address}`);
        break;

      case 'help':
        this.displayHelp();
        break;

      case 'exit':
        console.log('👋 Stopping demo and exiting...');
        try {
          await this.monitor.stop();
        } catch (error) {
          // Ignore stop errors during exit
        }
        process.exit(0);

      default:
        if (command.length > 0) {
          console.log(`❓ Unknown command: ${command}`);
          console.log('   Type "help" for available commands\n');
        }
        break;
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.monitor.stop();
    } catch (error) {
      logger.error('Error stopping monitor:', error);
    }
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  const demo = new EscrowMonitorDemo();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Received SIGINT, shutting down gracefully...');
    await demo.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Received SIGTERM, shutting down gracefully...');
    await demo.stop();
    process.exit(0);
  });

  // Start the demo
  demo.start().catch((error) => {
    console.error('Demo failed to start:', error);
    process.exit(1);
  });
}

export { EscrowMonitorDemo };
