'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Database } from '@/lib/database.types'

type OrderStatus = Database['public']['Enums']['order_status']
type User = Database['public']['Tables']['users']['Row']

interface OrderDetailProps {
  order: any
  currentUser: User
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Нова',
  VALIDATION_PENDING: 'Очаква валидация',
  READY_FOR_PRINT: 'Готова за печат',
  PRINTING: 'В печат',
  IN_TRANSIT: 'В транзит',
  COMPLETED: 'Завършена',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  NEW: 'bg-blue-100 text-blue-800 border-blue-200',
  VALIDATION_PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  READY_FOR_PRINT: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  PRINTING: 'bg-purple-100 text-purple-800 border-purple-200',
  IN_TRANSIT: 'bg-orange-100 text-orange-800 border-orange-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
}

export function OrderDetail({ order, currentUser }: OrderDetailProps) {
  const router = useRouter()
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>(order.status)
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null)

  const isAdmin = currentUser.role === 'admin'
  const isViewer = currentUser.role === 'viewer'

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
      alert('Грешка при промяна на статуса')
      console.error(error)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // Viewer view - only ID, status, and date
  if (isViewer) {
    return (
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
    )
  }

  // Admin view - full details with expandable book content
  return (
    <div className="space-y-4">
      {/* Status Section */}
      <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
        <h3 className="text-lg font-bold text-purple-900 mb-3">Статус</h3>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span
            className={`inline-flex items-center px-4 py-2 rounded-xl text-base font-bold border-2 ${STATUS_COLORS[currentStatus]}`}
          >
            {STATUS_LABELS[currentStatus]}
          </span>
          {isUpdatingStatus && (
            <span className="text-neutral-600 text-sm">Актуализира се...</span>
          )}
        </div>

        {/* Status Change Buttons (Admin Only) */}
        {isAdmin && (
          <div>
            <p className="text-sm font-bold text-purple-900 mb-3">
              Промени статуса на:
            </p>
            <select
              value={currentStatus}
              onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
              disabled={isUpdatingStatus}
              className="w-full px-4 py-2 text-base border-2 border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all bg-white font-bold text-purple-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(
                [
                  'NEW',
                  'VALIDATION_PENDING',
                  'READY_FOR_PRINT',
                  'PRINTING',
                  'IN_TRANSIT',
                  'COMPLETED',
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
      {(order.delivery_city_name || order.speedy_office_name) && (
        <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
          <h3 className="text-lg font-bold text-purple-900 mb-3">
            Информация за доставка
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {order.delivery_city_name && (
              <div>
                <p className="text-xs font-bold text-purple-900 mb-1">Град</p>
                <p className="text-sm text-neutral-700">
                  {order.delivery_city_type} {order.delivery_city_name}
                  {order.delivery_city_region && ` (${order.delivery_city_region})`}
                </p>
              </div>
            )}
            {order.delivery_address_component_name && (
              <div>
                <p className="text-xs font-bold text-purple-900 mb-1">Адрес</p>
                <p className="text-sm text-neutral-700">
                  {order.delivery_address_type_prefix}{' '}
                  {order.delivery_address_component_name}
                </p>
              </div>
            )}
            {order.speedy_office_name && (
              <div className="md:col-span-2">
                <p className="text-xs font-bold text-purple-900 mb-1">Офис Speedy</p>
                <p className="text-sm text-neutral-700">
                  {order.speedy_office_name} (ID: {order.speedy_office_id})
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
                    {item.product_name}
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
                    <div key={config.id} className="bg-white rounded-xl p-3 border-2 border-purple-200">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-sm font-bold text-purple-900">
                          Персонализация на книгата
                        </h5>
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

                      {/* Basic Info - Always Visible */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                              <p className="text-xs font-bold text-purple-900 mb-1">
                                Изображения ({config.images.length})
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                {config.images.map((image: any, imgIdx: number) => (
                                  <div
                                    key={imgIdx}
                                    className="bg-purple-50 p-2 md:p-3 rounded-lg border border-purple-200"
                                  >
                                    <div className="text-xs text-neutral-600 mb-1">
                                      #{imgIdx + 1}
                                    </div>
                                    <div className="text-xs font-mono text-neutral-700 break-all">
                                      {image.r2_key || image.key || JSON.stringify(image)}
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
        <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
          <h3 className="text-lg font-bold text-purple-900 mb-3">
            История на статуса
          </h3>

          <div className="space-y-3">
            {order.order_status_history.map((history: any) => (
              <div
                key={history.id}
                className="flex items-center gap-3 pb-3 border-b-2 border-purple-100 last:border-0"
              >
                <div
                  className={`w-4 h-4 rounded-full ${STATUS_COLORS[history.status].split(' ')[0]}`}
                ></div>
                <div className="flex-1">
                  <p className="font-bold text-purple-900">
                    {STATUS_LABELS[history.status]}
                  </p>
                  <p className="text-sm text-neutral-600">
                    {new Date(history.changed_at).toLocaleString('bg-BG')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
