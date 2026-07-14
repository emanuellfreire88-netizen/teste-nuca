/**
 * scripts/create-dev-admin.ts
 *
 * Creates (or updates) a dedicated admin user for development/testing.
 *
 * Why this exists:
 *   The AI agent helping develop this project needs admin access to verify
 *   end-to-end flows (login → generate PDF → inspect output) without having
 *   to reset the real user's password every time. This script creates an
 *   idempotent dev admin so the agent can authenticate as itself.
 *
 * Usage:
 *   bun run scripts/create-dev-admin.ts
 *
 * Idempotent: safe to re-run. If the user already exists, only the password
 * is rotated (so the script always produces a working login).
 *
 * Output:
 *   - Creates user with email DEV_ADMIN_EMAIL (default: dev-admin@nuca.local)
 *   - Password is set to DEV_ADMIN_PASSWORD (default: DevAdmin@2026)
 *   - Role: Admin, status: active, must_change_password: false
 *   - Writes the credentials to .dev-credentials for later reference
 */

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// ── Load .env manually (matches scripts/sync-neon-to-sqlite.js pattern) ──
// Always overwrite process.env with .env values so the script uses the file's
// DATABASE_URL even if the shell env has a stale/different value.
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Check your .env file.');
  process.exit(1);
}

const DEV_EMAIL = process.env.DEV_ADMIN_EMAIL || 'dev-admin@nuca.local';
const DEV_PASSWORD = process.env.DEV_ADMIN_PASSWORD || 'DevAdmin@2026';
const DEV_FULL_NAME = 'Administrador de Desenvolvimento';

async function main() {
  const sql = neon(DATABASE_URL);

  // Hash password (bcrypt salt rounds = 12, matching src/lib/seed.ts)
  const hashedPassword = await bcrypt.hash(DEV_PASSWORD, 12);

  // Idempotent upsert via ON CONFLICT — Postgres supports this on the unique
  // email column. Note: the Prisma schema marks `id` as @default(uuid()) but
  // that default is generated client-side by Prisma Client. When bypassing
  // Prisma with raw SQL, we use Postgres' built-in gen_random_uuid().
  const result = await sql`
    INSERT INTO users (
      id, full_name, email, password, role, status,
      must_change_password, two_factor_enabled,
      failed_login_attempts, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), ${DEV_FULL_NAME}, ${DEV_EMAIL}, ${hashedPassword}, 'Admin', 'active',
      false, false,
      0, NOW(), NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
      password = EXCLUDED.password,
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      must_change_password = EXCLUDED.must_change_password,
      two_factor_enabled = EXCLUDED.two_factor_enabled,
      failed_login_attempts = 0,
      locked_until = NULL,
      updated_at = NOW()
    RETURNING id, email, role, status
  `;

  const user = result[0];
  console.log('✅ Dev admin ready:');
  console.log('   id:    ', user.id);
  console.log('   email: ', user.email);
  console.log('   role:  ', user.role);
  console.log('   status:', user.status);

  // Persist credentials to .dev-credentials so future agent sessions can
  // pick them up without re-running the script.
  const credsPath = path.join(process.cwd(), '.dev-credentials');
  const credsContent = [
    '# Dev admin credentials for the NUCA platform',
    '# Created by scripts/create-dev-admin.ts',
    `# Last refreshed: ${new Date().toISOString()}`,
    `DEV_ADMIN_EMAIL=${DEV_EMAIL}`,
    `DEV_ADMIN_PASSWORD=${DEV_PASSWORD}`,
    `DEV_ADMIN_ID=${user.id}`,
    '',
  ].join('\n');
  fs.writeFileSync(credsPath, credsContent, { mode: 0o600 });
  console.log('✅ Credentials written to .dev-credentials (chmod 600)');
}

main().catch((err) => {
  console.error('❌ Failed to create dev admin:', err);
  process.exit(1);
});
