'use client'

import { useState, useEffect } from 'react'

interface GenerationCostTrackerProps {
  generationId: string
}

export function GenerationCostTracker({ generationId }: GenerationCostTrackerProps) {
  const [totalCost, setTotalCost] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)

  const loadCost = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/costs`)
      if (response.ok) {
        const data = await response.json()
        setTotalCost(data.totalCost || 0)
      }
    } catch (error) {
      console.error('Failed to load costs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Load cost on mount
  useEffect(() => {
    loadCost()
  }, [generationId])

  // Listen for custom events to refresh cost (triggered after successful generation)
  useEffect(() => {
    const handleCostUpdate = () => loadCost()
    window.addEventListener('generation-cost-updated', handleCostUpdate)
    return () => window.removeEventListener('generation-cost-updated', handleCostUpdate)
  }, [generationId])

  return (
    <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl px-4 py-2 flex items-center justify-center sm:justify-start gap-3 shadow-lg">
      <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <p className="text-white/80 text-xs font-medium">Общ разход</p>
        <p className="text-white text-xl font-bold">
          {isLoading ? '...' : `$${totalCost.toFixed(2)}`}
        </p>
      </div>
    </div>
  )
}
