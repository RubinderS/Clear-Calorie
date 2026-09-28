#!/bin/sh
set -e

if [ -z "$NEXTAUTH_SECRET" ]; then
  echo "ERROR: NEXTAUTH_SECRET is required. Please provide it via environment variable."
  echo "Example: docker run -e NEXTAUTH_SECRET=your-random-secret ..."
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is required."
  exit 1
fi

echo "Applying database migrations..."
node /app/prisma-cli/node_modules/prisma/build/index.js migrate deploy \
  --schema /app/prisma/schema.prisma

exec "$@"
