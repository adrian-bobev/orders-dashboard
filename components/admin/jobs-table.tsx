'use client'

import { useState, useCallback } from 'react'
import type { Job, JobType, JobStatus } from '@/lib/queue/types'

interface JobsTableProps {
  initialJobs: Job[]
  initialTotal: number
}

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'Чакащ',
  processing: 'В процес',
  completed: 'Завършен',
  failed: 'Неуспешен',
  cancelled: 'Отменен',
}

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
}

const TYPE_LABELS: Record<JobType, string> = {
  PRINT_GENERATION: 'Печат',
  PREVIEW_GENERATION: 'Preview',
  CONTENT_GENERATION: 'Съдържание',
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('bg-BG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-'
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const durationMs = end - start

  if (durationMs < 1000) return '<1s'
  if (durationMs < 60000) return `${Math.round(durationMs / 1000)}s`
  if (durationMs < 3600000) return `${Math.round(durationMs / 60000)}m`
  return `${Math.round(durationMs / 3600000)}h`
}

function getWooOrderId(job: Job): string | null {
  const payload = job.payload as Record<string, unknown> | null
  if (!payload) return null

  // Different job types store the WooCommerce order ID in different fields
  if ('woocommerceOrderId' in payload) {
    return String(payload.woocommerceOrderId)
  }
  if ('wooOrderId' in payload) {
    return String(payload.wooOrderId)
  }
  if ('orderNumber' in payload) {
    return String(payload.orderNumber)
  }
  return null
}

export function JobsTable({ initialJobs, initialTotal }: JobsTableProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('')
  const [typeFilter, setTypeFilter] = useState<JobType | ''>('')
  const [orderIdFilter, setOrderIdFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const limit = 20

  const fetchJobs = useCallback(async (newOffset: number = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('offset', String(newOffset))
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('type', typeFilter)
      if (orderIdFilter.trim()) params.set('orderId', orderIdFilter.trim())

      const response = await fetch(`/api/admin/jobs?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        setJobs(data.jobs)
        setTotal(data.total)
        setOffset(newOffset)
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter, orderIdFilter])

  const handleRetrigger = async (jobId: string) => {
    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/retrigger`, {
        method: 'POST',
      })
      const data = await response.json()

      if (response.ok) {
        // Refresh the list
        await fetchJobs(offset)
        alert(`Новата задача е създадена: ${data.newJobId}`)
      } else {
        alert(`Грешка: ${data.error}`)
      }
    } catch (error) {
      console.error('Failed to retrigger job:', error)
      alert('Грешка при създаване на нова задача')
    }
  }

  const handleCancel = async (jobId: string) => {
    if (!confirm('Сигурни ли сте, че искате да отмените тази задача?')) return

    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/cancel`, {
        method: 'POST',
      })
      const data = await response.json()

      if (response.ok) {
        // Refresh the list
        await fetchJobs(offset)
      } else {
        alert(`Грешка: ${data.error}`)
      }
    } catch (error) {
      console.error('Failed to cancel job:', error)
      alert('Грешка при отмяна на задачата')
    }
  }

  const handleFilterChange = () => {
    fetchJobs(0)
  }

  const handleWakeWorker = async () => {
    try {
      const response = await fetch('/api/admin/worker/wake', {
        method: 'POST',
      })
      const data = await response.json()

      if (response.ok) {
        alert('Worker събуден успешно! Проверява за чакащи задачи...')
        // Refresh jobs list after a short delay
        setTimeout(() => fetchJobs(offset), 2000)
      } else {
        alert(`Грешка: ${data.error}`)
      }
    } catch (error) {
      console.error('Failed to wake worker:', error)
      alert('Грешка при събуждане на worker')
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-warm border border-purple-100">
      {/* Filters */}
      <div className="p-4 border-b border-purple-100 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-600">Статус:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as JobStatus | '')
              setTimeout(handleFilterChange, 0)
            }}
            className="border border-purple-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="">Всички</option>
            <option value="pending">Чакащи</option>
            <option value="processing">В процес</option>
            <option value="completed">Завършени</option>
            <option value="failed">Неуспешни</option>
            <option value="cancelled">Отменени</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-600">Тип:</label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as JobType | '')
              setTimeout(handleFilterChange, 0)
            }}
            className="border border-purple-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="">Всички</option>
            <option value="PRINT_GENERATION">Печат</option>
            <option value="PREVIEW_GENERATION">Preview</option>
            <option value="CONTENT_GENERATION">Съдържание</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-600">Поръчка №:</label>
          <input
            type="text"
            value={orderIdFilter}
            onChange={(e) => setOrderIdFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleFilterChange()
              }
            }}
            placeholder="напр. 12345"
            className="border border-purple-200 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <button
            onClick={handleFilterChange}
            className="px-2 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200"
          >
            Търси
          </button>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={handleWakeWorker}
            className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Стартирай Worker
          </button>
          <button
            onClick={() => fetchJobs(offset)}
            disabled={loading}
            className="px-4 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? 'Зареждане...' : 'Обнови'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-purple-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-purple-600 uppercase tracking-wider">
                Поръчка
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-purple-600 uppercase tracking-wider">
                Тип
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-purple-600 uppercase tracking-wider">
                Статус
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-purple-600 uppercase tracking-wider">
                Създаден
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-purple-600 uppercase tracking-wider">
                Времетраене
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-purple-600 uppercase tracking-wider">
                Опити
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-purple-600 uppercase tracking-wider">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-100">
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-purple-50/50">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelectedJob(job)}
                    className="text-sm font-bold text-purple-600 hover:underline"
                  >
                    #{getWooOrderId(job) || job.id.slice(0, 8)}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-neutral-700">
                  {TYPE_LABELS[job.type]}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[job.status]}`}>
                    {STATUS_LABELS[job.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-neutral-600">
                  {formatDate(job.created_at)}
                </td>
                <td className="px-4 py-3 text-sm text-neutral-600">
                  {formatDuration(job.started_at, job.completed_at)}
                </td>
                <td className="px-4 py-3 text-sm text-neutral-600">
                  {job.retry_count} / {job.max_retries}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {(job.status === 'failed' || job.status === 'cancelled') && (
                      <button
                        onClick={() => handleRetrigger(job.id)}
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        Повтори
                      </button>
                    )}
                    {job.status === 'pending' && (
                      <button
                        onClick={() => handleCancel(job.id)}
                        className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Отмени
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  Няма намерени задачи
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-4 border-t border-purple-100 flex items-center justify-between">
        <span className="text-sm text-neutral-600">
          Показани {offset + 1} - {Math.min(offset + limit, total)} от {total}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => fetchJobs(Math.max(0, offset - limit))}
            disabled={offset === 0 || loading}
            className="px-3 py-1.5 border border-purple-200 rounded-lg text-sm disabled:opacity-50 hover:bg-purple-50"
          >
            Предишна
          </button>
          <button
            onClick={() => fetchJobs(offset + limit)}
            disabled={offset + limit >= total || loading}
            className="px-3 py-1.5 border border-purple-200 rounded-lg text-sm disabled:opacity-50 hover:bg-purple-50"
          >
            Следваща
          </button>
        </div>
      </div>

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-purple-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-purple-900">
                Детайли за задача
              </h3>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-neutral-500 hover:text-neutral-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              <div>
                <div className="text-sm font-medium text-neutral-500">ID</div>
                <div className="font-mono text-sm">{selectedJob.id}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-neutral-500">Тип</div>
                  <div>{TYPE_LABELS[selectedJob.type]}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-500">Статус</div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[selectedJob.status]}`}>
                    {STATUS_LABELS[selectedJob.status]}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-neutral-500">Създаден</div>
                  <div className="text-sm">{formatDate(selectedJob.created_at)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-500">Завършен</div>
                  <div className="text-sm">{formatDate(selectedJob.completed_at)}</div>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-neutral-500 mb-1">Payload</div>
                <pre className="bg-neutral-100 p-3 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>
              {selectedJob.result && (
                <div>
                  <div className="text-sm font-medium text-neutral-500 mb-1">Result</div>
                  <pre className="bg-green-50 p-3 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedJob.result, null, 2)}
                  </pre>
                </div>
              )}
              {selectedJob.error && (
                <div>
                  <div className="text-sm font-medium text-red-500 mb-1">Error</div>
                  <pre className="bg-red-50 p-3 rounded-lg text-xs text-red-700 overflow-x-auto whitespace-pre-wrap">
                    {selectedJob.error}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
