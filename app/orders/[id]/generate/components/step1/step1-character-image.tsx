'use client'

import { useState, useEffect } from 'react'
import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'
import ReactCrop, { type Crop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

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
  const [isProcessing, setIsProcessing] = useState(false)
  const [characterImages, setCharacterImages] = useState<any[]>([])
  const [selectedVersion, setSelectedVersion] = useState<any | null>(null)
  const [isGeneratingReference, setIsGeneratingReference] = useState(false)
  const [selectedImagesForGeneration, setSelectedImagesForGeneration] = useState<Set<string>>(
    new Set()
  )

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
    if (!selectedImageKey || !crop) return

    setIsProcessing(true)
    try {
      // The crop-image endpoint handles everything - it creates a new version
      // with crop data directly from the source image key
      const response = await fetch(`/api/generation/${generationId}/step1/crop-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImageKey: selectedImageKey,
          cropData: {
            x: crop.x,
            y: crop.y,
            width: crop.width,
            height: crop.height,
            unit: crop.unit,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to crop image')
      }

      setIsCropping(false)
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
      const response = await fetch(`/api/generation/${generationId}/step1/generate-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageKeys: Array.from(selectedImagesForGeneration),
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
      <div>
        <h2 className="text-xl font-bold text-purple-900 mb-2">
          Стъпка 1: Избор на главен герой
        </h2>
        <p className="text-neutral-600">
          Изберете изображение на главния герой от качените снимки. Можете да изрежете
          изображението след избор.
        </p>
      </div>

      {/* Selected Image Display */}
      {(selectedVersion || selectedImageKey) && (
        <div className="bg-purple-50 rounded-xl p-4 border-2 border-purple-200">
          <h3 className="font-bold text-purple-900 mb-3">Избрано изображение</h3>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <p className="text-sm text-neutral-600 mb-2">
                {selectedVersion ? 'Оригинално:' : 'Избрано от качени:'}
              </p>
              <SmartImage
                src={getImageUrl(selectedVersion?.source_image_key || selectedImageKey)}
                alt="Selected character"
                className="w-full h-64 object-contain rounded-lg bg-white"
              />
            </div>
            {selectedVersion?.processed_image_key && (
              <div className="flex-1">
                <p className="text-sm text-neutral-600 mb-2">Изрязано:</p>
                <SmartImage
                  src={getImageUrl(selectedVersion.processed_image_key)}
                  alt="Cropped character"
                  className="w-full h-64 object-contain rounded-lg bg-white"
                />
              </div>
            )}
            {selectedVersion?.generated_image_key && (
              <div className="flex-1">
                <p className="text-sm text-neutral-600 mb-2">Pixar Референция:</p>
                <SmartImage
                  src={getImageUrl(selectedVersion.generated_image_key)}
                  alt="Generated Pixar character"
                  className="w-full h-64 object-contain rounded-lg bg-white border-4 border-green-500"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Crop Interface */}
      {isCropping && selectedImageKey && (
        <div className="bg-white rounded-xl p-4 border-2 border-purple-300">
          <h3 className="font-bold text-purple-900 mb-3">Изрежи изображението</h3>
          <div className="max-w-2xl mx-auto">
            <ReactCrop crop={crop} onChange={(c) => setCrop(c)}>
              <SmartImage
                src={getImageUrl(selectedImageKey)}
                alt="Crop preview"
                className="max-w-full h-auto"
              />
            </ReactCrop>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <button
              onClick={() => {
                setIsCropping(false)
                setSelectedImageKey(null)
                setSelectedVersion(null)
              }}
              className="px-4 py-2 bg-neutral-300 text-neutral-700 rounded-xl font-bold hover:bg-neutral-400 transition-colors"
            >
              Отказ
            </button>
            <button
              onClick={handleCropImage}
              disabled={isProcessing}
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
          {/* Character Image Versions (Cropped) */}
          {characterImages.length > 0 && (
            <div>
              <h3 className="font-bold text-purple-900 mb-3">
                Обработени версии ({characterImages.filter((img: any) => img.processed_image_key || img.generated_image_key).length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {characterImages
                  .filter((img: any) => img.processed_image_key || img.generated_image_key) // Show images that are cropped or generated
                  .map((charImage: any) => {
                    // Display generated image if available, otherwise show processed/cropped
                    const displayKey = charImage.generated_image_key || charImage.processed_image_key
                    const isActiveVersion = selectedVersion?.id === charImage.id
                    const isSelectedForGen = selectedImagesForGeneration.has(displayKey)
                    const isGeneratedReference = !!charImage.generated_image_key

                    return (
                      <div key={charImage.id} className="relative">
                        <button
                          onClick={() => handleSelectImage(charImage.id, false, isActiveVersion)}
                          disabled={isProcessing}
                          className={`relative group rounded-xl overflow-hidden border-4 transition-all w-full ${
                            isActiveVersion
                              ? 'border-green-600 ring-4 ring-green-200'
                              : isGeneratedReference
                                ? 'border-blue-300 hover:border-blue-500'
                                : 'border-neutral-200 hover:border-purple-300'
                          } disabled:opacity-50`}
                        >
                          <SmartImage
                            src={getImageUrl(displayKey)}
                            alt={`Version ${charImage.version}`}
                            className="w-full h-48 object-cover"
                          />
                          <div className={`absolute top-2 left-2 px-2 py-1 rounded-lg text-xs font-bold ${
                            isGeneratedReference
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-purple-900'
                          }`}>
                            v{charImage.version} {isGeneratedReference ? '(AI Pixar)' : '(изрязана)'}
                          </div>
                          {isActiveVersion && (
                            <div className="absolute top-2 right-2 bg-green-600 text-white rounded-full p-1">
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

                        {/* Checkbox for generation selection - only for non-generated images */}
                        {!isGeneratedReference && (
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
                        )}

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

          {/* Original Uploaded Images */}
          <div>
            <h3 className="font-bold text-purple-900 mb-3">
              Оригинални качени изображения ({uploadedImages.length})
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
        </div>
      )}

      {/* Generation Actions - Always Visible */}
      <div className="bg-white rounded-xl p-4 border-2 border-blue-200">
        <div className="flex flex-wrap gap-3 items-center">
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
    </div>
  )
}
