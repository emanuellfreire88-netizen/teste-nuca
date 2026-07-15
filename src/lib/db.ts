import { PrismaClient } from '@prisma/client';
import { PrismaNeonHTTP } from '@prisma/adapter-neon';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Database client connected to Neon (PostgreSQL) via the HTTP adapter.
 *
 * Why HTTP adapter?
 *   The cloud sandbox blocks outbound TCP on port 5432, so Prisma's default
 *   TCP-based Postgres driver cannot reach Neon directly. Neon's serverless
 *   driver speaks HTTPS (port 443), which is allowed. PrismaNeonHTTP wires
 *   that HTTPS driver under PrismaClient.
 *
 * Connection strings (in .env):
 *   - DATABASE_URL  → Neon pooler URL (used here at runtime, over HTTPS)
 *   - DIRECT_URL    → Neon direct URL (used by `prisma db push` for DDL)
 *
 * IMPORTANT: The sandbox shell exports `DATABASE_URL=file:.../custom.db`
 * (a SQLite path) which would override the .env Neon URL and break the
 * Neon adapter. We detect and ignore non-PostgreSQL values here, falling
 * back to the .env file directly.
 */

/**
 * Read a variable from the .env file on disk.
 * Returns the raw value (without quotes) or undefined if not found.
 */
function readEnvFile(key: string): string | undefined {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf-8');
    const match = content.match(
      new RegExp(`^${key}=(.*)$`, 'm')
    );
    if (match) {
      // Strip surrounding quotes and whitespace
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // .env file might not exist in some environments
  }
  return undefined;
}

/**
 * Resolve the correct DATABASE_URL to use.
 *
 * Priority:
 *  1. process.env.DATABASE_URL — IF it starts with `postgresql://`
 *     (the sandbox shell sets it to a SQLite `file:` path, which we skip)
 *  2. The value from the .env file (always PostgreSQL / Neon)
 */
function resolveDatabaseUrl(): string {
  const envVal = process.env.DATABASE_URL;
  if (envVal && envVal.startsWith('postgresql://')) {
    return envVal;
  }

  // Check NEON_DATABASE_URL from env or .env file (fallback when DATABASE_URL is SQLite)
  const neonEnvVal = process.env.NEON_DATABASE_URL;
  if (neonEnvVal && neonEnvVal.startsWith('postgresql://')) {
    return neonEnvVal;
  }

  const neonFileVal = readEnvFile('NEON_DATABASE_URL');
  if (neonFileVal && neonFileVal.startsWith('postgresql://')) {
    return neonFileVal;
  }

  const fileVal = readEnvFile('DATABASE_URL');
  if (fileVal && fileVal.startsWith('postgresql://')) {
    return fileVal;
  }

  throw new Error(
    'DATABASE_URL is not set or is not a PostgreSQL connection string. ' +
      'Configure the Neon connection string in .env ' +
      '(current value: ' +
      (envVal || 'undefined') +
      ')'
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = resolveDatabaseUrl();

  // PrismaNeonHTTP accepts the connection string directly (not the sql fn).
  // Second argument is required HTTPQueryOptions (empty = use defaults).
  const adapter = new PrismaNeonHTTP(connectionString, {});

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
