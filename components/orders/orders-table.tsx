'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Database } from '@/lib/database.types'

type Order = Database['public']['Tables']['orders']['Row']
type OrderStatus = Database['public']['Enums']['order_status']
type User = Database['public']['Tables']['users']['Row']

interface OrdersTableProps {
  initialOrders: Order[]
  currentUser: User
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Нова',
  VALIDATION_PENDING: 'Валидация',
  READY_FOR_PRINT: 'Готова за печат',
  PRINTING: 'Печат',
  IN_TRANSIT: 'Транзит',
  COMPLETED: 'Завършена',
  REJECTED: 'Отказана',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  VALIDATION_PENDING: 'bg-yellow-100 text-yellow-800',
  READY_FOR_PRINT: 'bg-indigo-100 text-indigo-800',
  PRINTING: 'bg-purple-100 text-purple-800',
  IN_TRANSIT: 'bg-orange-100 text-orange-800',
  COMPLETED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

export function OrdersTable({ initialOrders, currentUser }: OrdersTableProps) {
  const router = useRouter()
  const [orders] = useState(initialOrders)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null)

  const isAdmin = currentUser.role === 'admin'
  const isViewer = currentUser.role === 'viewer'

  // For viewers, only show READY_FOR_PRINT and PRINTING
  const viewerStatuses: OrderStatus[] = ['READY_FOR_PRINT', 'PRINTING']

  // Filter orders based on status and search
  const filteredOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter
    const matchesSearch =
      searchQuery === '' ||
      order.woocommerce_order_id.toString().includes(searchQuery) ||
      (isAdmin &&
        (order.billing_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          order.billing_first_name
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          order.billing_last_name.toLowerCase().includes(searchQuery.toLowerCase())))

    return matchesStatus && matchesSearch
  })

  const handleDownload = async (e: React.MouseEvent, orderId: string, orderNumber: string | null) => {
    e.stopPropagation()
    setDownloadingOrderId(orderId)

    try {
      const response = await fetch(`/api/orders/${orderId}/download`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Download failed')
      }

      // Trigger browser download
      const link = document.createElement('a')
      link.href = data.downloadUrl
      link.download = `order-${orderNumber || orderId}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Download error:', error)
      alert(error instanceof Error ? error.message : 'Грешка при изтегляне')
    } finally {
      setDownloadingOrderId(null)
    }
  }

  const DownloadButton = ({ order }: { order: Order }) => {
    const hasPrintFile = !!order.print_file_r2_key
    const isDownloading = downloadingOrderId === order.id

    return (
      <button
        onClick={(e) => handleDownload(e, order.id, order.order_number)}
        disabled={!hasPrintFile || isDownloading}
        className={`inline-flex items-center justify-center px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
          hasPrintFile
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
        title={hasPrintFile ? 'Изтегли файл за печат' : 'Няма файл за печат'}
      >
        {isDownloading ? (
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters Section */}
      <div className="bg-white rounded-2xl shadow-warm border border-purple-100 overflow-hidden">
        <div className="p-4 md:p-6 border-b-2 border-purple-100 space-y-4">
        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isAdmin ? 'Търси...' : 'Търси по номер...'}
          className="w-full px-4 py-3 text-base border-2 border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all"
        />

        {/* Status Filter - Dropdown style for better mobile UX */}
        <div>
          <label className="block text-xs font-bold text-purple-900 mb-2 uppercase">
            Статус
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'ALL')}
            className="w-full px-4 py-3 text-base border-2 border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all bg-white font-bold text-purple-900"
          >
            <option value="ALL">Всички</option>
            {isAdmin &&
              (
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
            {isViewer &&
              viewerStatuses.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
          </select>
        </div>

        {/* Results Count */}
        <div className="text-neutral-600 text-sm">
          {filteredOrders.length} от {orders.length} поръчки
        </div>
      </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl shadow-warm border border-purple-100 overflow-hidden">
      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-purple-200 rounded-full flex items-center justify-center mx-auto mb-4 shadow-warm">
            <svg
              className="w-10 h-10 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-purple-900 mb-2 tracking-tight">
            Няма намерени поръчки
          </h3>
          <p className="text-neutral-600 text-sm">
            {searchQuery
              ? 'Опитайте да промените търсенето'
              : 'Поръчките ще се появят тук'}
          </p>
        </div>
      ) : (
        <>
          {/* Admin Table View */}
          {isAdmin && (
            <>
              {/* Desktop/Tablet Table View (min-width: 640px) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-purple-50 border-b-2 border-purple-100">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-bold text-purple-900 uppercase">
                        #
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-purple-900 uppercase">
                        Статус
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-purple-900 uppercase">
                        Клиент
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-purple-900 uppercase">
                        Имейл
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-bold text-purple-900 uppercase">
                        Сума
                      </th>
                      <th className="px-3 py-3 text-right text-xs font-bold text-purple-900 uppercase">
                        Дата
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-bold text-purple-900 uppercase">
                        Изтегли
                      </th>
                      <th className="px-3 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-100">
                    {filteredOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-purple-50 transition-colors cursor-pointer group"
                        onClick={() => router.push(`/orders/${order.id}`)}
                      >
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-sm font-bold text-purple-900">
                            {order.woocommerce_order_id}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold ${STATUS_COLORS[order.status]}`}
                          >
                            {STATUS_LABELS[order.status]}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-sm text-neutral-900 font-medium truncate max-w-[120px]">
                            {order.billing_first_name} {order.billing_last_name}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-sm text-neutral-600 truncate max-w-[180px]">
                            {order.billing_email}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <span className="text-sm font-bold text-purple-900">
                            €{order.total}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <span className="text-xs text-neutral-600">
                            {new Date(order.created_at).toLocaleDateString('bg-BG')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <DownloadButton order={order} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <svg
                            className="w-5 h-5 text-purple-600 group-hover:translate-x-1 transition-transform"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.5}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Stacked View */}
              <div className="sm:hidden divide-y divide-purple-100">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => router.push(`/orders/${order.id}`)}
                    className="p-4 hover:bg-purple-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-purple-900 text-base mb-1">
                          #{order.woocommerce_order_id}
                        </div>
                        <div className="text-sm text-neutral-700 truncate">
                          {order.billing_first_name} {order.billing_last_name}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-purple-900 text-base mb-1">
                          €{order.total}
                        </div>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${STATUS_COLORS[order.status]}`}
                        >
                          {STATUS_LABELS[order.status]}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs text-neutral-500">
                        {new Date(order.created_at).toLocaleDateString('bg-BG')}
                      </div>
                      <DownloadButton order={order} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Viewer Table View - Only ID, Status, Date, File Size, Download */}
          {isViewer && (
            <>
              {/* Desktop/Tablet View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-purple-50 border-b-2 border-purple-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase">
                        # Поръчка
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase">
                        Статус
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-purple-900 uppercase">
                        Дата
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-purple-900 uppercase">
                        Размер
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-purple-900 uppercase">
                        Изтегли
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-100">
                    {filteredOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-purple-50/50 transition-colors"
                      >
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-base font-bold text-purple-900">
                            {order.woocommerce_order_id}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold ${STATUS_COLORS[order.status]}`}
                          >
                            {STATUS_LABELS[order.status]}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <span className="text-sm text-neutral-700">
                            {new Date(order.created_at).toLocaleDateString('bg-BG', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <span className="text-sm text-neutral-600">
                            {order.print_file_size_bytes
                              ? `${(order.print_file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                              : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <DownloadButton order={order} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile View */}
              <div className="sm:hidden divide-y divide-purple-100">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="font-bold text-purple-900 text-lg">
                        #{order.woocommerce_order_id}
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${STATUS_COLORS[order.status]}`}
                      >
                        {STATUS_LABELS[order.status]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-sm text-neutral-600">
                        {new Date(order.created_at).toLocaleDateString('bg-BG', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                        {order.print_file_size_bytes && (
                          <span className="ml-2 text-neutral-500">
                            • {(order.print_file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        )}
                      </div>
                      <DownloadButton order={order} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      </div>
    </div>
  )
}
