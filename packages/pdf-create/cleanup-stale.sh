#!/bin/bash

# Cleanup script for orphaned files
# Deletes directories older than 24 hours

LOG_FILE="/var/log/pdf-service-cleanup.log"

echo "[$(date)] Starting stale file cleanup" >> "$LOG_FILE"

# Find and delete old upload directories
DELETED_UPLOADS=$(find /app/uploads -maxdepth 1 -type d -mtime +1 2>/dev/null | wc -l)
find /app/uploads -maxdepth 1 -type d -mtime +1 -exec rm -rf {} \; 2>/dev/null

# Find and delete old TIFF directories
DELETED_TIFFS=$(find /app/generated_cmyk_tiffs -maxdepth 1 -type d -mtime +1 2>/dev/null | wc -l)
find /app/generated_cmyk_tiffs -maxdepth 1 -type d -mtime +1 -exec rm -rf {} \; 2>/dev/null

echo "[$(date)] Cleanup complete: $DELETED_UPLOADS upload dirs, $DELETED_TIFFS TIFF dirs deleted" >> "$LOG_FILE"
