#!/usr/bin/env node
/**
 * postinstall.js — runs automatically after `npm install` / `bun install`.
 *
 * Problem we're solving:
 *   The default `postinstall: "prisma generate"` runs BEFORE build-vercel.sh
 *   has a chance to swap the schema. On Vercel, that means `prisma generate`
 *   runs against prisma/schema.prisma (provider = "sqlite") while DATABASE_URL
 *   points at Neon (PostgreSQL). Prisma 6 validates the URL against the
 *   provider and aborts with:
 *     "Error validating datasource `db`: the URL must start with the
 *      protocol `file:`"
 *
 * Fix:
 *   - On Vercel ($VERCEL set): copy the PostgreSQL schema over the SQLite
 *     one BEFORE running `prisma generate`, so the client is generated for
 *     the correct provider.
 *   - Locally: do nothing extra; just run `prisma generate` against the
 *     existing SQLite schema.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sqliteSchema = path.join(root, 'prisma', 'schema.prisma');
const pgSchema = path.join(root, 'prisma', 'schema.vercel.prisma');

// Detect Vercel build environment. Vercel sets several env vars during build;
// we check multiple to be robust across different install/cache scenarios.
const isVercel = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.VERCEL_URL ||
  process.env.NOW_BUILDER
);

// Also detect: if DATABASE_URL looks like PostgreSQL but schema is SQLite,
// we MUST swap — otherwise prisma generate will fail with P1012.
const dbUrl = process.env.DATABASE_URL || '';
const isPostgresUrl = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');

if (isVercel) {
  console.log('📦 [postinstall] Vercel environment detected (VERCEL=' + (process.env.VERCEL || 'unset') + ')');
  console.log('   DATABASE_URL starts with: ' + (dbUrl ? dbUrl.split('://')[0] + '://' : '(empty)'));
  if (fs.existsSync(pgSchema)) {
    console.log('   → Swapping prisma/schema.prisma → PostgreSQL version');
    fs.copyFileSync(pgSchema, sqliteSchema);
  } else {
    console.warn('   ⚠️ prisma/schema.vercel.prisma not found — keeping SQLite schema');
  }
} else if (isPostgresUrl) {
  // Fallback: even if VERCEL env var isn't detected, if DATABASE_URL is
  // PostgreSQL we must use the PG schema (otherwise prisma generate fails).
  console.log('📦 [postinstall] PostgreSQL DATABASE_URL detected (non-Vercel cloud build)');
  if (fs.existsSync(pgSchema)) {
    console.log('   → Swapping prisma/schema.prisma → PostgreSQL version');
    fs.copyFileSync(pgSchema, sqliteSchema);
  }
}

console.log('🔧 [postinstall] Running prisma generate...');
try {
  execSync('npx prisma generate', { stdio: 'inherit', cwd: root });
  console.log('✅ [postinstall] Prisma client generated');
} catch (err) {
  // Don't fail the whole install if generate fails — build step will report it.
  console.error('⚠️ [postinstall] prisma generate failed:', err.message);
  process.exit(0);
}
