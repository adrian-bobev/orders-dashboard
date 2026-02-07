import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/services/user-service'
import { JobsTable } from '@/components/admin/jobs-table'
import { getJobStats, listJobs } from '@/lib/queue/client'

export default async function AdminJobsPage() {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/sign-in')
  }

  // Get current user and check if admin
  const currentUser = await getCurrentUser()

  if (!currentUser || currentUser.role !== 'admin') {
    redirect('/dashboard')
  }

  // Fetch initial data
  const [stats, jobsResult] = await Promise.all([
    getJobStats(24),
    listJobs({ limit: 20, offset: 0 }),
  ])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-warm p-5 border border-purple-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center shadow-warm">
            <svg
              className="w-7 h-7 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-purple-900 tracking-tight">
              Опашка за задачи
            </h2>
            <p className="text-neutral-600 mt-1 text-base">
              Мониторинг на фонови задачи за генериране на PDF и preview изображения.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-yellow-200 shadow-sm">
          <div className="text-sm text-yellow-700 font-medium">Чакащи</div>
          <div className="text-2xl font-bold text-yellow-800">{stats.pending}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-blue-200 shadow-sm">
          <div className="text-sm text-blue-700 font-medium">В процес</div>
          <div className="text-2xl font-bold text-blue-800">{stats.processing}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-green-200 shadow-sm">
          <div className="text-sm text-green-700 font-medium">Завършени</div>
          <div className="text-2xl font-bold text-green-800">{stats.completed}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-red-200 shadow-sm">
          <div className="text-sm text-red-700 font-medium">Неуспешни</div>
          <div className="text-2xl font-bold text-red-800">{stats.failed}</div>
        </div>
      </div>

      <JobsTable initialJobs={jobsResult.jobs} initialTotal={jobsResult.total} />
    </div>
  )
}
