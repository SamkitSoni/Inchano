'use client'

import { useState, useEffect } from 'react'
import { Clock, CheckCircle, XCircle, ExternalLink, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Transaction {
  id: string
  fromToken: string
  toToken: string
  fromAmount: string
  toAmount: string
  fromChain: 'ethereum' | 'cardano'
  toChain: 'ethereum' | 'cardano'
  status: 'pending' | 'completed' | 'failed'
  timestamp: Date
  txHash?: string
  destinationAddress: string
  auctionPrice?: number
  relayerId?: string
}

interface TransactionHistoryProps {
  className?: string
}

export function TransactionHistory({ className = '' }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Mock transaction data for demonstration
  useEffect(() => {
    const mockTransactions: Transaction[] = [
      {
        id: '1',
        fromToken: 'ADA',
        toToken: 'ETH',
        fromAmount: '1000',
        toAmount: '0.75',
        fromChain: 'cardano',
        toChain: 'ethereum',
        status: 'completed',
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        txHash: '0x1234...5678',
        destinationAddress: '0x742d35Cc6635C0532925a3b8D474d0b2af',
        auctionPrice: 0.00075,
        relayerId: 'relayer-001'
      },
      {
        id: '2',
        fromToken: 'ETH',
        toToken: 'ADA',
        fromAmount: '0.5',
        toAmount: '667',
        fromChain: 'ethereum',
        toChain: 'cardano',
        status: 'pending',
        timestamp: new Date(Date.now() - 900000), // 15 minutes ago
        destinationAddress: 'addr1qy8x...x9z',
        auctionPrice: 1334.0,
        relayerId: 'relayer-002'
      },
      {
        id: '3',
        fromToken: 'USDC',
        toToken: 'ADA',
        fromAmount: '100',
        toAmount: '250',
        fromChain: 'ethereum',
        toChain: 'cardano',
        status: 'failed',
        timestamp: new Date(Date.now() - 7200000), // 2 hours ago
        destinationAddress: 'addr1qx9y...y8z',
      }
    ]
    
    setTransactions(mockTransactions)
  }, [])

  const getStatusIcon = (status: Transaction['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-400" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-400 animate-pulse" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-400" />
    }
  }

  const getStatusText = (status: Transaction['status']) => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'pending':
        return 'In Progress'
      case 'failed':
        return 'Failed'
    }
  }

  const formatTime = (timestamp: Date) => {
    const now = new Date()
    const diff = now.getTime() - timestamp.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  const truncateAddress = (address: string) => {
    if (address.length <= 12) return address
    return `${address.slice(0, 6)}...${address.slice(-6)}`
  }

  const truncateHash = (hash: string) => {
    if (hash.length <= 12) return hash
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`
  }

  const getExplorerUrl = (txHash: string, chain: 'ethereum' | 'cardano') => {
    if (chain === 'ethereum') {
      return `https://sepolia.etherscan.io/tx/${txHash}`
    } else {
      return `https://preprod.cardanoscan.io/transaction/${txHash}`
    }
  }

  if (transactions.length === 0) {
    return (
      <Card className={`p-6 bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl ${className}`}>
        <h3 className="text-lg font-semibold text-white mb-4">Transaction History</h3>
        <div className="text-center py-8">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-400">No transactions yet</p>
          <p className="text-sm text-gray-500 mt-1">Your cross-chain swaps will appear here</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className={`p-6 bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Transaction History</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsLoading(true)
            // Simulate refresh
            setTimeout(() => setIsLoading(false), 1000)
          }}
          disabled={isLoading}
          className="text-gray-400 hover:text-white"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <div className="space-y-3">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {getStatusIcon(tx.status)}
                <span className="text-white font-medium">
                  {tx.fromAmount} {tx.fromToken} → {tx.toAmount} {tx.toToken}
                </span>
              </div>
              <span className="text-xs text-gray-400">{formatTime(tx.timestamp)}</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
              <span className="capitalize">{tx.fromChain}</span>
              <ArrowRight className="h-3 w-3" />
              <span className="capitalize">{tx.toChain}</span>
              <span className="ml-auto">{getStatusText(tx.status)}</span>
            </div>

            <div className="text-xs text-gray-500 space-y-1">
              <div className="flex justify-between">
                <span>To:</span>
                <span className="font-mono">{truncateAddress(tx.destinationAddress)}</span>
              </div>
              
              {tx.auctionPrice && (
                <div className="flex justify-between">
                  <span>Auction Rate:</span>
                  <span>{tx.auctionPrice} {tx.toToken}/{tx.fromToken}</span>
                </div>
              )}
              
              {tx.relayerId && (
                <div className="flex justify-between">
                  <span>Relayer:</span>
                  <span>{tx.relayerId}</span>
                </div>
              )}
              
              {tx.txHash && (
                <div className="flex justify-between items-center">
                  <span>Tx Hash:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono">{truncateHash(tx.txHash)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 text-gray-400 hover:text-white"
                      onClick={() => window.open(getExplorerUrl(tx.txHash!, tx.toChain), '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
