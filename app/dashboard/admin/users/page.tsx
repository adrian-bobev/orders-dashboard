import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UserManagementTable } from '@/components/admin/user-management-table'
import { listAllUsers, getCurrentUser } from '@/lib/services/user-service'

export default async function AdminUsersPage() {
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

  // Fetch all users for the table
  const users = await listAllUsers()

  return (
    <div className="space-y-10 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-warm p-10 border border-purple-100">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 bg-purple-600 rounded-3xl flex items-center justify-center shadow-warm">
            <svg
              className="w-9 h-9 text-white"
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
          <div>
            <h2 className="text-3xl font-bold text-purple-900 tracking-tight">
              Управление на потребители
            </h2>
            <p className="text-neutral-600 mt-2 text-lg">
              Управление на потребителски роли и разрешения в платформата.
            </p>
          </div>
        </div>
      </div>

      <UserManagementTable initialUsers={users} currentUser={currentUser} />
    </div>
  )
}
