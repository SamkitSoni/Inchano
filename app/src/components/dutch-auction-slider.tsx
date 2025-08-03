'use client'

import { useState, useEffect } from 'react'
import { Slider } from '@/components/ui/slider'

interface DutchAuctionSliderProps {
  marketPrice: number
  onPriceRangeChange: (startPrice: number, endPrice: number) => void
  fromSymbol: string
  toSymbol: string
  disabled?: boolean
}

export function DutchAuctionSlider({ 
  marketPrice, 
  onPriceRangeChange, 
  fromSymbol, 
  toSymbol,
  disabled = false 
}: DutchAuctionSliderProps) {
  const [startMultiplier, setStartMultiplier] = useState(1.2) // Start at 1.2x market price
  const [endMultiplier, setEndMultiplier] = useState(1.0) // End at market price

  const maxMultiplier = 1.5 // 1.5x market price max
  const minMultiplier = 0 // 0 min price

  const startPrice = marketPrice * startMultiplier
  const endPrice = marketPrice * endMultiplier

  useEffect(() => {
    onPriceRangeChange(startPrice, endPrice)
  }, [startPrice, endPrice, onPriceRangeChange])

  const formatPriceValue = (price: number): string => {
    if (price >= 1) {
      return price.toLocaleString(undefined, { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 6 
      })
    } else {
      return price.toFixed(8)
    }
  }

  if (disabled || marketPrice <= 0) {
    return null
  }

  return (
    <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-400">Dutch Auction Pricing</label>
          <span className="text-xs text-gray-500">Market: {formatPriceValue(marketPrice)} {toSymbol}</span>
        </div>
        <p className="text-xs text-gray-500">
          Set your starting price and ending price for the Dutch auction. 
          The price will decrease over time from start to end.
        </p>
      </div>

      {/* Start Price Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Start Price</span>
          <span className="text-sm text-white font-mono">
            {formatPriceValue(startPrice)} {toSymbol}
            <span className="text-gray-400 ml-1">
              ({(startMultiplier * 100).toFixed(0)}% of market)
            </span>
          </span>
        </div>
        <Slider
          value={[startMultiplier]}
          onValueChange={([value]: number[]) => setStartMultiplier(value)}
          max={maxMultiplier}
          min={Math.max(endMultiplier, 0.5)} // Ensure start price is always >= end price
          step={0.01}
          className="w-full"
        />
      </div>

      {/* End Price Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">End Price</span>
          <span className="text-sm text-white font-mono">
            {formatPriceValue(endPrice)} {toSymbol}
            <span className="text-gray-400 ml-1">
              ({(endMultiplier * 100).toFixed(0)}% of market)
            </span>
          </span>
        </div>
        <Slider
          value={[endMultiplier]}
          onValueChange={([value]: number[]) => setEndMultiplier(value)}
          max={Math.min(startMultiplier, maxMultiplier)} // Ensure end price is always <= start price
          min={minMultiplier}
          step={0.01}
          className="w-full"
        />
      </div>

      {/* Price Range Summary */}
      <div className="pt-2 border-t border-white/10">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Price Range:</span>
          <span className="text-white font-mono">
            {formatPriceValue(startPrice)} → {formatPriceValue(endPrice)} {toSymbol}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
          <span>Auction starts high and decreases over time</span>
          <span>
            {startPrice > endPrice 
              ? `${(((startPrice - endPrice) / startPrice) * 100).toFixed(1)}% decrease`
              : startPrice === endPrice 
                ? 'Fixed price'
                : `${(((endPrice - startPrice) / startPrice) * 100).toFixed(1)}% increase`
            }
          </span>
        </div>
      </div>
    </div>
  )
}
