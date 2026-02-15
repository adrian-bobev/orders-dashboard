import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('PDFServiceClient');
const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL || 'http://localhost:4001';
const PDF_SERVICE_ACCESS_TOKEN = process.env.PDF_SERVICE_ACCESS_TOKEN;

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (PDF_SERVICE_ACCESS_TOKEN) {
    headers['x-access-token'] = PDF_SERVICE_ACCESS_TOKEN;
  }
  return headers;
}

export interface CleanupResult {
  ok: boolean;
  workId: string;
  cleaned: {
    uploads: boolean;
    tiffs: boolean;
  };
  message?: string;
  error?: string;
}

/**
 * Call PDF service cleanup endpoint to delete job files
 * @param workId - The work ID to clean up
 * @returns Cleanup result
 */
export async function cleanupPDFServiceJob(workId: string): Promise<CleanupResult> {
  try {
    logger.info(`Requesting cleanup for PDF service job`, { workId });

    const response = await fetch(`${PDF_SERVICE_URL}/cleanup/${workId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PDF service cleanup failed: ${response.status} ${text}`);
    }

    const result = await response.json();
    logger.info(`PDF service cleanup completed`, {
      workId,
      cleaned: result.cleaned
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`PDF service cleanup failed`, { workId, error: errorMessage });

    return {
      ok: false,
      workId,
      cleaned: { uploads: false, tiffs: false },
      error: errorMessage,
    };
  }
}
