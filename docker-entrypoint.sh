#!/bin/bash
# Starts the bundled MongoDB unless DATABASE_URL points elsewhere, applies
# data migrations, then runs the app. On stop, the app exits before MongoDB.
set -euo pipefail

if [ -z "${NEXTAUTH_SECRET:-}" ]; then
  echo "ERROR: NEXTAUTH_SECRET is required. Please provide it via environment variable."
  echo "Example: docker run -e NEXTAUTH_SECRET=your-random-secret ..."
  exit 1
fi

DATA_DIR=/app/data

mongod_pid=""
app_pid=""

stop() {
  if [ -n "$app_pid" ]; then
    kill -TERM "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  if [ -n "$mongod_pid" ]; then
    echo "Stopping MongoDB..."
    kill -TERM "$mongod_pid" 2>/dev/null || true
    wait "$mongod_pid" 2>/dev/null || true
  fi
}
trap 'stop; exit 0' TERM INT

if [ -z "${DATABASE_URL:-}" ]; then
  mkdir -p "$DATA_DIR/db"
  echo "Starting bundled MongoDB (log: $DATA_DIR/mongod.log)..."
  # Bound to localhost: only the app inside this container can reach it.
  mongod \
    --dbpath "$DATA_DIR/db" \
    --bind_ip 127.0.0.1 \
    --port 27017 \
    --wiredTigerCacheSizeGB "${MONGO_CACHE_SIZE_GB:-0.25}" \
    --logpath "$DATA_DIR/mongod.log" \
    --logappend &
  mongod_pid=$!
  export DATABASE_URL="mongodb://127.0.0.1:27017/clearcalorie"

  for _ in $(seq 1 60); do
    if mongosh --quiet --eval "db.adminCommand('ping').ok" "$DATABASE_URL" > /dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$mongod_pid" 2>/dev/null; then
      echo "ERROR: MongoDB exited during startup. Last log lines:"
      tail -n 20 "$DATA_DIR/mongod.log" || true
      echo "MongoDB 5+ needs a CPU with AVX (x86) or ARMv8.2 (e.g. not a Raspberry Pi 4)."
      echo "On such hardware, set DATABASE_URL to an external MongoDB instead."
      exit 1
    fi
    sleep 1
  done
  if ! mongosh --quiet --eval "db.adminCommand('ping').ok" "$DATABASE_URL" > /dev/null 2>&1; then
    echo "ERROR: MongoDB didn't start within 60 seconds; see $DATA_DIR/mongod.log"
    stop
    exit 1
  fi
fi

echo "Applying database migrations..."
node /app/migrate-cli/node_modules/migrate-mongo/bin/migrate-mongo.js up \
  -f /app/migrate-mongo-config.js

# Run the app as a child, not exec'd, so MongoDB can be stopped after it.
"$@" &
app_pid=$!
set +e
wait "$app_pid"
status=$?
app_pid=""
stop
exit "$status"
