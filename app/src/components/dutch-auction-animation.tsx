'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Square, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface AuctionState {
  isRunning: boolean
  isPaused: boolean
  currentPrice: number
  progress: number // 0 to 1
  timeRemaining: number // in seconds
  totalDuration: number // in seconds
}

interface DutchAuctionAnimationProps {
  startPrice: number
  endPrice: number
  marketPrice: number
  durationMinutes: number
  tokenSymbol: string
  onPriceUpdate?: (price: number, progress: number) => void
  onAuctionComplete?: () => void
  onAuctionStart?: () => void
  onAuctionPause?: () => void
  onAuctionStop?: () => void
}

export function DutchAuctionAnimation({
  startPrice,
  endPrice,
  marketPrice,
  durationMinutes,
  tokenSymbol,
  onPriceUpdate,
  onAuctionComplete,
  onAuctionStart,
  onAuctionPause,
  onAuctionStop
}: DutchAuctionAnimationProps) {
  const [auctionState, setAuctionState] = useState<AuctionState>({
    isRunning: false,
    isPaused: false,
    currentPrice: startPrice,
    progress: 0,
    timeRemaining: durationMinutes * 60,
    totalDuration: durationMinutes * 60
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)

  // Dutch auction price calculation with non-linear curve
  const calculatePrice = useCallback((progress: number): number => {
    if (progress >= 1) return endPrice
    
    // Create a curve that decreases slowly before market price, then rapidly after
    const marketProgressPoint = marketPrice <= startPrice && marketPrice >= endPrice 
      ? (startPrice - marketPrice) / (startPrice - endPrice)
      : 0.5 // Default to halfway if market price is outside range

    let adjustedProgress: number
    
    if (progress <= marketProgressPoint) {
      // Slow decrease before market price (exponential curve)
      adjustedProgress = Math.pow(progress / marketProgressPoint, 2) * marketProgressPoint
    } else {
      // Fast decrease after market price (accelerated curve)
      const remainingProgress = (progress - marketProgressPoint) / (1 - marketProgressPoint)
      adjustedProgress = marketProgressPoint + Math.pow(remainingProgress, 0.5) * (1 - marketProgressPoint)
    }

    return startPrice - (adjustedProgress * (startPrice - endPrice))
  }, [startPrice, endPrice, marketPrice])

  // Canvas drawing function
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // Set up chart dimensions
    const padding = 40
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2

    // Draw background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight / 5) * i
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(padding + chartWidth, y)
      ctx.stroke()
    }

    // Vertical grid lines
    for (let i = 0; i <= 10; i++) {
      const x = padding + (chartWidth / 10) * i
      ctx.beginPath()
      ctx.moveTo(x, padding)
      ctx.lineTo(x, padding + chartHeight)
      ctx.stroke()
    }

    // Draw price curve
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 3
    ctx.beginPath()

    const points = 100
    for (let i = 0; i <= points; i++) {
      const progress = i / points
      const price = calculatePrice(progress)
      const x = padding + (progress * chartWidth)
      const y = padding + chartHeight - ((price - endPrice) / (startPrice - endPrice)) * chartHeight

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()

    // Draw market price line
    if (marketPrice >= endPrice && marketPrice <= startPrice) {
      const marketY = padding + chartHeight - ((marketPrice - endPrice) / (startPrice - endPrice)) * chartHeight
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(padding, marketY)
      ctx.lineTo(padding + chartWidth, marketY)
      ctx.stroke()
      ctx.setLineDash([])

      // Market price label
      ctx.fillStyle = '#f59e0b'
      ctx.font = '12px sans-serif'
      ctx.fillText(`Market: ${marketPrice.toFixed(6)} ${tokenSymbol}`, padding + 5, marketY - 5)
    }

    // Draw current progress indicator
    if (auctionState.isRunning || auctionState.progress > 0) {
      const currentX = padding + (auctionState.progress * chartWidth)
      const currentPrice = calculatePrice(auctionState.progress)
      const currentY = padding + chartHeight - ((currentPrice - endPrice) / (startPrice - endPrice)) * chartHeight

      // Current position dot
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(currentX, currentY, 6, 0, 2 * Math.PI)
      ctx.fill()

      // Vertical progress line
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'
      ctx.lineWidth = 2
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(currentX, padding)
      ctx.lineTo(currentX, padding + chartHeight)
      ctx.stroke()
      ctx.setLineDash([])

      // Current price label
      ctx.fillStyle = '#ef4444'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(
        `${currentPrice.toFixed(6)} ${tokenSymbol}`, 
        currentX + 10, 
        currentY - 10
      )
    }

    // Draw price labels
    ctx.fillStyle = '#9ca3af'
    ctx.font = '12px sans-serif'
    
    // Start price
    ctx.fillText(`${startPrice.toFixed(6)} ${tokenSymbol}`, padding + 5, padding + 15)
    
    // End price
    ctx.fillText(`${endPrice.toFixed(6)} ${tokenSymbol}`, padding + 5, padding + chartHeight - 5)

    // Time labels
    ctx.fillText('0:00', padding, padding + chartHeight + 20)
    ctx.fillText(`${durationMinutes}:00`, padding + chartWidth - 30, padding + chartHeight + 20)
  }, [auctionState, startPrice, endPrice, marketPrice, durationMinutes, tokenSymbol, calculatePrice])

  // Animation loop
  useEffect(() => {
    if (auctionState.isRunning && !auctionState.isPaused) {
      animationRef.current = requestAnimationFrame(drawChart)
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [auctionState, drawChart])

  // Timer logic
  useEffect(() => {
    if (auctionState.isRunning && !auctionState.isPaused) {
      intervalRef.current = setInterval(() => {
        setAuctionState(prev => {
          const newTimeRemaining = Math.max(0, prev.timeRemaining - 0.1)
          const newProgress = 1 - (newTimeRemaining / prev.totalDuration)
          const newPrice = calculatePrice(newProgress)

          onPriceUpdate?.(newPrice, newProgress)

          if (newTimeRemaining <= 0) {
            onAuctionComplete?.()
            return {
              ...prev,
              isRunning: false,
              currentPrice: endPrice,
              progress: 1,
              timeRemaining: 0
            }
          }

          return {
            ...prev,
            currentPrice: newPrice,
            progress: newProgress,
            timeRemaining: newTimeRemaining
          }
        })
      }, 100) // Update every 100ms for smooth animation
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [auctionState.isRunning, auctionState.isPaused, calculatePrice, onPriceUpdate, onAuctionComplete, endPrice])

  // Update total duration when durationMinutes changes
  useEffect(() => {
    setAuctionState(prev => ({
      ...prev,
      totalDuration: durationMinutes * 60,
      timeRemaining: prev.isRunning ? prev.timeRemaining : durationMinutes * 60,
      currentPrice: startPrice
    }))
  }, [durationMinutes, startPrice])

  const startAuction = () => {
    setAuctionState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      currentPrice: startPrice,
      progress: 0,
      timeRemaining: durationMinutes * 60
    }))
    onAuctionStart?.()
  }

  const pauseAuction = () => {
    setAuctionState(prev => ({
      ...prev,
      isPaused: !prev.isPaused
    }))
    onAuctionPause?.()
  }

  const stopAuction = () => {
    setAuctionState(prev => ({
      ...prev,
      isRunning: false,
      isPaused: false,
      currentPrice: startPrice,
      progress: 0,
      timeRemaining: durationMinutes * 60
    }))
    onAuctionStop?.()
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-red-400" />
          <h3 className="text-lg font-semibold text-white">Dutch Auction</h3>
        </div>
        
        <div className="text-right">
          <div className="text-sm text-gray-400">Time Remaining</div>
          <div className="text-xl font-mono text-white">
            {formatTime(auctionState.timeRemaining)}
          </div>
        </div>
      </div>

      {/* Current Price Display */}
      <div className="text-center py-4 bg-black/20 rounded-lg">
        <div className="text-sm text-gray-400 mb-1">Current Price</div>
        <div className="text-3xl font-bold text-white font-mono">
          {auctionState.currentPrice.toFixed(6)} {tokenSymbol}
        </div>
        <div className="text-sm text-gray-400">
          Progress: {(auctionState.progress * 100).toFixed(1)}%
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={200}
          className="w-full h-48 bg-black/20 rounded-lg"
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        {!auctionState.isRunning ? (
          <Button
            onClick={startAuction}
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={startPrice <= endPrice}
          >
            <Play className="h-4 w-4 mr-2" />
            Start Auction
          </Button>
        ) : (
          <>
            <Button
              onClick={pauseAuction}
              variant="outline"
              className="border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black"
            >
              <Pause className="h-4 w-4 mr-2" />
              {auctionState.isPaused ? 'Resume' : 'Pause'}
            </Button>
            
            <Button
              onClick={stopAuction}
              variant="outline"
              className="border-red-400 text-red-400 hover:bg-red-400 hover:text-white"
            >
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          </>
        )}
      </div>

      {/* Status */}
      {auctionState.isRunning && (
        <div className="text-center text-sm text-gray-400">
          {auctionState.isPaused ? '⏸️ Auction Paused' : '🔴 Live Auction Running'}
        </div>
      )}
    </div>
  )
}
