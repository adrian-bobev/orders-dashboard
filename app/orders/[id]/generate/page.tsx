import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/services/user-service'
import { getOrderById } from '@/lib/services/order-service'
import { generationService } from '@/lib/services/generation/generation-service'
import { GenerationWorkflow } from './components/generation-workflow'
import { DeleteGenerationButton } from './components/delete-generation-button'
import Link from 'next/link'

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function GeneratePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ bookConfigId?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) redirect('/sign-in')

  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    redirect('/orders')
  }

  const { id: orderId } = await params
  const { bookConfigId } = await searchParams
  const order = await getOrderById(orderId)

  if (!order) {
    redirect('/orders')
  }

  // Find all book configurations in the order
  const allBookConfigs = order.line_items?.flatMap((item) => item.book_configurations || []) || []

  // If bookConfigId is specified, find that specific config
  // Otherwise, use the first one (backwards compatibility)
  let bookConfig = allBookConfigs.find((config) => config.id === bookConfigId)

  if (!bookConfig && allBookConfigs.length > 0) {
    bookConfig = allBookConfigs[0]
  }

  if (!bookConfig) {
    return (
      <div className="space-y-4">
        <Link
          href={`/orders/${orderId}`}
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
          Назад към поръчка
        </Link>

        <div className="bg-white rounded-2xl shadow-warm p-6 border border-purple-100">
          <h1 className="text-xl font-bold text-red-600">Няма книжна конфигурация</h1>
          <p className="text-neutral-600 mt-2">
            Тази поръчка няма свързана книжна конфигурация за генериране.
          </p>
        </div>
      </div>
    )
  }

  // Get or create generation for this book config
  const generation = await generationService.getOrCreateGeneration(
    bookConfig.id,
    currentUser.id
  )

  return (
    <div className="space-y-4">
      {/* Back Button */}
      <Link
        href={`/orders/${orderId}`}
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
        Назад към поръчка
      </Link>

      {/* Book Selector - Show if multiple books */}
      {allBookConfigs.length > 1 && (
        <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
          <h2 className="text-sm font-bold text-purple-900 mb-3">Избери книга:</h2>
          <div className="flex flex-wrap gap-2">
            {allBookConfigs.map((config) => (
              <Link
                key={config.id}
                href={`/orders/${orderId}/generate?bookConfigId=${config.id}`}
                className={`px-4 py-2 rounded-xl font-bold transition-colors ${
                  config.id === bookConfig.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-purple-100 text-purple-900 hover:bg-purple-200'
                }`}
              >
                {config.name} ({config.age} год., {config.gender})
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-purple-900 mb-2">
              Генериране на книга: {bookConfig.name}
            </h1>
            <p className="text-neutral-600">Поръчка #{order.woocommerce_order_id}</p>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <div>
                <span className="text-neutral-600">Възраст:</span>{' '}
                <span className="font-bold text-purple-900">{bookConfig.age}</span>
              </div>
              <div>
                <span className="text-neutral-600">Пол:</span>{' '}
                <span className="font-bold text-purple-900">{bookConfig.gender}</span>
              </div>
            </div>
          </div>
          <div>
            <DeleteGenerationButton
              generationId={generation.id}
              orderId={orderId}
              bookConfigName={bookConfig.name}
            />
          </div>
        </div>
      </div>

      {/* Generation Workflow */}
      <GenerationWorkflow
        key={generation.id}
        generation={generation}
        bookConfig={bookConfig}
        orderId={orderId}
      />
    </div>
  )
}
