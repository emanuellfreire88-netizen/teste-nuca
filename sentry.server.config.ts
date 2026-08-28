/**
 * Sentry server-side configuration.
 * Same sanitization rules as sentry.client.config.ts.
 */
import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN && process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.NODE_ENV,

    beforeSend(event) {
      // Sanitize request data
      if (event.request) {
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
        if (event.request.query_string) {
          event.request.query_string = String(event.request.query_string)
            .replace(/email=[^&]+/gi, 'email=***MASKED***')
            .replace(/cpf=[^&]+/gi, 'cpf=***MASKED***')
            .replace(/token=[^&]+/gi, 'token=***MASKED***');
        }
      }

      // Sanitize request body
      if (event.request?.data) {
        const data = event.request.data as Record<string, unknown>;
        const sensitiveKeys = [
          'password', 'newPassword', 'currentPassword', 'token', 'secret',
          'apiKey', 'authorization', 'cpf', 'rg', 'phone', 'guardian_phone',
          'guardian_email', 'emergency_contact', 'address', 'two_factor_secret',
          'verification_code', 'file_data',
        ];
        for (const key of Object.keys(data)) {
          if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
            data[key] = '***MASKED***';
          }
        }
      }

      return event;
    },

    ignoreErrors: [
      'NEXT_NOT_FOUND',
      'NEXT_REDIRECT',
    ],
  });
}
