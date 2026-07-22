/* eslint-disable @typescript-eslint/no-require-imports */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Database client that auto-detects the environment:
 *
 * - SQLite (local dev):  DATABASE_URL starts with "file:"
 * - Neon PostgreSQL (Vercel):  DATABASE_URL starts with "postgresql://" or "postgres://"
 *
 * When a Driver Adapter is in use, Prisma does NOT read the DATABASE_URL
 * from the datasource block — the connection is handled entirely by the adapter.
 */
function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL || '';

  // ── SQLite (local development) ──
  if (dbUrl.startsWith('file:')) {
    // Dynamic require to avoid bundling SQLite adapter on Vercel
    const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
    const adapter = new PrismaBetterSqlite3({
      url: dbUrl,
    });
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  // ── Neon PostgreSQL (Vercel production) ──
  if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
    // Dynamic require to avoid bundling Neon adapter locally
    const { PrismaNeonHTTP } = require('@prisma/adapter-neon');
    const { Pool, neonConfig } = require('@neondatabase/serverless');

    // Fetch connection over HTTP (works in Vercel Edge/Serverless)
    neonConfig.fetchConnectionCache = true;

    const pool = new Pool({ connectionString: dbUrl });
    const adapter = new PrismaNeonHTTP(pool);

    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  // ── Fallback: no adapter (plain PrismaClient) ──
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
