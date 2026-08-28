/**
 * Audit logging for data export operations.
 *
 * Every export (PDF, Excel, CSV) must be logged to track who exported what,
 * when, and with which filters. This is critical for LGPD compliance and
 * data leakage prevention.
 *
 * Usage:
 *   import { logExport } from '@/lib/export-audit';
 *   await logExport(req, 'students_excel', { school_id: '...', status: 'active' }, 150);
 */

import { AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export type ExportType =
  | 'students_excel'
  | 'students_pdf'
  | 'attendance_excel'
  | 'attendance_sheet_pdf'
  | 'events_excel'
  | 'events_pdf'
  | 'reports_excel'
  | 'reports_pdf'
  | 'action_logs_excel'
  | 'student_profile_pdf'
  | 'student_authorization_pdf'
  | 'student_image_authorization_pdf'
  | 'student_participation_authorization_pdf'
  | 'document_pdf'
  | 'document_attachment_download'
  | 'certificate_download'
  | 'other';

/**
 * Log an export operation to the audit trail.
 * Does NOT log the actual data exported — only metadata.
 *
 * @param req - The authenticated request (for user ID + IP)
 * @param exportType - Type of export
 * @param filters - Filters applied (e.g., { school_id, status, date_from })
 * @param recordCount - Number of records exported
 */
export async function logExport(
  req: AuthenticatedRequest,
  exportType: ExportType,
  filters: Record<string, unknown> = {},
  recordCount?: number
): Promise<void> {
  const userId = req.user?.userId || null;

  // Sanitize filters — remove any values that might contain sensitive data
  const safeFilters: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    // Only log primitive values (strings, numbers, booleans)
    // Skip arrays, objects, and very long strings
    if (typeof value === 'string' && value.length < 200) {
      safeFilters[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      safeFilters[key] = value;
    }
  }

  const description = `Export: ${exportType}${recordCount !== undefined ? ` (${recordCount} registros)` : ''}${Object.keys(safeFilters).length > 0 ? ` — filtros: ${JSON.stringify(safeFilters)}` : ''}`;

  await logAction(userId, 'export_data', description, req);
}
