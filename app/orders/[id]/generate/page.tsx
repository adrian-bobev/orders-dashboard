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
  searchParams: Promise<{ bookConfigId?: string; generationId?: string }>
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
  const { bookConfigId, generationId: selectedGenerationId } = await searchParams
  const order = await getOrderById(orderId)

  if (!order) {
    redirect('/orders')
  }

  // Find all book configurations in the order
  const allBookConfigs = order.line_items?.flatMap((item: any) => item.book_configurations || []) || []

  // If bookConfigId is specified, find that specific config
  // Otherwise, use the first one (backwards compatibility)
  let bookConfig = allBookConfigs.find((config: any) => config.id === bookConfigId)

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

  // Get all generations for this book config
  const allGenerations = await generationService.getGenerationsByBookConfigId(bookConfig.id)

  // Determine which generation to show
  let generation = allGenerations.find((g) => g.id === selectedGenerationId)

  // If no generation selected or not found, use most recent or create new one
  if (!generation) {
    if (allGenerations.length > 0) {
      generation = allGenerations[0] // Most recent (ordered by created_at desc)
    } else {
      // Create first generation if none exist
      generation = await generationService.createGeneration(bookConfig.id, currentUser.id)
    }
  }

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
            {allBookConfigs.map((config: any) => (
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

      {/* Generation Selector */}
      <div className="bg-white rounded-2xl shadow-warm p-4 border border-purple-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-purple-900">Генерации:</h2>
          <Link
            href={`/api/generation/create?bookConfigId=${bookConfig.id}&orderId=${orderId}`}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors text-sm flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Нова генерация
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {allGenerations.map((gen, index) => {
            const generationNumber = allGenerations.length - index
            const statusColors = {
              in_progress: 'bg-blue-100 text-blue-900 border-blue-200',
              completed: 'bg-green-100 text-green-900 border-green-200',
              failed: 'bg-red-100 text-red-900 border-red-200',
            }
            const isActive = gen.id === generation.id

            return (
              <Link
                key={gen.id}
                href={`/orders/${orderId}/generate?bookConfigId=${bookConfig.id}&generationId=${gen.id}`}
                className={`px-4 py-2 rounded-xl font-bold transition-colors border-2 ${
                  isActive
                    ? 'bg-purple-600 text-white border-purple-600'
                    : statusColors[gen.status as keyof typeof statusColors] ||
                      'bg-neutral-100 text-neutral-900 border-neutral-200 hover:bg-neutral-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>Генерация #{generationNumber}</span>
                  {gen.status === 'completed' && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {gen.status === 'failed' && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <div className="text-xs mt-1 opacity-80">
                  {new Date(gen.created_at).toLocaleDateString('bg-BG', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </Link>
            )
          })}
        </div>
      </div>

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
