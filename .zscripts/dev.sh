#!/bin/bash
# Custom dev script for Neon PostgreSQL project
# This script is used by the start.sh boot process instead of the default flow.
# It preserves the Neon PostgreSQL configuration and properly sets up the project.

set -e

echo "[DEV] Starting Neon PostgreSQL project setup..."

# Step 1: Restore the Neon .env configuration (start.sh may have overwritten it)
# IMPORTANT: We must BOTH write the .env file AND export the environment variables
# because Next.js prioritizes env vars over .env file values.
echo "[DEV] Writing Neon PostgreSQL .env configuration..."
cat > /home/z/my-project/.env << 'ENVEOF'
DATABASE_URL="postgresql://neondb_owner:npg_ztuh93AHNfbn@ep-orange-brook-apv361yg-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:npg_ztuh93AHNfbn@ep-orange-brook-apv361yg.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require"
ENVEOF

# Also export to override any env vars set by the boot process
export DATABASE_URL="postgresql://neondb_owner:npg_ztuh93AHNfbn@ep-orange-brook-apv361yg-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require"
export DIRECT_URL="postgresql://neondb_owner:npg_ztuh93AHNfbn@ep-orange-brook-apv361yg.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require"

chown z:z /home/z/my-project/.env
echo "[DEV] .env and environment configured for Neon PostgreSQL"

# Step 2: Install dependencies
echo "[DEV] Installing dependencies..."
cd /home/z/my-project
sudo -u z bun install
echo "[DEV] Dependencies installed"

# Step 3: Generate Prisma client (no need for db:push since Neon is already in sync)
echo "[DEV] Generating Prisma client..."
sudo -u z bun run db:generate
echo "[DEV] Prisma client generated"

# Step 4: Start the development server
echo "[DEV] Starting development server..."
sudo -u z bun run dev &

# Wait for the dev server to be ready
echo "[DEV] Waiting for dev server to be ready..."
for i in $(seq 1 30); do
  if curl -s --connect-timeout 2 --max-time 5 "http://localhost:3000" > /dev/null 2>&1; then
    echo "[DEV] Dev server is ready!"
    break
  fi
  echo "[DEV] Attempt $i/30: Dev server not ready yet, waiting..."
  sleep 2
done

echo "[DEV] Setup complete!"
