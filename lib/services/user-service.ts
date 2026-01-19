import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Database } from '@/lib/database.types'

type User = Database['public']['Tables']['users']['Row']

/**
 * Get the current authenticated user from the database
 * Returns null if not authenticated or user not found
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .eq('is_active', true)
    .single()

  return data
}

/**
 * Check if current user is authenticated admin.
 * Returns the user if authenticated as admin, or a NextResponse error to return from the route handler.
 *
 * Usage in API routes:
 * ```
 * const authResult = await requireAdmin()
 * if (authResult instanceof NextResponse) return authResult
 * const user = authResult
 * ```
 */
export async function requireAdmin(): Promise<User | NextResponse> {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return currentUser
}

/**
 * List all users (active and inactive)
 * Only accessible by admins
 */
export async function listAllUsers(): Promise<User[]> {
  const supabase = await createClient()

  // Check if current user is admin
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required')
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }

  return data || []
}

/**
 * List only active users
 * Only accessible by admins
 */
export async function listActiveUsers(): Promise<User[]> {
  const supabase = await createClient()

  // Check if current user is admin
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required')
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch active users: ${error.message}`)
  }

  return data || []
}

/**
 * Update a user's role
 * Only accessible by admins
 * Cannot update own role
 */
export async function updateUserRole(
  userId: string,
  newRole: 'admin' | 'viewer'
): Promise<void> {
  const supabase = await createClient()

  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required')
  }

  if (currentUser.id === userId) {
    throw new Error('Cannot update own role')
  }

  const { error } = await supabase
    .from('users')
    .update({ role: newRole })
    .eq('id', userId)
    .eq('is_active', true)

  if (error) {
    throw new Error(`Failed to update user role: ${error.message}`)
  }
}

/**
 * Soft delete a user (set is_active to false)
 * Only accessible by admins
 * Cannot remove self
 */
export async function removeUser(userId: string): Promise<void> {
  const supabase = await createClient()

  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required')
  }

  if (currentUser.id === userId) {
    throw new Error('Cannot remove self')
  }

  const { error } = await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to remove user: ${error.message}`)
  }
}

/**
 * Reactivate a previously removed user
 * Only accessible by admins
 */
export async function reactivateUser(userId: string): Promise<void> {
  const supabase = await createClient()

  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required')
  }

  const { error } = await supabase
    .from('users')
    .update({ is_active: true })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to reactivate user: ${error.message}`)
  }
}
