'use client'

import { useState, useEffect } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'
import { EntitySelectionSection } from './EntitySelectionSection'

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
  image_prompt: string | null
  model_used: string | null
  generation_params: any
  character_reference_ids: string | null
  created_at: string
}

interface Entity {
  id: string
  character_name: string
  character_type: string
  description: string
  is_main_character: boolean
}

interface CharacterListInfo {
  id: string
  character_name: string
  character_type: string
  description: string | null
  is_main_character: boolean
}

interface Reference {
  id: string
  character_list_id: string
  image_key: string
  version: number
  image_prompt: string | null
  is_selected: boolean
  generation_character_list: CharacterListInfo
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
  onDeleteVersion: (imageId: string) => void
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
  onDeleteVersion,
}: SceneCardProps) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [editedPrompt, setEditedPrompt] = useState(prompt.image_prompt)
  const [previewImage, setPreviewImage] = useState<SceneImage | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [characterReferences, setCharacterReferences] = useState<Reference[]>([])
  const hasImages = images.length > 0

  useEffect(() => {
    loadCharacterReferences()
  }, [generationId])

  const loadCharacterReferences = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step4/generate-character-refs`)
      if (response.ok) {
        const data = await response.json()
        setCharacterReferences(data.references || [])
      }
    } catch (error) {
      console.error('Failed to load character references:', error)
    }
  }

  const handleSavePrompt = async () => {
    if (editedPrompt.trim() !== prompt.image_prompt) {
      await onPromptUpdate(prompt.id, editedPrompt.trim())
    }
    setShowPrompt(false)
  }

  const handleOpenPrompt = () => {
    if (!showPrompt) {
      // Open directly in edit mode
      setEditedPrompt(prompt.image_prompt)
      setShowPrompt(true)
    } else {
      // Close if already open
      setShowPrompt(false)
    }
  }

  const parseCharacterReferenceIds = (jsonString: string | null): string[] => {
    if (!jsonString) return []
    try {
      return JSON.parse(jsonString)
    } catch {
      return []
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('bg-BG', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const isCover = prompt.scene_type === 'cover'

  return (
    <div
      className={`rounded-xl p-4 border-2 ${
        isCover
          ? 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300'
          : 'bg-white border-purple-200'
      }`}
    >
      {/* Scene Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold text-purple-900 flex items-center gap-2">
          {isCover ? (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
              </svg>
              Корица на книгата
            </>
          ) : (
            <>
              <span className="bg-purple-600 text-white px-2 py-0.5 rounded-lg text-sm">
                {prompt.scene_number}
              </span>
              Сцена {prompt.scene_number}
            </>
          )}
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
            onClick={handleOpenPrompt}
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
        </div>

        {showPrompt && (
          <div className="mt-2">
            <div className="space-y-2">
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                className="w-full p-3 bg-white rounded-lg border-2 border-purple-300 text-xs text-neutral-700 focus:outline-none focus:border-purple-500"
                rows={4}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleSavePrompt}
                  className="px-3 py-1 bg-purple-600 text-white rounded font-bold hover:bg-purple-700 transition-colors text-xs"
                >
                  Запази
                </button>
              </div>
            </div>
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
              <div key={img.id} className="relative">
                <button
                  onClick={() => !img.is_selected && onSelectVersion(prompt.id, img.id)}
                  disabled={img.is_selected}
                  className={`relative rounded-lg overflow-hidden border-4 transition-all w-full ${
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

                  {/* Bottom-left: Version badge */}
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-xs font-bold shadow-lg">
                    v{img.version}
                  </div>

                  {/* Top-left: Selected icon */}
                  {img.is_selected && (
                    <div className="absolute top-2 left-2 bg-green-500 text-white rounded-full p-1">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
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

                {/* Top-right: Preview button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setPreviewImage(img)
                    setIsPreviewOpen(true)
                  }}
                  className="absolute top-2 right-2 z-10 bg-white hover:bg-neutral-100 text-purple-900 rounded-full p-2 shadow-lg transition-colors"
                  title="Преглед"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>

                {/* Bottom-right: Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteVersion(img.id)
                  }}
                  className="absolute bottom-2 right-2 z-10 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg transition-colors"
                  title="Изтрий версия"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-neutral-500 italic">Няма генерирани изображения</p>
        </div>
      )}

      {/* Preview Modal */}
      {isPreviewOpen && previewImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-purple-900">
                  {isCover ? 'Преглед на корица' : `Преглед на сцена ${prompt.scene_number}`} - версия {previewImage.version}
                </h3>
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Image */}
              <div className="mb-6">
                <SmartImage
                  src={getImageUrl(previewImage.image_key)}
                  alt={`Version ${previewImage.version}`}
                  className="w-full h-auto rounded-lg border-2 border-purple-300 max-h-[50vh] object-contain"
                />
              </div>

              {/* Details */}
              <div className="space-y-4">
                {/* Version and Status */}
                <div className="flex items-center gap-2">
                  <span className="bg-purple-600 text-white px-3 py-1 rounded text-sm font-bold">
                    v{previewImage.version}
                  </span>
                  <span className="text-sm text-neutral-600">{formatDate(previewImage.created_at)}</span>
                  {previewImage.is_selected && (
                    <span className="bg-green-500 text-white px-3 py-1 rounded text-sm font-bold">
                      Избрана
                    </span>
                  )}
                </div>

                {/* Prompt */}
                {previewImage.image_prompt && (
                  <div>
                    <p className="text-sm font-bold text-neutral-700 mb-2">Prompt:</p>
                    <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                      <p className="text-sm text-neutral-700 whitespace-pre-wrap">
                        {previewImage.image_prompt}
                      </p>
                    </div>
                  </div>
                )}

                {/* Model and Parameters */}
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-neutral-600">
                  {previewImage.model_used && (
                    <div>
                      <span className="font-bold">Модел:</span> {previewImage.model_used}
                    </div>
                  )}
                  {previewImage.generation_params?.size && (
                    <div>
                      <span className="font-bold">Размер:</span> {previewImage.generation_params.size}
                    </div>
                  )}
                  {previewImage.generation_params?.quality && (
                    <div>
                      <span className="font-bold">Качество:</span> {previewImage.generation_params.quality}
                    </div>
                  )}
                </div>

                {/* Character References */}
                {(() => {
                  const characterRefIds = parseCharacterReferenceIds(previewImage.character_reference_ids)
                  if (characterRefIds.length === 0) return null

                  return (
                    <div>
                      <p className="text-sm font-bold text-neutral-700 mb-2">
                        Използвани референции ({characterRefIds.length}):
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {characterRefIds.map((refId) => {
                          const reference = characterReferences.find((r) => r.id === refId)
                          if (!reference) {
                            return (
                              <span
                                key={refId}
                                className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs"
                              >
                                ?
                              </span>
                            )
                          }
                          return (
                            <div
                              key={refId}
                              className="relative group"
                              title={reference.generation_character_list.character_name}
                            >
                              <div className="w-16 h-16 rounded overflow-hidden border-2 border-purple-200">
                                <SmartImage
                                  src={getImageUrl(reference.image_key)}
                                  alt={reference.generation_character_list.character_name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="absolute -bottom-1 -right-1 bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                {reference.generation_character_list.character_type === 'character'
                                  ? 'Г'
                                  : 'О'}
                              </div>
                              <p className="text-xs text-neutral-700 mt-1 text-center truncate max-w-[64px]">
                                {reference.generation_character_list.character_name}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end mt-6">
                {!previewImage.is_selected && (
                  <button
                    onClick={() => {
                      onSelectVersion(prompt.id, previewImage.id)
                      setIsPreviewOpen(false)
                    }}
                    className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors"
                  >
                    Избери тази версия
                  </button>
                )}
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors"
                >
                  Затвори
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
