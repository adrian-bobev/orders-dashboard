'use client'

import { useState, useEffect, useRef } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'
import ReactCrop, { type Crop, centerCrop, makeAspectCrop, PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { ImageUploadZone } from './image-upload-zone'

interface Step1CharacterImageProps {
  generationId: string
  bookConfig: any
  onComplete: () => void
}

export function Step1CharacterImage({
  generationId,
  bookConfig,
  onComplete,
}: Step1CharacterImageProps) {
  const [selectedImageKey, setSelectedImageKey] = useState<string | null>(null)
  const [isCropping, setIsCropping] = useState(false)
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [characterImages, setCharacterImages] = useState<any[]>([])
  const [selectedVersion, setSelectedVersion] = useState<any | null>(null)
  const [isGeneratingReference, setIsGeneratingReference] = useState(false)
  const [selectedImagesForGeneration, setSelectedImagesForGeneration] = useState<Set<string>>(
    new Set()
  )
  const [previewImage, setPreviewImage] = useState<any | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewType, setPreviewType] = useState<'original' | 'cropped' | 'ai'>('cropped')
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState<string>('')
  const [defaultPrompt, setDefaultPrompt] = useState<string>('')
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>('')
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState<string>('')

  const uploadedImages = (bookConfig.images as any[]) || []

  useEffect(() => {
    loadCharacterImages()
  }, [generationId])

  const loadCharacterImages = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step1/images`)
      if (response.ok) {
        const data = await response.json()
        setCharacterImages(data.images || [])
        const selected = data.images?.find((img: any) => img.is_selected)
        if (selected) {
          setSelectedVersion(selected)
          setSelectedImageKey(selected.source_image_key)
        }
      }
    } catch (error) {
      console.error('Failed to load character images:', error)
    }
  }

  const handleSelectImage = async (imageKeyOrId: string, isFromOriginals: boolean = true, isCurrentlySelected: boolean = false) => {
    setIsProcessing(true)
    try {
      // If clicking on currently selected image, deselect all instead
      if (isCurrentlySelected) {
        const response = await fetch(`/api/generation/${generationId}/step1/deselect-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (!response.ok) {
          throw new Error('Failed to deselect')
        }

        setSelectedVersion(null)
        setSelectedImageKey(null)
        setIsCropping(false)
        await loadCharacterImages()
        return
      }

      if (isFromOriginals) {
        // Just select the image in frontend state and enter crop mode
        setSelectedImageKey(imageKeyOrId)
        setSelectedVersion(null) // No version yet, just viewing original
        setIsCropping(true) // Automatically enter crop mode
      } else {
        // Selecting an existing version directly by ID
        const response = await fetch(`/api/generation/${generationId}/step1/select-version`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterImageId: imageKeyOrId }),
        })

        if (!response.ok) {
          throw new Error('Failed to select version')
        }
        await loadCharacterImages()
        setIsCropping(false)
      }
    } catch (error) {
      console.error('Error selecting image:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCropImage = async () => {
    if (!selectedImageKey || !completedCrop || !imgRef.current) return

    setIsProcessing(true)
    try {
      // Get the natural dimensions of the image
      const image = imgRef.current
      const naturalWidth = image.naturalWidth
      const naturalHeight = image.naturalHeight

      // Calculate the scale between displayed and natural size
      const scaleX = naturalWidth / image.width
      const scaleY = naturalHeight / image.height

      // Convert the displayed pixel crop to natural image pixels
      const cropData = {
        x: Math.round(completedCrop.x * scaleX),
        y: Math.round(completedCrop.y * scaleY),
        width: Math.round(completedCrop.width * scaleX),
        height: Math.round(completedCrop.height * scaleY),
        unit: 'px' as const,
      }

      console.log('Displayed image size:', image.width, 'x', image.height)
      console.log('Natural image size:', naturalWidth, 'x', naturalHeight)
      console.log('Scale:', scaleX, 'x', scaleY)
      console.log('Crop on display:', completedCrop)
      console.log('Crop on natural image:', cropData)

      // The crop-image endpoint handles everything - it creates a new version
      // with crop data directly from the source image key
      const response = await fetch(`/api/generation/${generationId}/step1/crop-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImageKey: selectedImageKey,
          cropData,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to crop image')
      }

      setIsCropping(false)
      setCompletedCrop(null)
      await loadCharacterImages()
    } catch (error) {
      console.error('Error cropping image:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleGenerateReference = async () => {
    if (selectedImagesForGeneration.size === 0) {
      return
    }

    setIsGeneratingReference(true)
    try {
      let finalSystemPrompt = customSystemPrompt
      let finalUserPrompt = customPrompt

      // Load default prompts if not already loaded
      if (!finalSystemPrompt || !finalUserPrompt) {
        const prompts = await loadDefaultPrompt()
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

      const response = await fetch(`/api/generation/${generationId}/step1/generate-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageKeys: Array.from(selectedImagesForGeneration),
          customPrompt: combinedCustomPrompt, // Send combined prompt if set
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate reference character')
      }

      const data = await response.json()
      // Reload character images to show the new generated reference
      await loadCharacterImages()
    } catch (error) {
      console.error('Error generating reference character:', error)
    } finally {
      setIsGeneratingReference(false)
    }
  }

  const loadDefaultPrompt = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step1/default-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookConfig }),
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

  const handleDeleteVersion = async (characterImageId: string) => {
    setIsProcessing(true)
    try {
      const response = await fetch(
        `/api/generation/${generationId}/step1/delete-version?characterImageId=${characterImageId}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        throw new Error('Failed to delete version')
      }

      await loadCharacterImages()
    } catch (error) {
      console.error('Error deleting version:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const toggleImageSelection = (imageKey: string) => {
    const newSelection = new Set(selectedImagesForGeneration)
    if (newSelection.has(imageKey)) {
      newSelection.delete(imageKey)
    } else {
      newSelection.add(imageKey)
    }
    setSelectedImagesForGeneration(newSelection)
  }

  return (
    <div className="space-y-6">
      {/* Preview Dialog */}
      {isPreviewOpen && previewImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4" onClick={() => setIsPreviewOpen(false)}>
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold text-purple-900">
                  {previewType === 'original' && 'Преглед на оригинално изображение'}
                  {previewType === 'cropped' && `Преглед на версия ${previewImage.version}`}
                  {previewType === 'ai' && `Преглед на AI Pixar версия ${previewImage.version}`}
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

              {/* Original Image Preview */}
              {previewType === 'original' && previewImage && typeof previewImage === 'string' && (
                <div className="mb-6">
                  <SmartImage
                    src={getImageUrl(previewImage)}
                    alt="Original"
                    className="w-full h-auto rounded-lg border-2 border-neutral-200 max-h-[70vh] object-contain"
                  />
                </div>
              )}

              {/* Cropped Image Preview */}
              {previewType === 'cropped' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <p className="text-sm font-bold text-neutral-600 mb-2">Оригинално изображение:</p>
                    <SmartImage
                      src={getImageUrl(previewImage.source_image_key)}
                      alt="Original"
                      className="w-full h-auto rounded-lg border-2 border-neutral-200"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-neutral-600 mb-2">Изрязано изображение:</p>
                    <SmartImage
                      src={getImageUrl(previewImage.processed_image_key)}
                      alt="Cropped"
                      className="w-full h-auto rounded-lg border-2 border-purple-300"
                    />
                  </div>
                </div>
              )}

              {/* AI Generated Preview */}
              {previewType === 'ai' && (
                <div className="mb-6">
                  <div className="mb-4">
                    <p className="text-sm font-bold text-neutral-600 mb-2">AI Pixar генериран герой:</p>
                    <SmartImage
                      src={getImageUrl(previewImage.generated_image_key)}
                      alt="AI Generated"
                      className="w-full h-auto rounded-lg border-2 border-blue-300 max-h-[50vh] object-contain"
                    />
                  </div>
                  {(() => {
                    let referenceImageKeys: string[] = []
                    try {
                      if (previewImage.notes) {
                        const notesData = JSON.parse(previewImage.notes)
                        if (notesData.referenceImageKeys) {
                          referenceImageKeys = notesData.referenceImageKeys
                        }
                      }
                    } catch (e) {}

                    if (referenceImageKeys.length > 0) {
                      return (
                        <div>
                          <p className="text-sm font-bold text-neutral-600 mb-2">
                            Използвани референции ({referenceImageKeys.length}):
                          </p>
                          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                            {referenceImageKeys.map((imgKey: string, idx: number) => (
                              <div key={idx} className="relative rounded-lg overflow-hidden border-2 border-blue-200">
                                <SmartImage
                                  src={getImageUrl(imgKey)}
                                  alt={`Reference ${idx + 1}`}
                                  className="w-full h-24 object-cover"
                                />
                                {idx === 0 && (
                                  <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[10px] px-1 rounded-bl">
                                    Основна
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end">
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

      <div>
        <h2 className="text-xl font-bold text-purple-900 mb-2">
          Стъпка 1: Избор на главен герой
        </h2>
        <p className="text-neutral-600">
          Изберете изображение на главния герой от качените снимки. Можете да изрежете
          изображението след избор.
        </p>
      </div>

      {/* Crop Interface */}
      {isCropping && selectedImageKey && (
        <div className="bg-white rounded-xl p-4 border-2 border-purple-300">
          <h3 className="font-bold text-purple-900 mb-3">Изрежи изображението</h3>
          <div className="max-w-2xl mx-auto">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
            >
              <img
                ref={imgRef}
                src={getImageUrl(selectedImageKey)}
                alt="Crop preview"
                className="max-w-full h-auto"
                onLoad={(e) => {
                  const img = e.currentTarget
                  console.log('Image loaded - Natural size:', img.naturalWidth, 'x', img.naturalHeight)
                  console.log('Image loaded - Display size:', img.width, 'x', img.height)
                }}
              />
            </ReactCrop>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={() => {
                setIsCropping(false)
                setSelectedImageKey(null)
                setSelectedVersion(null)
                setCompletedCrop(null)
              }}
              className="px-4 py-2 bg-neutral-300 text-neutral-700 rounded-xl font-bold hover:bg-neutral-400 transition-colors"
            >
              Отказ
            </button>
            <button
              onClick={handleCropImage}
              disabled={isProcessing || !completedCrop}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {isProcessing ? 'Обработка...' : 'Запази изрязването'}
            </button>
          </div>
        </div>
      )}

      {/* Image Selection Grid */}
      {!isCropping && (
        <div className="space-y-6">
          {/* Original Uploaded Images */}
          <div>
            <h3 className="font-bold text-purple-900 mb-3">
              📸 Оригинални качени изображения ({uploadedImages.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {uploadedImages.map((image: any, index: number) => {
                const imageKey = image.r2_key
                const isActiveSelection = imageKey === selectedImageKey && !selectedVersion
                const isSelectedForGen = selectedImagesForGeneration.has(imageKey)

                return (
                  <div key={index} className="relative">
                    <button
                      onClick={() => handleSelectImage(imageKey, true, isActiveSelection)}
                      disabled={isProcessing}
                      className={`relative group rounded-xl overflow-hidden border-4 transition-all w-full ${
                        isActiveSelection
                          ? 'border-purple-600 ring-4 ring-purple-200'
                          : 'border-neutral-200 hover:border-purple-300'
                      } disabled:opacity-50`}
                    >
                      <SmartImage
                        src={getImageUrl(imageKey)}
                        alt={`Upload ${index + 1}`}
                        className="w-full h-48 object-cover"
                      />
                      {isActiveSelection && (
                        <div className="absolute top-2 right-2 bg-purple-600 text-white rounded-full p-1">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center">
                        <span className="text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          {isActiveSelection ? 'Деактивирай' : 'Активирай'}
                        </span>
                      </div>
                    </button>

                    {/* Preview button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setPreviewImage(imageKey)
                        setPreviewType('original')
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

                    {/* Checkbox for generation selection */}
                    <div className="absolute bottom-2 left-2 z-10">
                      <label
                        className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg shadow-lg cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelectedForGen}
                          onChange={() => toggleImageSelection(imageKey)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-200"
                        />
                        <span className="text-xs font-bold text-purple-900">За AI</span>
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Character Image Versions (Cropped only) */}
          {characterImages.some((img: any) => img.processed_image_key && !img.generated_image_key) && (
            <div>
              <h3 className="font-bold text-purple-900 mb-3">
                ✂️ Изрязани версии ({characterImages.filter((img: any) => img.processed_image_key && !img.generated_image_key).length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {characterImages
                  .filter((img: any) => img.processed_image_key && !img.generated_image_key)
                  .map((charImage: any) => {
                    const displayKey = charImage.processed_image_key
                    const isSelectedForGen = selectedImagesForGeneration.has(displayKey)

                    return (
                      <div key={charImage.id} className="relative">
                        <div className="relative rounded-xl overflow-hidden border-4 border-neutral-200">
                          <SmartImage
                            src={getImageUrl(displayKey)}
                            alt={`Version ${charImage.version}`}
                            className="w-full h-48 object-cover"
                          />
                          <div className="absolute top-2 left-2 px-2 py-1 bg-white text-purple-900 rounded-lg text-xs font-bold">
                            v{charImage.version}
                          </div>
                        </div>

                        {/* Preview button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setPreviewImage(charImage)
                            setPreviewType('cropped')
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

                        {/* Checkbox for generation selection */}
                        <div className="absolute bottom-2 left-2 z-10">
                          <label
                            className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg shadow-lg cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelectedForGen}
                              onChange={() => toggleImageSelection(displayKey)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-200"
                            />
                            <span className="text-xs font-bold text-purple-900">За AI</span>
                          </label>
                        </div>

                        {/* Delete button */}
                        <button
                          onClick={() => handleDeleteVersion(charImage.id)}
                          disabled={isProcessing}
                          className="absolute bottom-2 right-2 z-10 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg transition-colors disabled:opacity-50"
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
                    )
                  })}
              </div>
            </div>
          )}

          {/* Pixar AI References */}
          <div>
            <h3 className="font-bold text-purple-900 mb-3">
              🎨 AI Pixar Референции ({characterImages.filter((img: any) => img.generated_image_key).length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {characterImages.some((img: any) => img.generated_image_key) &&
                characterImages
                  .filter((img: any) => img.generated_image_key)
                  .map((charImage: any) => {
                    const isActiveVersion = selectedVersion?.id === charImage.id

                    // Parse notes to get reference images
                    let referenceImageKeys: string[] = []
                    try {
                      if (charImage.notes) {
                        const notesData = JSON.parse(charImage.notes)
                        if (notesData.referenceImageKeys) {
                          referenceImageKeys = notesData.referenceImageKeys
                        }
                      }
                    } catch (e) {
                      // Old format or invalid JSON, ignore
                    }

                    return (
                      <div key={charImage.id} className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-4 border-2 border-blue-300">
                        <div className="relative">
                          <button
                            onClick={() => handleSelectImage(charImage.id, false, isActiveVersion)}
                            disabled={isProcessing}
                            className={`relative group rounded-xl overflow-hidden border-4 transition-all w-full ${
                              isActiveVersion
                                ? 'border-green-600 ring-4 ring-green-200'
                                : 'border-blue-400 hover:border-blue-600'
                            } disabled:opacity-50`}
                          >
                            <SmartImage
                              src={getImageUrl(charImage.generated_image_key)}
                              alt={`Pixar Reference v${charImage.version}`}
                              className="w-full h-64 object-cover"
                            />
                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg text-xs font-bold shadow-lg">
                              v{charImage.version} (AI Pixar)
                            </div>
                            {isActiveVersion && (
                              <div className="absolute top-2 left-2 bg-green-600 text-white rounded-full p-1">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center">
                              <span className="text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                {isActiveVersion ? 'Деактивирай' : 'Активирай'}
                              </span>
                            </div>
                          </button>

                          {/* Preview button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setPreviewImage(charImage)
                              setPreviewType('ai')
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

                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteVersion(charImage.id)
                            }}
                            disabled={isProcessing}
                            className="absolute bottom-2 right-2 z-10 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg transition-colors disabled:opacity-50"
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

                        {/* Reference images used */}
                        {referenceImageKeys.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-bold text-purple-900 mb-2">
                              Използвани референции ({referenceImageKeys.length}):
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {referenceImageKeys.map((imgKey: string, idx: number) => (
                                <div key={idx} className="relative rounded-lg overflow-hidden border-2 border-blue-200">
                                  <SmartImage
                                    src={getImageUrl(imgKey)}
                                    alt={`Reference ${idx + 1}`}
                                    className="w-full h-16 object-cover"
                                  />
                                  {idx === 0 && (
                                    <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[10px] px-1 rounded-bl">
                                      Основна
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

              {/* Upload Zone */}
              <ImageUploadZone
                generationId={generationId}
                onUploadSuccess={async (characterImage) => {
                  // Reload character images to show the uploaded one
                  await loadCharacterImages()
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Generation Actions - Always Visible */}
      <div className="bg-white rounded-xl p-4 border-2 border-blue-200">
        <div className="flex flex-wrap gap-3 items-center">
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
            Промени промпта
          </button>
          <button
            onClick={handleGenerateReference}
            disabled={isGeneratingReference || selectedImagesForGeneration.size === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isGeneratingReference ? (
              <>
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
                Генериране...
              </>
            ) : (
              `Генерирай Pixar герой (${selectedImagesForGeneration.size})`
            )}
          </button>
          <button
            onClick={onComplete}
            disabled={!characterImages.some((img: any) => img.generated_image_key && img.is_selected)}
            className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            Готово - Следваща стъпка
          </button>
        </div>
        {!characterImages.some((img: any) => img.generated_image_key && img.is_selected) && (
          <p className="mt-2 text-sm text-amber-600">
            ⚠️ Генерирайте Pixar герой преди да продължите към следващата стъпка
          </p>
        )}
      </div>

      {/* Prompt Editor Modal */}
      {isPromptEditorOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-neutral-200 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-purple-900">Промени промпта за генериране</h2>
                <p className="text-sm text-neutral-600 mt-1">
                  Промените са само за текущата генерация. Оригиналният промпт остава непроменен.
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
                        Промптът е променен спрямо оригиналния от YAML файла.
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
