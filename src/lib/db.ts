import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env with override=true so that the file's PostgreSQL URLs take
// priority over the system env DATABASE_URL (which may be set to SQLite
// for other purposes). The project uses Neon PostgreSQL.
config({ path: resolve(process.cwd(), '.env'), override: true });

// Override DATABASE_URL at process.env level so PrismaClient validation passes.
// The pooled connection URL from .env works fine with PrismaClient directly.
if (!process.env.DATABASE_URL?.startsWith('postgresql://')) {
  process.env.DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL!;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
