import { PrismaClient } from '@prisma/client';
import { PrismaNeonHTTP } from '@prisma/adapter-neon';

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
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Configure the Neon connection string in .env'
    );
  }

  // PrismaNeonHTTP accepts the connection string directly (not the sql fn).
  const adapter = new PrismaNeonHTTP(connectionString);

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
