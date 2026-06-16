#!/bin/bash
# Build script for Vercel deployment with Neon PostgreSQL
# This script swaps the Prisma schema to PostgreSQL before building.
#
# Neon (free tier) auto-suspends the database after ~5 min of inactivity.
# A suspended DB can cause `prisma db push` to time out during the Vercel
# build. To work around this we:
#   1. "Wake up" the database with a tiny TCP connection retry loop.
#   2. Retry `prisma db push` up to 3 times.

set -e

echo "🚀 Starting Vercel build process..."

# Check if we're on Vercel
if [ -n "$VERCEL" ]; then
  echo "📦 Detected Vercel environment - using PostgreSQL schema"

  # Swap schema to PostgreSQL version
  cp prisma/schema.vercel.prisma prisma/schema.prisma
  echo "✅ Schema swapped to PostgreSQL"

  # Generate Prisma client (works even if DB is suspended — no connection needed)
  echo "🔧 Generating Prisma client..."
  npx prisma generate

  # --------------------------------------------------------------------
  # Wake up the Neon database before running migrations.
  # Neon's free tier suspends idle databases; the first TCP connection
  # can take 5-15s to resume. We probe with a short timeout and retry
  # so the actual `prisma db push` doesn't hit a cold-start timeout.
  # --------------------------------------------------------------------
  echo "🔔 Waking up Neon database (cold-start mitigation)..."

  # Extract host from DATABASE_URL for the TCP probe.
  DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|^postgresql://[^@]+@([^:/]+).*|\1|')
  echo "   Probing host: $DB_HOST"

  WAKE_RETRIES=6
  for i in $(seq 1 $WAKE_RETRIES); do
    # Try a quick TCP connect (5s timeout). Neon listens on 5432.
    if node -e "
      const net = require('net');
      const s = net.createConnection(5432, '$DB_HOST');
      s.setTimeout(5000);
      s.on('connect', () => { console.log('   ✓ TCP connect OK'); s.end(); process.exit(0); });
      s.on('timeout', () => { console.error('   ⏱  timeout'); s.destroy(); process.exit(1); });
      s.on('error', (e) => { console.error('   ✗', e.message); process.exit(1); });
    " 2>&1; then
      echo "   ✅ Database is responsive (attempt $i/$WAKE_RETRIES)"
      break
    else
      echo "   ⏳ Attempt $i/$WAKE_RETRIES failed, waiting 3s..."
      sleep 3
    fi
  done

  # --------------------------------------------------------------------
  # Push schema to Neon database (with retry).
  # `db push` ensures the DB schema matches prisma/schema.prisma.
  # Retries handle transient cold-start / connection timeouts.
  # --------------------------------------------------------------------
  echo "📤 Pushing schema to Neon database..."
  PUSH_RETRIES=3
  for i in $(seq 1 $PUSH_RETRIES); do
    if npx prisma db push --accept-data-loss; then
      echo "   ✅ db push succeeded (attempt $i/$PUSH_RETRIES)"
      break
    else
      if [ "$i" -eq "$PUSH_RETRIES" ]; then
        echo "   ⚠️ db push failed after $PUSH_RETRIES attempts — continuing anyway"
        echo "   (schema may already be in sync; runtime queries will still work)"
      else
        echo "   ⚠️ db push attempt $i failed, retrying in 5s..."
        sleep 5
      fi
    fi
  done

else
  echo "💻 Local development environment - keeping SQLite schema"
  npx prisma generate
fi

# Build Next.js
echo "🔨 Building Next.js application..."
next build

echo "✅ Build complete!"
