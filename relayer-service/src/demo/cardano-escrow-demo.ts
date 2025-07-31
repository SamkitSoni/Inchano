import { 
  CardanoEscrowMonitor,
  createDefaultCardanoConfig,
  OGMIOS_ENDPOINTS,
  CardanoEscrowEventType,
  CardanoEscrowStatus 
} from '../cardano-escrow-monitor';
import { logger } from '../utils/logger';

async function demonstrateCardanoEscrowMonitor() {
  logger.info('=== Cardano Escrow Monitor Demo ===');

  // Create configuration
  const ogmiosUrl = process.env['OGMIOS_URL'] || OGMIOS_ENDPOINTS.local;
  const config = createDefaultCardanoConfig(ogmiosUrl);
  
  logger.info('Configuration:', {
    network: config.network,
    ogmiosUrl: config.ogmiosUrl,
    contractsCount: config.contracts.length,
    enableLogging: config.enableLogging
  });

  // Create monitor instance
  const monitor = new CardanoEscrowMonitor(config);

  // Set up event listeners
  monitor.on('monitor:start', () => {
    logger.info('✅ Cardano Escrow Monitor started successfully');
  });

  monitor.on('monitor:stop', () => {
    logger.info('⏹️  Cardano Escrow Monitor stopped');
  });

  monitor.on('connection:open', () => {
    logger.info('🔗 Connected to Ogmios WebSocket');
  });

  monitor.on('connection:close', () => {
    logger.warn('🔌 Disconnected from Ogmios WebSocket');
  });

  monitor.on('connection:error', (error) => {
    logger.error('❌ WebSocket connection error:', error.message);
  });

  monitor.on('sync:progress', (slot, blockHeight) => {
    if (slot % 100 === 0) { // Log every 100 slots to avoid spam
      logger.info(`📊 Sync progress - Slot: ${slot}, Block Height: ${blockHeight}`);
    }
  });

  monitor.on('escrow:event', (event) => {
    logger.info('🎯 Escrow event detected:', {
      type: event.type,
      scriptAddress: event.scriptAddress,
      transactionId: event.transactionId,
      slot: event.slot,
      blockHeight: event.blockHeight,
      amount: event.data.amount
    });

    // Handle different event types
    switch (event.type) {
      case CardanoEscrowEventType.ESCROW_CREATED:
        logger.info('💼 New escrow contract created');
        break;
      case CardanoEscrowEventType.ESCROW_FUNDED:
        logger.info('💰 Escrow funded with:', event.data.amount, 'lovelace');
        break;
      case CardanoEscrowEventType.ESCROW_RELEASED:
        logger.info('✅ Escrow funds released');
        break;
      case CardanoEscrowEventType.ESCROW_REFUNDED:
        logger.info('↩️  Escrow funds refunded');
        break;
      case CardanoEscrowEventType.ESCROW_DISPUTED:
        logger.info('⚠️  Escrow disputed');
        break;
      case CardanoEscrowEventType.ESCROW_RESOLVED:
        logger.info('⚖️  Escrow dispute resolved');
        break;
      case CardanoEscrowEventType.ESCROW_CANCELLED:
        logger.info('❌ Escrow cancelled');
        break;
    }
  });

  monitor.on('escrow:state_change', (state) => {
    logger.info('📝 Escrow state changed:', {
      escrowId: state.escrowId,
      status: state.status,
      amount: state.amount,
      totalDeposits: state.totalDeposits,
      totalReleases: state.totalReleases,
      totalRefunds: state.totalRefunds
    });
  });

  try {
    // Start monitoring
    logger.info('🚀 Starting Cardano Escrow Monitor...');
    await monitor.start();

    // Display initial status
    const status = monitor.getConnectionStatus();
    logger.info('📊 Monitor Status:', status);

    const activeContracts = monitor.getActiveContracts();
    logger.info('📜 Monitoring contracts:', 
      activeContracts.map(c => ({
        name: c.name,
        address: c.scriptAddress,
        scriptHash: c.scriptHash
      }))
    );

    // Keep the demo running
    logger.info('👀 Monitoring for escrow events... (Press Ctrl+C to stop)');

    // Periodically display statistics
    const statsInterval = setInterval(() => {
      const currentStatus = monitor.getConnectionStatus();
      const escrowStates = monitor.getAllEscrowStates();
      
      logger.info('📈 Current Statistics:', {
        connected: currentStatus.connected,
        currentSlot: currentStatus.currentSlot,
        totalEscrows: escrowStates.length,
        activeEscrows: escrowStates.filter(s => 
          s.status === CardanoEscrowStatus.FUNDED || 
          s.status === CardanoEscrowStatus.DISPUTED
        ).length,
        completedEscrows: escrowStates.filter(s => 
          s.status === CardanoEscrowStatus.COMPLETED
        ).length
      });
    }, 30000); // Every 30 seconds

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('🛑 Received SIGINT, shutting down gracefully...');
      clearInterval(statsInterval);
      
      try {
        await monitor.stop();
        logger.info('👋 Cardano Escrow Monitor demo completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    process.on('SIGTERM', async () => {
      logger.info('🛑 Received SIGTERM, shutting down gracefully...');
      clearInterval(statsInterval);
      
      try {
        await monitor.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

  } catch (error) {
    logger.error('❌ Failed to start Cardano Escrow Monitor:', error);
    process.exit(1);
  }
}

// Additional demo functions

async function demonstrateContractManagement() {
  logger.info('=== Contract Management Demo ===');

  const config = createDefaultCardanoConfig(OGMIOS_ENDPOINTS.local);
  const monitor = new CardanoEscrowMonitor(config);

  logger.info('Initial contracts:', monitor.getActiveContracts().length);

  // Add a new contract
  monitor.addContract({
    scriptAddress: 'addr_test1wqag8t7z8m5m5vxf8k9k9k9k9k9k9k9k9k9k9k9k9k9k9k9k9kdemo123',
    scriptHash: 'demo1234567890abcdef1234567890abcdef1234567890abcdef12',
    name: 'Demo Contract',
    description: 'Contract added during demo',
    createdAt: new Date(),
    isActive: true
  });

  logger.info('After adding contract:', monitor.getActiveContracts().length);

  // Remove a contract
  const contracts = monitor.getActiveContracts();
  if (contracts.length > 0) {
    monitor.removeContract(contracts[0].scriptAddress);
    logger.info('After removing contract:', monitor.getActiveContracts().length);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateCardanoEscrowMonitor().catch(error => {
    logger.error('Demo failed:', error);
    process.exit(1);
  });
}

export { 
  demonstrateCardanoEscrowMonitor, 
  demonstrateContractManagement 
};
