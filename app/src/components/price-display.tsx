'use client'

import { usePrices } from '@/hooks/usePrices'
import { Loader2, RefreshCw, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PriceDisplayProps {
  className?: string
}

export function PriceDisplay({ className = '' }: PriceDisplayProps) {
  const { prices, loading, error, lastUpdated, formatPrice, refetch } = usePrices()

  const formatLastUpdated = (date: Date | null) => {
    if (!date) return 'Never'
    
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    
    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`
    } else if (diffSeconds < 3600) {
      return `${Math.floor(diffSeconds / 60)}m ago`
    } else {
      return date.toLocaleTimeString()
    }
  }

  if (error) {
    return (
      <div className={`bg-red-500/10 border border-red-500/20 rounded-lg p-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-300 text-sm">
            <span>⚠️ Failed to load prices</span>
          </div>
          <Button
            onClick={refetch}
            variant="ghost"
            size="sm"
            className="text-red-300 hover:text-red-200 h-6 w-6 p-0"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white/5 border border-white/10 rounded-lg p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Clock className="h-3 w-3" />
          <span>Live Prices</span>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
          <Button
            onClick={refetch}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white h-6 w-6 p-0"
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="text-center">
          <div className="text-gray-400 text-xs mb-1">ETH</div>
          <div className="text-white font-mono">
            {loading ? '...' : formatPrice(prices.ETH)}
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-gray-400 text-xs mb-1">ADA</div>
          <div className="text-white font-mono">
            {loading ? '...' : formatPrice(prices.ADA)}
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-gray-400 text-xs mb-1">USDC</div>
          <div className="text-white font-mono">
            {formatPrice(prices.USDC)}
          </div>
        </div>
      </div>
      
      {lastUpdated && (
        <div className="text-xs text-gray-500 text-center mt-2">
          Updated {formatLastUpdated(lastUpdated)}
        </div>
      )}
    </div>
  )
}
