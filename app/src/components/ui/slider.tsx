'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface SliderProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number[]
  onValueChange: (value: number[]) => void
  max: number
  min: number
  step: number
  disabled?: boolean
}

export function Slider({ 
  value, 
  onValueChange, 
  max, 
  min, 
  step, 
  disabled = false,
  className,
  ...props 
}: SliderProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value)
    onValueChange([newValue])
  }

  const percentage = ((value[0] - min) / (max - min)) * 100

  return (
    <div className={cn('relative w-full', className)} {...props}>
      <div className="relative h-2 w-full rounded-full bg-white/10">
        <div 
          className="absolute h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-600"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={handleChange}
        disabled={disabled}
        className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
      <div 
        className="absolute w-4 h-4 rounded-full bg-white border-2 border-blue-500 transform -translate-x-1/2 -translate-y-1 shadow-lg"
        style={{ left: `${percentage}%`, top: '50%' }}
      />
    </div>
  )
}
