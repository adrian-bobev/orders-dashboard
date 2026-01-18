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

  useEffect(() => {
    loadCorrectedContent()
  }, [generationId])

  const loadCorrectedContent = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step2/proofread`)
      if (response.ok) {
        const data = await response.json()
        if (data.correctedContent) {
          setCorrectedContent(data.correctedContent)
        }
      }
    } catch (error) {
      console.error('Failed to load corrected content:', error)
    }
  }

  const handleProofread = async () => {
    setIsProofreading(true)
    try {
      const response = await fetch(`/api/generation/${generationId}/step2/proofread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error('Failed to proofread content')
      }

      const data = await response.json()
      setCorrectedContent(data.correctedContent)
      alert('Коректурата е завършена успешно!')
    } catch (error) {
      console.error('Error proofreading content:', error)
      alert('Грешка при коректура на съдържанието')
    } finally {
      setIsProofreading(false)
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
    setEditedContent(JSON.stringify(correctedContent.corrected_content, null, 2))
  }

  const handleSaveEdit = async () => {
    try {
      const parsed = JSON.parse(editedContent)

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
      setIsEditing(false)
      alert('Промените са запазени!')
    } catch (error) {
      console.error('Error saving edits:', error)
      alert('Грешка при запазване на промените. Уверете се, че JSON форматът е валиден.')
    }
  }

  const originalContent = bookConfig.content
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

      {/* Proofread Button */}
      {!correctedContent && (
        <div className="text-center py-8">
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
          <p className="text-sm text-neutral-500 mt-2">
            {process.env.NEXT_PUBLIC_USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === 'true'
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
                    <p className="text-neutral-900">{originalContent.title}</p>
                  </div>
                  <div>
                    <p className="font-bold text-neutral-700">Кратко описание:</p>
                    <p className="text-neutral-900">{originalContent.shortDescription}</p>
                  </div>
                  <div>
                    <p className="font-bold text-neutral-700">Сцени:</p>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {originalContent.scenes?.map((scene: any, index: number) => (
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

      {/* Edit Mode */}
      {isEditing && (
        <div className="bg-white rounded-xl p-4 border-2 border-purple-300">
          <h3 className="font-bold text-purple-900 mb-3">Редактиране на съдържание</h3>
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
    </div>
  )
}
