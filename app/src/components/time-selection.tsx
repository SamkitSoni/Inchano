'use client'

import { useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface AuctionTimeOption {
  value: number
  label: string
  description: string
}

interface TimeSelectionProps {
  onTimeSelect: (minutes: number) => void
  selectedTime?: number
  disabled?: boolean
}

const TIME_OPTIONS: AuctionTimeOption[] = [
  {
    value: 3,
    label: '3 min',
    description: 'Quick auction'
  },
  {
    value: 6,
    label: '6 min', 
    description: 'Standard auction'
  },
  {
    value: 10,
    label: '10 min',
    description: 'Extended auction'
  }
]

export function TimeSelection({ onTimeSelect, selectedTime, disabled = false }: TimeSelectionProps) {
  const [hoveredTime, setHoveredTime] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Clock className="h-4 w-4" />
        <span>Auction Duration</span>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        {TIME_OPTIONS.map((option) => {
          const isSelected = selectedTime === option.value
          const isHovered = hoveredTime === option.value
          
          return (
            <Button
              key={option.value}
              variant={isSelected ? "default" : "outline"}
              onClick={() => onTimeSelect(option.value)}
              onMouseEnter={() => setHoveredTime(option.value)}
              onMouseLeave={() => setHoveredTime(null)}
              disabled={disabled}
              className={`
                flex flex-col h-16 p-3 transition-all duration-200
                ${isSelected 
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 border-blue-400 text-white' 
                  : 'bg-white/5 border-white/20 text-gray-300 hover:bg-white/10 hover:border-white/30'
                }
                ${isHovered && !isSelected ? 'transform scale-105' : ''}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <div className="text-lg font-semibold">
                {option.label}
              </div>
              <div className="text-xs opacity-75">
                {option.description}
              </div>
            </Button>
          )
        })}
      </div>
      
      {selectedTime && (
        <div className="text-xs text-gray-500 text-center">
          Price will decrease from start price to end price over {selectedTime} minutes
        </div>
      )}
    </div>
  )
}
