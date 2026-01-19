'use client'

import { useState, useEffect } from 'react'

interface Step3ScenePromptsProps {
  generationId: string
  onComplete: () => void
}

export function Step3ScenePrompts({ generationId, onComplete }: Step3ScenePromptsProps) {
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
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState<string>('')
  const [defaultPrompt, setDefaultPrompt] = useState<string>('')
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>('')
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState<string>('')

  useEffect(() => {
    loadPrompts()
  }, [generationId])

  const loadPrompts = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step3/generate-prompts`)
      if (response.ok) {
        const data = await response.json()
        setPrompts(data.prompts || [])
        setEntitiesCount(data.entitiesCount || null)
      }
    } catch (error) {
      console.error('Failed to load scene prompts:', error)
    }
  }

  const loadDefaultPrompt = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step3/default-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        const data = await response.json()
        setDefaultPrompt(data.userPrompt)
        setDefaultSystemPrompt(data.systemPrompt)
        if (!customPrompt) {
          setCustomPrompt(data.userPrompt)
        }
        if (!customSystemPrompt) {
          setCustomSystemPrompt(data.systemPrompt)
        }
      }
    } catch (error) {
      console.error('Error loading default prompt:', error)
    }
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      // Load default prompts first if not loaded
      let finalSystemPrompt = customSystemPrompt
      let finalUserPrompt = customPrompt

      if (!finalSystemPrompt || !finalUserPrompt) {
        const response = await fetch(`/api/generation/${generationId}/step3/default-prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (response.ok) {
          const data = await response.json()
          finalSystemPrompt = data.systemPrompt
          finalUserPrompt = data.userPrompt

          // Update state for future use
          setDefaultPrompt(data.userPrompt)
          setDefaultSystemPrompt(data.systemPrompt)
          setCustomPrompt(data.userPrompt)
          setCustomSystemPrompt(data.systemPrompt)
        } else {
          throw new Error('Failed to load prompts')
        }
      }

      if (!finalSystemPrompt || !finalUserPrompt) {
        throw new Error('Prompts not loaded')
      }

      const generateResponse = await fetch(`/api/generation/${generationId}/step3/generate-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: finalSystemPrompt,
          userPrompt: finalUserPrompt,
        }),
      })

      if (!generateResponse.ok) {
        const error = await generateResponse.json()
        console.error('API Error:', error)
        throw new Error(error.error || 'Failed to generate scene prompts')
      }

      const data = await generateResponse.json()
      console.log('Generate response:', data)

      // Reload to get fresh data including entities count
      await loadPrompts()
    } catch (error) {
      console.error('Error generating scene prompts:', error)
      alert(error instanceof Error ? error.message : 'Failed to generate scene prompts')
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
      const response = await fetch(`/api/generation/${generationId}/step3/generate-prompts`, {
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
    }
  }

  const coverPrompt = prompts.find((p) => p.scene_type === 'cover')
  const scenePrompts = prompts.filter((p) => p.scene_type === 'scene').sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-purple-900 mb-2">
          Стъпка 3: Генериране на Scene Prompts
        </h2>
        <p className="text-neutral-600">
          Генерирайте детайлни prompts за корицата и всяка сцена. Prompts могат да се редактират след генериране.
        </p>
      </div>

      {/* Prompt Editor Button - Always Visible */}
      <div className="bg-white rounded-xl p-4 border-2 border-purple-200">
        <button
          onClick={() => {
            if (!defaultPrompt) {
              loadDefaultPrompt()
            }
            setIsPromptEditorOpen(true)
          }}
          className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Промени промптовете за генериране
        </button>
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
              'Генерирай Scene Prompts'
            )}
          </button>
          <p className="text-sm text-neutral-500 mt-2">
            {process.env.NEXT_PUBLIC_USE_MOCK_AI === 'true'
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

      {/* Prompt Editor Modal */}
      {isPromptEditorOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-neutral-200 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-purple-900">Промени промптовете за scene генериране</h2>
                <p className="text-sm text-neutral-600 mt-1">
                  Промените са само за текущата генерация. Оригиналните промптове остават непроменени.
                </p>
              </div>
              <button
                onClick={() => setIsPromptEditorOpen(false)}
                className="p-2 hover:bg-neutral-100 rounded-full transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-6">
                {/* System Prompt */}
                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2">
                    System Prompt (контекст за AI модела):
                  </label>
                  <textarea
                    value={customSystemPrompt}
                    onChange={(e) => setCustomSystemPrompt(e.target.value)}
                    rows={6}
                    className="w-full px-4 py-3 border-2 border-neutral-300 rounded-xl focus:border-purple-500 focus:outline-none font-mono text-sm"
                    placeholder="System промптът ще се зареди..."
                  />
                  {customSystemPrompt !== defaultSystemPrompt && defaultSystemPrompt && (
                    <p className="text-xs text-amber-600 mt-1">⚠️ System промптът е променен</p>
                  )}
                </div>

                {/* User Prompt */}
                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2">
                    User Prompt (инструкции за генериране):
                  </label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={15}
                    className="w-full px-4 py-3 border-2 border-neutral-300 rounded-xl focus:border-purple-500 focus:outline-none font-mono text-sm"
                    placeholder="User промптът ще се зареди..."
                  />
                  {customPrompt !== defaultPrompt && defaultPrompt && (
                    <p className="text-xs text-amber-600 mt-1">⚠️ User промптът е променен</p>
                  )}
                </div>

                {(customPrompt !== defaultPrompt || customSystemPrompt !== defaultSystemPrompt) &&
                  (defaultPrompt || defaultSystemPrompt) && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <p className="text-sm text-amber-800">
                        Промптовете са променени спрямо оригиналните от YAML файла.
                      </p>
                    </div>
                  )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-neutral-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setCustomPrompt(defaultPrompt)
                  setCustomSystemPrompt(defaultSystemPrompt)
                }}
                className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-xl font-bold hover:bg-neutral-300 transition-colors"
                disabled={!defaultPrompt && !defaultSystemPrompt}
              >
                Възстанови оригиналите
              </button>
              <button
                onClick={() => setIsPromptEditorOpen(false)}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors"
              >
                Запази промените
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
