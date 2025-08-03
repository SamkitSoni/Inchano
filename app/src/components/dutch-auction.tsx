'use client'

import { useState, useCallback, useEffect } from 'react'
import { Wifi, WifiOff, Users, Clock } from 'lucide-react'
import { TimeSelection } from '@/components/time-selection'
import { DutchAuctionAnimation } from '@/components/dutch-auction-animation'
import { useAuctionWebSocket, AuctionUpdate, RelayerBid } from '@/hooks/useAuctionWebSocket'
import { Button } from '@/components/ui/button'

interface DutchAuctionProps {
  startPrice: number
  endPrice: number
  marketPrice: number
  fromSymbol: string
  toSymbol: string
  orderId?: string
  duration?: number // Duration in minutes
  onAuctionAccepted?: (acceptedPrice: number, relayerId: string) => void
  onAuctionExpired?: () => void
}

export function DutchAuction({
  startPrice,
  endPrice,
  marketPrice,
  fromSymbol,
  toSymbol,
  orderId,
  duration = 6, // Default 6 minutes
  onAuctionAccepted,
  onAuctionExpired
}: DutchAuctionProps) {
  const [selectedDuration, setSelectedDuration] = useState<number>(duration)
  const [isAuctionActive, setIsAuctionActive] = useState(false)
  const [currentAuctionId, setCurrentAuctionId] = useState<string | null>(null)
  const [acceptedBid, setAcceptedBid] = useState<RelayerBid | null>(null)
  const [autoStarted, setAutoStarted] = useState(false)

  // WebSocket integration
  const {
    isConnected,
    connectionStatus,
    lastUpdate,
    activeBids,
    broadcastAuctionUpdate,
    submitBid,
    connect,
    disconnect
  } = useAuctionWebSocket({
    auctionId: currentAuctionId || undefined,
    onAuctionUpdate: (update) => {
      console.log('📈 Auction update received:', update)
    },
    onRelayerBid: (bid) => {
      console.log('💰 New relayer bid:', bid)
      // Auto-accept if bid is at or above current auction price
      // (In real implementation, you might want more sophisticated logic)
    },
    onConnectionChange: (connected) => {
      console.log('🔗 WebSocket connection:', connected ? 'Connected' : 'Disconnected')
    },
    onError: (error) => {
      console.error('❌ WebSocket error:', error)
    }
  })

  // Generate unique auction ID
  const generateAuctionId = () => {
    return `auction_${orderId || 'demo'}_${Date.now()}`
  }

  // Start auction
  const handleAuctionStart = useCallback(() => {
    const auctionId = generateAuctionId()
    setCurrentAuctionId(auctionId)
    setIsAuctionActive(true)
    setAcceptedBid(null)
    
    console.log('🚀 Starting Dutch auction:', auctionId)
    
    // Notify resolver dashboard about new auction
    const auctionData = {
      id: auctionId,
      fromToken: fromSymbol || 'ADA',
      toToken: toSymbol || 'ETH', 
      fromAmount: '1000', // This would come from the swap interface
      currentPrice: startPrice,
      startPrice,
      endPrice,
      progress: 0,
      timeRemaining: selectedDuration * 60,
      totalDuration: selectedDuration * 60,
      maker: 'addr1qy8x...x9z', // Would be actual wallet address
      receiver: '0x742d35Cc6635C0532925a3b8D474d0b2af', // Would be actual receiver
      status: 'running' as const
    }
    
    // Store in localStorage for resolver to pick up
    localStorage.setItem('active_auction', JSON.stringify(auctionData))
    
    // Dispatch custom event for resolver to listen to
    window.dispatchEvent(new CustomEvent('auctionStarted', { detail: auctionData }))
  }, [orderId, fromSymbol, toSymbol, startPrice, endPrice, selectedDuration])

  // Price update handler
  const handlePriceUpdate = useCallback((price: number, progress: number) => {
    if (currentAuctionId && isConnected) {
      const update: AuctionUpdate = {
        auctionId: currentAuctionId,
        currentPrice: price,
        progress,
        timeRemaining: selectedDuration * 60 * (1 - progress),
        status: 'running',
        timestamp: Date.now()
      }
      
      broadcastAuctionUpdate(update)
      
      // Also update the auction data in localStorage and notify resolver
      const auctionData = {
        id: currentAuctionId,
        fromToken: fromSymbol || 'ADA',
        toToken: toSymbol || 'ETH',
        fromAmount: '1000',
        currentPrice: price,
        startPrice,
        endPrice,
        progress,
        timeRemaining: selectedDuration * 60 * (1 - progress),
        totalDuration: selectedDuration * 60,
        maker: 'addr1qy8x...x9z',
        receiver: '0x742d35Cc6635C0532925a3b8D474d0b2af',
        status: 'running' as const
      }
      
      localStorage.setItem('active_auction', JSON.stringify(auctionData))
      window.dispatchEvent(new CustomEvent('auctionUpdated', { detail: auctionData }))
    }
  }, [currentAuctionId, isConnected, broadcastAuctionUpdate, selectedDuration, fromSymbol, toSymbol, startPrice, endPrice])

  // Auction completion handler
  const handleAuctionComplete = useCallback(() => {
    setIsAuctionActive(false)
    
    if (currentAuctionId && isConnected) {
      const update: AuctionUpdate = {
        auctionId: currentAuctionId,
        currentPrice: endPrice,
        progress: 1,
        timeRemaining: 0,
        status: 'completed',
        timestamp: Date.now()
      }
      
      broadcastAuctionUpdate(update)
    }
    
    // Clear from localStorage and notify resolver
    localStorage.removeItem('active_auction')
    window.dispatchEvent(new CustomEvent('auctionCompleted', { detail: { auctionId: currentAuctionId } }))
    
    console.log('✅ Auction completed')
    
    // If no bid was accepted, call onAuctionExpired
    if (!acceptedBid && onAuctionExpired) {
      onAuctionExpired()
    }
  }, [currentAuctionId, isConnected, broadcastAuctionUpdate, endPrice, acceptedBid, onAuctionExpired])

  // Auto-start auction when component mounts
  useEffect(() => {
    if (!autoStarted) {
      setSelectedDuration(duration)
      setTimeout(() => {
        handleAuctionStart()
        setAutoStarted(true)
      }, 1000) // Start after 1 second delay
    }
  }, [duration, handleAuctionStart, autoStarted])

  // Auction pause handler
  const handleAuctionPause = useCallback(() => {
    if (currentAuctionId && isConnected) {
      const update: AuctionUpdate = {
        auctionId: currentAuctionId,
        currentPrice: lastUpdate?.currentPrice || startPrice,
        progress: lastUpdate?.progress || 0,
        timeRemaining: lastUpdate?.timeRemaining || selectedDuration * 60,
        status: 'paused',
        timestamp: Date.now()
      }
      
      broadcastAuctionUpdate(update)
    }
  }, [currentAuctionId, isConnected, broadcastAuctionUpdate, lastUpdate, startPrice, selectedDuration])

  // Stop auction handler
  const handleAuctionStop = useCallback(() => {
    setIsAuctionActive(false)
    setCurrentAuctionId(null)
    
    if (currentAuctionId && isConnected) {
      const update: AuctionUpdate = {
        auctionId: currentAuctionId,
        currentPrice: startPrice,
        progress: 0,
        timeRemaining: 0,
        status: 'cancelled',
        timestamp: Date.now()
      }
      
      broadcastAuctionUpdate(update)
    }
    
    // Clear from localStorage and notify resolver
    localStorage.removeItem('active_auction')
    window.dispatchEvent(new CustomEvent('auctionStopped', { detail: { auctionId: currentAuctionId } }))
    
    console.log('🛑 Auction stopped')
  }, [currentAuctionId, isConnected, broadcastAuctionUpdate, startPrice])

  // Accept a bid from relayer
  const handleAcceptBid = useCallback((bid: RelayerBid) => {
    setAcceptedBid(bid)
    setIsAuctionActive(false)
    onAuctionAccepted?.(bid.bidPrice, bid.relayerId)
    
    if (currentAuctionId && isConnected) {
      const update: AuctionUpdate = {
        auctionId: currentAuctionId,
        currentPrice: bid.bidPrice,
        progress: lastUpdate?.progress || 0,
        timeRemaining: 0,
        status: 'completed',
        timestamp: Date.now()
      }
      
      broadcastAuctionUpdate(update)
    }
    
    console.log('🎯 Bid accepted:', bid)
  }, [currentAuctionId, isConnected, broadcastAuctionUpdate, lastUpdate, onAuctionAccepted])

  // Connect to WebSocket on mount
  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  const formatPrice = (price: number) => {
    return price >= 1 
      ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
      : price.toFixed(8)
  }

  return (
    <div className="space-y-6">
      {/* Auction Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">
          Dutch Auction
        </h2>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 text-sm ${
            isConnected ? 'text-green-400' : 'text-red-400'
          }`}>
            {isConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          {activeBids.length > 0 && (
            <div className="flex items-center gap-1 text-blue-400 text-sm">
              <Users className="h-4 w-4" />
              {activeBids.length} bid{activeBids.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Auction Status Debug Info */}
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs">
        <div className="text-blue-300 font-medium mb-1">🔧 Debug Info:</div>
        <div className="text-blue-200 space-y-1">
          <div>Duration: {selectedDuration} minutes</div>
          <div>Status: {isAuctionActive ? 'Active' : 'Inactive'} {autoStarted ? '(Auto-started)' : '(Pending start)'}</div>
          <div>Auction ID: {currentAuctionId || 'None'}</div>
          <div>WebSocket: {isConnected ? 'Connected' : 'Disconnected'}</div>
        </div>
      </div>

      {/* Time Selection */}
      {/* Dutch Auction Animation */}
      <DutchAuctionAnimation
        startPrice={startPrice}
        endPrice={endPrice}
        marketPrice={marketPrice}
        durationMinutes={selectedDuration}
        tokenSymbol={toSymbol}
        onPriceUpdate={handlePriceUpdate}
        onAuctionComplete={handleAuctionComplete}
        onAuctionStart={handleAuctionStart}
        onAuctionPause={handleAuctionPause}
        onAuctionStop={handleAuctionStop}
      />

      {/* Active Bids from Relayers */}
      {activeBids.length > 0 && isAuctionActive && (
        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-3">Active Relayer Bids</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {activeBids.map((bid, index) => (
              <div
                key={`${bid.relayerId}-${bid.timestamp}`}
                className="flex items-center justify-between p-3 bg-black/20 rounded-lg"
              >
                <div>
                  <div className="text-white font-mono">
                    {formatPrice(bid.bidPrice)} {toSymbol}
                  </div>
                  <div className="text-xs text-gray-400">
                    Relayer: {bid.relayerId.slice(0, 8)}...
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-xs text-gray-400">
                    {new Date(bid.timestamp).toLocaleTimeString()}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAcceptBid(bid)}
                    className="bg-green-600 hover:bg-green-700 text-white mt-1"
                  >
                    Accept
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accepted Bid Display */}
      {acceptedBid && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <h3 className="text-lg font-semibold text-green-400 mb-2">🎉 Bid Accepted!</h3>
          <div className="text-white">
            <div>Price: <span className="font-mono">{formatPrice(acceptedBid.bidPrice)} {toSymbol}</span></div>
            <div>Relayer: <span className="font-mono">{acceptedBid.relayerId}</span></div>
            <div>Time: {new Date(acceptedBid.timestamp).toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Debug Info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="p-4 bg-gray-800/50 rounded-lg">
          <summary className="text-sm text-gray-400 cursor-pointer">Debug Info</summary>
          <pre className="text-xs text-gray-300 mt-2 overflow-auto">
            {JSON.stringify({
              connectionStatus,
              isConnected,
              currentAuctionId,
              isAuctionActive,
              selectedDuration,
              lastUpdate,
              activeBidsCount: activeBids.length
            }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
