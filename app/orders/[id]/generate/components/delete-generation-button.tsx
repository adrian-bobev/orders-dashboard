'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DeleteGenerationButtonProps {
  generationId: string
  orderId: string
  bookConfigId: string
  bookConfigName: string
  allGenerations: any[]
}

export function DeleteGenerationButton({
  generationId,
  orderId,
  bookConfigId,
  bookConfigName,
  allGenerations,
}: DeleteGenerationButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/generation/${generationId}/delete`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete generation')
      }

      // Reset state before redirect
      setIsDeleting(false)
      setShowConfirm(false)

      // Determine redirect based on remaining generations
      // Filter out the current generation being deleted
      const remainingGenerations = allGenerations.filter(g => g.id !== generationId)

      if (remainingGenerations.length > 0) {
        // Stay on generation page with next generation (most recent)
        const nextGeneration = remainingGenerations[0]
        router.push(`/orders/${orderId}/generate?bookConfigId=${bookConfigId}&generationId=${nextGeneration.id}`)
      } else {
        // No more generations, go to order details
        router.push(`/orders/${orderId}`)
      }

      router.refresh()
    } catch (error) {
      console.error('Error deleting generation:', error)
      alert(`Грешка при изтриване: ${error instanceof Error ? error.message : 'Неизвестна грешка'}`)
      setIsDeleting(false)
      setShowConfirm(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={isDeleting}
        className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        title="Изтрий генерацията"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        Изтрий генерация
      </button>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-neutral-900 mb-2">
                  Изтриване на генерация
                </h3>
                <p className="text-neutral-600 text-sm mb-2">
                  Сигурни ли сте, че искате да изтриете тази генерация за <strong>{bookConfigName}</strong>?
                </p>
                <p className="text-red-600 text-sm font-bold">
                  Това действие ще изтрие:
                </p>
                <ul className="text-neutral-600 text-sm mt-1 ml-4 list-disc space-y-1">
                  <li>Стъпка 1: Всички изображения на главния герой</li>
                  <li>Стъпка 2: Коригирано съдържание</li>
                  <li>Стъпка 3: Списък с герои</li>
                  <li>Стъпка 4: Промптове за сцени</li>
                  <li>Стъпка 5: Референтни изображения на герои</li>
                  <li>Стъпка 6: Генерирани изображения на сцени</li>
                  <li>Всички генерирани файлове в R2 storage</li>
                </ul>
                <p className="text-red-600 text-sm font-bold mt-2">
                  ⚠️ Това действие е необратимо!
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-xl font-bold hover:bg-neutral-300 transition-colors disabled:opacity-50"
              >
                Отказ
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Изтриване...
                  </>
                ) : (
                  'Потвърди изтриване'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
