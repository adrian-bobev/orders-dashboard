#!/usr/bin/env tsx

/**
 * Fetch order from WooCommerce and sync images from R2 to MinIO
 * This combines fetch-order.ts and sync-order-images.js
 *
 * Usage:
 *   npm run fetch-and-sync <woocommerce-order-id>
 *
 * Example:
 *   npm run fetch-and-sync 1578
 */

import { execSync } from 'child_process';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

/**
 * Execute command and stream output
 */
function executeCommand(command: string, description: string): boolean {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔧 ${description}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    execSync(command, {
      stdio: 'inherit',
      env: process.env,
    });
    return true;
  } catch (error) {
    console.error(`\n❌ Failed: ${description}`);
    return false;
  }
}

/**
 * Main function
 */
async function fetchAndSyncOrder(wooOrderId: number) {
  console.log('🚀 Starting fetch and sync workflow...');
  console.log(`   WooCommerce Order ID: ${wooOrderId}\n`);

  // Step 1: Fetch order from WooCommerce and save to database
  const fetchSuccess = executeCommand(
    `npx tsx scripts/fetch-order.ts ${wooOrderId}`,
    'Step 1: Fetching order from WooCommerce'
  );

  if (!fetchSuccess) {
    console.error('\n❌ Failed to fetch order. Aborting.');
    process.exit(1);
  }

  // Step 2: Sync images from R2 to MinIO
  const syncSuccess = executeCommand(
    `node scripts/sync-order-images.js ${wooOrderId}`,
    'Step 2: Syncing images from R2 to MinIO'
  );

  if (!syncSuccess) {
    console.error('\n⚠️ Order fetched but image sync failed.');
    process.exit(1);
  }

  // Success
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Complete! Order fetched and images synced successfully!');
  console.log('='.repeat(60));
}

// Get order ID from command line
const wooOrderId = process.argv[2];

if (!wooOrderId) {
  console.error('❌ Error: Please provide a WooCommerce order ID');
  console.log('\nUsage:');
  console.log('  npm run fetch-and-sync <woocommerce-order-id>');
  console.log('\nExample:');
  console.log('  npm run fetch-and-sync 1578');
  console.log('\nThis script will:');
  console.log('  1. Fetch order data from WooCommerce');
  console.log('  2. Save order to database');
  console.log('  3. Sync order images from R2 to MinIO');
  process.exit(1);
}

// Validate order ID is a number
const orderIdNum = parseInt(wooOrderId, 10);
if (isNaN(orderIdNum)) {
  console.error('❌ Error: Order ID must be a number');
  process.exit(1);
}

// Run the workflow
fetchAndSyncOrder(orderIdNum);
