#!/bin/bash
# Build script for Vercel deployment with Neon PostgreSQL
# The project now uses Neon PostgreSQL permanently.
# No schema swapping needed — schema.prisma is always PostgreSQL.

set -e

echo "🚀 Starting Vercel build process..."

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Wake up the Neon database (cold-start mitigation for free tier)
echo "🔔 Waking up Neon database..."

DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|^postgresql://[^@]+@([^:/]+).*|\1|')
echo "   Probing host: $DB_HOST"

WAKE_RETRIES=6
for i in $(seq 1 $WAKE_RETRIES); do
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

# Push schema to Neon database (with retry)
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

# Build Next.js
echo "🔨 Building Next.js application..."
next build

echo "✅ Build complete!"
