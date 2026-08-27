/**
 * Validation utilities using Zod for API endpoint input.
 *
 * Usage in route handlers:
 *   import { validateBody, validateQuery, validateParams } from '@/lib/validation';
 *   import { z } from 'zod';
 *
 *   const createSchema = z.object({
 *     full_name: z.string().min(1).max(255),
 *     email: z.string().email().max(255),
 *     role: z.enum(['Admin', 'Operator', 'Viewer']),
 *   });
 *
 *   const result = validateBody(createSchema, body);
 *   if (!result.success) return result.error;
 *   const data = result.data; // typed
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: NextResponse };

/**
 * Validate a request body against a Zod schema.
 * Returns the parsed data on success, or a 400 NextResponse on failure.
 */
export function validateBody<T>(
  schema: z.ZodType<T>,
  body: unknown
): ValidationResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: NextResponse.json(
      {
        error: 'Dados inválidos',
        details: result.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 }
    ),
  };
}

/**
 * Validate query parameters against a Zod schema.
 * Query params are always strings, so the schema should use z.coerce for numbers.
 */
export function validateQuery<T>(
  schema: z.ZodType<T>,
  query: Record<string, string | string[] | undefined>
): ValidationResult<T> {
  const result = schema.safeParse(query);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: NextResponse.json(
      {
        error: 'Parâmetros inválidos',
        details: result.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 }
    ),
  };
}

// ─── Reusable schema fragments ──────────────────────────────────────────────

export const uuidSchema = z.string().uuid('ID inválido');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const emailSchema = z
  .string()
  .email('Email inválido')
  .max(255, 'Email muito longo')
  .toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, 'Mínimo de 8 caracteres')
  .max(128, 'Máximo de 128 caracteres');

export const roleSchema = z.enum(['Admin', 'Operator', 'Viewer']);

export const documentTypeSchema = z.enum([
  'oficio', 'memorando', 'declaracao', 'convite', 'comunicado',
  'solicitacao_transporte', 'solicitacao_espaco', 'solicitacao_alimentacao',
  'encaminhamento', 'relatorio', 'certificado', 'outros',
]);

export const documentStatusSchema = z.enum([
  'draft', 'generated', 'printed', 'signed', 'sent', 'received', 'archived', 'cancelled',
]);

export const eventStatusSchema = z.enum([
  'upcoming', 'ongoing', 'completed', 'cancelled',
]);

export const eventCategorySchema = z.enum([
  'sports', 'cultural', 'party', 'academic', 'other',
]);

export const studentStatusSchema = z.enum(['active', 'inactive']);

export const authorizationStatusSchema = z.enum([
  'authorized', 'not_authorized', 'pending',
]);

export const attendanceStatusSchema = z.enum(['present', 'absent']);

/**
 * Sanitize a string to prevent stored XSS (basic — removes < > " ').
 * For HTML content, use sanitizeHtml from @/lib/sanitize instead.
 */
export const safeString = (max = 255) =>
  z
    .string()
    .max(max, `Máximo de ${max} caracteres`)
    .transform((s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim());

/**
 * Optional string that allows null/undefined/empty.
 */
export const optionalString = (max = 255) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((s) => (s === '' ? null : s));
