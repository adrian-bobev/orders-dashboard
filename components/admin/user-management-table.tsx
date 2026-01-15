'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Database } from '@/lib/database.types'

type User = Database['public']['Tables']['users']['Row']

interface UserManagementTableProps {
  initialUsers: User[]
  currentUser: User
}

export function UserManagementTable({
  initialUsers,
  currentUser,
}: UserManagementTableProps) {
  const router = useRouter()
  const supabase = createClient()
  const [users, setUsers] = useState(initialUsers)
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'viewer') => {
    setLoadingUserId(userId)
    setError(null)

    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId)

      if (error) throw error

      // Update local state
      setUsers(users.map((u) => (u.id === userId ? { ...u, role: newRole } : u)))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неуспешна промяна на роля')
    } finally {
      setLoadingUserId(null)
    }
  }

  const handleRemoveUser = async (userId: string) => {
    if (!confirm('Сигурни ли сте, че искате да премахнете този потребител?')) {
      return
    }

    setLoadingUserId(userId)
    setError(null)

    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', userId)

      if (error) throw error

      // Update local state
      setUsers(users.map((u) => (u.id === userId ? { ...u, is_active: false } : u)))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неуспешно премахване на потребител')
    } finally {
      setLoadingUserId(null)
    }
  }

  const handleReactivateUser = async (userId: string) => {
    if (
      !confirm('Сигурни ли сте, че искате да активирате отново този потребител?')
    ) {
      return
    }

    setLoadingUserId(userId)
    setError(null)

    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: true })
        .eq('id', userId)

      if (error) throw error

      // Update local state
      setUsers(users.map((u) => (u.id === userId ? { ...u, is_active: true } : u)))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неуспешна активация на потребител')
    } finally {
      setLoadingUserId(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-warm border-2 border-red-200 animate-shake">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center shadow-warm flex-shrink-0">
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="text-red-900 font-bold text-sm md:text-base">{error}</p>
          </div>
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white rounded-2xl shadow-warm border border-purple-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-purple-50 border-b-2 border-purple-100">
                <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Потребител
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Имейл
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Роля
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {users.map((user, index) => (
                <tr
                  key={user.id}
                  className={`transition-colors duration-200 ${
                    user.is_active
                      ? 'hover:bg-purple-50/50'
                      : 'bg-neutral-50 hover:bg-neutral-100'
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {user.image_url ? (
                          <img
                            className={`w-10 h-10 rounded-xl border-2 shadow-sm ${
                              user.is_active
                                ? 'border-purple-200'
                                : 'border-neutral-300 grayscale'
                            }`}
                            src={user.image_url}
                            alt=""
                          />
                        ) : (
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
                              user.is_active ? 'bg-purple-600' : 'bg-neutral-400'
                            }`}
                          >
                            <span className="text-white font-bold text-sm">
                              {user.name?.[0] || user.email[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`text-sm font-bold truncate ${
                            user.is_active ? 'text-purple-900' : 'text-neutral-500'
                          }`}
                        >
                          {user.name || 'Без име'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className={`text-sm font-medium truncate max-w-[200px] ${
                        user.is_active ? 'text-neutral-700' : 'text-neutral-500'
                      }`}
                    >
                      {user.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 inline-flex text-xs font-bold rounded-xl shadow-sm ${
                        user.role === 'admin'
                          ? user.is_active
                            ? 'bg-purple-600 text-white'
                            : 'bg-neutral-400 text-white'
                          : user.is_active
                            ? 'bg-green-500 text-white'
                            : 'bg-neutral-400 text-white'
                      }`}
                    >
                      {user.role === 'admin' ? 'админ' : 'наблюд.'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 inline-flex text-xs font-bold rounded-xl shadow-sm ${
                        user.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {user.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      {user.id !== currentUser.id && user.is_active && (
                        <>
                          <button
                            onClick={() =>
                              handleRoleChange(
                                user.id,
                                user.role === 'admin' ? 'viewer' : 'admin'
                              )
                            }
                            disabled={loadingUserId === user.id}
                            className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 disabled:opacity-50 font-bold text-xs transition-all duration-300 hover:shadow-sm hover:-translate-y-0.5"
                          >
                            {loadingUserId === user.id
                              ? '...'
                              : user.role === 'admin'
                                ? '→ Наблюд.'
                                : '→ Админ'}
                          </button>
                          <button
                            onClick={() => handleRemoveUser(user.id)}
                            disabled={loadingUserId === user.id}
                            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 disabled:opacity-50 font-bold text-xs transition-all duration-300 hover:shadow-sm hover:-translate-y-0.5"
                          >
                            {loadingUserId === user.id ? '...' : 'Премахни'}
                          </button>
                        </>
                      )}
                      {user.id !== currentUser.id && !user.is_active && (
                        <button
                          onClick={() => handleReactivateUser(user.id)}
                          disabled={loadingUserId === user.id}
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 disabled:opacity-50 font-bold text-xs transition-all duration-300 hover:shadow-sm hover:-translate-y-0.5"
                        >
                          {loadingUserId === user.id ? '...' : 'Активирай'}
                        </button>
                      )}
                      {user.id === currentUser.id && (
                        <span className="px-3 py-1 bg-neutral-100 text-neutral-600 text-xs font-bold rounded-xl">
                          Вие
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile/Tablet Card View */}
      <div className="lg:hidden space-y-3">
        {users.map((user, index) => (
          <div
            key={user.id}
            className={`bg-white rounded-2xl shadow-warm border overflow-hidden transition-all duration-300 ${
              user.is_active ? 'border-purple-100' : 'border-neutral-200'
            }`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="p-4">
              {/* User Info Section */}
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0">
                  {user.image_url ? (
                    <img
                      className={`w-12 h-12 rounded-xl border-2 shadow-sm ${
                        user.is_active
                          ? 'border-purple-200'
                          : 'border-neutral-300 grayscale'
                      }`}
                      src={user.image_url}
                      alt=""
                    />
                  ) : (
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
                        user.is_active ? 'bg-purple-600' : 'bg-neutral-400'
                      }`}
                    >
                      <span className="text-white font-bold text-base">
                        {user.name?.[0] || user.email[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3
                      className={`font-bold text-base truncate ${
                        user.is_active ? 'text-purple-900' : 'text-neutral-500'
                      }`}
                    >
                      {user.name || 'Без име'}
                    </h3>
                    {user.id === currentUser.id && (
                      <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs font-bold rounded-lg flex-shrink-0">
                        Вие
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-sm truncate mb-2 ${
                      user.is_active ? 'text-neutral-700' : 'text-neutral-500'
                    }`}
                  >
                    {user.email}
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 inline-flex text-xs font-bold rounded-lg shadow-sm ${
                        user.role === 'admin'
                          ? user.is_active
                            ? 'bg-purple-600 text-white'
                            : 'bg-neutral-400 text-white'
                          : user.is_active
                            ? 'bg-green-500 text-white'
                            : 'bg-neutral-400 text-white'
                      }`}
                    >
                      {user.role === 'admin' ? 'Админ' : 'Наблюд.'}
                    </span>
                    <span
                      className={`px-2.5 py-1 inline-flex text-xs font-bold rounded-lg shadow-sm ${
                        user.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {user.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {user.id !== currentUser.id && (
                <div className="flex gap-2 pt-3 border-t border-neutral-100">
                  {user.is_active ? (
                    <>
                      <button
                        onClick={() =>
                          handleRoleChange(
                            user.id,
                            user.role === 'admin' ? 'viewer' : 'admin'
                          )
                        }
                        disabled={loadingUserId === user.id}
                        className="flex-1 px-3 py-2 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 disabled:opacity-50 font-bold text-sm transition-all duration-300"
                      >
                        {loadingUserId === user.id
                          ? '...'
                          : user.role === 'admin'
                            ? '→ Наблюд.'
                            : '→ Админ'}
                      </button>
                      <button
                        onClick={() => handleRemoveUser(user.id)}
                        disabled={loadingUserId === user.id}
                        className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 disabled:opacity-50 font-bold text-sm transition-all duration-300"
                      >
                        {loadingUserId === user.id ? '...' : 'Премахни'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleReactivateUser(user.id)}
                      disabled={loadingUserId === user.id}
                      className="w-full px-3 py-2 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 disabled:opacity-50 font-bold text-sm transition-all duration-300"
                    >
                      {loadingUserId === user.id ? '...' : 'Активирай отново'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="bg-white rounded-2xl shadow-warm border border-purple-100 p-12 text-center">
          <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <p className="text-neutral-500 font-bold text-base">
            Не са намерени потребители.
          </p>
        </div>
      )}
    </div>
  )
}
