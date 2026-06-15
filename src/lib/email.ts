import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// In-memory rate limiter for email sending (per email)
const emailCooldowns = new Map<string, number>();
const COOLDOWN_MS = 60 * 1000; // 1 minute between emails per address
const MAX_ENTRIES = 1000;

function isEmailRateLimited(email: string): boolean {
  const lastSent = emailCooldowns.get(email);
  if (!lastSent) return false;
  return Date.now() - lastSent < COOLDOWN_MS;
}

function recordEmailSent(email: string): void {
  // Evict oldest entries if map is too large
  if (emailCooldowns.size >= MAX_ENTRIES) {
    const oldestKey = emailCooldowns.keys().next().value;
    if (oldestKey) emailCooldowns.delete(oldestKey);
  }
  emailCooldowns.set(email, Date.now());
}

export function generateVerificationCode(): string {
  // Generate a 6-digit code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVerificationEmail(
  toEmail: string,
  userName: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  // Check rate limit
  if (isEmailRateLimited(toEmail)) {
    return { success: false, error: 'Aguarde 1 minuto antes de solicitar um novo código.' };
  }

  try {
    const { error } = await resend.emails.send({
      from: 'Nuca Plataforma <onboarding@resend.dev>',
      to: [toEmail],
      subject: 'Seu código de verificação - Nuca Plataforma',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 0;">
            <tr>
              <td align="center">
                <table width="480" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #091829, #1e3a5f); padding: 32px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Nuca Plataforma</h1>
                      <p style="margin: 8px 0 0; color: rgba(255,255,255,0.6); font-size: 14px;">Sistema de Gestão Escolar</p>
                    </td>
                  </tr>
                  <!-- Body -->
                  <tr>
                    <td style="padding: 40px;">
                      <p style="margin: 0 0 8px; font-size: 16px; color: #18181b;">Olá, <strong>${userName}</strong>!</p>
                      <p style="margin: 0 0 24px; font-size: 14px; color: #71717a; line-height: 1.6;">
                        Recebemos uma tentativa de login na sua conta. Use o código abaixo para completar a autenticação:
                      </p>
                      <!-- Code Box -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 24px 0;">
                            <div style="display: inline-block; background-color: #f4f4f5; border: 2px dashed #d4d4d8; border-radius: 12px; padding: 16px 40px;">
                              <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #091829; font-family: 'Courier New', monospace;">${code}</span>
                            </div>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 24px 0 0; font-size: 13px; color: #a1a1aa; line-height: 1.6;">
                        Este código expira em <strong style="color: #71717a;">10 minutos</strong>. Se você não solicitou este código, ignore este e-mail.
                      </p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #fafafa; padding: 20px 40px; border-top: 1px solid #e4e4e7;">
                      <p style="margin: 0; text-align: center; font-size: 12px; color: #a1a1aa;">
                        Nuca Plataforma &copy; ${new Date().getFullYear()} — Sistema de Gestão Escolar
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: 'Erro ao enviar e-mail. Tente novamente.' };
    }

    recordEmailSent(toEmail);
    return { success: true };
  } catch (err) {
    console.error('Email send error:', err);
    return { success: false, error: 'Erro ao enviar e-mail. Tente novamente.' };
  }
}
