import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Use service role client to bypass RLS for script access
    const supabase = createServiceRoleClient();

    // First get the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError) {
      if (orderError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        );
      }
      throw new Error(`Failed to fetch order: ${orderError.message}`);
    }

    // Get line items
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('line_items')
      .select('*')
      .eq('order_id', id);

    if (lineItemsError) {
      throw new Error(`Failed to fetch line items: ${lineItemsError.message}`);
    }

    // Get book configurations for each line item
    if (lineItems && lineItems.length > 0) {
      const lineItemIds = lineItems.map((li) => li.id);
      const { data: bookConfigs, error: bookConfigsError } = await supabase
        .from('book_configurations')
        .select('*')
        .in('line_item_id', lineItemIds);

      if (bookConfigsError) {
        throw new Error(
          `Failed to fetch book configurations: ${bookConfigsError.message}`
        );
      }

      // Attach book configs to their respective line items
      lineItems.forEach((lineItem: any) => {
        lineItem.book_configurations = bookConfigs?.filter(
          (config) => config.line_item_id === lineItem.id
        );
      });
    }

    // Get status history
    const { data: statusHistory, error: statusHistoryError } = await supabase
      .from('order_status_history')
      .select('*')
      .eq('order_id', id)
      .order('changed_at', { ascending: false });

    if (statusHistoryError) {
      throw new Error(
        `Failed to fetch status history: ${statusHistoryError.message}`
      );
    }

    const result = {
      ...order,
      line_items: lineItems || [],
      order_status_history: statusHistory || [],
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch order',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
