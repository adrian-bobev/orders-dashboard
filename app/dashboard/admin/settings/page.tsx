'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface SpeedyProfile {
  clientId: number
  clientName: string
  contactName: string
  address: {
    siteName: string
    streetName?: string
    streetNo?: string
  }
}

interface SpeedyOffice {
  id: number
  name: string
  address: {
    siteName: string
    fullAddressString?: string
  }
}

interface SpeedyCity {
  id: number
  name: string
  postCode?: string
}

interface SpeedySettings {
  clientId: number | null
  sendFrom: 'office' | 'address'
  dropoffOfficeId: number | null
  dropoffCityId: number | null
  dropoffCityName: string | null
  senderName: string | null
  senderPhone: string | null
}

export default function SettingsPage() {
  const [profiles, setProfiles] = useState<SpeedyProfile[]>([])
  const [offices, setOffices] = useState<SpeedyOffice[]>([])
  const [cities, setCities] = useState<SpeedyCity[]>([])
  const [settings, setSettings] = useState<SpeedySettings>({
    clientId: null,
    sendFrom: 'address',
    dropoffOfficeId: null,
    dropoffCityId: null,
    dropoffCityName: null,
    senderName: null,
    senderPhone: null,
  })

  const [selectedProfile, setSelectedProfile] = useState<number | null>(null)
  const [sendFrom, setSendFrom] = useState<'office' | 'address'>('address')
  const [selectedCity, setSelectedCity] = useState<SpeedyCity | null>(null)
  const [selectedOffice, setSelectedOffice] = useState<number | null>(null)
  const [senderName, setSenderName] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [citySearch, setCitySearch] = useState('')

  const [loading, setLoading] = useState(true)
  const [loadingOffices, setLoadingOffices] = useState(false)
  const [loadingCities, setLoadingCities] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Fetch profiles on mount
  useEffect(() => {
    fetchProfiles()
  }, [])

  // Fetch offices when city is selected
  useEffect(() => {
    if (selectedCity && sendFrom === 'office') {
      fetchOffices(selectedCity.id)
    }
  }, [selectedCity, sendFrom])

  const fetchProfiles = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/speedy/profiles')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to fetch profiles')
      }

      setProfiles(data.profiles || [])
      const currentSettings = data.currentSettings || {}
      setSettings(currentSettings)

      // Set initial selections from saved settings
      if (currentSettings.clientId) {
        setSelectedProfile(currentSettings.clientId)
      }
      if (currentSettings.sendFrom) {
        setSendFrom(currentSettings.sendFrom)
      }
      if (currentSettings.dropoffCityId && currentSettings.dropoffCityName) {
        setSelectedCity({
          id: currentSettings.dropoffCityId,
          name: currentSettings.dropoffCityName,
        })
        setCitySearch(currentSettings.dropoffCityName)
      }
      if (currentSettings.dropoffOfficeId) {
        setSelectedOffice(currentSettings.dropoffOfficeId)
      }
      if (currentSettings.senderName) {
        setSenderName(currentSettings.senderName)
      }
      if (currentSettings.senderPhone) {
        setSenderPhone(currentSettings.senderPhone)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch profiles')
    } finally {
      setLoading(false)
    }
  }

  const fetchOffices = async (cityId: number) => {
    try {
      setLoadingOffices(true)
      const response = await fetch(`/api/admin/speedy/offices?cityId=${cityId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to fetch offices')
      }

      setOffices(data.offices || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch offices')
    } finally {
      setLoadingOffices(false)
    }
  }

  const searchCities = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCities([])
      return
    }

    try {
      setLoadingCities(true)
      const response = await fetch(`/api/admin/speedy/cities?q=${encodeURIComponent(query)}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to search cities')
      }

      setCities(data.cities || [])
    } catch (err) {
      console.error('Error searching cities:', err)
    } finally {
      setLoadingCities(false)
    }
  }, [])

  // Debounce city search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (citySearch && !selectedCity) {
        searchCities(citySearch)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [citySearch, selectedCity, searchCities])

  const saveAllSettings = async () => {
    if (!selectedProfile) {
      setError('Моля, изберете профил')
      return
    }

    try {
      setSaving(true)
      setError(null)

      // Save profile
      const profileResponse = await fetch('/api/admin/speedy/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedProfile }),
      })

      if (!profileResponse.ok) {
        const data = await profileResponse.json()
        throw new Error(data.details || data.error || 'Failed to save profile')
      }

      // Save office settings (includes sendFrom mode)
      const officeResponse = await fetch('/api/admin/speedy/offices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendFrom,
          dropoffOfficeId: sendFrom === 'office' ? selectedOffice : null,
          dropoffCityId: sendFrom === 'office' ? selectedCity?.id : null,
          dropoffCityName: sendFrom === 'office' ? selectedCity?.name : null,
          senderName: senderName || null,
          senderPhone: senderPhone || null,
        }),
      })

      if (!officeResponse.ok) {
        const data = await officeResponse.json()
        throw new Error(data.details || data.error || 'Failed to save settings')
      }

      setSettings((prev) => ({
        ...prev,
        clientId: selectedProfile,
        sendFrom,
        dropoffOfficeId: sendFrom === 'office' ? selectedOffice : null,
        dropoffCityId: sendFrom === 'office' ? selectedCity?.id || null : null,
        dropoffCityName: sendFrom === 'office' ? selectedCity?.name || null : null,
        senderName: senderName || null,
        senderPhone: senderPhone || null,
      }))

      setSuccess('Настройките са запазени успешно!')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const selectCity = (city: SpeedyCity) => {
    setSelectedCity(city)
    setCitySearch(city.name)
    setCities([])
    setSelectedOffice(null)
    setOffices([])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-gray-600">Зареждане на настройки...</span>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="text-purple-600 hover:text-purple-700 transition-colors"
        >
          ← Назад към таблото
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Настройки на Speedy</h1>
        <p className="mt-2 text-gray-600">
          Конфигурирайте вашия Speedy акаунт за създаване на товарителници
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-700">{success}</p>
        </div>
      )}

      {/* Profile Selection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          1. Избор на профил (Client ID)
        </h2>
        <p className="text-gray-600 mb-4">
          Изберете профила, от който ще изпращате пратки
        </p>

        {profiles.length === 0 ? (
          <p className="text-amber-600">
            Няма намерени профили. Проверете дали SPEEDY_USERNAME и SPEEDY_PASSWORD са конфигурирани правилно.
          </p>
        ) : (
          <div className="grid gap-3">
            {profiles.map((profile) => (
              <label
                key={profile.clientId}
                className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedProfile === profile.clientId
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="profile"
                  value={profile.clientId}
                  checked={selectedProfile === profile.clientId}
                  onChange={() => setSelectedProfile(profile.clientId)}
                  className="w-4 h-4 text-purple-600"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {profile.clientName}
                  </div>
                  <div className="text-sm text-gray-500">
                    ID: {profile.clientId} • {profile.address.siteName}
                    {profile.address.streetName && `, ${profile.address.streetName}`}
                    {profile.address.streetNo && ` ${profile.address.streetNo}`}
                  </div>
                </div>
                {settings.clientId === profile.clientId && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                    Текущ
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Send From Mode */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          2. Начин на изпращане
        </h2>
        <p className="text-gray-600 mb-4">
          Изберете как ще предавате пратките на Speedy
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <label
            className={`flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
              sendFrom === 'address'
                ? 'border-purple-500 bg-purple-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input
              type="radio"
              name="sendFrom"
              value="address"
              checked={sendFrom === 'address'}
              onChange={() => setSendFrom('address')}
              className="w-4 h-4 text-purple-600 mt-1"
            />
            <div>
              <div className="font-medium text-gray-900">От адрес</div>
              <div className="text-sm text-gray-500">
                Куриер на Speedy ще вземе пратките от вашия регистриран адрес
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
              sendFrom === 'office'
                ? 'border-purple-500 bg-purple-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input
              type="radio"
              name="sendFrom"
              value="office"
              checked={sendFrom === 'office'}
              onChange={() => setSendFrom('office')}
              className="w-4 h-4 text-purple-600 mt-1"
            />
            <div>
              <div className="font-medium text-gray-900">От офис</div>
              <div className="text-sm text-gray-500">
                Вие ще занесете пратките до избран офис на Speedy
              </div>
            </div>
          </label>
        </div>

        {/* Office Selection (only if sendFrom === 'office') */}
        {sendFrom === 'office' && (
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Изберете офис за предаване
            </h3>

            {/* City Search */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Град
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={citySearch}
                  onChange={(e) => {
                    setCitySearch(e.target.value)
                    if (selectedCity && e.target.value !== selectedCity.name) {
                      setSelectedCity(null)
                      setOffices([])
                      setSelectedOffice(null)
                    }
                  }}
                  placeholder="Въведете име на град..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                {loadingCities && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                  </div>
                )}
              </div>

              {/* City Suggestions */}
              {cities.length > 0 && !selectedCity && (
                <div className="mt-2 border border-gray-200 rounded-lg shadow-lg bg-white max-h-48 overflow-y-auto">
                  {cities.map((city) => (
                    <button
                      key={city.id}
                      onClick={() => selectCity(city)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-medium">{city.name}</span>
                      {city.postCode && (
                        <span className="text-gray-500 ml-2">({city.postCode})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Office Selection */}
            {selectedCity && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Офис в {selectedCity.name}
                </label>

                {loadingOffices ? (
                  <div className="flex items-center gap-2 text-gray-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                    Зареждане на офиси...
                  </div>
                ) : offices.length === 0 ? (
                  <p className="text-amber-600">Няма намерени офиси в този град</p>
                ) : (
                  <select
                    value={selectedOffice || ''}
                    onChange={(e) => setSelectedOffice(parseInt(e.target.value, 10))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">Изберете офис...</option>
                    {offices.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name} - {office.address.fullAddressString || office.address.siteName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sender Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          3. Данни на подателя (по избор)
        </h2>
        <p className="text-gray-600 mb-4">
          Ако оставите полетата празни, ще се използват данните от профила
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Име на подателя
            </label>
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Име за контакт"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Телефон
            </label>
            <input
              type="text"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
              placeholder="Телефон за контакт"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveAllSettings}
          disabled={!selectedProfile || saving}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {saving ? 'Запазване...' : 'Запази всички настройки'}
        </button>
      </div>

      {/* Configuration Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Статус на конфигурацията
        </h2>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {settings.clientId ? (
              <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
            ) : (
              <span className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            )}
            <span className="text-gray-700">
              Client ID: {settings.clientId || 'Не е конфигуриран'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <span className="text-gray-700">
              Изпращане: {settings.sendFrom === 'office' ? 'От офис' : 'От адрес'}
              {settings.sendFrom === 'office' && settings.dropoffCityName && (
                <span className="text-gray-500"> ({settings.dropoffCityName})</span>
              )}
            </span>
          </div>

          {settings.sendFrom === 'office' && (
            <div className="flex items-center gap-3">
              {settings.dropoffOfficeId ? (
                <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              ) : (
                <span className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
              )}
              <span className="text-gray-700">
                Офис за предаване: {settings.dropoffOfficeId ? `ID ${settings.dropoffOfficeId}` : 'Не �� избран'}
              </span>
            </div>
          )}
        </div>

        {settings.clientId && (settings.sendFrom === 'address' || settings.dropoffOfficeId) && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700">
              ✓ Speedy е конфигуриран и готов за създаване на товарителници!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
