import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Allow public access — this endpoint returns ONLY minimal status info.
// No secrets, no DB connection strings, no user data.
export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    // Simple DB connectivity check — lightweight query
    // Use a 3-second timeout to avoid hanging if Neon is cold-starting
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB timeout')), 3000)
      ),
    ]);

    return NextResponse.json({
      status: 'ok',
      timestamp,
      // Do NOT expose: DB version, connection string, user count, etc.
    });
  } catch {
    // Still return 200 with degraded status so uptime monitors don't alert
    // on transient cold-start delays. Return 503 only if truly down.
    return NextResponse.json(
      {
        status: 'degraded',
        timestamp,
      },
      { status: 503 }
    );
  }
}
