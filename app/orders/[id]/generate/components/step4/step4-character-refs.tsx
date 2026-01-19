'use client'

import { useState, useEffect, useCallback } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'
import { useDropzone } from 'react-dropzone'

interface Step4CharacterRefsProps {
  generationId: string
  bookConfig: any
  onComplete: () => void
}

interface Entity {
  id: string
  character_name: string
  character_type: string
  description: string | null
  is_custom?: boolean
  is_main_character?: boolean
}

interface UploadProgress {
  [entityId: string]: {
    [fileId: string]: {
      progress: number
      status: 'uploading' | 'success' | 'error'
      error?: string
    }
  }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const acceptedFileTypes = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}

export function Step4CharacterRefs({ generationId, bookConfig, onComplete }: Step4CharacterRefsProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [references, setReferences] = useState<any[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [generatingCharacter, setGeneratingCharacter] = useState<string | null>(null)
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null)
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({})
  const [customSystemPrompts, setCustomSystemPrompts] = useState<Record<string, string>>({})
  const [showAddForm, setShowAddForm] = useState<'character' | 'object' | null>(null)
  const [newEntityName, setNewEntityName] = useState('')
  const [newEntityDescription, setNewEntityDescription] = useState('')
  const [isCreatingEntity, setIsCreatingEntity] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({})
  const [uploadingEntity, setUploadingEntity] = useState<string | null>(null)
  const [previewEntity, setPreviewEntity] = useState<Entity | null>(null)
  const [previewRef, setPreviewRef] = useState<any | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [defaultPrompts, setDefaultPrompts] = useState<Record<string, string>>({})
  const [defaultSystemPrompts, setDefaultSystemPrompts] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
  }, [generationId])

  const loadData = async () => {
    await Promise.all([loadEntities(), loadReferences()])
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
      console.error('Failed to load character references:', error)
    }
  }

  const loadDefaultPrompt = async (entity: Entity) => {
    // If we already have the default prompt for this entity, don't reload
    if (defaultPrompts[entity.id] && defaultSystemPrompts[entity.id]) {
      return {
        userPrompt: defaultPrompts[entity.id],
        systemPrompt: defaultSystemPrompts[entity.id],
      }
    }

    try {
      const response = await fetch(`/api/generation/${generationId}/step4/default-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterName: entity.character_name,
          characterType: entity.character_type,
          description: entity.description,
          bookConfig,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setDefaultPrompts((prev) => ({
          ...prev,
          [entity.id]: data.userPrompt,
        }))
        setDefaultSystemPrompts((prev) => ({
          ...prev,
          [entity.id]: data.systemPrompt,
        }))

        // If no custom prompt exists yet, initialize it with the default
        if (!customPrompts[entity.id]) {
          setCustomPrompts((prev) => ({
            ...prev,
            [entity.id]: data.userPrompt,
          }))
        }
        if (!customSystemPrompts[entity.id]) {
          setCustomSystemPrompts((prev) => ({
            ...prev,
            [entity.id]: data.systemPrompt,
          }))
        }

        return {
          userPrompt: data.userPrompt,
          systemPrompt: data.systemPrompt,
        }
      }
    } catch (error) {
      console.error('Failed to load default prompt:', error)
    }
    return null
  }

  const handleGenerateAll = async () => {
    setIsGenerating(true)
    try {
      // Load default prompts for all entities that don't have them yet
      const promptLoadPromises = entities.map(entity => loadDefaultPrompt(entity))
      const promptsResults = await Promise.all(promptLoadPromises)

      // Build custom prompts object with all entities using the returned values
      const customPromptsForAll: Record<string, string> = {}

      entities.forEach((entity, index) => {
        const loadedPrompts = promptsResults[index]

        // Use custom prompt if exists, otherwise use the loaded default
        const userPrompt = customPrompts[entity.id] || loadedPrompts?.userPrompt
        const systemPrompt = customSystemPrompts[entity.id] || loadedPrompts?.systemPrompt

        if (systemPrompt && userPrompt) {
          customPromptsForAll[entity.id] = `${systemPrompt}\n\n${userPrompt}`
        } else if (userPrompt) {
          customPromptsForAll[entity.id] = userPrompt
        }
      })

      const response = await fetch(`/api/generation/${generationId}/step4/generate-character-refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookConfig,
          customPrompts: customPromptsForAll,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate references')
      }

      await loadReferences()
    } catch (error) {
      console.error('Error generating references:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateSingle = async (entity: Entity) => {
    setGeneratingCharacter(entity.id)
    try {
      // Load default prompts if they're not already loaded
      let finalSystemPrompt = customSystemPrompts[entity.id]
      let finalUserPrompt = customPrompts[entity.id]

      if (!finalSystemPrompt || !finalUserPrompt) {
        const prompts = await loadDefaultPrompt(entity)
        if (prompts) {
          finalSystemPrompt = finalSystemPrompt || prompts.systemPrompt
          finalUserPrompt = finalUserPrompt || prompts.userPrompt
        }
      }

      // Combine system + user prompts for the final custom prompt
      const combinedCustomPrompt =
        finalSystemPrompt && finalUserPrompt
          ? `${finalSystemPrompt}\n\n${finalUserPrompt}`
          : finalUserPrompt || undefined

      const response = await fetch(`/api/generation/${generationId}/step4/generate-character-refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterListId: entity.id,
          characterName: entity.character_name,
          characterType: entity.character_type,
          description: entity.description,
          customPrompt: combinedCustomPrompt || undefined,
          bookConfig,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate reference')
      }

      await loadReferences()
      // Don't clear custom prompt after generation - keep it for the next generation
    } catch (error) {
      console.error('Error generating reference:', error)
    } finally {
      setGeneratingCharacter(null)
    }
  }

  const handleSelectVersion = async (characterListId: string, referenceId: string) => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step4/generate-character-refs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterListId, referenceId }),
      })

      if (!response.ok) {
        throw new Error('Failed to select version')
      }

      await loadReferences()
    } catch (error) {
      console.error('Error selecting version:', error)
    }
  }

  const handleCreateEntity = async () => {
    if (!newEntityName.trim() || !showAddForm) return

    setIsCreatingEntity(true)
    try {
      const response = await fetch(`/api/generation/${generationId}/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterName: newEntityName.trim(),
          characterType: showAddForm,
          description: newEntityDescription.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create entity')
      }

      await loadEntities()
      setNewEntityName('')
      setNewEntityDescription('')
      setShowAddForm(null)
    } catch (error) {
      console.error('Error creating entity:', error)
    } finally {
      setIsCreatingEntity(false)
    }
  }

  const handleDeleteEntity = async (entity: Entity) => {
    if (!entity.is_custom) {
      console.warn('Only custom entities can be deleted')
      return
    }

    try {
      const response = await fetch(`/api/generation/${generationId}/entities?entityId=${entity.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete entity')
      }

      await loadData()
    } catch (error) {
      console.error('Error deleting entity:', error)
    }
  }

  const uploadFile = async (entity: Entity, file: File) => {
    const fileId = `${file.name}-${Date.now()}`

    if (!uploadProgress[entity.id]) {
      setUploadProgress(prev => ({
        ...prev,
        [entity.id]: {},
      }))
    }

    setUploadProgress(prev => ({
      ...prev,
      [entity.id]: {
        ...prev[entity.id],
        [fileId]: { progress: 0, status: 'uploading' },
      },
    }))

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('characterListId', entity.id)
      formData.append('characterName', entity.character_name)
      formData.append('characterType', entity.character_type)

      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          setUploadProgress(prev => ({
            ...prev,
            [entity.id]: {
              ...prev[entity.id],
              [fileId]: { ...prev[entity.id][fileId], progress: percent },
            },
          }))
        }
      })

      // Handle completion
      await new Promise<void>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(prev => ({
              ...prev,
              [entity.id]: {
                ...prev[entity.id],
                [fileId]: { progress: 100, status: 'success' },
              },
            }))
            loadReferences()
            resolve()
          } else {
            const error = JSON.parse(xhr.responseText).error || 'Upload failed'
            setUploadProgress(prev => ({
              ...prev,
              [entity.id]: {
                ...prev[entity.id],
                [fileId]: { progress: 0, status: 'error', error },
              },
            }))
            reject(new Error(error))
          }
        })

        xhr.addEventListener('error', () => {
          const error = 'Upload failed. Please check your connection and try again.'
          setUploadProgress(prev => ({
            ...prev,
            [entity.id]: {
              ...prev[entity.id],
              [fileId]: { progress: 0, status: 'error', error },
            },
          }))
          reject(new Error(error))
        })

        xhr.open('POST', `/api/generation/${generationId}/step4/upload-character-ref`)
        xhr.send(formData)
      })
    } catch (error) {
      console.error('Upload error:', error)
    }
  }

  const onDropForEntity = (entity: Entity) => async (acceptedFiles: File[]) => {
    setUploadingEntity(entity.id)
    for (const file of acceptedFiles) {
      await uploadFile(entity, file)
    }
    setUploadingEntity(null)
  }

  // Group references by entity
  const groupedReferences: Record<string, any[]> = {}
  references.forEach((ref) => {
    const charId = ref.character_list_id || ref.generation_character_list?.id
    if (!charId) return
    if (!groupedReferences[charId]) {
      groupedReferences[charId] = []
    }
    groupedReferences[charId].push(ref)
  })

  // Sort references by version descending
  Object.keys(groupedReferences).forEach((key) => {
    groupedReferences[key].sort((a, b) => b.version - a.version)
  })

  const characters = entities.filter((e) => e.character_type === 'character')
  const objects = entities.filter((e) => e.character_type === 'object')

  const hasAnyReferences = references.length > 0

  const renderEntityCard = (entity: Entity, bgColor: string, buttonColor: string) => {
    const entityRefs = groupedReferences[entity.id] || []
    const selectedRef = entityRefs.find((r) => r.is_selected) || entityRefs[0]
    const isExpanded = expandedEntity === entity.id
    const hasRefs = entityRefs.length > 0
    const isEditingPromptForThis = editingPrompt === entity.id
    const customPrompt = customPrompts[entity.id]
    const entityUploadProgress = uploadProgress[entity.id] || {}
    const hasActiveUploads = Object.keys(entityUploadProgress).length > 0

    return (
      <div key={entity.id} className={`bg-white rounded-lg p-3 border-2 border-${bgColor}-200 hover:border-${bgColor}-300 transition-colors`}>
        {/* Compact Header */}
        <div className="flex items-center gap-3">
          {/* Preview thumbnail if exists */}
          {selectedRef && (
            <div className="relative rounded overflow-hidden w-16 h-16 flex-shrink-0 border-2 border-green-500">
              <SmartImage
                src={getImageUrl(selectedRef.image_key)}
                alt={entity.character_name}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-0 right-0 bg-green-500 text-white text-xs px-1 rounded-bl">
                v{selectedRef.version}
              </div>
            </div>
          )}

          {/* Entity info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={`font-bold text-${bgColor}-900 truncate`}>{entity.character_name}</h4>
              {entity.is_main_character && (
                <span className="px-1.5 py-0.5 bg-purple-600 text-white text-xs font-bold rounded-full flex-shrink-0">
                  Главен
                </span>
              )}
              {entity.is_custom && (
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full flex-shrink-0">
                  Персонализиран
                </span>
              )}
              {hasRefs && (
                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full flex-shrink-0">
                  {entityRefs.length}
                </span>
              )}
            </div>
            {entity.description && !customPrompt && !isEditingPromptForThis && (
              <p className="text-xs text-neutral-600 truncate mt-0.5">{entity.description}</p>
            )}
            {customPrompt && !isEditingPromptForThis && (
              <p className="text-xs text-purple-600 truncate mt-0.5">Персонализиран промпт</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-1 flex-shrink-0">
            {hasRefs && selectedRef && (
              <button
                onClick={() => {
                  setPreviewEntity(entity)
                  setPreviewRef(selectedRef)
                  setIsPreviewOpen(true)
                }}
                className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 transition-colors"
                title="Преглед"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            )}
            {/* Hide edit prompt button for main character */}
            {!entity.is_main_character && (
              <button
                onClick={async () => {
                  if (!isEditingPromptForThis) {
                    // Load default prompt when opening editor
                    await loadDefaultPrompt(entity)
                  }
                  setEditingPrompt(isEditingPromptForThis ? null : entity.id)
                }}
                className={`px-2 py-1 text-xs font-bold rounded transition-colors ${
                  isEditingPromptForThis || customPrompt
                    ? `bg-${bgColor}-600 text-white hover:bg-${bgColor}-700`
                    : `bg-${bgColor}-100 text-${bgColor}-900 hover:bg-${bgColor}-200`
                }`}
                title="Редактирай промпт"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
            )}
            {hasRefs && (
              <button
                onClick={() => setExpandedEntity(isExpanded ? null : entity.id)}
                className={`px-2 py-1 bg-neutral-100 text-neutral-700 text-xs font-bold rounded hover:bg-neutral-200 transition-colors`}
                title="Версии"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            <UploadButton entity={entity} bgColor={bgColor} onDrop={onDropForEntity(entity)} isUploading={uploadingEntity === entity.id} />
            {/* Hide generate button for main character */}
            {!entity.is_main_character && (
              <button
                onClick={() => handleGenerateSingle(entity)}
                disabled={generatingCharacter === entity.id}
                className={`px-2 py-1 bg-${buttonColor}-600 text-white text-xs font-bold rounded hover:bg-${buttonColor}-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {generatingCharacter === entity.id ? (
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : hasRefs ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
              </button>
            )}
            {entity.is_custom && (
              <button
                onClick={() => handleDeleteEntity(entity)}
                className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700 transition-colors"
                title="Изтрий"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Upload Progress */}
        {hasActiveUploads && (
          <div className="mt-2 space-y-1">
            {Object.entries(entityUploadProgress).map(([fileId, progress]) => {
              const fileName = fileId.split('-')[0]
              return (
                <div key={fileId} className="flex items-center gap-2">
                  <span className="text-xs text-neutral-600 truncate flex-1">{fileName}</span>
                  {progress.status === 'uploading' && (
                    <div className="flex-1 bg-neutral-200 rounded-full h-1.5">
                      <div
                        className={`bg-${bgColor}-500 h-1.5 rounded-full transition-all`}
                        style={{ width: `${progress.progress}%` }}
                      />
                    </div>
                  )}
                  <span className="text-xs text-neutral-500">
                    {progress.status === 'success' && '✓'}
                    {progress.status === 'error' && '✗'}
                    {progress.status === 'uploading' && `${progress.progress}%`}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Custom Prompt Editor */}
        {isEditingPromptForThis && (
          <div className="mt-3 pt-3 border-t border-neutral-200">
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              System Prompt (контекст за AI модела):
            </label>
            <textarea
              value={customSystemPrompts[entity.id] || ''}
              onChange={(e) =>
                setCustomSystemPrompts({ ...customSystemPrompts, [entity.id]: e.target.value })
              }
              className={`w-full px-2 py-1.5 border-2 border-${bgColor}-200 rounded text-xs focus:border-${bgColor}-400 focus:ring-2 focus:ring-${bgColor}-200 outline-none mb-2`}
              rows={4}
              placeholder={`System промпт за ${entity.character_name}...`}
            />
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              User Prompt (инструкции за генериране):
            </label>
            <textarea
              value={customPrompts[entity.id] || ''}
              onChange={(e) => setCustomPrompts({ ...customPrompts, [entity.id]: e.target.value })}
              className={`w-full px-2 py-1.5 border-2 border-${bgColor}-200 rounded text-xs focus:border-${bgColor}-400 focus:ring-2 focus:ring-${bgColor}-200 outline-none`}
              rows={8}
              placeholder={`User промпт за ${entity.character_name}...`}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  // Reset to default prompts
                  if (defaultPrompts[entity.id]) {
                    setCustomPrompts({ ...customPrompts, [entity.id]: defaultPrompts[entity.id] })
                  }
                  if (defaultSystemPrompts[entity.id]) {
                    setCustomSystemPrompts({
                      ...customSystemPrompts,
                      [entity.id]: defaultSystemPrompts[entity.id],
                    })
                  }
                }}
                className="px-2 py-1 bg-neutral-200 text-neutral-700 text-xs font-bold rounded hover:bg-neutral-300 transition-colors"
              >
                Нулирай до оригинални
              </button>
              <button
                onClick={() => {
                  setCustomPrompts((prev) => {
                    const updated = { ...prev }
                    delete updated[entity.id]
                    return updated
                  })
                  setCustomSystemPrompts((prev) => {
                    const updated = { ...prev }
                    delete updated[entity.id]
                    return updated
                  })
                  setEditingPrompt(null)
                }}
                className="px-2 py-1 bg-neutral-200 text-neutral-700 text-xs font-bold rounded hover:bg-neutral-300 transition-colors"
              >
                Отказ
              </button>
            </div>
          </div>
        )}

        {/* Version History */}
        {isExpanded && hasRefs && (
          <div className="mt-3 pt-3 border-t border-neutral-200">
            <h5 className="text-xs font-bold text-neutral-900 mb-2">Версии ({entityRefs.length})</h5>
            <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
              {entityRefs.map((ref) => (
                <div
                  key={ref.id}
                  onClick={() => handleSelectVersion(entity.id, ref.id)}
                  className={`relative rounded overflow-hidden border-2 transition-all cursor-pointer ${
                    ref.is_selected
                      ? 'border-green-500 ring-2 ring-green-200'
                      : `border-neutral-200 hover:border-${bgColor}-400`
                  }`}
                >
                  <SmartImage
                    src={getImageUrl(ref.image_key)}
                    alt={`${entity.character_name} v${ref.version}`}
                    className="w-full h-16 object-cover"
                  />
                  <div className={`absolute top-0 left-0 bg-white bg-opacity-90 px-1 text-xs font-bold text-${bgColor}-900`}>
                    v{ref.version}
                  </div>
                  {ref.is_selected && (
                    <div className="absolute top-0 right-0 bg-green-500 text-white rounded-bl p-0.5">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
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
          </div>
        )}
      </div>
    )
  }

  // Upload Button Component
  function UploadButton({ entity, bgColor, onDrop, isUploading }: { entity: Entity; bgColor: string; onDrop: (files: File[]) => void; isUploading: boolean }) {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      onDrop,
      accept: acceptedFileTypes,
      maxSize: MAX_FILE_SIZE,
      multiple: false,
      disabled: isUploading,
    })

    return (
      <div {...getRootProps()}>
        <input {...getInputProps()} />
        <button
          type="button"
          className={`px-2 py-1 bg-${bgColor}-600 text-white text-xs font-bold rounded hover:bg-${bgColor}-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
          disabled={isUploading}
          title="Качи изображение"
        >
          {isUploading ? (
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Preview Dialog */}
      {isPreviewOpen && previewEntity && previewRef && (
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
                  Преглед: {previewEntity.character_name} (v{previewRef.version})
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

              {/* Image Preview */}
              <div className="mb-6">
                <SmartImage
                  src={getImageUrl(previewRef.image_key)}
                  alt={previewEntity.character_name}
                  className="w-full h-auto rounded-lg border-2 border-neutral-200 max-h-[70vh] object-contain"
                />
              </div>

              {/* Details */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-neutral-700 mb-1">Име:</h4>
                  <p className="text-neutral-900">{previewEntity.character_name}</p>
                </div>

                {previewEntity.description && (
                  <div>
                    <h4 className="text-sm font-bold text-neutral-700 mb-1">Описание:</h4>
                    <p className="text-neutral-900">{previewEntity.description}</p>
                  </div>
                )}

                {previewRef.image_prompt && (
                  <div>
                    <h4 className="text-sm font-bold text-neutral-700 mb-1">Промпт за генериране:</h4>
                    <p className="text-neutral-600 text-sm bg-neutral-50 p-3 rounded-lg whitespace-pre-wrap">
                      {previewRef.image_prompt}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-700 mb-1">Версия:</h4>
                    <p className="text-neutral-900">{previewRef.version}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-neutral-700 mb-1">Модел:</h4>
                    <p className="text-neutral-900">{previewRef.model_used || 'N/A'}</p>
                  </div>
                </div>

                {previewRef.generation_params && (
                  <div>
                    <h4 className="text-sm font-bold text-neutral-700 mb-1">Параметри на генерирането:</h4>
                    <pre className="text-neutral-600 text-xs bg-neutral-50 p-3 rounded-lg overflow-x-auto">
                      {JSON.stringify(previewRef.generation_params, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Close button */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors"
                >
                  Затвори
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold text-purple-900 mb-2">
          Стъпка 4: Генериране на референции
        </h2>
        <p className="text-neutral-600">
          Генерирайте референтни изображения за всички герои и обекти от списъка.
        </p>
      </div>

      {/* Generate All Button */}
      <div className="flex items-center justify-between">
        <div>
          {!hasAnyReferences && (
            <p className="text-sm text-neutral-500">
              {process.env.NEXT_PUBLIC_USE_MOCK_AI === 'true'
                ? '(Mock режим - ще върне placeholder изображения)'
                : '(Ще използва fal.ai nano-banana модел)'}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateAll}
            disabled={isGenerating || entities.length === 0}
            className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              'Генерирай всички референции'
            )}
          </button>
          {hasAnyReferences && (
            <button
              onClick={onComplete}
              className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors"
            >
              Готово - Следваща стъпка
            </button>
          )}
        </div>
      </div>

      {/* Entity Lists */}
      {entities.length === 0 ? (
        <div className="text-center py-8 text-neutral-500">
          <p>Няма извлечени герои или обекти.</p>
          <p className="text-sm mt-2">Моля генерирайте scene prompts в предишната стъпка.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Characters Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-purple-900 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                Герои ({characters.length})
              </h3>
              <button
                onClick={() => setShowAddForm(showAddForm === 'character' ? null : 'character')}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm font-bold rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Добави Герой
              </button>
            </div>

            {/* Add Character Form */}
            {showAddForm === 'character' && (
              <div className="bg-purple-50 rounded-lg p-4 mb-3 border-2 border-purple-200">
                <h4 className="font-bold text-purple-900 mb-2">Нов Герой</h4>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newEntityName}
                    onChange={(e) => setNewEntityName(e.target.value)}
                    placeholder="Име на героя..."
                    className="w-full px-3 py-2 border-2 border-purple-200 rounded text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none"
                  />
                  <textarea
                    value={newEntityDescription}
                    onChange={(e) => setNewEntityDescription(e.target.value)}
                    placeholder="Описание (опционално)..."
                    className="w-full px-3 py-2 border-2 border-purple-200 rounded text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateEntity}
                      disabled={!newEntityName.trim() || isCreatingEntity}
                      className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingEntity ? 'Създаване...' : 'Създай'}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddForm(null)
                        setNewEntityName('')
                        setNewEntityDescription('')
                      }}
                      className="px-4 py-2 bg-neutral-200 text-neutral-700 text-sm font-bold rounded hover:bg-neutral-300 transition-colors"
                    >
                      Отказ
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {characters.map((entity) => renderEntityCard(entity, 'purple', 'purple'))}
            </div>
          </div>

          {/* Objects Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                </svg>
                Обекти ({objects.length})
              </h3>
              <button
                onClick={() => setShowAddForm(showAddForm === 'object' ? null : 'object')}
                className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-bold rounded hover:bg-emerald-700 transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Добави Обект
              </button>
            </div>

            {/* Add Object Form */}
            {showAddForm === 'object' && (
              <div className="bg-emerald-50 rounded-lg p-4 mb-3 border-2 border-emerald-200">
                <h4 className="font-bold text-emerald-900 mb-2">Нов Обект</h4>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newEntityName}
                    onChange={(e) => setNewEntityName(e.target.value)}
                    placeholder="Име на обекта..."
                    className="w-full px-3 py-2 border-2 border-emerald-200 rounded text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 outline-none"
                  />
                  <textarea
                    value={newEntityDescription}
                    onChange={(e) => setNewEntityDescription(e.target.value)}
                    placeholder="Описание (опционално)..."
                    className="w-full px-3 py-2 border-2 border-emerald-200 rounded text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-200 outline-none"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateEntity}
                      disabled={!newEntityName.trim() || isCreatingEntity}
                      className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingEntity ? 'Създаване...' : 'Създай'}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddForm(null)
                        setNewEntityName('')
                        setNewEntityDescription('')
                      }}
                      className="px-4 py-2 bg-neutral-200 text-neutral-700 text-sm font-bold rounded hover:bg-neutral-300 transition-colors"
                    >
                      Отказ
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {objects.map((entity) => renderEntityCard(entity, 'emerald', 'emerald'))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
