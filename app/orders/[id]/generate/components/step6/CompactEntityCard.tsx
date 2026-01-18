import { getImageUrl } from '@/lib/r2-client'
import { SmartImage } from '@/components/SmartImage'

interface Entity {
  id: string
  character_name: string
  character_type: string
  description: string
  is_main_character: boolean
  is_custom: boolean
}

interface Reference {
  id: string
  image_key: string
  version: number
  image_prompt: string | null
}

interface CompactEntityCardProps {
  entity: Entity
  reference?: Reference
  bgColor: 'purple' | 'emerald'
  onRemove: () => void
}

export function CompactEntityCard({ entity, reference, bgColor, onRemove }: CompactEntityCardProps) {
  const colorClasses = {
    purple: {
      border: 'border-purple-200',
      text: 'text-purple-900',
      bg: 'bg-purple-600',
    },
    emerald: {
      border: 'border-emerald-200',
      text: 'text-emerald-900',
      bg: 'bg-emerald-600',
    },
  }

  const colors = colorClasses[bgColor]

  return (
    <div
      className={`flex-shrink-0 w-28 bg-white rounded-lg border-2 ${colors.border} p-2 hover:shadow-md transition-shadow`}
    >
      {reference ? (
        <div className="relative w-full h-20 rounded overflow-hidden mb-2 bg-neutral-100">
          <SmartImage
            src={getImageUrl(reference.image_key)}
            alt={entity.character_name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded font-bold">
            v{reference.version}
          </div>
        </div>
      ) : (
        <div className="w-full h-20 rounded bg-neutral-100 mb-2 flex items-center justify-center">
          <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}

      <div className="space-y-1">
        <p className={`text-xs font-bold ${colors.text} truncate leading-tight`} title={entity.character_name}>
          {entity.character_name}
        </p>

        <div className="flex items-center justify-between gap-1">
          {entity.is_main_character && (
            <span className={`text-[10px] ${colors.bg} text-white px-1 py-0.5 rounded font-bold`}>
              Главен
            </span>
          )}
          {entity.is_custom && (
            <span className="text-[10px] bg-neutral-600 text-white px-1 py-0.5 rounded font-bold">
              Custom
            </span>
          )}
        </div>

        <button
          onClick={onRemove}
          className="w-full mt-1 text-xs text-red-600 hover:text-red-800 font-bold hover:bg-red-50 rounded px-1 py-0.5 transition-colors"
        >
          Премахни
        </button>
      </div>
    </div>
  )
}
