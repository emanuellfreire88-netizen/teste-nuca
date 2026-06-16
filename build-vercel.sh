#!/bin/bash
# Build script for Vercel deployment with Neon PostgreSQL
# This script swaps the Prisma schema to PostgreSQL before building

set -e

echo "🚀 Starting Vercel build process..."

# Check if we're on Vercel
if [ -n "$VERCEL" ]; then
  echo "📦 Detected Vercel environment - using PostgreSQL schema"
  
  # Swap schema to PostgreSQL version
  cp prisma/schema.vercel.prisma prisma/schema.prisma
  
  echo "✅ Schema swapped to PostgreSQL"
  
  # Generate Prisma client
  echo "🔧 Generating Prisma client..."
  npx prisma generate
  
  # Push schema to Neon database
  echo "📤 Pushing schema to Neon database..."
  npx prisma db push --accept-data-loss || echo "⚠️ db push failed, continuing..."
  
else
  echo "💻 Local development environment - keeping SQLite schema"
  npx prisma generate
fi

# Build Next.js
echo "🔨 Building Next.js application..."
next build

echo "✅ Build complete!"
