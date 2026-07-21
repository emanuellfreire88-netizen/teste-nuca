import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

/**
 * Database client using SQLite via the better-sqlite3 adapter.
 *
 * The adapter factory receives the URL config directly so Prisma
 * can locate the SQLite file.  When a Driver Adapter is in use,
 * Prisma does NOT read the DATABASE_URL from the datasource block —
 * the connection is handled entirely by the adapter.
 */

const SQLITE_DB_PATH = '/home/z/my-project/db/custom.db';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: `file:${SQLITE_DB_PATH}`,
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
