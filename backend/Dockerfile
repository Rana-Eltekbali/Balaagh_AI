FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/home/app/.cache/huggingface HOST=0.0.0.0 PORT=8000
WORKDIR /app
COPY requirements.txt requirements-ml.txt ./
# CPU wheels avoid installing a CUDA runtime on low-cost CPU VMs.
RUN pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r requirements-ml.txt \
    && useradd --create-home --uid 10001 app
COPY --chown=app:app app ./app
COPY --chown=app:app migrations ./migrations
COPY --chown=app:app alembic.ini ./
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8000')+'/api/healthz',timeout=4)"
CMD ["sh", "-c", "exec uvicorn app.main:app --host ${HOST:-0.0.0.0} --port ${PORT:-8000} --workers 1 --no-access-log"]
