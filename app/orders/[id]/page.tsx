import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/services/user-service'
import { getOrderById } from '@/lib/services/order-service'
import { generationService } from '@/lib/services/generation/generation-service'
import { OrderDetail } from '@/components/orders/order-detail'
import Link from 'next/link'

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/sign-in')
  }

  // Get current user
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/sign-in')
  }

  // Get the order ID from params
  const { id } = await params

  // Fetch order details
  const order = await getOrderById(id)

  // Check if viewer can access this order (only READY_FOR_PRINT and PRINTING orders)
  if (
    currentUser.role === 'viewer' &&
    order.status !== 'READY_FOR_PRINT' &&
    order.status !== 'PRINTING'
  ) {
    redirect('/orders')
  }

  // Fetch generation counts and completion status for each book configuration
  const generationCounts: Record<string, number> = {}
  const completedConfigs: Record<string, boolean> = {}
  if (currentUser.role === 'admin') {
    const allBookConfigs = order.line_items?.flatMap((item: any) => item.book_configurations || []) || []
    for (const config of allBookConfigs) {
      const generations = await generationService.getGenerationsByBookConfigId(config.id)
      generationCounts[config.id] = generations.length
      // Check if any generation is completed
      completedConfigs[config.id] = generations.some((g: any) => g.status === 'completed')
    }
  }

  return (
    <div className="space-y-4">
      {/* Back Button */}
      <Link
        href="/orders"
        className="inline-flex items-center gap-2 text-purple-900 hover:text-purple-700 font-bold transition-colors"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Назад към поръчките
      </Link>

      {/* Order Details */}
      <OrderDetail
        order={order}
        currentUser={currentUser}
        generationCounts={generationCounts}
        completedConfigs={completedConfigs}
      />
    </div>
  )
}
