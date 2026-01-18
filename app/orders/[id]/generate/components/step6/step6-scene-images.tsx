'use client'

import { useState, useEffect } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'
import { SceneCard } from './SceneCard'

interface Step6SceneImagesProps {
  generationId: string
  onComplete: () => void
}

export function Step6SceneImages({ generationId, onComplete }: Step6SceneImagesProps) {
  const [prompts, setPrompts] = useState<any[]>([])
  const [images, setImages] = useState<any[]>([])
  const [entities, setEntities] = useState<any[]>([])
  const [references, setReferences] = useState<any[]>([])
  const [sceneCharacters, setSceneCharacters] = useState<Record<string, string[]>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingScene, setGeneratingScene] = useState<string | null>(null)
  const [showSceneSelector, setShowSceneSelector] = useState(false)
  const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set())
  const [scenesWithoutImages, setScenesWithoutImages] = useState<string[]>([])

  useEffect(() => {
    loadData()
  }, [generationId])

  const loadData = async () => {
    await Promise.all([
      loadPrompts(),
      loadImages(),
      loadScenesWithoutImages(),
      loadEntities(),
      loadReferences(),
      loadSceneCharacters(),
    ])
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
      console.error('Failed to load references:', error)
    }
  }

  const loadSceneCharacters = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step6/scene-characters`)
      if (response.ok) {
        const data = await response.json()
        setSceneCharacters(data.sceneCharacters || {})
      }
    } catch (error) {
      console.error('Failed to load scene characters:', error)
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

  const handleAddCharacter = async (sceneId: string, characterId: string) => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step6/scene-characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenePromptId: sceneId,
          characterListId: characterId,
        }),
      })

      if (response.ok) {
        await loadSceneCharacters()
      }
    } catch (error) {
      console.error('Error adding character to scene:', error)
    }
  }

  const handleRemoveCharacter = async (sceneId: string, characterId: string) => {
    try {
      const response = await fetch(
        `/api/generation/${generationId}/step6/scene-characters?scenePromptId=${sceneId}&characterListId=${characterId}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        await loadSceneCharacters()
      }
    } catch (error) {
      console.error('Error removing character from scene:', error)
    }
  }

  const handlePromptUpdate = async (scenePromptId: string, newPrompt: string) => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step4/generate-prompts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId: scenePromptId,
          imagePrompt: newPrompt,
        }),
      })

      if (response.ok) {
        await loadPrompts()
      }
    } catch (error) {
      console.error('Error updating prompt:', error)
    }
  }

  const handleSelectVersion = async (scenePromptId: string, imageId: string) => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step6/generate-scenes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenePromptId,
          imageId,
        }),
      })

      if (response.ok) {
        await loadImages()
      }
    } catch (error) {
      console.error('Error selecting version:', error)
    }
  }

  const handleDeleteVersion = async (imageId: string) => {
    try {
      const response = await fetch(
        `/api/generation/${generationId}/step6/generate-scenes?imageId=${imageId}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        await loadImages()
      }
    } catch (error) {
      console.error('Error deleting version:', error)
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
          версии. Можете да добавяте герои и обекти към всяка сцена.
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
        <div className="mb-6">
          <SceneCard
            prompt={coverPrompt}
            images={imagesByPrompt[coverPrompt.id] || []}
            selectedCharacterIds={
              (sceneCharacters[coverPrompt.id] || []).filter((id) =>
                entities.some((e) => e.id === id && e.character_type === 'character')
              )
            }
            selectedObjectIds={
              (sceneCharacters[coverPrompt.id] || []).filter((id) =>
                entities.some((e) => e.id === id && e.character_type === 'object')
              )
            }
            entities={entities}
            references={references}
            generationId={generationId}
            isGenerating={generatingScene === coverPrompt.id}
            onGenerateSingle={handleGenerateSingle}
            onAddCharacter={handleAddCharacter}
            onRemoveCharacter={handleRemoveCharacter}
            onPromptUpdate={handlePromptUpdate}
            onSelectVersion={handleSelectVersion}
            onDeleteVersion={handleDeleteVersion}
          />
        </div>
      )}

      {/* Scene Images using SceneCard */}
      <div>
        <h3 className="font-bold text-purple-900 mb-3">Сцени ({scenePrompts.length})</h3>
        <div className="space-y-4">
          {scenePrompts.map((prompt) => {
            const sceneImages = imagesByPrompt[prompt.id] || []
            const characterIds = sceneCharacters[prompt.id] || []
            const selectedCharacters = characterIds.filter((id) =>
              entities.some((e) => e.id === id && e.character_type === 'character')
            )
            const selectedObjects = characterIds.filter((id) =>
              entities.some((e) => e.id === id && e.character_type === 'object')
            )

            return (
              <SceneCard
                key={prompt.id}
                prompt={prompt}
                images={sceneImages}
                selectedCharacterIds={selectedCharacters}
                selectedObjectIds={selectedObjects}
                entities={entities}
                references={references}
                generationId={generationId}
                isGenerating={generatingScene === prompt.id}
                onGenerateSingle={handleGenerateSingle}
                onAddCharacter={handleAddCharacter}
                onRemoveCharacter={handleRemoveCharacter}
                onPromptUpdate={handlePromptUpdate}
                onSelectVersion={handleSelectVersion}
                onDeleteVersion={handleDeleteVersion}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
