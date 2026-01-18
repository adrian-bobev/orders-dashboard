'use client'

import { useState } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'

interface GenerationHistoryItem {
  id: string
  version: number
  image_key: string
  image_prompt: string | null
  model_used: string | null
  generation_params: any
  character_reference_ids: string | null
  is_selected: boolean
  created_at: string
  completed_at: string | null
}

interface GenerationHistoryPanelProps {
  scenePromptId: string
  generationId: string
  onLoad?: (history: GenerationHistoryItem[]) => void
}

export function GenerationHistoryPanel({
  scenePromptId,
  generationId,
  onLoad,
}: GenerationHistoryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [history, setHistory] = useState<GenerationHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadHistory = async () => {
    if (history.length > 0) return // Already loaded

    setIsLoading(true)
    try {
      const response = await fetch(
        `/api/generation/${generationId}/step6/generate-scenes?scenePromptId=${scenePromptId}`
      )
      if (response.ok) {
        const data = await response.json()
        const historyData = data.images || []
        setHistory(historyData)
        onLoad?.(historyData)
      }
    } catch (error) {
      console.error('Failed to load generation history:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggle = () => {
    if (!isExpanded) {
      loadHistory()
    }
    setIsExpanded(!isExpanded)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('bg-BG', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const parseCharacterReferenceIds = (jsonString: string | null): string[] => {
    if (!jsonString) return []
    try {
      return JSON.parse(jsonString)
    } catch {
      return []
    }
  }

  return (
    <div className="mt-4 border-t border-neutral-200 pt-4">
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 text-sm font-bold text-neutral-900 hover:text-purple-700 transition-colors"
      >
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        История на генерирането ({history.length})
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {isLoading ? (
            <div className="text-sm text-neutral-500 italic">Зареждане...</div>
          ) : history.length === 0 ? (
            <div className="text-sm text-neutral-500 italic">Няма история</div>
          ) : (
            history.map((item) => {
              const characterRefIds = parseCharacterReferenceIds(item.character_reference_ids)
              const params = item.generation_params || {}

              return (
                <div
                  key={item.id}
                  className={`bg-neutral-50 rounded-lg p-3 border-2 ${
                    item.is_selected ? 'border-green-500 bg-green-50' : 'border-neutral-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Thumbnail */}
                    <div className="relative flex-shrink-0 w-20 h-20 rounded overflow-hidden border-2 border-neutral-200">
                      <SmartImage
                        src={getImageUrl(item.image_key)}
                        alt={`Version ${item.version}`}
                        className="w-full h-full object-cover"
                      />
                      {item.is_selected && (
                        <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-purple-600 text-white px-2 py-0.5 rounded text-xs font-bold">
                          v{item.version}
                        </span>
                        <span className="text-xs text-neutral-600">{formatDate(item.created_at)}</span>
                        {item.is_selected && (
                          <span className="bg-green-500 text-white px-2 py-0.5 rounded text-xs font-bold">
                            Избрана
                          </span>
                        )}
                      </div>

                      {/* Prompt */}
                      {item.image_prompt && (
                        <div className="text-xs">
                          <span className="font-bold text-neutral-700">Prompt:</span>
                          <p className="text-neutral-600 mt-1 line-clamp-2">{item.image_prompt}</p>
                        </div>
                      )}

                      {/* Model and Parameters */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
                        {item.model_used && (
                          <div>
                            <span className="font-bold">Модел:</span> {item.model_used}
                          </div>
                        )}
                        {params.size && (
                          <div>
                            <span className="font-bold">Размер:</span> {params.size}
                          </div>
                        )}
                        {params.quality && (
                          <div>
                            <span className="font-bold">Качество:</span> {params.quality}
                          </div>
                        )}
                      </div>

                      {/* Character References */}
                      {characterRefIds.length > 0 && (
                        <div className="text-xs">
                          <span className="font-bold text-neutral-700">
                            Референции ({characterRefIds.length}):
                          </span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {characterRefIds.map((refId, index) => (
                              <span
                                key={refId}
                                className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs"
                              >
                                #{index + 1}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
