import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { cleanupOrderPreviewImages } from '@/lib/services/r2-cleanup';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('CleanupPreviewsAPI');

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Get order data
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('woocommerce_order_id')
      .eq('id', id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!order.woocommerce_order_id) {
      return NextResponse.json(
        { error: 'Order has no WooCommerce ID' },
        { status: 400 }
      );
    }

    logger.info('Manual preview cleanup requested', {
      orderId: id,
      wooOrderId: order.woocommerce_order_id,
    });

    // Cleanup R2 preview images
    const cleanupResult = await cleanupOrderPreviewImages(order.woocommerce_order_id);

    // Update cleanup status
    const cleanupUpdate = cleanupResult.success
      ? { preview_cleanup_status: 'completed', preview_cleanup_error: null }
      : {
          preview_cleanup_status: 'failed',
          preview_cleanup_error: cleanupResult.error,
        };

    const { error: updateError } = await supabase
      .from('orders')
      .update(cleanupUpdate)
      .eq('id', id);

    if (updateError) {
      logger.error('Failed to update cleanup status', {
        orderId: id,
        error: updateError.message,
      });
    }

    if (!cleanupResult.success) {
      logger.error('Manual preview cleanup failed', {
        orderId: id,
        error: cleanupResult.error,
      });

      return NextResponse.json(
        {
          success: false,
          error: cleanupResult.error,
        },
        { status: 500 }
      );
    }

    logger.info('Manual preview cleanup completed', {
      orderId: id,
      deletedCount: cleanupResult.deletedCount,
    });

    return NextResponse.json({
      success: true,
      deletedCount: cleanupResult.deletedCount,
      message: `Successfully deleted ${cleanupResult.deletedCount} preview images`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Manual preview cleanup error', {
      error: errorMessage,
    });

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
