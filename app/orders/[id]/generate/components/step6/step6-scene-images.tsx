'use client'

import { useState, useEffect } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'

interface Step6SceneImagesProps {
  generationId: string
  onComplete: () => void
}

export function Step6SceneImages({ generationId, onComplete }: Step6SceneImagesProps) {
  const [prompts, setPrompts] = useState<any[]>([])
  const [images, setImages] = useState<any[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingScene, setGeneratingScene] = useState<string | null>(null)
  const [showSceneSelector, setShowSceneSelector] = useState(false)
  const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set())
  const [scenesWithoutImages, setScenesWithoutImages] = useState<string[]>([])

  useEffect(() => {
    loadData()
  }, [generationId])

  const loadData = async () => {
    await Promise.all([loadPrompts(), loadImages(), loadScenesWithoutImages()])
  }

  const loadPrompts = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step4/generate-prompts`)
      if (response.ok) {
        const data = await response.json()
        setPrompts(data.prompts || [])
      }
    } catch (error) {
      console.error('Failed to load prompts:', error)
    }
  }

  const loadImages = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step6/generate-scenes`)
      if (response.ok) {
        const data = await response.json()
        setImages(data.images || [])
      }
    } catch (error) {
      console.error('Failed to load images:', error)
    }
  }

  const loadScenesWithoutImages = async () => {
    try {
      const response = await fetch(
        `/api/generation/${generationId}/step6/generate-scenes?action=without-images`
      )
      if (response.ok) {
        const data = await response.json()
        setScenesWithoutImages(data.scenePromptIds || [])
      }
    } catch (error) {
      console.error('Failed to load scenes without images:', error)
    }
  }

  const handleOpenSceneSelector = async () => {
    await loadScenesWithoutImages()
    setSelectedScenes(new Set(scenesWithoutImages))
    setShowSceneSelector(true)
  }

  const handleBatchGenerate = async () => {
    if (selectedScenes.size === 0) {
      return
    }

    setIsGenerating(true)
    setShowSceneSelector(false)

    try {
      const response = await fetch(`/api/generation/${generationId}/step6/generate-scenes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenePromptIds: Array.from(selectedScenes),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate scenes')
      }

      await loadData()
    } catch (error) {
      console.error('Error generating scenes:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateSingle = async (scenePromptId: string, imagePrompt: string) => {
    setGeneratingScene(scenePromptId)
    try {
      const response = await fetch(
        `/api/generation/${generationId}/step6/generate-scene/${scenePromptId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagePrompt }),
        }
      )

      if (!response.ok) {
        throw new Error('Failed to generate scene')
      }

      await loadData()
    } catch (error) {
      console.error('Error generating scene:', error)
    } finally {
      setGeneratingScene(null)
    }
  }

  const toggleSceneSelection = (scenePromptId: string) => {
    const newSelection = new Set(selectedScenes)
    if (newSelection.has(scenePromptId)) {
      newSelection.delete(scenePromptId)
    } else {
      newSelection.add(scenePromptId)
    }
    setSelectedScenes(newSelection)
  }

  // Group images by scene prompt
  const imagesByPrompt: Record<string, any[]> = {}
  images.forEach((img) => {
    const promptId = img.generation_scene_prompts.id
    if (!imagesByPrompt[promptId]) {
      imagesByPrompt[promptId] = []
    }
    imagesByPrompt[promptId].push(img)
  })

  const coverPrompt = prompts.find((p) => p.scene_type === 'cover')
  const scenePrompts = prompts
    .filter((p) => p.scene_type === 'scene')
    .sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-purple-900 mb-2">
          Стъпка 6: Генериране на изображения
        </h2>
        <p className="text-neutral-600">
          Генерирайте изображения за корицата и всички сцени. Всяка сцена поддържа множество
          версии.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-neutral-500">
          {process.env.NEXT_PUBLIC_USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === 'true'
            ? '(Mock режим - ще върне placeholder изображения)'
            : '(Ще използва OpenAI DALL-E 3)'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleOpenSceneSelector}
            disabled={isGenerating}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            Генерирай избрани сцени
          </button>
          <button
            onClick={onComplete}
            className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors"
          >
            Завърши
          </button>
        </div>
      </div>

      {/* Scene Selector Dialog */}
      {showSceneSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold text-purple-900 mb-4">Изберете сцени за генериране</h3>

            <div className="space-y-2 mb-6">
              {scenePrompts.map((prompt) => {
                const hasImage = imagesByPrompt[prompt.id] && imagesByPrompt[prompt.id].length > 0
                const isSelected = selectedScenes.has(prompt.id)

                return (
                  <label
                    key={prompt.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-neutral-200 hover:border-purple-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSceneSelection(prompt.id)}
                      className="w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-200"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-purple-900">
                          {prompt.scene_type === 'cover' ? 'Корица' : `Сцена ${prompt.scene_number}`}
                        </span>
                        {hasImage && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">
                            Има изображение
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-600 truncate mt-1">{prompt.image_prompt}</p>
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSceneSelector(false)}
                className="px-4 py-2 bg-neutral-300 text-neutral-700 rounded-xl font-bold hover:bg-neutral-400 transition-colors"
              >
                Отказ
              </button>
              <button
                onClick={handleBatchGenerate}
                disabled={selectedScenes.size === 0}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                Генерирай ({selectedScenes.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Book Cover */}
      {coverPrompt && (
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border-2 border-purple-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-purple-900 text-lg flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
              </svg>
              Корица на книгата
            </h3>
            <button
              onClick={() => handleGenerateSingle(coverPrompt.id, coverPrompt.image_prompt)}
              disabled={generatingScene === coverPrompt.id}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm"
            >
              {generatingScene === coverPrompt.id ? 'Генериране...' : 'Генерирай'}
            </button>
          </div>

          {imagesByPrompt[coverPrompt.id] && imagesByPrompt[coverPrompt.id].length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {imagesByPrompt[coverPrompt.id].map((img) => (
                <div
                  key={img.id}
                  className={`relative rounded-lg overflow-hidden border-4 transition-all ${
                    img.is_selected
                      ? 'border-green-500 ring-4 ring-green-200'
                      : 'border-neutral-200'
                  }`}
                >
                  <SmartImage
                    src={getImageUrl(img.image_key)}
                    alt="Book cover"
                    className="w-full h-48 object-cover"
                  />
                  <div className="absolute top-2 left-2 bg-white px-2 py-1 rounded-lg text-xs font-bold text-purple-900">
                    v{img.version}
                  </div>
                  {img.is_selected && (
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
          )}
        </div>
      )}

      {/* Scene Images */}
      <div>
        <h3 className="font-bold text-purple-900 mb-3">Сцени ({scenePrompts.length})</h3>
        <div className="space-y-4">
          {scenePrompts.map((prompt) => {
            const sceneImages = imagesByPrompt[prompt.id] || []
            const hasImages = sceneImages.length > 0

            return (
              <div key={prompt.id} className="bg-white rounded-xl p-4 border-2 border-purple-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-purple-900 flex items-center gap-2">
                    <span className="bg-purple-600 text-white px-2 py-0.5 rounded-lg text-sm">
                      {prompt.scene_number}
                    </span>
                    Сцена {prompt.scene_number}
                  </h4>
                  <button
                    onClick={() => handleGenerateSingle(prompt.id, prompt.image_prompt)}
                    disabled={generatingScene === prompt.id}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm"
                  >
                    {generatingScene === prompt.id ? 'Генериране...' : hasImages ? 'Нова версия' : 'Генерирай'}
                  </button>
                </div>

                {hasImages ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {sceneImages.map((img) => (
                      <div
                        key={img.id}
                        className={`relative rounded-lg overflow-hidden border-4 transition-all ${
                          img.is_selected
                            ? 'border-green-500 ring-4 ring-green-200'
                            : 'border-neutral-200'
                        }`}
                      >
                        <SmartImage
                          src={getImageUrl(img.image_key)}
                          alt={`Scene ${prompt.scene_number}`}
                          className="w-full h-48 object-cover"
                        />
                        <div className="absolute top-2 left-2 bg-white px-2 py-1 rounded-lg text-xs font-bold text-purple-900">
                          v{img.version}
                        </div>
                        {img.is_selected && (
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
                ) : (
                  <p className="text-sm text-neutral-500 italic">Няма генерирани изображения</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
