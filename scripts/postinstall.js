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

const isVercel = Boolean(process.env.VERCEL);

if (isVercel) {
  console.log('📦 [postinstall] Vercel environment detected');
  if (fs.existsSync(pgSchema)) {
    console.log('   → Swapping prisma/schema.prisma → PostgreSQL version');
    fs.copyFileSync(pgSchema, sqliteSchema);
  } else {
    console.warn('   ⚠️ prisma/schema.vercel.prisma not found — keeping SQLite schema');
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
