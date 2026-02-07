'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Database } from '@/lib/database.types'
import { SmartImage } from '@/components/SmartImage'
import { getImageUrl } from '@/lib/r2-client'

type OrderStatus = Database['public']['Enums']['order_status']
type User = Database['public']['Tables']['users']['Row']

interface OrderDetailProps {
  order: any
  currentUser: User
  generationCounts?: Record<string, number>
  completedConfigs?: Record<string, boolean>
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Нова',
  VALIDATION_PENDING: 'Очаква валидация',
  READY_FOR_PRINT: 'Готова за печат',
  PRINTING: 'В печат',
  IN_TRANSIT: 'В транзит',
  COMPLETED: 'Завършена',
  REJECTED: 'Отказана',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  NEW: 'bg-blue-100 text-blue-800 border-blue-200',
  VALIDATION_PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  READY_FOR_PRINT: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  PRINTING: 'bg-purple-100 text-purple-800 border-purple-200',
  IN_TRANSIT: 'bg-orange-100 text-orange-800 border-orange-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
}

export function OrderDetail({ order, currentUser, generationCounts = {}, completedConfigs = {} }: OrderDetailProps) {
  const router = useRouter()
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>(order.status)
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null)
  const [isSendingNotifications, setIsSendingNotifications] = useState(false)
  const [notificationProgress, setNotificationProgress] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [isCreatingLabel, setIsCreatingLabel] = useState(false)
  const [isDeletingLabel, setIsDeletingLabel] = useState(false)
  const [shippingLabelError, setShippingLabelError] = useState<string | null>(null)
  const [shippingLabel, setShippingLabel] = useState<{
    shipmentId: string
    trackingUrl: string
    createdAt: string
  } | null>(
    order.speedy_shipment_id
      ? {
          shipmentId: order.speedy_shipment_id,
          trackingUrl: `https://www.speedy.bg/bg/track-shipment?shipmentNumber=${order.speedy_shipment_id}`,
          createdAt: order.speedy_label_created_at,
        }
      : null
  )
  const [isStatusHistoryExpanded, setIsStatusHistoryExpanded] = useState(false)

  const isAdmin = currentUser.role === 'admin'
  const isViewer = currentUser.role === 'viewer'

  const handleDownload = async () => {
    setIsDownloading(true)

    try {
      const response = await fetch(`/api/orders/${order.id}/download`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Download failed')
      }

      // Trigger browser download
      const link = document.createElement('a')
      link.href = data.downloadUrl
      link.download = `order-${order.order_number || order.id}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Download error:', error)
      alert(error instanceof Error ? error.message : 'Грешка при изтегляне')
    } finally {
      setIsDownloading(false)
    }
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-'
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(2)} MB`
  }

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (!isAdmin) return

    if (
      !confirm(
        `Сигурни ли сте, че искате да промените статуса на "${STATUS_LABELS[newStatus]}"?`
      )
    ) {
      return
    }

    setIsUpdatingStatus(true)

    try {
      const response = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }

      setCurrentStatus(newStatus)
      router.refresh()
    } catch (error) {
      console.error('Error updating status:', error)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // Check if all book configs have completed generations
  const allBookConfigIds = order.line_items?.flatMap((item: any) =>
    item.book_configurations?.map((bc: any) => bc.id) || []
  ) || []
  const allConfigsCompleted = allBookConfigIds.length > 0 &&
    allBookConfigIds.every((id: string) => completedConfigs[id] === true)
  const completedCount = allBookConfigIds.filter((id: string) => completedConfigs[id] === true).length

  // Check if order is in validation pending state
  const isValidationPending = currentStatus === 'VALIDATION_PENDING'

  const handleSendNotifications = async () => {
    if (!isAdmin || !allConfigsCompleted || isValidationPending) return

    if (
      !confirm(
        'Ще бъдат генерирани PDF прегледи и изпратени известия (Telegram + Email). Продължавате ли?'
      )
    ) {
      return
    }

    setIsSendingNotifications(true)
    setNotificationProgress('Генериране на PDF прегледи...')

    try {
      const response = await fetch(`/api/orders/${order.id}/send-notifications`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send notifications')
      }

      setNotificationProgress('Известията са изпратени успешно!')
      router.refresh()

      // Clear progress message after a delay
      setTimeout(() => {
        setNotificationProgress('')
      }, 3000)
    } catch (error) {
      console.error('Error sending notifications:', error)
      setNotificationProgress(error instanceof Error ? error.message : 'Грешка при изпращане')
      setTimeout(() => {
        setNotificationProgress('')
      }, 5000)
    } finally {
      setIsSendingNotifications(false)
    }
  }

  const handleCreateShippingLabel = async () => {
    if (!isAdmin || isCreatingLabel) return

    if (
      !confirm(
        'Ще бъде създадена товарителница в Speedy. Продължавате ли?'
      )
    ) {
      return
    }

    setIsCreatingLabel(true)
    setShippingLabelError(null)

    try {
      const response = await fetch(`/api/orders/${order.id}/shipping-label`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to create shipping label')
      }

      setShippingLabel({
        shipmentId: data.shipmentId,
        trackingUrl: data.trackingUrl,
        createdAt: new Date().toISOString(),
      })
      router.refresh()
    } catch (error) {
      console.error('Error creating shipping label:', error)
      setShippingLabelError(error instanceof Error ? error.message : 'Грешка при създаване на товарителница')
    } finally {
      setIsCreatingLabel(false)
    }
  }

  const handleDeleteShippingLabel = async () => {
    if (!isAdmin || isDeletingLabel || !shippingLabel) return

    if (
      !confirm(
        `Сигурни ли сте, че искате да анулирате товарителница ${shippingLabel.shipmentId}?`
      )
    ) {
      return
    }

    setIsDeletingLabel(true)
    setShippingLabelError(null)

    try {
      const response = await fetch(`/api/orders/${order.id}/shipping-label`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to delete shipping label')
      }

      setShippingLabel(null)
      router.refresh()
    } catch (error) {
      console.error('Error deleting shipping label:', error)
      setShippingLabelError(error instanceof Error ? error.message : 'Грешка при анулиране на товарителница')
    } finally {
      setIsDeletingLabel(false)
    }
  }

  // Viewer view - only ID, status, date, and print file
  if (isViewer) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-bold text-purple-900 mb-1">Номер на поръчка</p>
              <p className="text-xl font-bold text-neutral-900">{order.woocommerce_order_id}</p>
            </div>

            <div>
              <p className="text-sm font-bold text-purple-900 mb-1">Статус</p>
              <span
                className={`inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-bold border-2 ${STATUS_COLORS[currentStatus]}`}
              >
                {STATUS_LABELS[currentStatus]}
              </span>
            </div>

            <div>
              <p className="text-sm font-bold text-purple-900 mb-1">Дата на създаване</p>
              <p className="text-base text-neutral-700">
                {new Date(order.created_at).toLocaleString('bg-BG', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Print File Section for Viewer */}
        <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
          <h3 className="text-lg font-bold text-purple-900 mb-3">Файл за печат</h3>

          {order.print_file_r2_key ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-bold text-purple-900 mb-1">Размер</p>
                  <p className="text-sm text-neutral-700">{formatFileSize(order.print_file_size_bytes)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-purple-900 mb-1">Генериран на</p>
                  <p className="text-sm text-neutral-700">
                    {order.print_generated_at
                      ? new Date(order.print_generated_at).toLocaleString('bg-BG')
                      : '-'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {isDownloading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Изтегляне...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Изтегли файл за печат</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm text-neutral-500">Файлът за печат все още не е генериран</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Admin view - full details with expandable book content
  return (
    <div className="space-y-4">
      {/* Status Section */}
      <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Current Status */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wide">Статус</p>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-bold border ${STATUS_COLORS[currentStatus]}`}
              >
                {STATUS_LABELS[currentStatus]}
              </span>
            </div>
            {isUpdatingStatus && (
              <svg className="animate-spin h-5 w-5 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
          </div>

          {/* Status Change (Admin Only) */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-neutral-500 hidden sm:inline">Промени на:</span>
              <select
                value={currentStatus}
                onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
                disabled={isUpdatingStatus}
                className="px-3 py-2 text-sm border-2 border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all bg-white font-bold text-purple-900 disabled:opacity-50 disabled:cursor-not-allowed min-w-[180px]"
              >
                {(
                  [
                    'NEW',
                    'VALIDATION_PENDING',
                    'READY_FOR_PRINT',
                    'PRINTING',
                    'IN_TRANSIT',
                    'COMPLETED',
                    'REJECTED',
                  ] as OrderStatus[]
                ).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Actions Section (Admin Only) - Grouped Preview, Print File, and Shipping Label */}
      {isAdmin && (
        <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
          <h3 className="text-lg font-bold text-purple-900 mb-4">Действия</h3>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Send for Preview */}
            {allBookConfigIds.length > 0 && (
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </div>
                  <h4 className="font-bold text-indigo-900">Изпращане на прегледи</h4>
                </div>

                {/* Completion Status */}
                <div className="mb-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                    allConfigsCompleted
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                  }`}>
                    {allConfigsCompleted ? (
                      <>
                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Всички книги готови
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {completedCount} / {allBookConfigIds.length} готови
                      </>
                    )}
                  </span>
                </div>

                {/* Progress Message */}
                {notificationProgress && (
                  <div className={`flex items-center gap-2 p-2 rounded-lg mb-3 text-xs ${
                    notificationProgress.includes('успешно')
                      ? 'bg-green-100 text-green-800'
                      : notificationProgress.includes('Грешка')
                      ? 'bg-red-100 text-red-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {isSendingNotifications && (
                      <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    <span className="font-medium">{notificationProgress}</span>
                  </div>
                )}

                {/* Send Button */}
                <button
                  onClick={handleSendNotifications}
                  disabled={!allConfigsCompleted || isSendingNotifications || isValidationPending}
                  className={`w-full px-3 py-2.5 rounded-lg font-bold transition-all flex items-center justify-center gap-2 text-sm ${
                    allConfigsCompleted && !isSendingNotifications && !isValidationPending
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isSendingNotifications ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Изпращане...</span>
                    </>
                  ) : (
                    <span>Изпрати за преглед</span>
                  )}
                </button>

                {!allConfigsCompleted && (
                  <p className="text-xs text-indigo-600 mt-2">
                    Изисква завършени генерации
                  </p>
                )}
                {allConfigsCompleted && isValidationPending && (
                  <p className="text-xs text-indigo-600 mt-2">
                    Поръчката е в &quot;Очаква валидация&quot;
                  </p>
                )}
              </div>
            )}

            {/* Print File */}
            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                </div>
                <h4 className="font-bold text-green-900">Файл за печат</h4>
              </div>

              {order.print_file_r2_key ? (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div>
                      <p className="font-bold text-green-800">Размер</p>
                      <p className="text-green-700">{formatFileSize(order.print_file_size_bytes)}</p>
                    </div>
                    <div>
                      <p className="font-bold text-green-800">Изтегляния</p>
                      <p className="text-green-700">{order.download_count || 0}</p>
                    </div>
                  </div>

                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="w-full px-3 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    {isDownloading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Изтегляне...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Изтегли</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-xs text-green-700">Все още не е генериран</p>
                </div>
              )}
            </div>

            {/* Shipping Label */}
            {order.bg_carriers_carrier === 'speedy' && (
              <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20" />
                    </svg>
                  </div>
                  <h4 className="font-bold text-orange-900">Товарителница</h4>
                </div>

                {shippingLabelError && (
                  <div className="mb-3 p-2 bg-red-100 text-red-800 rounded-lg text-xs">
                    {shippingLabelError}
                  </div>
                )}

                {shippingLabel ? (
                  <>
                    <div className="flex items-center gap-1.5 text-green-700 mb-3">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-xs font-bold">Създадена</span>
                    </div>

                    <div className="mb-3">
                      <p className="text-xs font-bold text-orange-800">Номер</p>
                      <p className="text-sm font-mono text-orange-700">{shippingLabel.shipmentId}</p>
                    </div>

                    <div className="flex gap-2">
                      <a
                        href={shippingLabel.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-all text-xs"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Проследи
                      </a>

                      <button
                        onClick={handleDeleteShippingLabel}
                        disabled={isDeletingLabel}
                        className={`px-3 py-2 rounded-lg font-bold transition-all text-xs ${
                          isDeletingLabel
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-red-100 hover:bg-red-200 text-red-700'
                        }`}
                      >
                        {isDeletingLabel ? (
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-orange-700 mb-3">
                      Товарителница не е създадена
                    </p>

                    <button
                      onClick={handleCreateShippingLabel}
                      disabled={isCreatingLabel}
                      className={`w-full px-3 py-2.5 rounded-lg font-bold transition-all flex items-center justify-center gap-2 text-sm ${
                        isCreatingLabel
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-orange-500 hover:bg-orange-600 text-white'
                      }`}
                    >
                      {isCreatingLabel ? (
                        <>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Създаване...</span>
                        </>
                      ) : (
                        <span>Генерирай</span>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order Information */}
      <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
        <h3 className="text-lg font-bold text-purple-900 mb-3">
          Информация за поръчката
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-purple-900 mb-1">Номер на поръчка</p>
            <p className="text-sm text-neutral-700">{order.order_number || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-purple-900 mb-1">WooCommerce ID</p>
            <p className="text-sm text-neutral-700">{order.woocommerce_order_id}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-purple-900 mb-1">Обща сума</p>
            <p className="text-sm text-neutral-700">
              {order.currency} {order.total}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-purple-900 mb-1">Метод на плащане</p>
            <p className="text-sm text-neutral-700">
              {order.payment_method_title || order.payment_method}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-purple-900 mb-1">Доставка</p>
            <p className="text-sm text-neutral-700">
              {order.shipping_method_title || '-'} ({order.currency}{' '}
              {order.shipping_total || '0'})
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-purple-900 mb-1">Дата на създаване</p>
            <p className="text-sm text-neutral-700">
              {new Date(order.created_at).toLocaleString('bg-BG')}
            </p>
          </div>
        </div>
      </div>

      {/* Billing Information */}
      <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
        <h3 className="text-lg font-bold text-purple-900 mb-3">
          Информация за фактуриране
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-purple-900 mb-1">Име</p>
            <p className="text-sm text-neutral-700">
              {order.billing_first_name} {order.billing_last_name}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-purple-900 mb-1">Имейл</p>
            <p className="text-sm text-neutral-700 break-all">{order.billing_email}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-purple-900 mb-1">Телефон</p>
            <p className="text-sm text-neutral-700">{order.billing_phone || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-purple-900 mb-1">Пощенски код</p>
            <p className="text-sm text-neutral-700">{order.billing_postcode || '-'}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs font-bold text-purple-900 mb-1">Адрес</p>
            <p className="text-sm text-neutral-700">
              {[
                order.billing_address_1,
                order.billing_address_2,
                order.billing_city,
                order.billing_state,
                order.billing_country,
              ]
                .filter(Boolean)
                .join(', ') || '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Delivery Information */}
      {order.bg_carriers_service_type && (
        <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
          <h3 className="text-lg font-bold text-purple-900 mb-3">
            Информация за доставка
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Service Type Badge */}
            <div className="md:col-span-2">
              <p className="text-xs font-bold text-purple-900 mb-1">Тип доставка</p>
              <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold ${
                order.bg_carriers_service_type === 'home'
                  ? 'bg-blue-100 text-blue-800'
                  : order.bg_carriers_service_type === 'office'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-orange-100 text-orange-800'
              }`}>
                {order.bg_carriers_service_type === 'home' && 'До адрес'}
                {order.bg_carriers_service_type === 'office' && 'До офис'}
                {order.bg_carriers_service_type === 'apm' && 'До автомат'}
                {order.bg_carriers_service_type === 'pickup' && 'Вземане от място'}
              </span>
              {order.bg_carriers_carrier && (
                <span className="ml-2 text-xs text-neutral-600">
                  ({order.bg_carriers_carrier})
                </span>
              )}
            </div>

            {/* Pickup Location (Office/APM) */}
            {(order.bg_carriers_service_type === 'office' || order.bg_carriers_service_type === 'apm') && (
              <>
                {order.speedy_pickup_location_name && (
                  <div className="md:col-span-2">
                    <p className="text-xs font-bold text-purple-900 mb-1">
                      {order.speedy_pickup_location_type === 'apm' ? 'Автомат' : 'Офис'}
                    </p>
                    <p className="text-sm text-neutral-700">
                      {order.speedy_pickup_location_name}
                      {order.speedy_pickup_location_id && (
                        <span className="text-neutral-500"> [{order.speedy_pickup_location_id}]</span>
                      )}
                    </p>
                  </div>
                )}
                {order.speedy_pickup_location_address && (
                  <div>
                    <p className="text-xs font-bold text-purple-900 mb-1">Адрес</p>
                    <p className="text-sm text-neutral-700">{order.speedy_pickup_location_address}</p>
                  </div>
                )}
                {order.speedy_pickup_location_city && (
                  <div>
                    <p className="text-xs font-bold text-purple-900 mb-1">Град</p>
                    <p className="text-sm text-neutral-700">
                      {order.speedy_pickup_location_city}
                      {order.speedy_pickup_location_postcode && `, ${order.speedy_pickup_location_postcode}`}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Home Delivery */}
            {order.bg_carriers_service_type === 'home' && (
              <>
                {order.speedy_delivery_full_address && (
                  <div className="md:col-span-2">
                    <p className="text-xs font-bold text-purple-900 mb-1">Пълен адрес</p>
                    <p className="text-sm text-neutral-700">{order.speedy_delivery_full_address}</p>
                  </div>
                )}
                {order.speedy_delivery_city_name && (
                  <div>
                    <p className="text-xs font-bold text-purple-900 mb-1">Град</p>
                    <p className="text-sm text-neutral-700">
                      {order.speedy_delivery_city_name}
                      {order.speedy_delivery_postcode && `, ${order.speedy_delivery_postcode}`}
                      {order.speedy_delivery_city_id && (
                        <span className="text-neutral-500"> [{order.speedy_delivery_city_id}]</span>
                      )}
                    </p>
                  </div>
                )}
                {order.speedy_delivery_street_name && (
                  <div>
                    <p className="text-xs font-bold text-purple-900 mb-1">Улица</p>
                    <p className="text-sm text-neutral-700">
                      {order.speedy_delivery_street_type && `${order.speedy_delivery_street_type} `}
                      {order.speedy_delivery_street_name}
                      {order.speedy_delivery_street_number && ` ${order.speedy_delivery_street_number}`}
                      {order.speedy_delivery_street_id && (
                        <span className="text-neutral-500"> [{order.speedy_delivery_street_id}]</span>
                      )}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Generic location (fallback) */}
            {order.bg_carriers_location_name && !order.speedy_pickup_location_name && !order.speedy_delivery_city_name && (
              <div className="md:col-span-2">
                <p className="text-xs font-bold text-purple-900 mb-1">Локация</p>
                <p className="text-sm text-neutral-700">
                  {order.bg_carriers_location_name}
                  {order.bg_carriers_location_address && ` - ${order.bg_carriers_location_address}`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Line Items */}
      <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
        <h3 className="text-lg font-bold text-purple-900 mb-3">
          Артикули ({order.line_items?.length || 0})
        </h3>

        <div className="space-y-3">
          {order.line_items?.map((item: any, index: number) => (
            <div
              key={item.id}
              className="bg-purple-50 border-2 border-purple-200 rounded-xl p-3"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="text-base font-bold text-purple-900 mb-1">
                    {item.book_configurations?.[0]?.content?.title || item.book_configurations?.[0]?.name || item.product_name}
                  </h4>
                  <p className="text-sm text-neutral-600">
                    Количество: {item.quantity} | Цена: {order.currency} {item.total}
                  </p>
                </div>
              </div>

              {/* Book Configuration */}
              {item.book_configurations && item.book_configurations.length > 0 && (
                <div className="mt-3 space-y-3">
                  {item.book_configurations.map((config: any) => (
                    <div key={config.id} className={`bg-white rounded-xl p-3 border-2 ${completedConfigs[config.id] ? 'border-green-300' : 'border-purple-200'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <h5 className="text-sm font-bold text-purple-900">
                              Персонализация на книгата
                            </h5>
                            {generationCounts[config.id] !== undefined && generationCounts[config.id] > 0 && (
                              <p className="text-xs text-neutral-600 mt-1">
                                {generationCounts[config.id]} {generationCounts[config.id] === 1 ? 'генерация' : 'генерации'}
                              </p>
                            )}
                          </div>
                          {completedConfigs[config.id] && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Готова
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {isAdmin && (
                            <button
                              onClick={() => router.push(`/orders/${order.id}/generate?bookConfigId=${config.id}`)}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all text-xs flex items-center gap-1"
                            >
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2.5}
                                  d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                              </svg>
                              <span>Генерации {generationCounts[config.id] > 0 && `(${generationCounts[config.id]})`}</span>
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setExpandedBookId(expandedBookId === config.id ? null : config.id)
                            }
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-all text-xs flex items-center gap-1"
                          >
                            {expandedBookId === config.id ? (
                              <>
                                <span>Скрий съдържанието</span>
                                <svg
                                  className="w-3 h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2.5}
                                    d="M5 15l7-7 7 7"
                                  />
                                </svg>
                              </>
                            ) : (
                              <>
                                <span>Виж съдържанието</span>
                                <svg
                                  className="w-3 h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2.5}
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Basic Info - Always Visible */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <div>
                          <p className="text-xs font-bold text-purple-900">Име</p>
                          <p className="text-sm text-neutral-700">{config.name}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-purple-900">Възраст</p>
                          <p className="text-sm text-neutral-700">{config.age}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-purple-900">Пол</p>
                          <p className="text-sm text-neutral-700">
                            {config.gender === 'boy'
                              ? 'Момче'
                              : config.gender === 'girl'
                              ? 'Момиче'
                              : config.gender}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-purple-900">Конфигурация ID</p>
                          <p className="text-xs font-mono text-neutral-700 break-all" title={config.config_id}>
                            {config.config_id}
                          </p>
                        </div>
                      </div>

                      {/* Story Description - When Collapsed */}
                      {expandedBookId !== config.id && config.story_description && (
                        <div className="mt-3">
                          <p className="text-xs font-bold text-purple-900 mb-1">
                            Описание на историята
                          </p>
                          <p className="text-sm text-neutral-700 bg-purple-50 p-2 rounded-lg">
                            {config.story_description}
                          </p>
                        </div>
                      )}

                      {/* Expandable Book Content */}
                      {expandedBookId === config.id && (
                        <div className="mt-3 pt-3 border-t-2 border-purple-100 space-y-3">
                          {/* Title */}
                          {config.content?.title && (
                            <div>
                              <p className="text-xs font-bold text-purple-900 mb-1">
                                Заглавие
                              </p>
                              <p className="text-sm text-neutral-700 bg-purple-50 p-2 rounded-lg">
                                {config.content.title}
                              </p>
                            </div>
                          )}

                          {/* Short Description */}
                          {config.content?.shortDescription && (
                            <div>
                              <p className="text-xs font-bold text-purple-900 mb-1">
                                Кратко описание
                              </p>
                              <p className="text-sm text-neutral-700 bg-purple-50 p-2 rounded-lg">
                                {config.content.shortDescription}
                              </p>
                            </div>
                          )}

                          {/* Scenes */}
                          {config.content?.scenes && config.content.scenes.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-purple-900 mb-2">
                                Сцени ({config.content.scenes.length})
                              </p>
                              <div className="space-y-2">
                                {config.content.scenes.map((scene: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="bg-purple-50 p-2 rounded-lg border border-purple-200"
                                  >
                                    <div className="flex items-start gap-2">
                                      <span className="inline-flex items-center justify-center w-6 h-6 bg-purple-600 text-white font-bold rounded-full text-xs flex-shrink-0">
                                        {idx + 1}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        {scene.heading && (
                                          <p className="text-sm font-bold text-purple-900 mb-1">
                                            {scene.heading}
                                          </p>
                                        )}
                                        {scene.text && (
                                          <p className="text-xs text-neutral-700 whitespace-pre-wrap break-words">
                                            {scene.text}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Motivation End */}
                          {config.content?.motivationEnd && (
                            <div>
                              <p className="text-xs font-bold text-purple-900 mb-1">
                                Мотивационен край
                              </p>
                              <p className="text-sm text-neutral-700 bg-purple-50 p-2 rounded-lg">
                                {config.content.motivationEnd}
                              </p>
                            </div>
                          )}

                          {/* Images */}
                          {config.images && config.images.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-purple-900 mb-2">
                                Изображения ({config.images.length})
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {config.images.map((image: any, imgIdx: number) => (
                                  <div
                                    key={imgIdx}
                                    className="bg-purple-50 p-2 rounded-lg border-2 border-purple-200 space-y-2"
                                  >
                                    <div className="text-xs text-neutral-600 font-bold">
                                      #{imgIdx + 1}
                                    </div>
                                    <div className="relative aspect-square rounded-lg overflow-hidden bg-purple-100">
                                      <SmartImage
                                        src={getImageUrl(image.r2_key || image.key) || ''}
                                        alt={`Image ${imgIdx + 1}`}
                                        fill
                                        className="object-cover"
                                      />
                                    </div>
                                    <div className="text-xs font-mono text-neutral-600 break-all truncate" title={image.r2_key || image.key}>
                                      {image.r2_key || image.key}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status History */}
      {order.order_status_history && order.order_status_history.length > 0 && (
        <div className="bg-white rounded-2xl shadow-warm border border-purple-100 overflow-hidden">
          <button
            onClick={() => setIsStatusHistoryExpanded(!isStatusHistoryExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-purple-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-base font-bold text-purple-900">
                История на статуса
              </h3>
              <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                {order.order_status_history.length}
              </span>
            </div>
            <svg
              className={`w-5 h-5 text-purple-600 transition-transform ${isStatusHistoryExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isStatusHistoryExpanded && (
            <div className="px-4 pb-4 space-y-2">
              {order.order_status_history.map((history: any) => (
                <div
                  key={history.id}
                  className="flex items-center gap-3 py-2 border-b border-purple-100 last:border-0"
                >
                  <div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${STATUS_COLORS[history.status as OrderStatus].split(' ')[0]}`}
                  ></div>
                  <div className="flex-1 flex items-center justify-between">
                    <p className="font-bold text-purple-900 text-sm">
                      {STATUS_LABELS[history.status as OrderStatus]}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {new Date(history.changed_at).toLocaleString('bg-BG', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
