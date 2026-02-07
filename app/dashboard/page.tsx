import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/sign-in')
  }

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .eq('is_active', true)
    .single()

  if (!user) {
    redirect('/sign-in')
  }

  return (
    <div className="space-y-4">
      {/* Welcome Card */}
      <div className="bg-white rounded-2xl shadow-warm p-5 border border-purple-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-purple-900 mb-2 tracking-tight">
              {user.role === 'admin' ? 'Табло за управление' : 'Добре дошли'}
            </h2>
            <p className="text-base text-neutral-600 leading-relaxed">
              Здравейте,{' '}
              <span className="font-bold text-purple-900">
                {user.name || user.email}
              </span>
              ! Влезли сте като{' '}
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-purple-600 text-white shadow-warm">
                {user.role === 'admin'
                  ? 'администратор'
                  : user.role === 'viewer'
                    ? 'наблюдател'
                    : user.role}
              </span>
            </p>
          </div>
          <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center shadow-warm flex-shrink-0 transform hover:scale-105 transition-transform duration-300">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Content Section */}
      {user.role === 'admin' ? (
        <div className="bg-white rounded-2xl shadow-warm p-5 border border-purple-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-purple-600 rounded-xl flex items-center justify-center shadow-warm">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-purple-900">
              Администраторски действия
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/orders"
              className="group relative overflow-hidden bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 hover:border-purple-400 hover:shadow-warm-lg transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-warm group-hover:scale-110 transition-transform duration-300">
                      <svg
                        className="w-6 h-6 text-white"
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
                    <h4 className="text-lg font-bold text-purple-900">
                      Поръчки
                    </h4>
                  </div>
                  <p className="text-neutral-600 leading-relaxed text-sm">
                    Преглед и управление на поръчките
                  </p>
                </div>
                <svg
                  className="w-6 h-6 text-purple-600 group-hover:translate-x-1 transition-transform duration-300 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/users"
              className="group relative overflow-hidden bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 hover:border-purple-400 hover:shadow-warm-lg transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-warm group-hover:scale-110 transition-transform duration-300">
                      <svg
                        className="w-6 h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                        />
                      </svg>
                    </div>
                    <h4 className="text-lg font-bold text-purple-900">
                      Потребители
                    </h4>
                  </div>
                  <p className="text-neutral-600 leading-relaxed text-sm">
                    Управление на роли и разрешения
                  </p>
                </div>
                <svg
                  className="w-6 h-6 text-purple-600 group-hover:translate-x-1 transition-transform duration-300 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/jobs"
              className="group relative overflow-hidden bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 hover:border-purple-400 hover:shadow-warm-lg transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-warm group-hover:scale-110 transition-transform duration-300">
                      <svg
                        className="w-6 h-6 text-white"
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
                    <h4 className="text-lg font-bold text-purple-900">
                      Задачи
                    </h4>
                  </div>
                  <p className="text-neutral-600 leading-relaxed text-sm">
                    Мониторинг на фонови задачи
                  </p>
                </div>
                <svg
                  className="w-6 h-6 text-purple-600 group-hover:translate-x-1 transition-transform duration-300 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/settings"
              className="group relative overflow-hidden bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 hover:border-purple-400 hover:shadow-warm-lg transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-warm group-hover:scale-110 transition-transform duration-300">
                      <svg
                        className="w-6 h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </div>
                    <h4 className="text-lg font-bold text-purple-900">
                      Настройки
                    </h4>
                  </div>
                  <p className="text-neutral-600 leading-relaxed text-sm">
                    Speedy и други настройки
                  </p>
                </div>
                <svg
                  className="w-6 h-6 text-purple-600 group-hover:translate-x-1 transition-transform duration-300 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-warm p-5 border border-purple-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-purple-600 rounded-xl flex items-center justify-center shadow-warm">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-purple-900">
              Вашите действия
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Link
              href="/orders"
              className="group relative overflow-hidden bg-purple-50 border-2 border-purple-200 rounded-2xl p-5 hover:border-purple-400 hover:shadow-warm-lg transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-warm group-hover:scale-110 transition-transform duration-300">
                      <svg
                        className="w-6 h-6 text-white"
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
                    <h4 className="text-lg font-bold text-purple-900">
                      Поръчки
                    </h4>
                  </div>
                  <p className="text-neutral-600 leading-relaxed text-sm">
                    Преглед на поръчките
                  </p>
                </div>
                <svg
                  className="w-6 h-6 text-purple-600 group-hover:translate-x-1 transition-transform duration-300 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
