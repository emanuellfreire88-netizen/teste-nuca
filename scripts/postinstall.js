#!/usr/bin/env node
/**
 * postinstall.js — runs automatically after `npm install` / `bun install`.
 *
 * The project now uses Neon PostgreSQL permanently (both locally and in production).
 * This script simply runs `prisma generate` to ensure the Prisma client is ready.
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');

console.log('🔧 [postinstall] Running prisma generate...');
try {
  execSync('npx prisma generate', { stdio: 'inherit', cwd: root });
  console.log('✅ [postinstall] Prisma client generated');
} catch (err) {
  // Don't fail the whole install if generate fails — build step will report it.
  console.error('⚠️ [postinstall] prisma generate failed:', err.message);
  process.exit(0);
}
