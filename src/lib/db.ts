import { PrismaClient } from '@prisma/client';

// Only load .env in development. In production (Vercel), environment
// variables are provided by the platform and .env is not available.
if (process.env.NODE_ENV !== 'production') {
  const { config } = require('dotenv');
  const { resolve } = require('path');
  config({ path: resolve(process.cwd(), '.env'), override: true });
}

// Ensure DATABASE_URL is set — fall back to DIRECT_URL if needed
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
