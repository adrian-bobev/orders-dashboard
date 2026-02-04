'use client'

import { useState, useEffect } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'
import { SceneCard } from './SceneCard'
import { DownloadZip } from '../download-zip'

type ImageProvider = 'fal' | 'replicate'

interface ProviderConfig {
  provider: ImageProvider
}

interface ProviderOption {
  id: ImageProvider
  name: string
}

// Generation status for bulk operations
type SceneGenerationStatus = 'queued' | 'generating' | 'completed' | 'failed' | 'idle'

interface Step5SceneImagesProps {
  generationId: string
  onComplete: () => void
}

export function Step5SceneImages({ generationId, onComplete }: Step5SceneImagesProps) {
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
  const [storyContent, setStoryContent] = useState<any>(null)

  // Track generation status for each scene during bulk generation
  const [sceneStatuses, setSceneStatuses] = useState<Record<string, SceneGenerationStatus>>({})
  // Track which scenes completed successfully during current batch
  const [completedInBatch, setCompletedInBatch] = useState<Set<string>>(new Set())

  // Provider configuration
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [selectedProvider, setSelectedProvider] = useState<ImageProvider>('fal')
  const [costPerImage, setCostPerImage] = useState<number>(0.039)
  const [step5Cost, setStep5Cost] = useState<number>(0)

  useEffect(() => {
    loadData()
    loadProviders()
  }, [generationId])

  const loadData = async () => {
    await Promise.all([
      loadPrompts(),
      loadImages(),
      loadScenesWithoutImages(),
      loadEntities(),
      loadReferences(),
      loadSceneCharacters(),
      loadCosts(),
      loadStoryContent(),
    ])
  }

  const loadProviders = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step5/providers`)
      if (response.ok) {
        const data = await response.json()
        setProviders(data.providers || [])
        if (data.defaultConfig) {
          setSelectedProvider(data.defaultConfig.provider)
        }
        if (data.cost) {
          setCostPerImage(data.cost)
        }
      }
    } catch (error) {
      console.error('Failed to load providers:', error)
    }
  }

  const loadCosts = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step5/costs`)
      if (response.ok) {
        const data = await response.json()
        setStep5Cost(data.step5Cost || 0)
      }
    } catch (error) {
      console.error('Failed to load costs:', error)
    }
  }

  const loadPrompts = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step3/generate-prompts`)
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
      const response = await fetch(`/api/generation/${generationId}/step5/generate-scenes`)
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
      const response = await fetch(`/api/generation/${generationId}/step4/generate-character-refs`)
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
      const response = await fetch(`/api/generation/${generationId}/step5/scene-characters`)
      if (response.ok) {
        const data = await response.json()
        setSceneCharacters(data.sceneCharacters || {})
      }
    } catch (error) {
      console.error('Failed to load scene characters:', error)
    }
  }

  const loadStoryContent = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step2/proofread`)
      if (response.ok) {
        const data = await response.json()
        // Use manually edited content if available, otherwise use corrected_content from correctedContent object
        const content =
          data.manuallyEditedContent || data.correctedContent?.corrected_content || null
        setStoryContent(content)
      }
    } catch (error) {
      console.error('Failed to load story content:', error)
    }
  }

  const loadScenesWithoutImages = async () => {
    try {
      const response = await fetch(
        `/api/generation/${generationId}/step5/generate-scenes?action=without-images`
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
    // Fetch scenes without images and use the result directly
    try {
      const response = await fetch(
        `/api/generation/${generationId}/step5/generate-scenes?action=without-images`
      )
      if (response.ok) {
        const data = await response.json()
        const sceneIds = data.scenePromptIds || []
        setScenesWithoutImages(sceneIds)
        // Pre-select only scenes without images (including cover if it has no image)
        setSelectedScenes(new Set(sceneIds))
      }
    } catch (error) {
      console.error('Failed to load scenes without images:', error)
    }
    setShowSceneSelector(true)
  }

  const handleBatchGenerate = async () => {
    if (selectedScenes.size === 0) {
      return
    }

    setIsGenerating(true)
    setShowSceneSelector(false)

    // Initialize all selected scenes as queued
    const initialStatuses: Record<string, SceneGenerationStatus> = {}
    selectedScenes.forEach((id) => {
      initialStatuses[id] = 'queued'
    })
    setSceneStatuses(initialStatuses)
    setCompletedInBatch(new Set())

    try {
      const providerConfig: ProviderConfig = {
        provider: selectedProvider,
      }

      const scenePromptIds = Array.from(selectedScenes)

      // Get the prompts for each scene
      const scenesToGenerate = prompts.filter((p) => scenePromptIds.includes(p.id))

      // Separate front cover, back cover, and scenes
      // Front cover must be generated first if back cover is selected
      const frontCover = scenesToGenerate.find((p) => p.scene_type === 'cover')
      const backCover = scenesToGenerate.find((p) => p.scene_type === 'back_cover')
      const scenes = scenesToGenerate.filter(
        (p) => p.scene_type !== 'cover' && p.scene_type !== 'back_cover'
      )

      // Helper function to generate a single scene
      const generateSingleScene = async (prompt: any) => {
        try {
          // Update status to generating
          setGeneratingScene(prompt.id)
          setSceneStatuses((prev) => ({ ...prev, [prompt.id]: 'generating' }))

          const response = await fetch(
            `/api/generation/${generationId}/step5/generate-scene/${prompt.id}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imagePrompt: prompt.image_prompt,
                providerConfig,
              }),
            }
          )

          if (!response.ok) {
            throw new Error('Failed to generate scene')
          }

          // Update status to completed
          setSceneStatuses((prev) => ({ ...prev, [prompt.id]: 'completed' }))
          setCompletedInBatch((prev) => new Set([...prev, prompt.id]))

          // Reload images after each successful generation to show progress
          await loadImages()
          await loadCosts()

          // Dispatch event to update global cost tracker
          window.dispatchEvent(new CustomEvent('generation-cost-updated'))

          return { success: true, scenePromptId: prompt.id }
        } catch (error) {
          console.error(`Error generating scene ${prompt.scene_number}:`, error)
          setSceneStatuses((prev) => ({ ...prev, [prompt.id]: 'failed' }))
          return { success: false, scenePromptId: prompt.id, error }
        }
      }

      // Generate scenes, front cover, and back cover in parallel
      // Back cover depends on front cover, so we handle that separately
      const CONCURRENCY_LIMIT = 6

      // Start all scene generations in parallel batches
      const sceneGenerationPromise = (async () => {
        for (let i = 0; i < scenes.length; i += CONCURRENCY_LIMIT) {
          const batch = scenes.slice(i, i + CONCURRENCY_LIMIT)
          const batchPromises = batch.map(generateSingleScene)
          await Promise.all(batchPromises)
        }
      })()

      // Handle covers: front cover first (if selected), then back cover (if selected)
      const coverGenerationPromise = (async () => {
        if (frontCover) {
          await generateSingleScene(frontCover)
        }
        // Back cover uses front cover as reference, so it must wait
        if (backCover) {
          await generateSingleScene(backCover)
        }
      })()

      // Wait for both to complete
      await Promise.all([sceneGenerationPromise, coverGenerationPromise])

      setGeneratingScene(null)
    } catch (error) {
      console.error('Error generating scenes:', error)
    } finally {
      setIsGenerating(false)
      setGeneratingScene(null)
      // Clear statuses after a delay to show final state
      setTimeout(() => {
        setSceneStatuses({})
        setCompletedInBatch(new Set())
      }, 3000)
    }
  }

  const handleGenerateSingle = async (scenePromptId: string, imagePrompt: string) => {
    setGeneratingScene(scenePromptId)
    setSceneStatuses((prev) => ({ ...prev, [scenePromptId]: 'generating' }))
    try {
      const providerConfig: ProviderConfig = {
        provider: selectedProvider,
      }

      const response = await fetch(
        `/api/generation/${generationId}/step5/generate-scene/${scenePromptId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagePrompt, providerConfig }),
        }
      )

      if (!response.ok) {
        throw new Error('Failed to generate scene')
      }

      setSceneStatuses((prev) => ({ ...prev, [scenePromptId]: 'completed' }))

      // Reload images and costs after generation
      await loadImages()
      await loadCosts()

      // Dispatch event to update global cost tracker
      window.dispatchEvent(new CustomEvent('generation-cost-updated'))
    } catch (error) {
      console.error('Error generating scene:', error)
      setSceneStatuses((prev) => ({ ...prev, [scenePromptId]: 'failed' }))
    } finally {
      setGeneratingScene(null)
      // Clear status after a delay
      setTimeout(() => {
        setSceneStatuses((prev) => {
          const newStatuses = { ...prev }
          delete newStatuses[scenePromptId]
          return newStatuses
        })
      }, 2000)
    }
  }

  const handleAddCharacter = async (sceneId: string, characterId: string) => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step5/scene-characters`, {
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
        `/api/generation/${generationId}/step5/scene-characters?scenePromptId=${sceneId}&characterListId=${characterId}`,
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
      const response = await fetch(`/api/generation/${generationId}/step3/generate-prompts`, {
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

  const handleSceneTextUpdate = async (scenePromptId: string, newText: string) => {
    try {
      // Find the scene number for this prompt
      const prompt = prompts.find((p) => p.id === scenePromptId)
      if (!prompt?.scene_number) {
        console.error('Scene number not found for prompt:', scenePromptId)
        return
      }

      // Update the corrected content (single source of truth)
      const response = await fetch(`/api/generation/${generationId}/step2/proofread`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneNumber: prompt.scene_number,
          sceneText: newText,
        }),
      })

      if (response.ok) {
        // Update local state
        const sceneIndex = prompt.scene_number - 1
        setStoryContent((prev: any) => {
          if (!prev?.scenes) return prev
          const updatedScenes = [...prev.scenes]
          if (updatedScenes[sceneIndex]) {
            updatedScenes[sceneIndex] = { ...updatedScenes[sceneIndex], text: newText }
          }
          return { ...prev, scenes: updatedScenes }
        })
      }
    } catch (error) {
      console.error('Error updating scene text:', error)
    }
  }

  const handleSelectVersion = async (scenePromptId: string, imageId: string) => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step5/generate-scenes`, {
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
        `/api/generation/${generationId}/step5/generate-scenes?imageId=${imageId}`,
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

  // Group images by scene prompt - only include completed images
  const imagesByPrompt: Record<string, any[]> = {}
  images
    .filter((img) => img.generation_status === 'completed')
    .forEach((img) => {
      const promptId = img.generation_scene_prompts.id
      if (!imagesByPrompt[promptId]) {
        imagesByPrompt[promptId] = []
      }
      imagesByPrompt[promptId].push(img)
    })

  const coverPrompt = prompts.find((p) => p.scene_type === 'cover')
  const backCoverPrompt = prompts.find((p) => p.scene_type === 'back_cover')
  const scenePrompts = prompts
    .filter((p) => p.scene_type === 'scene')
    .sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0))

  // All prompts (covers + scenes) for the selector dialog
  const allPrompts = [
    ...(coverPrompt ? [coverPrompt] : []),
    ...(backCoverPrompt ? [backCoverPrompt] : []),
    ...scenePrompts,
  ]

  // Check if front cover has a completed image (needed for back cover)
  const frontCoverHasImage =
    coverPrompt &&
    imagesByPrompt[coverPrompt.id]?.some((img: any) => img.generation_status === 'completed')

  // Check if all prompts have at least one completed image
  const allImagesGenerated =
    prompts.length > 0 &&
    prompts.every(
      (prompt) =>
        imagesByPrompt[prompt.id]?.some((img: any) => img.generation_status === 'completed')
    )

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

      {/* Provider Selection and Cost Display */}
      <div className="bg-neutral-50 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Provider Selection */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-700">Доставчик:</span>
            <div className="flex gap-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => setSelectedProvider(provider.id)}
                  disabled={isGenerating || generatingScene !== null}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedProvider === provider.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-white border border-neutral-300 text-neutral-700 hover:border-purple-400'
                  } disabled:opacity-50`}
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          {/* Cost Display */}
          <div className="flex items-center gap-4 ml-auto">
            <div className="text-sm">
              <span className="text-neutral-500">Цена/изобр.:</span>{' '}
              <span className="font-bold text-purple-700">${costPerImage.toFixed(3)}</span>
            </div>
            <div className="text-sm">
              <span className="text-neutral-500">Стъпка 5:</span>{' '}
              <span className="font-bold text-green-600">${step5Cost.toFixed(4)}</span>
            </div>
          </div>
        </div>

        {/* Mock Mode Notice */}
        <div className="text-sm text-neutral-500">
          {process.env.NEXT_PUBLIC_USE_MOCK_AI === 'true'
            ? '(Mock режим - ще върне placeholder изображения)'
            : `(Използва Seedream 4.5 от ${selectedProvider === 'fal' ? 'fal.ai' : 'Replicate'})`}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleOpenSceneSelector}
          disabled={isGenerating}
          className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          Генерирай избрани сцени
        </button>
        <DownloadZip generationId={generationId} />
        <button
          onClick={onComplete}
          disabled={!allImagesGenerated || isGenerating}
          title={!allImagesGenerated ? 'Генерирайте всички изображения първо' : ''}
          className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Завърши
        </button>
      </div>

      {/* Bulk Generation Progress Bar */}
      {isGenerating && Object.keys(sceneStatuses).length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <div>
                <h4 className="font-bold text-purple-900">Генериране на изображения</h4>
                <p className="text-sm text-purple-600">Моля, изчакайте...</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-purple-900">
                {Object.values(sceneStatuses).filter((s) => s === 'completed').length} / {Object.keys(sceneStatuses).length}
              </div>
              <div className="text-xs text-purple-600">завършени</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-purple-100 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out"
              style={{
                width: `${(Object.values(sceneStatuses).filter((s) => s === 'completed').length / Object.keys(sceneStatuses).length) * 100}%`,
              }}
            />
          </div>

          {/* Status legend */}
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-neutral-600">
                На опашка: {Object.values(sceneStatuses).filter((s) => s === 'queued').length}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              <span className="text-neutral-600">
                Генериране: {Object.values(sceneStatuses).filter((s) => s === 'generating').length}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-neutral-600">
                Готови: {Object.values(sceneStatuses).filter((s) => s === 'completed').length}
              </span>
            </div>
            {Object.values(sceneStatuses).filter((s) => s === 'failed').length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-600">
                  Грешки: {Object.values(sceneStatuses).filter((s) => s === 'failed').length}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scene Selector Dialog */}
      {showSceneSelector && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-neutral-200 p-6 pb-4 z-10">
              <h3 className="text-xl font-bold text-purple-900">Изберете сцени за генериране</h3>
              <p className="text-sm text-neutral-500 mt-1">
                Маркирайте сцените, които искате да генерирате
              </p>
            </div>

            <div className="p-6 pt-4 space-y-2">
              {allPrompts.map((prompt) => {
                const hasImage = imagesByPrompt[prompt.id] && imagesByPrompt[prompt.id].length > 0
                const isSelected = selectedScenes.has(prompt.id)

                return (
                  <label
                    key={prompt.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50 shadow-sm'
                        : 'border-neutral-200 hover:border-purple-300 hover:bg-neutral-50'
                    } ${prompt.scene_type === 'back_cover' && !frontCoverHasImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSceneSelection(prompt.id)}
                      disabled={prompt.scene_type === 'back_cover' && !frontCoverHasImage}
                      className="w-5 h-5 text-purple-600 rounded-md border-2 border-neutral-300 focus:ring-2 focus:ring-purple-200 focus:ring-offset-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-purple-900">
                          {prompt.scene_type === 'cover'
                            ? 'Корица (предна)'
                            : prompt.scene_type === 'back_cover'
                              ? 'Корица (задна)'
                              : `Сцена ${prompt.scene_number}`}
                        </span>
                        {hasImage ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Има изображение
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Няма изображение
                          </span>
                        )}
                        {prompt.scene_type === 'back_cover' && !frontCoverHasImage && (
                          <span className="inline-flex items-center gap-1 text-xs bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full font-semibold">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            Изчаква предна корица
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-500 truncate mt-1">{prompt.image_prompt}</p>
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-neutral-200 p-6 pt-4 flex gap-3 justify-between items-center">
              <span className="text-sm text-neutral-500">
                {selectedScenes.size} от {allPrompts.length} избрани
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSceneSelector(false)}
                  className="px-4 py-2.5 bg-neutral-100 text-neutral-700 rounded-xl font-bold hover:bg-neutral-200 transition-colors"
                >
                  Отказ
                </button>
                <button
                  onClick={handleBatchGenerate}
                  disabled={selectedScenes.size === 0}
                  className="px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-200"
                >
                  Генерирай ({selectedScenes.size})
                </button>
              </div>
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
            generationStatus={sceneStatuses[coverPrompt.id] || 'idle'}
            onGenerateSingle={handleGenerateSingle}
            onAddCharacter={handleAddCharacter}
            onRemoveCharacter={handleRemoveCharacter}
            onPromptUpdate={handlePromptUpdate}
            onSelectVersion={handleSelectVersion}
            onDeleteVersion={handleDeleteVersion}
          />
        </div>
      )}

      {/* Back Cover */}
      {backCoverPrompt && (
        <div className="mb-6">
          {!frontCoverHasImage && (
            <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
              <strong>Забележка:</strong> Задната корица изисква първо да бъде генерирана предната
              корица. Тя ще използва предната корица като референция, за да запази същата среда.
            </div>
          )}
          <SceneCard
            prompt={backCoverPrompt}
            images={imagesByPrompt[backCoverPrompt.id] || []}
            selectedCharacterIds={[]}
            selectedObjectIds={[]}
            entities={entities}
            references={references}
            generationId={generationId}
            isGenerating={generatingScene === backCoverPrompt.id}
            generationStatus={sceneStatuses[backCoverPrompt.id] || 'idle'}
            onGenerateSingle={handleGenerateSingle}
            onAddCharacter={handleAddCharacter}
            onRemoveCharacter={handleRemoveCharacter}
            onPromptUpdate={handlePromptUpdate}
            onSelectVersion={handleSelectVersion}
            onDeleteVersion={handleDeleteVersion}
            disabled={!frontCoverHasImage}
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
            // Get scene text from corrected content (single source of truth)
            // Scenes array is 0-indexed, scene_number is 1-indexed
            const sceneIndex = (prompt.scene_number || 1) - 1
            const sceneText = storyContent?.scenes?.[sceneIndex]?.text

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
                generationStatus={sceneStatuses[prompt.id] || 'idle'}
                onGenerateSingle={handleGenerateSingle}
                onAddCharacter={handleAddCharacter}
                onRemoveCharacter={handleRemoveCharacter}
                onPromptUpdate={handlePromptUpdate}
                onSelectVersion={handleSelectVersion}
                onDeleteVersion={handleDeleteVersion}
                sceneText={sceneText}
                onSceneTextUpdate={handleSceneTextUpdate}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
