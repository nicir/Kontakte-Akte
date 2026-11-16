# Kontakte-Akte backend image (FastAPI + SQLCipher). Built once on first install.
FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/tmp \
    KA_DATA_ROOT=/data

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "import sqlcipher3; c=sqlcipher3.connect(':memory:'); assert c.execute('PRAGMA cipher_version').fetchone()[0]"

COPY app ./app
COPY migrations ./migrations

# Runs as the host user's uid/gid (set by docker-compose) so that files on the
# bind-mounted data directory keep the correct ownership. Fallback: nobody.
USER 65534:65534
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status == 200 else 1)"]

CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log", "--no-server-header"]
