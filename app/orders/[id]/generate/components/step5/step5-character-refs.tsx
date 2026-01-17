'use client'

import { useState, useEffect } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'

interface Step5CharacterRefsProps {
  generationId: string
  onComplete: () => void
}

export function Step5CharacterRefs({ generationId, onComplete }: Step5CharacterRefsProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [references, setReferences] = useState<any[]>([])
  const [generatingCharacter, setGeneratingCharacter] = useState<string | null>(null)

  useEffect(() => {
    loadReferences()
  }, [generationId])

  const loadReferences = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step5/generate-character-refs`)
      if (response.ok) {
        const data = await response.json()
        setReferences(data.references || [])
      }
    } catch (error) {
      console.error('Failed to load character references:', error)
    }
  }

  const handleGenerateAll = async () => {
    setIsGenerating(true)
    try {
      const response = await fetch(`/api/generation/${generationId}/step5/generate-character-refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate character references')
      }

      const data = await response.json()
      setReferences(data.references || [])
      alert('Референциите на героите са генерирани успешно!')
    } catch (error) {
      console.error('Error generating character references:', error)
      alert(error instanceof Error ? error.message : 'Грешка при генериране на референции')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateSingle = async (characterListId: string, characterName: string) => {
    setGeneratingCharacter(characterListId)
    try {
      const response = await fetch(`/api/generation/${generationId}/step5/generate-character-refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterListId, characterName }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate character reference')
      }

      await loadReferences()
    } catch (error) {
      console.error('Error generating character reference:', error)
      alert('Грешка при генериране на референция')
    } finally {
      setGeneratingCharacter(null)
    }
  }

  // Group references by character
  const groupedReferences: Record<string, any[]> = {}
  references.forEach((ref) => {
    // Handle both direct property and nested relation
    const charId = ref.character_list_id || ref.generation_character_list?.id
    if (!charId) {
      console.warn('Reference missing character_list_id:', ref)
      return
    }
    if (!groupedReferences[charId]) {
      groupedReferences[charId] = []
    }
    groupedReferences[charId].push(ref)
  })

  const hasAnyReferences = references.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-purple-900 mb-2">
          Стъпка 5: Генериране на референции
        </h2>
        <p className="text-neutral-600">
          Генерирайте референтни изображения за всички герои от списъка.
        </p>
      </div>

      {/* Generate All Button */}
      <div className="flex items-center justify-between">
        <div>
          {!hasAnyReferences && (
            <p className="text-sm text-neutral-500">
              {process.env.NEXT_PUBLIC_USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === 'true'
                ? '(Mock режим - ще върне placeholder изображения)'
                : '(Ще използва OpenAI DALL-E 3)'}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateAll}
            disabled={isGenerating}
            className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Обработка...
              </span>
            ) : (
              'Генерирай всички референции'
            )}
          </button>
          {hasAnyReferences && (
            <button
              onClick={onComplete}
              className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors"
            >
              Готово - Следваща стъпка
            </button>
          )}
        </div>
      </div>

      {/* Character References */}
      {Object.keys(groupedReferences).length > 0 && (
        <div className="space-y-6">
          {Object.entries(groupedReferences).map(([characterId, refs]) => {
            const character = refs[0].generation_character_list || {
              character_name: 'Unknown Character',
              id: characterId
            }
            const selectedRef = refs.find((r) => r.is_selected) || refs[0]

            return (
              <div key={characterId} className="bg-white rounded-xl p-4 border-2 border-purple-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-purple-900 text-lg">{character.character_name}</h3>
                  <button
                    onClick={() => handleGenerateSingle(characterId, character.character_name)}
                    disabled={generatingCharacter === characterId}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm"
                  >
                    {generatingCharacter === characterId ? 'Генериране...' : 'Нова версия'}
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {refs.map((ref) => (
                    <div
                      key={ref.id}
                      className={`relative rounded-lg overflow-hidden border-4 transition-all cursor-pointer ${
                        ref.is_selected
                          ? 'border-green-500 ring-4 ring-green-200'
                          : 'border-neutral-200 hover:border-purple-300'
                      }`}
                    >
                      <SmartImage
                        src={getImageUrl(ref.image_key)}
                        alt={character.character_name}
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute top-2 left-2 bg-white px-2 py-1 rounded-lg text-xs font-bold text-purple-900">
                        v{ref.version}
                      </div>
                      {ref.is_selected && (
                        <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
