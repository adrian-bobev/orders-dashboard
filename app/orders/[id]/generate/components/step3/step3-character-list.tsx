'use client'

import { useState, useEffect } from 'react'

interface Step3CharacterListProps {
  generationId: string
  onComplete: () => void
}

export function Step3CharacterList({ generationId, onComplete }: Step3CharacterListProps) {
  const [isExtracting, setIsExtracting] = useState(false)
  const [characters, setCharacters] = useState<any[]>([])
  const [isEditing, setIsEditing] = useState<string | null>(null)
  const [editedName, setEditedName] = useState('')
  const [editedType, setEditedType] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newCharacterName, setNewCharacterName] = useState('')

  useEffect(() => {
    loadCharacters()
  }, [generationId])

  const loadCharacters = async () => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step3/characters`)
      if (response.ok) {
        const data = await response.json()
        setCharacters(data.characters || [])
      }
    } catch (error) {
      console.error('Failed to load characters:', error)
    }
  }

  const handleExtract = async () => {
    setIsExtracting(true)
    try {
      const response = await fetch(`/api/generation/${generationId}/step3/extract-characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to extract characters')
      }

      const data = await response.json()
      setCharacters(data.characters || [])
      alert('Героите са извлечени успешно!')
    } catch (error) {
      console.error('Error extracting characters:', error)
      alert(error instanceof Error ? error.message : 'Грешка при извличане на герои')
    } finally {
      setIsExtracting(false)
    }
  }

  const handleAdd = async () => {
    if (!newCharacterName.trim()) return

    try {
      const response = await fetch(`/api/generation/${generationId}/step3/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterName: newCharacterName,
          characterType: 'character',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to add character')
      }

      setNewCharacterName('')
      setIsAdding(false)
      await loadCharacters()
    } catch (error) {
      console.error('Error adding character:', error)
      alert('Грешка при добавяне на герой')
    }
  }

  const handleEdit = (character: any) => {
    setIsEditing(character.id)
    setEditedName(character.character_name)
    setEditedType(character.character_type || 'character')
    setEditedDescription(character.description || '')
  }

  const handleSaveEdit = async (characterId: string) => {
    try {
      const response = await fetch(`/api/generation/${generationId}/step3/characters`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          characterName: editedName,
          characterType: editedType,
          description: editedDescription,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update character')
      }

      setIsEditing(null)
      await loadCharacters()
    } catch (error) {
      console.error('Error updating character:', error)
      alert('Грешка при обновяване на герой')
    }
  }

  const handleDelete = async (characterId: string) => {
    if (!confirm('Сигурни ли сте, че искате да изтриете този герой?')) return

    try {
      const response = await fetch(
        `/api/generation/${generationId}/step3/characters?characterId=${characterId}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        throw new Error('Failed to delete character')
      }

      await loadCharacters()
    } catch (error) {
      console.error('Error deleting character:', error)
      alert('Грешка при изтриване на герой')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-purple-900 mb-2">Стъпка 3: Списък с герои</h2>
        <p className="text-neutral-600">
          Извлечете героите от историята или добавете ръчно. Главният герой е изключен
          автоматично.
        </p>
      </div>

      {/* Extract Button */}
      {characters.length === 0 && (
        <div className="text-center py-8">
          <button
            onClick={handleExtract}
            disabled={isExtracting}
            className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold text-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExtracting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Обработка...
              </span>
            ) : (
              'Извлечи герои от историята'
            )}
          </button>
          <p className="text-sm text-neutral-500 mt-2">
            {process.env.NEXT_PUBLIC_USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === 'true'
              ? '(Mock режим - ще върне примерни герои)'
              : '(Ще използва OpenAI API)'}
          </p>
        </div>
      )}

      {/* Characters List */}
      {characters.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-purple-900">
              Герои ({characters.length})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setIsAdding(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors text-sm"
              >
                + Добави герой
              </button>
              <button
                onClick={handleExtract}
                disabled={isExtracting}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm"
              >
                Извлечи отново
              </button>
              <button
                onClick={onComplete}
                className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors text-sm"
              >
                Готово - Следваща стъпка
              </button>
            </div>
          </div>

          {/* Add New Character Form */}
          {isAdding && (
            <div className="bg-green-50 rounded-xl p-4 border-2 border-green-200">
              <h4 className="font-bold text-green-900 mb-3">Добави нов герой</h4>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newCharacterName}
                  onChange={(e) => setNewCharacterName(e.target.value)}
                  placeholder="Име на героя..."
                  className="flex-1 px-4 py-2 border-2 border-neutral-200 rounded-xl focus:border-green-400 focus:ring-2 focus:ring-green-200 outline-none"
                  onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                />
                <button
                  onClick={handleAdd}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors"
                >
                  Добави
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false)
                    setNewCharacterName('')
                  }}
                  className="px-4 py-2 bg-neutral-300 text-neutral-700 rounded-xl font-bold hover:bg-neutral-400 transition-colors"
                >
                  Отказ
                </button>
              </div>
            </div>
          )}

          {/* Characters Grid */}
          <div className="grid gap-3">
            {characters.map((character) => (
              <div
                key={character.id}
                className="bg-white rounded-xl p-4 border-2 border-purple-200 hover:border-purple-300 transition-all"
              >
                {isEditing === character.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-neutral-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none font-bold"
                    />
                    <input
                      type="text"
                      value={editedType}
                      onChange={(e) => setEditedType(e.target.value)}
                      placeholder="Тип (герой, обект, домашен любимец...)"
                      className="w-full px-3 py-2 border-2 border-neutral-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none text-sm"
                    />
                    <textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      placeholder="Описание (опционално)..."
                      className="w-full px-3 py-2 border-2 border-neutral-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-200 outline-none text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(character.id)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors text-sm"
                      >
                        Запази
                      </button>
                      <button
                        onClick={() => setIsEditing(null)}
                        className="px-3 py-1.5 bg-neutral-300 text-neutral-700 rounded-lg font-bold hover:bg-neutral-400 transition-colors text-sm"
                      >
                        Отказ
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-bold text-purple-900 text-lg">
                        {character.character_name}
                      </h4>
                      {character.character_type && (
                        <p className="text-sm text-neutral-600 mt-1">
                          Тип: {character.character_type}
                        </p>
                      )}
                      {character.description && (
                        <p className="text-sm text-neutral-700 mt-1">{character.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleEdit(character)}
                        className="p-2 bg-purple-100 text-purple-900 rounded-lg hover:bg-purple-200 transition-colors"
                        title="Редактирай"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(character.id)}
                        className="p-2 bg-red-100 text-red-900 rounded-lg hover:bg-red-200 transition-colors"
                        title="Изтрий"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
