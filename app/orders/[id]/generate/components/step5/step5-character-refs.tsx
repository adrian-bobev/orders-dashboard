'use client'

import { useState, useEffect } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'

interface Step5CharacterRefsProps {
  generationId: string
  onComplete: () => void
}

interface Entity {
  id: string
  character_name: string
  character_type: string
  description: string | null
}

export function Step5CharacterRefs({ generationId, onComplete }: Step5CharacterRefsProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [references, setReferences] = useState<any[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [generatingCharacter, setGeneratingCharacter] = useState<string | null>(null)
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null)
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
  }, [generationId])

  const loadData = async () => {
    await Promise.all([loadEntities(), loadReferences()])
  }

  const loadEntities = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/entities`)
      if (response.ok) {
        const data = await response.json()
        setEntities(data.entities || [])
      }
    } catch (error) {
      console.error('Failed to load entities:', error)
    }
  }

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
        throw new Error(error.error || 'Failed to generate references')
      }

      await loadReferences()
    } catch (error) {
      console.error('Error generating references:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateSingle = async (entity: Entity) => {
    setGeneratingCharacter(entity.id)
    try {
      const customPrompt = customPrompts[entity.id]
      const response = await fetch(`/api/generation/${generationId}/step5/generate-character-refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterListId: entity.id,
          characterName: entity.character_name,
          characterType: entity.character_type,
          description: customPrompt || entity.description,
          customPrompt: customPrompt || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate reference')
      }

      await loadReferences()
      // Clear custom prompt after successful generation
      if (customPrompt) {
        setCustomPrompts((prev) => {
          const updated = { ...prev }
          delete updated[entity.id]
          return updated
        })
        setEditingPrompt(null)
      }
    } catch (error) {
      console.error('Error generating reference:', error)
    } finally {
      setGeneratingCharacter(null)
    }
  }

  const handleSelectVersion = async (characterListId: string, referenceId: string) => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step5/generate-character-refs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterListId, referenceId }),
      })

      if (!response.ok) {
        throw new Error('Failed to select version')
      }

      await loadReferences()
    } catch (error) {
      console.error('Error selecting version:', error)
    }
  }

  // Group references by entity
  const groupedReferences: Record<string, any[]> = {}
  references.forEach((ref) => {
    const charId = ref.character_list_id || ref.generation_character_list?.id
    if (!charId) return
    if (!groupedReferences[charId]) {
      groupedReferences[charId] = []
    }
    groupedReferences[charId].push(ref)
  })

  // Sort references by version descending
  Object.keys(groupedReferences).forEach((key) => {
    groupedReferences[key].sort((a, b) => b.version - a.version)
  })

  const characters = entities.filter((e) => e.character_type === 'character')
  const objects = entities.filter((e) => e.character_type === 'object')

  const hasAnyReferences = references.length > 0

  const renderEntityCard = (entity: Entity, bgColor: string, buttonColor: string) => {
    const entityRefs = groupedReferences[entity.id] || []
    const selectedRef = entityRefs.find((r) => r.is_selected) || entityRefs[0]
    const isExpanded = expandedEntity === entity.id
    const hasRefs = entityRefs.length > 0
    const isEditingPromptForThis = editingPrompt === entity.id
    const customPrompt = customPrompts[entity.id]

    return (
      <div key={entity.id} className={`bg-white rounded-lg p-3 border-2 border-${bgColor}-200 hover:border-${bgColor}-300 transition-colors`}>
        {/* Compact Header */}
        <div className="flex items-center gap-3">
          {/* Preview thumbnail if exists */}
          {selectedRef && (
            <div className="relative rounded overflow-hidden w-16 h-16 flex-shrink-0 border-2 border-green-500">
              <SmartImage
                src={getImageUrl(selectedRef.image_key)}
                alt={entity.character_name}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-0 right-0 bg-green-500 text-white text-xs px-1 rounded-bl">
                v{selectedRef.version}
              </div>
            </div>
          )}

          {/* Entity info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={`font-bold text-${bgColor}-900 truncate`}>{entity.character_name}</h4>
              {hasRefs && (
                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full flex-shrink-0">
                  {entityRefs.length}
                </span>
              )}
            </div>
            {entity.description && !customPrompt && !isEditingPromptForThis && (
              <p className="text-xs text-neutral-600 truncate mt-0.5">{entity.description}</p>
            )}
            {customPrompt && !isEditingPromptForThis && (
              <p className="text-xs text-purple-600 truncate mt-0.5">Персонализиран промпт</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => setEditingPrompt(isEditingPromptForThis ? null : entity.id)}
              className={`px-2 py-1 text-xs font-bold rounded transition-colors ${
                isEditingPromptForThis || customPrompt
                  ? `bg-${bgColor}-600 text-white hover:bg-${bgColor}-700`
                  : `bg-${bgColor}-100 text-${bgColor}-900 hover:bg-${bgColor}-200`
              }`}
              title="Редактирай промпт"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            {hasRefs && (
              <button
                onClick={() => setExpandedEntity(isExpanded ? null : entity.id)}
                className={`px-2 py-1 bg-neutral-100 text-neutral-700 text-xs font-bold rounded hover:bg-neutral-200 transition-colors`}
                title="Версии"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            <button
              onClick={() => handleGenerateSingle(entity)}
              disabled={generatingCharacter === entity.id}
              className={`px-2 py-1 bg-${buttonColor}-600 text-white text-xs font-bold rounded hover:bg-${buttonColor}-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {generatingCharacter === entity.id ? (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : hasRefs ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Custom Prompt Editor */}
        {isEditingPromptForThis && (
          <div className="mt-3 pt-3 border-t border-neutral-200">
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Персонализиран промпт за генериране:
            </label>
            <textarea
              value={customPrompt || entity.description || ''}
              onChange={(e) => setCustomPrompts({ ...customPrompts, [entity.id]: e.target.value })}
              className={`w-full px-2 py-1.5 border-2 border-${bgColor}-200 rounded text-xs focus:border-${bgColor}-400 focus:ring-2 focus:ring-${bgColor}-200 outline-none`}
              rows={3}
              placeholder={`Напишете персонализиран промпт за ${entity.character_name}...`}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  setCustomPrompts({ ...customPrompts, [entity.id]: entity.description || '' })
                }}
                className="px-2 py-1 bg-neutral-200 text-neutral-700 text-xs font-bold rounded hover:bg-neutral-300 transition-colors"
              >
                Нулирай
              </button>
              <button
                onClick={() => {
                  setCustomPrompts((prev) => {
                    const updated = { ...prev }
                    delete updated[entity.id]
                    return updated
                  })
                  setEditingPrompt(null)
                }}
                className="px-2 py-1 bg-neutral-200 text-neutral-700 text-xs font-bold rounded hover:bg-neutral-300 transition-colors"
              >
                Отказ
              </button>
            </div>
          </div>
        )}

        {/* Version History */}
        {isExpanded && hasRefs && (
          <div className="mt-3 pt-3 border-t border-neutral-200">
            <h5 className="text-xs font-bold text-neutral-900 mb-2">Версии ({entityRefs.length})</h5>
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {entityRefs.map((ref) => (
                <div
                  key={ref.id}
                  onClick={() => handleSelectVersion(entity.id, ref.id)}
                  className={`relative rounded overflow-hidden border-2 transition-all cursor-pointer ${
                    ref.is_selected
                      ? 'border-green-500 ring-2 ring-green-200'
                      : `border-neutral-200 hover:border-${bgColor}-400`
                  }`}
                >
                  <SmartImage
                    src={getImageUrl(ref.image_key)}
                    alt={`${entity.character_name} v${ref.version}`}
                    className="w-full h-16 object-cover"
                  />
                  <div className={`absolute top-0 left-0 bg-white bg-opacity-90 px-1 text-xs font-bold text-${bgColor}-900`}>
                    v{ref.version}
                  </div>
                  {ref.is_selected && (
                    <div className="absolute top-0 right-0 bg-green-500 text-white rounded-bl p-0.5">
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
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-purple-900 mb-2">
          Стъпка 4: Генериране на референции
        </h2>
        <p className="text-neutral-600">
          Генерирайте референтни изображения за всички герои и обекти от списъка.
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
            disabled={isGenerating || entities.length === 0}
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

      {/* Entity Lists */}
      {entities.length === 0 ? (
        <div className="text-center py-8 text-neutral-500">
          <p>Няма извлечени герои или обекти.</p>
          <p className="text-sm mt-2">Моля генерирайте промпти за сцени в предишната стъпка.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Characters Section */}
          {characters.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                Герои ({characters.length})
              </h3>
              <div className="space-y-2">
                {characters.map((entity) => renderEntityCard(entity, 'purple', 'purple'))}
              </div>
            </div>
          )}

          {/* Objects Section */}
          {objects.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-emerald-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                </svg>
                Обекти ({objects.length})
              </h3>
              <div className="space-y-2">
                {objects.map((entity) => renderEntityCard(entity, 'emerald', 'emerald'))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
