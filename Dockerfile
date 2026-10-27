# One container for a free public demo (Render, Fly.io, Railway, any Docker host).
# Only the Next.js site is exposed. The FastAPI backend listens on 127.0.0.1 inside
# the container, so the internet can never reach it directly.

# ---- 1. Build the frontend ---------------------------------------------------
FROM node:22-slim AS web
WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
# Exact versions from the lockfile; install scripts disabled (a common malware vector).
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# ---- 2. Runtime: Python for the API + the Node binary for the site -----------
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node
# Node needs the C++ runtime library; slim Python images may not ship it.
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend/app backend/app
COPY --from=web /web/.next/standalone frontend/
COPY --from=web /web/.next/static frontend/.next/static
COPY --from=web /web/public frontend/public
COPY deploy/start.sh /app/start.sh

RUN useradd --create-home --uid 10001 appuser && mkdir -p /app/data && chown -R appuser /app/data && chmod 755 /app/start.sh
USER appuser

EXPOSE 10000
CMD ["/app/start.sh"]
