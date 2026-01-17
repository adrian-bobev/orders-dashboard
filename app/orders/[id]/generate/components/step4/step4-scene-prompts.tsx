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

  useEffect(() => {
    loadPrompts()
  }, [generationId])

  const loadPrompts = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step4/generate-prompts`)
      if (response.ok) {
        const data = await response.json()
        setPrompts(data.prompts || [])
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
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-purple-900">
              Промпти ({prompts.length})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm"
              >
                Генерирай отново
              </button>
              <button
                onClick={onComplete}
                className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors text-sm"
              >
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
                  className="px-3 py-1.5 bg-white text-purple-900 border-2 border-purple-300 rounded-lg font-bold hover:bg-purple-50 transition-colors text-sm"
                >
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
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors text-sm"
                    >
                      Запази
                    </button>
                    <button
                      onClick={() => setEditingPromptId(null)}
                      className="px-3 py-1.5 bg-neutral-300 text-neutral-700 rounded-lg font-bold hover:bg-neutral-400 transition-colors text-sm"
                    >
                      Отказ
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
                        className="px-2 py-1 bg-purple-100 text-purple-900 rounded-lg hover:bg-purple-200 transition-colors text-xs font-bold"
                      >
                        {expandedPromptId === prompt.id ? 'Скрий' : 'Покажи'}
                      </button>
                      <button
                        onClick={() => handleEdit(prompt)}
                        className="px-2 py-1 bg-purple-100 text-purple-900 rounded-lg hover:bg-purple-200 transition-colors text-xs font-bold"
                      >
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
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors text-sm"
                            >
                              Запази
                            </button>
                            <button
                              onClick={() => setEditingPromptId(null)}
                              className="px-3 py-1.5 bg-neutral-300 text-neutral-700 rounded-lg font-bold hover:bg-neutral-400 transition-colors text-sm"
                            >
                              Отказ
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
