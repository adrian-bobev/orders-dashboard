'use client'

import { useState, useEffect } from 'react'

interface Step2ProofreadProps {
  generationId: string
  bookConfig: any
  onComplete: () => void
}

export function Step2Proofread({ generationId, bookConfig, onComplete }: Step2ProofreadProps) {
  const [isProofreading, setIsProofreading] = useState(false)
  const [correctedContent, setCorrectedContent] = useState<any | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState<string>('')
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState<string>('')
  const [defaultPrompt, setDefaultPrompt] = useState<string>('')
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>('')
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState<string>('')
  const [originalContent, setOriginalContent] = useState<any>(null)
  const [manuallyEditedContent, setManuallyEditedContent] = useState<any | null>(null)

  useEffect(() => {
    // Set original content from bookConfig
    setOriginalContent(bookConfig.content)
    loadCorrectedContent()
  }, [generationId, bookConfig])

  const loadCorrectedContent = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step2/proofread`)
      if (response.ok) {
        const data = await response.json()
        if (data.correctedContent) {
          setCorrectedContent(data.correctedContent)
        }
        // Also load manually edited content if it exists (and no corrected content yet)
        if (data.manuallyEditedContent && !data.correctedContent) {
          setManuallyEditedContent(data.manuallyEditedContent)
        }
      }
    } catch (error) {
      console.error('Failed to load corrected content:', error)
    }
  }

  const loadDefaultPrompt = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step2/default-prompt`, {
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
        // Return the prompts for immediate use
        return {
          userPrompt: data.userPrompt,
          systemPrompt: data.systemPrompt,
        }
      }
    } catch (error) {
      console.error('Error loading default prompt:', error)
    }
    return null
  }

  const handleProofread = async () => {
    setIsProofreading(true)
    try {
      // Determine what content to use for correction:
      // 1. If corrected content exists and was potentially edited, use that
      // 2. Otherwise use manually edited content (if available)
      // 3. Otherwise use original content
      let contentToProofread
      if (correctedContent?.corrected_content) {
        // Re-running correction - use the latest corrected content
        contentToProofread = correctedContent.corrected_content
      } else {
        // First run - use manually edited or original
        contentToProofread = manuallyEditedContent || originalContent
      }

      // If content was manually edited (and no corrected content yet), reload the prompt
      // If re-running with corrected content, we also need to reload the prompt
      let finalSystemPrompt = customSystemPrompt
      let finalUserPrompt = customPrompt

      if (manuallyEditedContent || correctedContent) {
        // Reload the prompt with the content to be corrected
        const promptResponse = await fetch(`/api/generation/${generationId}/step2/default-prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: contentToProofread }),
        })

        if (promptResponse.ok) {
          const promptData = await promptResponse.json()
          finalSystemPrompt = customSystemPrompt || promptData.systemPrompt
          finalUserPrompt = customPrompt || promptData.userPrompt
        }
      } else {
        // Load default prompts if not already loaded
        if (!finalSystemPrompt || !finalUserPrompt) {
          const prompts = await loadDefaultPrompt()
          if (prompts) {
            finalSystemPrompt = finalSystemPrompt || prompts.systemPrompt
            finalUserPrompt = finalUserPrompt || prompts.userPrompt
          }
        }
      }

      if (!finalSystemPrompt || !finalUserPrompt) {
        throw new Error('Prompts not loaded')
      }

      const response = await fetch(`/api/generation/${generationId}/step2/proofread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: finalSystemPrompt,
          userPrompt: finalUserPrompt,
          contentToCorrect: contentToProofread,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to proofread content')
      }

      const data = await response.json()
      setCorrectedContent(data.correctedContent)
    } catch (error) {
      console.error('Error proofreading content:', error)
    } finally {
      setIsProofreading(false)
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
    // If corrected content exists, edit that; otherwise edit original
    const contentToEdit = correctedContent?.corrected_content || originalContent
    setEditedContent(JSON.stringify(contentToEdit, null, 2))
  }

  const handleEditOriginal = () => {
    setIsEditing(true)
    // Always edit the original content or the manually edited version
    const contentToEdit = manuallyEditedContent || originalContent
    setEditedContent(JSON.stringify(contentToEdit, null, 2))
  }

  const handleSaveEdit = async () => {
    try {
      const parsed = JSON.parse(editedContent)

      // Determine if we're editing corrected content or original content
      if (correctedContent) {
        // We're editing the corrected content
        const response = await fetch(`/api/generation/${generationId}/step2/proofread`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correctedContent: parsed }),
        })

        if (!response.ok) {
          throw new Error('Failed to save edits')
        }

        const data = await response.json()
        setCorrectedContent(data.correctedContent)
      } else {
        // We're editing the original content (manual edit before AI correction)
        // Save it to the database so it persists across page refreshes
        const response = await fetch(`/api/generation/${generationId}/step2/manual-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manuallyEditedContent: parsed }),
        })

        if (!response.ok) {
          throw new Error('Failed to save manual edits')
        }

        const data = await response.json()
        setManuallyEditedContent(data.manuallyEditedContent)
      }

      setIsEditing(false)
    } catch (error) {
      console.error('Error saving edits:', error)
      alert('Failed to save edits. Please check the JSON format.')
    }
  }

  const handleSkipCorrection = () => {
    // Skip AI correction and use original/manually edited content as final
    const contentToUse = manuallyEditedContent || originalContent

    // Save it as "corrected" content (even though it's not AI-corrected)
    fetch(`/api/generation/${generationId}/step2/proofread`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correctedContent: contentToUse }),
    })
      .then(response => response.json())
      .then(data => {
        setCorrectedContent(data.correctedContent)
      })
      .catch(error => {
        console.error('Error saving skipped content:', error)
      })
  }

  const displayOriginalContent = manuallyEditedContent || originalContent
  const corrected = correctedContent?.corrected_content

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-purple-900 mb-2">Стъпка 2: Корекция на текст</h2>
        <p className="text-neutral-600">
          Използвайте OpenAI за корекция на текст на граматика, правопис и стил на съдържанието на
          книгата.
        </p>
      </div>

      {/* Prompt Editor Button - Always Visible */}
      <div className="bg-white rounded-xl p-4 border-2 border-purple-200">
        <button
          onClick={async () => {
            // Load prompts with manually edited content if available
            const contentForPrompt = manuallyEditedContent || originalContent

            if (manuallyEditedContent) {
              // Reload prompt with manually edited content
              const response = await fetch(`/api/generation/${generationId}/step2/default-prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: contentForPrompt }),
              })

              if (response.ok) {
                const data = await response.json()
                setDefaultPrompt(data.userPrompt)
                setDefaultSystemPrompt(data.systemPrompt)
                setCustomPrompt(data.userPrompt)
                setCustomSystemPrompt(data.systemPrompt)
              }
            } else if (!defaultPrompt) {
              await loadDefaultPrompt()
            }

            setIsPromptEditorOpen(true)
          }}
          className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Промени промптовете за корекция
        </button>
      </div>

      {/* Original Content Display - Always Visible (or Edit Mode) */}
      {originalContent && !correctedContent && (
        <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-blue-900">
              {isEditing ? 'Редактиране на оригинално съдържание' : 'Оригинално съдържание'}
            </h3>
            {manuallyEditedContent && !isEditing && (
              <span className="text-xs bg-amber-200 text-amber-900 px-2 py-1 rounded-full font-bold">
                Ръчно редактирано
              </span>
            )}
          </div>

          {isEditing ? (
            /* Edit Mode */
            <>
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full h-96 p-3 border-2 border-neutral-200 rounded-xl font-mono text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none"
                placeholder="JSON съдържание..."
              />
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-neutral-300 text-neutral-700 rounded-xl font-bold hover:bg-neutral-400 transition-colors"
                >
                  Отказ
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors"
                >
                  Запази промените
                </button>
              </div>
            </>
          ) : (
            /* Preview Mode */
            <>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-bold text-neutral-700">Заглавие:</p>
                  <p className="text-neutral-900">{displayOriginalContent.title}</p>
                </div>
                <div>
                  <p className="font-bold text-neutral-700">Кратко описание:</p>
                  <p className="text-neutral-900">{displayOriginalContent.shortDescription}</p>
                </div>
                {displayOriginalContent.motivationEnd && (
                  <div>
                    <p className="font-bold text-neutral-700">Мотивационен край:</p>
                    <p className="text-neutral-900">{displayOriginalContent.motivationEnd}</p>
                  </div>
                )}
                <div>
                  <p className="font-bold text-neutral-700">Сцени:</p>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {displayOriginalContent.scenes?.map((scene: any, index: number) => (
                      <div key={index} className="bg-white p-2 rounded">
                        <p className="font-bold text-xs text-neutral-600">Сцена {index + 1}</p>
                        <p className="text-neutral-900">{scene.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleEditOriginal}
                  className="px-4 py-2 bg-white text-blue-900 border-2 border-blue-300 rounded-xl font-bold hover:bg-blue-50 transition-colors"
                >
                  Редактирай оригинала
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Proofread Button */}
      {!correctedContent && (
        <div className="text-center py-8">
          <div className="flex justify-center gap-4">
            <button
              onClick={handleProofread}
              disabled={isProofreading}
              className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold text-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProofreading ? (
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
                'Стартирай корекция на текста'
              )}
            </button>
            <button
              onClick={handleSkipCorrection}
              disabled={isProofreading}
              className="px-6 py-3 bg-neutral-200 text-neutral-700 rounded-xl font-bold text-lg hover:bg-neutral-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Пропусни корекцията
            </button>
          </div>
          <p className="text-sm text-neutral-500 mt-2">
            {process.env.NEXT_PUBLIC_USE_MOCK_AI === 'true'
              ? '(Mock режим - няма реални OpenAI заявки)'
              : '(Ще използва OpenAI API)'}
          </p>
        </div>
      )}

      {/* Corrected Content Display */}
      {correctedContent && !isEditing && (
        <div className="space-y-4">
          <div className="bg-green-50 rounded-xl p-4 border-2 border-green-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-green-900">Корекцията на текста е завършена</h3>
              <span className="text-sm text-neutral-600">
                Модел: {correctedContent.model_used}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="px-4 py-2 bg-white text-purple-900 border-2 border-purple-200 rounded-xl font-bold hover:bg-purple-50 transition-colors"
              >
                {showDiff ? 'Скрий оригинала' : 'Покажи оригинала'}
              </button>
              <button
                onClick={handleEdit}
                className="px-4 py-2 bg-white text-purple-900 border-2 border-purple-200 rounded-xl font-bold hover:bg-purple-50 transition-colors"
              >
                Редактирай
              </button>
              <button
                onClick={handleProofread}
                disabled={isProofreading}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                Корекция на текста отново
              </button>
              <button
                onClick={onComplete}
                className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors ml-auto"
              >
                Готово - Следваща стъпка
              </button>
            </div>
          </div>

          {/* Content Display */}
          <div className="grid md:grid-cols-2 gap-4">
            {showDiff && (
              <div className="bg-red-50 rounded-xl p-4 border-2 border-red-200">
                <h4 className="font-bold text-red-900 mb-3">Оригинално съдържание</h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-bold text-neutral-700">Заглавие:</p>
                    <p className="text-neutral-900">{displayOriginalContent.title}</p>
                  </div>
                  <div>
                    <p className="font-bold text-neutral-700">Кратко описание:</p>
                    <p className="text-neutral-900">{displayOriginalContent.shortDescription}</p>
                  </div>
                  {displayOriginalContent.motivationEnd && (
                    <div>
                      <p className="font-bold text-neutral-700">Мотивационен край:</p>
                      <p className="text-neutral-900">{displayOriginalContent.motivationEnd}</p>
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-neutral-700">Сцени:</p>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {displayOriginalContent.scenes?.map((scene: any, index: number) => (
                        <div key={index} className="bg-white p-2 rounded">
                          <p className="font-bold text-xs text-neutral-600">
                            Сцена {index + 1}
                          </p>
                          <p className="text-neutral-900">{scene.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-green-50 rounded-xl p-4 border-2 border-green-200">
              <h4 className="font-bold text-green-900 mb-3">Коригирано съдържание</h4>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-bold text-neutral-700">Заглавие:</p>
                  <p className="text-neutral-900">{corrected.title}</p>
                </div>
                <div>
                  <p className="font-bold text-neutral-700">Кратко описание:</p>
                  <p className="text-neutral-900">{corrected.shortDescription}</p>
                </div>
                {corrected.motivationEnd && (
                  <div>
                    <p className="font-bold text-neutral-700">Мотивационен край:</p>
                    <p className="text-neutral-900">{corrected.motivationEnd}</p>
                  </div>
                )}
                <div>
                  <p className="font-bold text-neutral-700">Сцени:</p>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {corrected.scenes?.map((scene: any, index: number) => (
                      <div key={index} className="bg-white p-2 rounded">
                        <p className="font-bold text-xs text-neutral-600">Сцена {index + 1}</p>
                        <p className="text-neutral-900">{scene.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Mode for Corrected Content */}
      {correctedContent && isEditing && (
        <div className="bg-white rounded-xl p-4 border-2 border-purple-300">
          <h3 className="font-bold text-purple-900 mb-3">Редактиране на коригирано съдържание</h3>
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="w-full h-96 p-3 border-2 border-neutral-200 rounded-xl font-mono text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none"
            placeholder="JSON съдържание..."
          />
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-neutral-300 text-neutral-700 rounded-xl font-bold hover:bg-neutral-400 transition-colors"
            >
              Отказ
            </button>
            <button
              onClick={handleSaveEdit}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors"
            >
              Запази промените
            </button>
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
                <h2 className="text-2xl font-bold text-purple-900">Промени промптовете за корекция</h2>
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
                    User Prompt (инструкции за корекция):
                  </label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={10}
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
