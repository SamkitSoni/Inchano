import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { EscrowMonitor } from '../escrow-monitor/EscrowMonitor';
import { EscrowContract } from '../escrow-monitor/types';

export class EscrowRoutes {
  private router: Router;
  private monitor: EscrowMonitor;

  constructor(monitor: EscrowMonitor) {
    this.router = Router();
    this.monitor = monitor;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Get monitor status
    this.router.get('/status', this.getStatus.bind(this));
    
    // Get all escrow states
    this.router.get('/states', this.getAllStates.bind(this));
    
    // Get specific escrow state
    this.router.get('/states/:contractAddress/:escrowId', this.getEscrowState.bind(this));
    
    // Get active contracts
    this.router.get('/contracts', this.getContracts.bind(this));
    
    // Add new contract to monitor
    this.router.post('/contracts', this.addContract.bind(this));
    
    // Remove contract from monitoring
    this.router.delete('/contracts/:address', this.removeContract.bind(this));
    
    // Start monitoring
    this.router.post('/start', this.startMonitoring.bind(this));
    
    // Stop monitoring
    this.router.post('/stop', this.stopMonitoring.bind(this));
  }

  private async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const status = this.monitor.getConnectionStatus();
      const isRunning = this.monitor.isRunning();
      
      res.json({
        success: true,
        data: {
          isRunning,
          ...status,
          activeContracts: this.monitor.getActiveContracts().length,
          totalStates: this.monitor.getAllEscrowStates().length
        }
      });
    } catch (error) {
      logger.error('Error getting monitor status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get monitor status'
      });
    }
  }

  private async getAllStates(_req: Request, res: Response): Promise<void> {
    try {
      const states = this.monitor.getAllEscrowStates();
      
      // Convert BigNumber to string for JSON serialization
      const serializedStates = states.map(state => ({
        ...state,
        amount: state.amount.toString(),
        deposits: state.deposits.toString(),
        releases: state.releases.toString(),
        refunds: state.refunds.toString()
      }));

      res.json({
        success: true,
        data: {
          states: serializedStates,
          count: serializedStates.length
        }
      });
    } catch (error) {
      logger.error('Error getting escrow states:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get escrow states'
      });
    }
  }

  private async getEscrowState(req: Request, res: Response): Promise<void> {
    try {
      const { contractAddress, escrowId } = req.params;
      
      if (!contractAddress || !escrowId) {
        res.status(400).json({
          success: false,
          error: 'Contract address and escrow ID are required'
        });
        return;
      }

      const state = this.monitor.getEscrowState(contractAddress, escrowId);
      
      if (!state) {
        res.status(404).json({
          success: false,
          error: 'Escrow state not found'
        });
        return;
      }

      // Convert BigNumber to string for JSON serialization
      const serializedState = {
        ...state,
        amount: state.amount.toString(),
        deposits: state.deposits.toString(),
        releases: state.releases.toString(),
        refunds: state.refunds.toString()
      };

      res.json({
        success: true,
        data: serializedState
      });
    } catch (error) {
      logger.error('Error getting escrow state:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get escrow state'
      });
    }
  }

  private async getContracts(_req: Request, res: Response): Promise<void> {
    try {
      const contracts = this.monitor.getActiveContracts();
      
      res.json({
        success: true,
        data: {
          contracts,
          count: contracts.length
        }
      });
    } catch (error) {
      logger.error('Error getting contracts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get contracts'
      });
    }
  }

  private async addContract(req: Request, res: Response): Promise<void> {
    try {
      const { address, name, description } = req.body;
      
      if (!address) {
        res.status(400).json({
          success: false,
          error: 'Contract address is required'
        });
        return;
      }

      const contract: EscrowContract = {
        address: address.toLowerCase(),
        name: name || `Contract ${address.slice(0, 8)}...`,
        description: description || '',
        createdAt: new Date(),
        isActive: true
      };

      this.monitor.addContract(contract);
      
      logger.info(`Added contract to monitor: ${address}`);
      
      res.json({
        success: true,
        data: {
          message: 'Contract added successfully',
          contract
        }
      });
    } catch (error) {
      logger.error('Error adding contract:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add contract'
      });
    }
  }

  private async removeContract(req: Request, res: Response): Promise<void> {
    try {
      const { address } = req.params;
      
      if (!address) {
        res.status(400).json({
          success: false,
          error: 'Contract address is required'
        });
        return;
      }

      this.monitor.removeContract(address);
      
      logger.info(`Removed contract from monitor: ${address}`);
      
      res.json({
        success: true,
        data: {
          message: 'Contract removed successfully'
        }
      });
    } catch (error) {
      logger.error('Error removing contract:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove contract'
      });
    }
  }

  private async startMonitoring(_req: Request, res: Response): Promise<void> {
    try {
      if (this.monitor.isRunning()) {
        res.status(400).json({
          success: false,
          error: 'Monitor is already running'
        });
        return;
      }

      await this.monitor.start();
      
      logger.info('Escrow monitor started via API');
      
      res.json({
        success: true,
        data: {
          message: 'Monitor started successfully'
        }
      });
    } catch (error) {
      logger.error('Error starting monitor:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start monitor'
      });
    }
  }

  private async stopMonitoring(_req: Request, res: Response): Promise<void> {
    try {
      if (!this.monitor.isRunning()) {
        res.status(400).json({
          success: false,
          error: 'Monitor is not running'
        });
        return;
      }

      await this.monitor.stop();
      
      logger.info('Escrow monitor stopped via API');
      
      res.json({
        success: true,
        data: {
          message: 'Monitor stopped successfully'
        }
      });
    } catch (error) {
      logger.error('Error stopping monitor:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to stop monitor'
      });
    }
  }

  public getRouter(): Router {
    return this.router;
  }
}

export const createEscrowRouter = (monitor: EscrowMonitor): Router => {
  const escrowRoutes = new EscrowRoutes(monitor);
  return escrowRoutes.getRouter();
};
