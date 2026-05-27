import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Resolve DATABASE_URL: if it points to SQLite (file:), fall back to DIRECT_URL or
// the env var explicitly set for PostgreSQL.  This handles environments where a
// system-level SQLite URL shadows the .env PostgreSQL URL.
function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (url && !url.startsWith('file:')) return url;
  // System env was SQLite – use DIRECT_URL instead (PostgreSQL)
  return process.env.DIRECT_URL || url;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasourceUrl: resolveDatabaseUrl(),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
