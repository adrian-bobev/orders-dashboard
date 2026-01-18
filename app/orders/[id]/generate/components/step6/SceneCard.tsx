'use client'

import { useState } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'
import { EntitySelectionSection } from './EntitySelectionSection'
import { GenerationHistoryPanel } from './GenerationHistoryPanel'

interface ScenePrompt {
  id: string
  scene_type: string
  scene_number: number | null
  image_prompt: string
}

interface SceneImage {
  id: string
  image_key: string
  version: number
  is_selected: boolean
  generation_status: string
}

interface Entity {
  id: string
  character_name: string
  character_type: string
  description: string
  is_main_character: boolean
  is_custom: boolean
}

interface Reference {
  id: string
  character_list_id: string
  image_key: string
  version: number
  image_prompt: string | null
  is_selected: boolean
}

interface SceneCardProps {
  prompt: ScenePrompt
  images: SceneImage[]
  selectedCharacterIds: string[]
  selectedObjectIds: string[]
  entities: Entity[]
  references: Reference[]
  generationId: string
  isGenerating: boolean
  onGenerateSingle: (scenePromptId: string, imagePrompt: string) => void
  onAddCharacter: (sceneId: string, characterId: string) => void
  onRemoveCharacter: (sceneId: string, characterId: string) => void
  onPromptUpdate: (scenePromptId: string, newPrompt: string) => void
  onSelectVersion: (scenePromptId: string, imageId: string) => void
}

export function SceneCard({
  prompt,
  images,
  selectedCharacterIds,
  selectedObjectIds,
  entities,
  references,
  generationId,
  isGenerating,
  onGenerateSingle,
  onAddCharacter,
  onRemoveCharacter,
  onPromptUpdate,
  onSelectVersion,
}: SceneCardProps) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [editedPrompt, setEditedPrompt] = useState(prompt.image_prompt)
  const hasImages = images.length > 0

  const handleSavePrompt = async () => {
    if (editedPrompt.trim() !== prompt.image_prompt) {
      await onPromptUpdate(prompt.id, editedPrompt.trim())
    }
    setIsEditingPrompt(false)
  }

  const handleCancelEdit = () => {
    setEditedPrompt(prompt.image_prompt)
    setIsEditingPrompt(false)
  }

  return (
    <div className="bg-white rounded-xl p-4 border-2 border-purple-200">
      {/* Scene Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold text-purple-900 flex items-center gap-2">
          <span className="bg-purple-600 text-white px-2 py-0.5 rounded-lg text-sm">
            {prompt.scene_number}
          </span>
          Сцена {prompt.scene_number}
        </h4>
        <button
          onClick={() => onGenerateSingle(prompt.id, prompt.image_prompt)}
          disabled={isGenerating}
          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm"
        >
          {isGenerating ? 'Генериране...' : hasImages ? 'Нова версия' : 'Генерирай'}
        </button>
      </div>

      {/* Image Prompt Display (Collapsible) */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="flex items-center gap-2 text-xs font-bold text-neutral-700 hover:text-purple-700 transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showPrompt ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Prompt за генериране
          </button>

          {showPrompt && !isEditingPrompt && (
            <button
              onClick={() => setIsEditingPrompt(true)}
              className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-2 py-1 rounded font-bold transition-colors"
            >
              Редактирай
            </button>
          )}
        </div>

        {showPrompt && (
          <div className="mt-2">
            {isEditingPrompt ? (
              <div className="space-y-2">
                <textarea
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  className="w-full p-3 bg-white rounded-lg border-2 border-purple-300 text-xs text-neutral-700 focus:outline-none focus:border-purple-500"
                  rows={4}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-1 bg-neutral-200 text-neutral-700 rounded font-bold hover:bg-neutral-300 transition-colors text-xs"
                  >
                    Отказ
                  </button>
                  <button
                    onClick={handleSavePrompt}
                    className="px-3 py-1 bg-purple-600 text-white rounded font-bold hover:bg-purple-700 transition-colors text-xs"
                  >
                    Запази
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <p className="text-xs text-neutral-700 whitespace-pre-wrap">{prompt.image_prompt}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Character/Object Selection Section */}
      <EntitySelectionSection
        sceneId={prompt.id}
        selectedCharacterIds={selectedCharacterIds}
        selectedObjectIds={selectedObjectIds}
        allEntities={entities}
        allReferences={references}
        onAdd={onAddCharacter}
        onRemove={onRemoveCharacter}
      />

      {/* Generated Images Grid */}
      {hasImages ? (
        <div className="mt-4">
          <h5 className="text-sm font-bold text-neutral-900 mb-2">
            Генерирани изображения ({images.length})
          </h5>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => !img.is_selected && onSelectVersion(prompt.id, img.id)}
                disabled={img.is_selected}
                className={`relative rounded-lg overflow-hidden border-4 transition-all ${
                  img.is_selected
                    ? 'border-green-500 ring-4 ring-green-200 cursor-default'
                    : 'border-neutral-200 hover:border-purple-400 cursor-pointer'
                }`}
              >
                <SmartImage
                  src={getImageUrl(img.image_key)}
                  alt={`Scene ${prompt.scene_number} v${img.version}`}
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
                {!img.is_selected && (
                  <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all flex items-center justify-center">
                    <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 bg-purple-600 px-2 py-1 rounded">
                      Избери
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-neutral-500 italic">Няма генерирани изображения</p>
        </div>
      )}

      {/* Generation History Panel (Collapsible) */}
      <GenerationHistoryPanel scenePromptId={prompt.id} generationId={generationId} />
    </div>
  )
}
