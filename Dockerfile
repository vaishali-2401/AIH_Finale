# Connecting the Dots: single image serving the API and the web app on :8080.
#
#   docker build -t connecting-the-dots .
#   docker run -p 8080:8080 -v ctd-data:/data -e GEMINI_API_KEY=... connecting-the-dots
#
# GEMINI_API_KEY is optional: without it the app runs in keyword mode with
# browser voices.

# --- Stage 1: build the static frontend --------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend_app/package.json frontend_app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend_app/ ./
# Same-origin API in production: requests go to /api/...
ENV NEXT_PUBLIC_API_URL="" NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Stage 2: Python runtime -------------------------------------------------
FROM python:3.14-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/app ./app
COPY --from=frontend /build/out ./frontend

RUN useradd --create-home --uid 10001 app \
    && mkdir -p /data && chown app:app /data
USER app

ENV HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    FRONTEND_DIST=/app/frontend \
    CORS_ORIGINS=""
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=4); sys.exit(0)" || exit 1

CMD ["python", "-m", "app"]
