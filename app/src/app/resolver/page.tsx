'use client'

import { useState, useEffect } from 'react'
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Wallet,
  DollarSign,
  ArrowRight,
  Play,
  Pause,
  RefreshCw,
  ExternalLink,
  TrendingDown,
  Users,
  Activity,
  ArrowLeft
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import Link from 'next/link'
import { useResolverWebSocket, ResolverOrder } from '@/hooks/useResolverWebSocket'

export default function ResolverDashboard() {
  const [selectedTab, setSelectedTab] = useState<'orders' | 'auctions'>('auctions')

  // WebSocket integration for real-time data
  const {
    isConnected,
    connectionStatus,
    orders,
    auctions: activeAuctions,
    acceptAuction,
    updateEscrow,
    refreshData
  } = useResolverWebSocket({
    onOrderUpdate: (order) => {
      console.log('📦 Order updated:', order)
    },
    onAuctionUpdate: (auction) => {
      console.log('🔥 Auction updated:', auction)
    },
    onEscrowUpdate: (update) => {
      console.log('🏦 Escrow updated:', update)
    },
    onConnectionChange: (connected) => {
      console.log('🔗 Connection status:', connected ? 'Connected' : 'Disconnected')
    },
    onError: (error) => {
      console.error('❌ WebSocket error:', error)
    }
  })

  const [isLoading, setIsLoading] = useState(false)

  const handleAcceptAuction = async (auctionId: string, price: number) => {
    try {
      await acceptAuction(auctionId, price)
      setSelectedTab('orders')
    } catch (error) {
      console.error('Failed to accept auction:', error)
    }
  }

  const handleEscrowAction = async (orderId: string, action: 'create' | 'deposit' | 'withdraw' | 'cancel') => {
    try {
      await updateEscrow(orderId, action)
    } catch (error) {
      console.error('Failed to update escrow:', error)
    }
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const getStatusIcon = (status: ResolverOrder['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-400" />
      case 'accepted':
        return <CheckCircle className="h-4 w-4 text-green-400" />
      case 'in_escrow':
        return <Wallet className="h-4 w-4 text-blue-400" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-400" />
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-400" />
    }
  }

  const getStatusText = (status: ResolverOrder['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending'
      case 'accepted':
        return 'Accepted'
      case 'in_escrow':
        return 'In Escrow'
      case 'completed':
        return 'Completed'
      case 'cancelled':
        return 'Cancelled'
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-b from-gray-900 via-blue-900 to-purple-900">
      <Header />
      
      <div className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Dashboard Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Resolver Dashboard</h1>
                <div className="flex items-center gap-4">
                  <p className="text-gray-400">Manage cross-chain swap orders and auctions</p>
                  <div className={`flex items-center gap-2 text-sm ${
                    isConnected ? 'text-green-400' : 'text-red-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      isConnected ? 'bg-green-400' : 'bg-red-400'
                    } animate-pulse`} />
                    {connectionStatus === 'connected' ? 'Connected' : 
                     connectionStatus === 'connecting' ? 'Connecting...' : 
                     connectionStatus === 'error' ? 'Connection Error' : 'Disconnected'}
                  </div>
                </div>
              </div>
              <Link href="/">
                <Button 
                  variant="outline" 
                  className="bg-transparent border-blue-500/50 text-blue-300 hover:bg-blue-500/10"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Swap
                </Button>
              </Link>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="p-6 bg-black/40 backdrop-blur-xl border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Activity className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Active Orders</p>
                  <p className="text-2xl font-bold text-white">{orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled').length}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-black/40 backdrop-blur-xl border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <TrendingDown className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Live Auctions</p>
                  <p className="text-2xl font-bold text-white">{activeAuctions.length}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-black/40 backdrop-blur-xl border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Completed Today</p>
                  <p className="text-2xl font-bold text-white">{orders.filter(o => o.status === 'completed').length}</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-black/40 backdrop-blur-xl border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <DollarSign className="h-6 w-6 text-yellow-400" />
                </div>
              </div>
            </Card>
          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-1 mb-6">
            <Button
              variant={selectedTab === 'auctions' ? 'default' : 'ghost'}
              onClick={() => setSelectedTab('auctions')}
              className={selectedTab === 'auctions' 
                ? 'bg-purple-600 text-white' 
                : 'text-gray-400 hover:text-white'
              }
            >
              <TrendingDown className="h-4 w-4 mr-2" />
              Live Auctions ({activeAuctions.length})
            </Button>
            <Button
              variant={selectedTab === 'orders' ? 'default' : 'ghost'}
              onClick={() => setSelectedTab('orders')}
              className={selectedTab === 'orders' 
                ? 'bg-blue-600 text-white' 
                : 'text-gray-400 hover:text-white'
              }
            >
              <Activity className="h-4 w-4 mr-2" />
              My Orders ({orders.length})
            </Button>
          </div>

          {/* Live Auctions Tab */}
          {selectedTab === 'auctions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Live Dutch Auctions</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsLoading(true)
                    refreshData()
                    setTimeout(() => setIsLoading(false), 1000)
                  }}
                  disabled={isLoading || !isConnected}
                  className="border-white/20 text-gray-300"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {activeAuctions.length === 0 ? (
                <Card className="p-8 bg-black/40 backdrop-blur-xl border-white/10 text-center">
                  <TrendingDown className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No Active Auctions</h3>
                  <p className="text-gray-400">New Dutch auctions will appear here when users start swaps</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {activeAuctions.map((auction) => (
                    <Card key={auction.id} className="p-6 bg-black/40 backdrop-blur-xl border-white/10">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{auction.fromToken === 'ADA' ? '₳' : auction.fromToken === 'ETH' ? '⟠' : '💰'}</span>
                            <ArrowRight className="h-4 w-4 text-gray-400" />
                            <span className="text-xl">{auction.toToken === 'ADA' ? '₳' : auction.toToken === 'ETH' ? '⟠' : '💰'}</span>
                          </div>
                          <div>
                            <p className="text-white font-medium">
                              {auction.fromAmount} {auction.fromToken} → {auction.toToken}
                            </p>
                            <p className="text-sm text-gray-400">Auction ID: {auction.id}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-green-400">
                            {auction.currentPrice.toFixed(6)} {auction.toToken}/{auction.fromToken}
                          </p>
                          <p className="text-sm text-gray-400">
                            Time: {formatTime(auction.timeRemaining)}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-sm text-gray-400 mb-2">
                          <span>Start: {auction.startPrice.toFixed(6)}</span>
                          <span>{Math.round(auction.progress * 100)}% complete</span>
                          <span>End: {auction.endPrice.toFixed(6)}</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-green-500 to-red-500 h-2 rounded-full transition-all duration-1000"
                            style={{ width: `${auction.progress * 100}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-400">
                          <p>From: {auction.maker.slice(0, 8)}...{auction.maker.slice(-6)}</p>
                          <p>To: {auction.receiver.slice(0, 8)}...{auction.receiver.slice(-6)}</p>
                        </div>
                        <Button
                          onClick={() => handleAcceptAuction(auction.id, auction.currentPrice)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Accept at {auction.currentPrice.toFixed(6)}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {selectedTab === 'orders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">My Orders</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsLoading(true)
                    refreshData()
                    setTimeout(() => setIsLoading(false), 1000)
                  }}
                  disabled={isLoading || !isConnected}
                  className="border-white/20 text-gray-300"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {orders.length === 0 ? (
                <Card className="p-8 bg-black/40 backdrop-blur-xl border-white/10 text-center">
                  <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">No Orders Yet</h3>
                  <p className="text-gray-400">Accepted auction orders will appear here</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {orders.map((order) => (
                    <Card key={order.id} className="p-6 bg-black/40 backdrop-blur-xl border-white/10">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(order.status)}
                          <div>
                            <p className="text-white font-medium">
                              {order.fromAmount} {order.fromToken} → {order.toAmount} {order.toToken}
                            </p>
                            <p className="text-sm text-gray-400">
                              Order ID: {order.id} • {getStatusText(order.status)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {order.auctionPrice && (
                            <p className="text-sm text-green-400">
                              Accepted at: {order.auctionPrice.toFixed(6)}
                            </p>
                          )}
                          <p className="text-xs text-gray-400">
                            {order.timestamp.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Escrow Actions */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Escrow Status:</span>
                          <span className={`text-sm font-medium ${
                            order.escrowStatus === 'deposited' ? 'text-green-400' :
                            order.escrowStatus === 'creating' || order.escrowStatus === 'withdrawing' ? 'text-yellow-400' :
                            'text-gray-400'
                          }`}>
                            {order.escrowStatus === 'none' ? 'Not Created' :
                             order.escrowStatus === 'creating' ? 'Creating...' :
                             order.escrowStatus === 'deposited' ? 'Deposited' :
                             order.escrowStatus === 'withdrawing' ? 'Withdrawing...' :
                             'Completed'}
                          </span>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          {order.status === 'accepted' && order.escrowStatus === 'none' && (
                            <Button
                              size="sm"
                              onClick={() => handleEscrowAction(order.id, 'create')}
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              Create Escrow
                            </Button>
                          )}

                          {order.status === 'accepted' && order.escrowStatus === 'creating' && (
                            <Button
                              size="sm"
                              onClick={() => handleEscrowAction(order.id, 'deposit')}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              Deposit to Escrow
                            </Button>
                          )}

                          {order.status === 'in_escrow' && order.escrowStatus === 'deposited' && (
                            <Button
                              size="sm"
                              onClick={() => handleEscrowAction(order.id, 'withdraw')}
                              className="bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              Withdraw & Complete
                            </Button>
                          )}

                          {(order.status === 'accepted' || order.status === 'in_escrow') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEscrowAction(order.id, 'cancel')}
                              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                            >
                              Cancel Order
                            </Button>
                          )}

                          {order.auctionId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-gray-400 hover:text-white"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View Auction
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Chain Information */}
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-400">From ({order.fromChain})</p>
                            <p className="text-white font-mono text-xs">
                              {order.maker.slice(0, 12)}...{order.maker.slice(-8)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400">To ({order.toChain})</p>
                            <p className="text-white font-mono text-xs">
                              {order.receiver.slice(0, 12)}...{order.receiver.slice(-8)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </main>
  )
}
