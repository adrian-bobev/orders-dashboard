import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/services/user-service'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { generationId } = await params
    const supabase = await createClient()

    // Fetch all entities including the main character
    const { data: entities, error } = await supabase
      .from('generation_character_list')
      .select('*')
      .eq('generation_id', generationId)
      .order('sort_order', { ascending: true })
      .order('character_type', { ascending: true })

    if (error) {
      console.error('Error fetching entities:', error)
      return NextResponse.json(
        { error: 'Failed to fetch entities' },
        { status: 500 }
      )
    }

    return NextResponse.json({ entities: entities || [] })
  } catch (error) {
    console.error('Error in entities GET:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch entities' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { generationId } = await params
    const body = await request.json()
    const { characterName, characterType, description } = body

    if (!characterName || !characterType) {
      return NextResponse.json(
        { error: 'Character name and type are required' },
        { status: 400 }
      )
    }

    if (!['character', 'object'].includes(characterType)) {
      return NextResponse.json(
        { error: 'Invalid character type. Must be "character" or "object"' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get the highest sort_order for the given type
    const { data: existingEntities } = await supabase
      .from('generation_character_list')
      .select('sort_order')
      .eq('generation_id', generationId)
      .eq('character_type', characterType)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = existingEntities && existingEntities.length > 0
      ? (existingEntities[0].sort_order || 0) + 1
      : 0

    // Create the new entity
    const { data: newEntity, error } = await supabase
      .from('generation_character_list')
      .insert({
        generation_id: generationId,
        character_name: characterName,
        character_type: characterType,
        description: description || `Generate a reference image for ${characterType}: ${characterName}`,
        is_main_character: false,
        sort_order: nextSortOrder,
        is_custom: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating entity:', error)
      return NextResponse.json(
        { error: 'Failed to create entity' },
        { status: 500 }
      )
    }

    return NextResponse.json({ entity: newEntity })
  } catch (error) {
    console.error('Error in entities POST:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create entity' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ generationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { generationId } = await params
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entityId')

    if (!entityId) {
      return NextResponse.json(
        { error: 'Entity ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Only allow deletion of custom entities
    const { data: entity } = await supabase
      .from('generation_character_list')
      .select('is_custom')
      .eq('id', entityId)
      .eq('generation_id', generationId)
      .single()

    if (!entity?.is_custom) {
      return NextResponse.json(
        { error: 'Only custom entities can be deleted' },
        { status: 403 }
      )
    }

    const { error } = await supabase
      .from('generation_character_list')
      .delete()
      .eq('id', entityId)
      .eq('generation_id', generationId)

    if (error) {
      console.error('Error deleting entity:', error)
      return NextResponse.json(
        { error: 'Failed to delete entity' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in entities DELETE:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete entity' },
      { status: 500 }
    )
  }
}
