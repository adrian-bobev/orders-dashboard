'use client'

import { useState } from 'react'
import { CompactEntityCard } from './CompactEntityCard'
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
  character_list_id: string
  image_key: string
  version: number
  image_prompt: string | null
  is_selected: boolean
}

interface EntitySelectionSectionProps {
  sceneId: string
  selectedCharacterIds: string[]
  selectedObjectIds: string[]
  allEntities: Entity[]
  allReferences: Reference[]
  onAdd: (sceneId: string, characterId: string) => void
  onRemove: (sceneId: string, characterId: string) => void
}

export function EntitySelectionSection({
  sceneId,
  selectedCharacterIds,
  selectedObjectIds,
  allEntities,
  allReferences,
  onAdd,
  onRemove,
}: EntitySelectionSectionProps) {
  const [showSelector, setShowSelector] = useState<'character' | 'object' | null>(null)

  // Separate entities by type
  const characters = allEntities.filter((e) => e.character_type === 'character')
  const objects = allEntities.filter((e) => e.character_type === 'object')

  // Get selected entities
  const selectedCharacters = characters.filter((c) => selectedCharacterIds.includes(c.id))
  const selectedObjects = objects.filter((o) => selectedObjectIds.includes(o.id))

  // Create reference map for quick lookup
  const referenceMap = new Map<string, Reference>()
  allReferences.forEach((ref) => {
    if (ref.is_selected) {
      referenceMap.set(ref.character_list_id, ref)
    }
  })

  const handleAddEntity = (entityId: string) => {
    onAdd(sceneId, entityId)
    setShowSelector(null)
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Characters Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-sm font-bold text-purple-900">
            Герои в тази сцена ({selectedCharacters.length})
          </h5>
          <button
            onClick={() => setShowSelector('character')}
            className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-2 py-1 rounded font-bold transition-colors"
          >
            + Добави герой
          </button>
        </div>

        {selectedCharacters.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {selectedCharacters.map((char) => (
              <CompactEntityCard
                key={char.id}
                entity={char}
                reference={referenceMap.get(char.id)}
                bgColor="purple"
                onRemove={() => onRemove(sceneId, char.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-500 italic">Няма избрани герои</p>
        )}
      </div>

      {/* Objects Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-sm font-bold text-emerald-900">
            Обекти в тази сцена ({selectedObjects.length})
          </h5>
          <button
            onClick={() => setShowSelector('object')}
            className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-2 py-1 rounded font-bold transition-colors"
          >
            + Добави обект
          </button>
        </div>

        {selectedObjects.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {selectedObjects.map((obj) => (
              <CompactEntityCard
                key={obj.id}
                entity={obj}
                reference={referenceMap.get(obj.id)}
                bgColor="emerald"
                onRemove={() => onRemove(sceneId, obj.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-500 italic">Няма избрани обекти</p>
        )}
      </div>

      {/* Entity Selector Modal */}
      {showSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold text-purple-900 mb-4">
              {showSelector === 'character' ? 'Изберете герой' : 'Изберете обект'}
            </h3>

            <div className="space-y-2 mb-6">
              {(showSelector === 'character' ? characters : objects)
                .filter(
                  (entity) =>
                    !(showSelector === 'character'
                      ? selectedCharacterIds
                      : selectedObjectIds
                    ).includes(entity.id)
                )
                .map((entity) => {
                  const ref = referenceMap.get(entity.id)
                  return (
                    <button
                      key={entity.id}
                      onClick={() => handleAddEntity(entity.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 hover:border-${
                        showSelector === 'character' ? 'purple' : 'emerald'
                      }-600 border-neutral-200 transition-all text-left`}
                    >
                      {ref && (
                        <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0 bg-neutral-100">
                          <SmartImage
                            src={getImageUrl(ref.image_key)}
                            alt={entity.character_name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-neutral-900 truncate">
                          {entity.character_name}
                        </div>
                        {entity.description && (
                          <div className="text-xs text-neutral-600 truncate">{entity.description}</div>
                        )}
                        <div className="flex gap-1 mt-1">
                          {entity.is_main_character && (
                            <span className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded font-bold">
                              Главен
                            </span>
                          )}
                          {entity.is_custom && (
                            <span className="text-xs bg-neutral-600 text-white px-1.5 py-0.5 rounded font-bold">
                              Custom
                            </span>
                          )}
                          {ref && (
                            <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded font-bold">
                              Има референция
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowSelector(null)}
                className="px-4 py-2 bg-neutral-300 text-neutral-700 rounded-xl font-bold hover:bg-neutral-400 transition-colors"
              >
                Затвори
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
