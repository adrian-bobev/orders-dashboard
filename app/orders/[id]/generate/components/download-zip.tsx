'use client'

import { useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

interface DownloadZipProps {
  generationId: string
}

interface ExportData {
  bookConfig: {
    name: string
    configId: string
  }
  orderInfo: {
    orderNumber: string
  }
  correctedContent: {
    corrected_content: {
      title: string
      shortDescription: string
      motivationEnd: string
      scenes: Array<{ text: string }>
    }
  } | null
  sceneImages: Array<{
    image_key: string
    is_selected: boolean
    generation_scene_prompts: {
      id: string
      scene_number: number
      scene_type: string
    }
  }>
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіїєґ\s-]/gi, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
}

export function DownloadZip({ generationId }: DownloadZipProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function fetchWithRetry(url: string, attempts = 3, baseDelay = 300): Promise<Response> {
    let lastErr: unknown
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res
      } catch (e) {
        lastErr = e
        await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, i)))
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('fetch failed')
  }

  async function handleDownloadZip() {
    setIsDownloading(true)
    setProgress(0)

    try {
      // Fetch all generation data
      const response = await fetch(`/api/generation/${generationId}/export`)
      if (!response.ok) {
        throw new Error('Failed to fetch export data')
      }

      const data: ExportData = await response.json()
      const zip = new JSZip()
      const imagesFolder = zip.folder('images')

      if (!imagesFolder) {
        throw new Error('Failed to create images folder')
      }

      // Get corrected content (from step 2) - single source of truth for scene texts
      const correctedContent = data.correctedContent?.corrected_content

      // Build simple book.json with scenes from corrected content
      const scenes = (correctedContent?.scenes || []).map((scene: any, index: number) => ({
        sceneNumber: index + 1,
        sourceText_bg: scene.text || '',
      }))

      const bookJson = {
        title: correctedContent?.title || '',
        shortDescription: correctedContent?.shortDescription || '',
        motivationEnd: correctedContent?.motivationEnd || '',
        scenes,
      }
      zip.file('book.json', JSON.stringify(bookJson, null, 2))

      // Get selected scene images (cover + scenes only)
      const selectedSceneImages = data.sceneImages.filter((img) => img.is_selected)
      const totalImages = selectedSceneImages.length
      let downloadedCount = 0

      // Download scene images (only selected ones - cover and 14 scenes)
      for (const img of selectedSceneImages) {
        try {
          const imageKey = img.image_key
          if (!imageKey) continue

          const url = `/api/images?key=${encodeURIComponent(imageKey)}`
          const res = await fetchWithRetry(url)
          const blob = await res.blob()
          const arrayBuffer = await blob.arrayBuffer()

          const sceneType = img.generation_scene_prompts.scene_type
          const sceneNumber = img.generation_scene_prompts.scene_number
          let fileName: string
          if (sceneType === 'cover') {
            fileName = 'cover.jpg'
          } else if (sceneType === 'back_cover') {
            fileName = 'back.jpg'
          } else {
            fileName = `scene_${sceneNumber}.jpg`
          }

          imagesFolder.file(fileName, arrayBuffer)
        } catch (e) {
          console.warn('Failed to download scene image:', e)
        }

        downloadedCount++
        setProgress(Math.round((downloadedCount / totalImages) * 100))
      }

      // Generate and save ZIP
      const content = await zip.generateAsync({ type: 'blob' })
      const childName = data.bookConfig.name || 'book'
      const orderNum = data.orderInfo.orderNumber || 'export'
      const filename = `${orderNum}-${slugify(childName)}.zip`
      saveAs(content, filename)

      setProgress(100)
    } catch (error) {
      console.error('Download failed:', error)
      alert('Грешка при изтеглянето. Моля, опитайте отново.')
    } finally {
      setIsDownloading(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  return (
    <button
      onClick={handleDownloadZip}
      disabled={isDownloading}
      className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
    >
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
      {isDownloading ? (
        <span>Изтегляне... {progress}%</span>
      ) : (
        <span>Изтегли ZIP</span>
      )}
    </button>
  )
}
