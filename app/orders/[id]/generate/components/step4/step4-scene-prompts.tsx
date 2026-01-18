'use client'

import { useState, useEffect } from 'react'

interface Step4ScenePromptsProps {
  generationId: string
  onComplete: () => void
}

export function Step4ScenePrompts({ generationId, onComplete }: Step4ScenePromptsProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [prompts, setPrompts] = useState<any[]>([])
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [editedPromptText, setEditedPromptText] = useState('')
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null)
  const [entitiesCount, setEntitiesCount] = useState<{
    charactersCount: number
    objectsCount: number
    totalCount: number
  } | null>(null)

  useEffect(() => {
    loadPrompts()
  }, [generationId])

  const loadPrompts = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step4/generate-prompts`)
      if (response.ok) {
        const data = await response.json()
        setPrompts(data.prompts || [])
        setEntitiesCount(data.entitiesCount || null)
      }
    } catch (error) {
      console.error('Failed to load scene prompts:', error)
    }
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const response = await fetch(`/api/generation/${generationId}/step4/generate-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate scene prompts')
      }

      const data = await response.json()
      setPrompts(data.prompts || [])

      // Reload to get entities count
      await loadPrompts()

      alert('Промптите за сцени са генерирани успешно!')
    } catch (error) {
      console.error('Error generating scene prompts:', error)
      alert(error instanceof Error ? error.message : 'Грешка при генериране на промпти')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleEdit = (prompt: any) => {
    setEditingPromptId(prompt.id)
    setEditedPromptText(prompt.image_prompt)
  }

  const handleSaveEdit = async (promptId: string) => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step4/generate-prompts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId,
          imagePrompt: editedPromptText,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update prompt')
      }

      setEditingPromptId(null)
      await loadPrompts()
    } catch (error) {
      console.error('Error updating prompt:', error)
      alert('Грешка при обновяване на промпт')
    }
  }

  const coverPrompt = prompts.find((p) => p.scene_type === 'cover')
  const scenePrompts = prompts.filter((p) => p.scene_type === 'scene').sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-purple-900 mb-2">
          Стъпка 4: Генериране на промпти за сцени
        </h2>
        <p className="text-neutral-600">
          Генерирайте детайлни промпти за корицата и всяка сцена. Промптите могат да се
          редактират след генериране.
        </p>
      </div>

      {/* Generate Button */}
      {prompts.length === 0 && (
        <div className="text-center py-8">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold text-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              'Генерирай промпти за сцени'
            )}
          </button>
          <p className="text-sm text-neutral-500 mt-2">
            {process.env.NEXT_PUBLIC_USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === 'true'
              ? '(Mock режим - ще върне примерни промпти)'
              : '(Ще използва OpenAI API)'}
          </p>
        </div>
      )}

      {/* Prompts Display */}
      {prompts.length > 0 && (
        <div className="space-y-6">
          {/* Extracted Entities Info */}
          {entitiesCount && entitiesCount.totalCount > 0 && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border-2 border-green-300">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-bold text-green-900">
                    Извлечени {entitiesCount.totalCount} елемента от промптите
                  </p>
                  <p className="text-sm text-green-700">
                    {entitiesCount.charactersCount} герои и {entitiesCount.objectsCount} обекти ще бъдат използвани в следващата стъпка
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="font-bold text-purple-900">
              Промпти ({prompts.length})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Генерирай отново
              </button>
              <button
                onClick={onComplete}
                className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                Готово - Следваща стъпка
              </button>
            </div>
          </div>

          {/* Book Cover Prompt */}
          {coverPrompt && (
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border-2 border-purple-300">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-purple-900 text-lg flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                  </svg>
                  Корица на книгата
                </h4>
                <button
                  onClick={() => handleEdit(coverPrompt)}
                  className="px-3 py-1.5 bg-white text-purple-900 border-2 border-purple-300 rounded-lg font-bold hover:bg-purple-50 transition-colors text-sm flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Редактирай
                </button>
              </div>

              {editingPromptId === coverPrompt.id ? (
                <div className="space-y-3">
                  <textarea
                    value={editedPromptText}
                    onChange={(e) => setEditedPromptText(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none text-sm"
                    rows={6}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(coverPrompt.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors text-sm flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Запази промените
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-neutral-800 text-sm leading-relaxed">
                  {coverPrompt.image_prompt}
                </p>
              )}
            </div>
          )}

          {/* Scene Prompts */}
          <div>
            <h4 className="font-bold text-purple-900 mb-3">Сцени ({scenePrompts.length})</h4>
            <div className="space-y-3">
              {scenePrompts.map((prompt) => (
                <div
                  key={prompt.id}
                  className="bg-white rounded-xl p-4 border-2 border-purple-200 hover:border-purple-300 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-bold text-purple-900 flex items-center gap-2">
                      <span className="bg-purple-600 text-white px-2 py-0.5 rounded-lg text-sm">
                        {prompt.scene_number}
                      </span>
                      Сцена {prompt.scene_number}
                    </h5>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setExpandedPromptId(expandedPromptId === prompt.id ? null : prompt.id)}
                        className="px-2 py-1 bg-purple-100 text-purple-900 rounded-lg hover:bg-purple-200 transition-colors text-xs font-bold flex items-center gap-1"
                      >
                        {expandedPromptId === prompt.id ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                            Скрий
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            Покажи
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(prompt)}
                        className="px-2 py-1 bg-purple-100 text-purple-900 rounded-lg hover:bg-purple-200 transition-colors text-xs font-bold flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Редактирай
                      </button>
                    </div>
                  </div>

                  {(expandedPromptId === prompt.id || editingPromptId === prompt.id) && (
                    <>
                      {editingPromptId === prompt.id ? (
                        <div className="space-y-3 mt-3">
                          <textarea
                            value={editedPromptText}
                            onChange={(e) => setEditedPromptText(e.target.value)}
                            className="w-full px-3 py-2 border-2 border-purple-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none text-sm"
                            rows={6}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveEdit(prompt.id)}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors text-sm flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Запази промените
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-neutral-700 text-sm leading-relaxed mt-2 bg-neutral-50 p-3 rounded-lg">
                          {prompt.image_prompt}
                        </p>
                      )}
                    </>
                  )}

                  {expandedPromptId !== prompt.id && editingPromptId !== prompt.id && (
                    <p className="text-neutral-600 text-sm truncate mt-1">
                      {prompt.image_prompt}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
