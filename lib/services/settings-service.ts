import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SpeedySettings {
  clientId: number | null
  sendFrom: 'office' | 'address'
  dropoffOfficeId: number | null
  dropoffCityId: number | null
  dropoffCityName: string | null
  senderName: string | null
  senderPhone: string | null
}

// Helper to bypass TypeScript strict table checking for new tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSettingsTable(supabase: SupabaseClient<any>) {
  return supabase.from('app_settings')
}

/**
 * Get a setting value from the database
 */
export async function getSetting<T>(key: string): Promise<T | null> {
  const supabase = await createClient()

  const { data, error } = await getSettingsTable(supabase)
    .select('value')
    .eq('key', key)
    .single()

  if (error || !data) {
    return null
  }

  return data.value as T
}

/**
 * Set a setting value in the database
 */
export async function setSetting<T>(key: string, value: T, userId?: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await getSettingsTable(supabase)
    .upsert({
      key,
      value: value as unknown,
      updated_by: userId || null,
    })

  if (error) {
    throw new Error(`Failed to save setting ${key}: ${error.message}`)
  }
}

/**
 * Get all Speedy-related settings
 */
export async function getSpeedySettings(): Promise<SpeedySettings> {
  const supabase = await createClient()

  const { data, error } = await getSettingsTable(supabase)
    .select('key, value')
    .in('key', [
      'speedy_client_id',
      'speedy_send_from',
      'speedy_dropoff_office_id',
      'speedy_dropoff_city_id',
      'speedy_dropoff_city_name',
      'speedy_sender_name',
      'speedy_sender_phone',
    ])

  if (error) {
    console.error('Failed to fetch Speedy settings:', error)
    return {
      clientId: null,
      sendFrom: 'address',
      dropoffOfficeId: null,
      dropoffCityId: null,
      dropoffCityName: null,
      senderName: null,
      senderPhone: null,
    }
  }

  const settings: Record<string, unknown> = {}
  for (const row of data || []) {
    settings[row.key] = row.value
  }

  return {
    clientId: settings['speedy_client_id'] as number | null,
    sendFrom: (settings['speedy_send_from'] as 'office' | 'address') || 'address',
    dropoffOfficeId: settings['speedy_dropoff_office_id'] as number | null,
    dropoffCityId: settings['speedy_dropoff_city_id'] as number | null,
    dropoffCityName: settings['speedy_dropoff_city_name'] as string | null,
    senderName: settings['speedy_sender_name'] as string | null,
    senderPhone: settings['speedy_sender_phone'] as string | null,
  }
}

/**
 * Save all Speedy-related settings
 * Non-null values are upserted, null values are deleted (to unset the setting)
 */
export async function saveSpeedySettings(
  settings: Partial<SpeedySettings>,
  userId?: string
): Promise<void> {
  const supabase = await createClient()

  const updates: Array<{ key: string; value: unknown; updated_by: string | null }> = []
  const deletes: string[] = []

  // Helper to add to updates or deletes based on value
  const processSetting = (key: string, value: unknown) => {
    if (value !== undefined) {
      if (value === null) {
        deletes.push(key)
      } else {
        updates.push({ key, value, updated_by: userId || null })
      }
    }
  }

  processSetting('speedy_client_id', settings.clientId)
  processSetting('speedy_send_from', settings.sendFrom)
  processSetting('speedy_dropoff_office_id', settings.dropoffOfficeId)
  processSetting('speedy_dropoff_city_id', settings.dropoffCityId)
  processSetting('speedy_dropoff_city_name', settings.dropoffCityName)
  processSetting('speedy_sender_name', settings.senderName)
  processSetting('speedy_sender_phone', settings.senderPhone)

  // Delete null settings
  if (deletes.length > 0) {
    const { error: deleteError } = await getSettingsTable(supabase)
      .delete()
      .in('key', deletes)

    if (deleteError) {
      throw new Error(`Failed to delete Speedy settings: ${deleteError.message}`)
    }
  }

  // Upsert non-null settings
  if (updates.length > 0) {
    const { error: upsertError } = await getSettingsTable(supabase)
      .upsert(updates)

    if (upsertError) {
      throw new Error(`Failed to save Speedy settings: ${upsertError.message}`)
    }
  }
}
