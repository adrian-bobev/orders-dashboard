'use client'

import { useCallback, useState } from 'react'
import { useDropzone, FileRejection } from 'react-dropzone'

interface ImageUploadZoneProps {
  generationId: string
  onUploadSuccess: (characterImage: any) => void
}

interface UploadProgress {
  [fileId: string]: {
    progress: number
    status: 'uploading' | 'success' | 'error'
    error?: string
  }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const acceptedFileTypes = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}

export function ImageUploadZone({ generationId, onUploadSuccess }: ImageUploadZoneProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({})
  const [errors, setErrors] = useState<string[]>([])

  const uploadFile = async (file: File) => {
    const fileId = `${file.name}-${Date.now()}`

    setUploadProgress(prev => ({
      ...prev,
      [fileId]: { progress: 0, status: 'uploading' },
    }))

    try {
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          setUploadProgress(prev => ({
            ...prev,
            [fileId]: { ...prev[fileId], progress: percent },
          }))
        }
      })

      // Handle completion
      await new Promise<void>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText)
            setUploadProgress(prev => ({
              ...prev,
              [fileId]: { progress: 100, status: 'success' },
            }))
            onUploadSuccess(response.characterImage)
            resolve()
          } else {
            const error = JSON.parse(xhr.responseText).error || 'Upload failed'
            setUploadProgress(prev => ({
              ...prev,
              [fileId]: { progress: 0, status: 'error', error },
            }))
            reject(new Error(error))
          }
        })

        xhr.addEventListener('error', () => {
          const error = 'Upload failed. Please check your connection and try again.'
          setUploadProgress(prev => ({
            ...prev,
            [fileId]: { progress: 0, status: 'error', error },
          }))
          reject(new Error(error))
        })

        xhr.open('POST', `/api/generation/${generationId}/step1/upload-pixar-ref`)
        xhr.send(formData)
      })
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      setErrors(prev => [...prev, `${file.name}: ${errorMessage}`])
    }
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      // Clear previous errors
      setErrors([])

      // Handle rejected files
      const rejectionErrors = rejectedFiles.map(rejection => {
        const error = rejection.errors[0]
        if (error.code === 'file-too-large') {
          return `${rejection.file.name}: File size must be less than 10MB`
        } else if (error.code === 'file-invalid-type') {
          return `${rejection.file.name}: Only JPG, PNG, and WEBP images are supported`
        }
        return `${rejection.file.name}: ${error.message}`
      })

      if (rejectionErrors.length > 0) {
        setErrors(rejectionErrors)
      }

      // Upload accepted files sequentially
      if (acceptedFiles.length > 0) {
        setIsUploading(true)
        for (const file of acceptedFiles) {
          await uploadFile(file)
        }
        setIsUploading(false)
      }
    },
    [generationId, onUploadSuccess]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  })

  const hasActiveUploads = Object.keys(uploadProgress).length > 0

  return (
    <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-4 border-2 border-blue-300">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer min-h-[200px] flex items-center justify-center
          ${isDragActive ? 'border-purple-500 bg-purple-100/50' : 'border-blue-400 hover:border-purple-400 bg-white/50'}
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} disabled={isUploading} />

        <div className="text-center">
          {!hasActiveUploads && !isUploading && (
            <>
              <div className="text-4xl mb-3">📤</div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {isDragActive ? 'Drop Pixar reference here' : 'Upload Pixar Reference'}
              </h3>
              <p className="text-gray-600 text-sm mb-3">
                Drag & drop a Pixar-style image here, or click to browse
              </p>
              <p className="text-gray-500 text-xs">
                Supports: JPG, PNG, WEBP (max 10MB each)
              </p>
            </>
          )}

          {isUploading && (
            <>
              <div className="text-4xl mb-3">⏳</div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Uploading...</h3>
            </>
          )}

          {hasActiveUploads && (
            <div className="space-y-2 mt-4">
              {Object.entries(uploadProgress).map(([fileId, progress]) => {
                const fileName = fileId.split('-')[0]
                return (
                  <div key={fileId} className="flex items-center gap-3 text-left">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
                          {fileName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {progress.status === 'success' && '✓'}
                          {progress.status === 'error' && '✗'}
                          {progress.status === 'uploading' && `${progress.progress}%`}
                        </span>
                      </div>
                      {progress.status === 'uploading' && (
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-purple-500 h-2 rounded-full transition-all"
                            style={{ width: `${progress.progress}%` }}
                          />
                        </div>
                      )}
                      {progress.status === 'error' && progress.error && (
                        <p className="text-xs text-red-600 mt-1">{progress.error}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mt-3 space-y-1">
          {errors.map((error, index) => (
            <p key={index} className="text-sm text-red-600">
              {error}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
