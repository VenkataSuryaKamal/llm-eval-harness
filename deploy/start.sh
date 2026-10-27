#!/bin/sh
# Starts the private API and the public website in one container.
# If either process exits, the container exits, so the platform restarts it.
set -eu

# The site's server-side proxy must send the same secret the API expects.
export APP_API_KEY="${APP_API_KEY:-$(python -c 'import secrets; print(secrets.token_urlsafe(32))')}"
export BACKEND_API_KEY="$APP_API_KEY"
export BACKEND_URL="http://127.0.0.1:8000"
export DATABASE_URL="${DATABASE_URL:-sqlite:////app/data/eval_harness.db}"

cd /app/backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log &
API_PID=$!

# Wait (up to 60 s) until the API answers, so the site never serves pages without it.
python - <<'PY'
import time, urllib.request
for _ in range(120):
    try:
        urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=1)
        break
    except Exception:
        time.sleep(0.5)
else:
    raise SystemExit("API did not start")
PY

cd /app/frontend
PORT="${PORT:-10000}" HOSTNAME=0.0.0.0 node server.js &
WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null' TERM INT
# Exit as soon as either process stops.
while kill -0 $API_PID 2>/dev/null && kill -0 $WEB_PID 2>/dev/null; do sleep 2; done
kill $API_PID $WEB_PID 2>/dev/null || true
exit 1
