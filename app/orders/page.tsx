import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/services/user-service'
import { getOrders } from '@/lib/services/order-service'
import { OrdersTable } from '@/components/orders/orders-table'
import Link from 'next/link'

export default async function OrdersPage() {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/sign-in')
  }

  // Get current user and check permissions
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/sign-in')
  }

  // Fetch orders based on user role
  const orders = await getOrders(currentUser.role)

  return (
    <div className="space-y-4 animate-fade-in">
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-purple-900 tracking-tight">
              Управление на поръчки
            </h2>
            <p className="text-neutral-600 mt-1 text-base">
              Преглед, филтриране и управление на статуса на поръчките.
            </p>
          </div>
        </div>
      </div>

      <OrdersTable initialOrders={orders} currentUser={currentUser} />
    </div>
  )
}
