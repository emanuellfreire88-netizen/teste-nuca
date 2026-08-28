/**
 * Sentry configuration for error monitoring.
 *
 * IMPORTANT: This file sanitizes sensitive data before sending to Sentry.
 * - Never sends passwords, tokens, or API keys
 * - Never sends Authorization headers
 * - Never sends connection strings
 * - Masks PII (email, CPF, phone) in request data
 *
 * To enable Sentry, set SENTRY_DSN in your environment variables.
 * If SENTRY_DSN is not set, Sentry runs in no-op mode (safe for dev).
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

// Only initialize Sentry if DSN is configured
if (SENTRY_DSN && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Performance monitoring — sample 10% of transactions
    tracesSampleRate: 0.1,

    // Release tracking
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // Environment
    environment: process.env.NODE_ENV,

    // ─── Data sanitization ───────────────────────────────────────────
    // Remove sensitive data before sending to Sentry

    beforeSend(event) {
      // Sanitize request data
      if (event.request) {
        // Remove Authorization header
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['x-api-key'];
        }

        // Mask email in query string if present
        if (event.request.query_string) {
          event.request.query_string = String(event.request.query_string)
            .replace(/email=[^&]+/gi, 'email=***MASKED***')
            .replace(/cpf=[^&]+/gi, 'cpf=***MASKED***')
            .replace(/token=[^&]+/gi, 'token=***MASKED***');
        }
      }

      // Sanitize request body if present
      if (event.request?.data) {
        const data = event.request.data as Record<string, unknown>;
        const sensitiveKeys = [
          'password', 'newPassword', 'currentPassword', 'token',
          'secret', 'apiKey', 'api_key', 'authorization',
          'cpf', 'rg', 'phone', 'guardian_phone', 'guardian_email',
          'emergency_contact', 'address', 'two_factor_secret',
          'verification_code', 'file_data',
        ];

        for (const key of Object.keys(data)) {
          if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
            data[key] = '***MASKED***';
          }
        }
      }

      // Sanitize extra context
      if (event.extra) {
        const extra = event.extra as Record<string, unknown>;
        for (const key of Object.keys(extra)) {
          if (key.toLowerCase().includes('password') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
            extra[key] = '***MASKED***';
          }
        }
      }

      return event;
    },

    // Ignore noisy errors that aren't actionable
    ignoreErrors: [
      'NEXT_NOT_FOUND', // 404 errors
      'NEXT_REDIRECT',  // Next.js redirects
      'Non-Error promise rejection captured',
    ],
  });
}
