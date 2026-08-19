#!/usr/bin/env bash
# Seed Neon (or any remote Postgres) with demo store + products.
# Usage: DATABASE_URL='postgresql://...' ./scripts/seed-neon.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: Set DATABASE_URL to your Neon connection string."
  echo "  DATABASE_URL='postgresql://...' ./scripts/seed-neon.sh"
  exit 1
fi

cd "$ROOT/apps/web"
echo "Pushing schema to database..."
npx prisma db push
echo "Seeding demo data..."
npm run db:seed
echo "Done. Demo org slug: luxeforless-demo"
