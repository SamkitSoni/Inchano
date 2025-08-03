import { RelayerController } from './controllers/relayer.controller';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';

async function main() {
  try {
    // Validate environment configuration
    validateConfig();
    
    // Create relayer controller
    const relayerController = new RelayerController();
    
    // Initialize the relayer service
    await relayerController.initialize();
    
    // Start the server
    const app = relayerController.getApp();
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Inchano Relayer Service started on port ${config.port}`);
      logger.info(`📊 Health check available at: http://localhost:${config.port}/health`);
      logger.info(`📈 Status endpoint available at: http://localhost:${config.port}/status`);
      logger.info(`🔗 Test connections at: http://localhost:${config.port}/test-connections`);
    });

    // Initialize WebSocket service
    relayerController.initializeWebSocket(server);
    logger.info(`🔌 WebSocket service initialized on port ${config.port}`);

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start relayer service:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

main().catch((error) => {
  logger.error('Application startup failed:', error);
  process.exit(1);
});
