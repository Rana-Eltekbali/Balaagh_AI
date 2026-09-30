# Balaagh AI backend

FastAPI is the primary backend. The existing React application and `/api` routes are preserved. `Platform/artifacts/api-server` and `Platform/lib/db` are legacy Express/SQLite development code, not the production service. No fixtures are seeded into PostgreSQL.

## Architecture and contract

`app/api` exposes routes; `schemas` validates camelCase JSON; `services` implements inference, summarization and report transactions; `ml` loads and adapts trained models; `db` holds async SQLAlchemy models; `migrations` owns schema changes. PostgreSQL uses asyncpg and JSONB. Timestamps are stored as UTC. Reports-today boundaries use `REPORTS_TIMEZONE` (default `Africa/Tripoli`).

Models load once during FastAPI lifespan, use `eval()` and `torch.inference_mode()`, and run sequentially in a bounded worker thread. Default inference concurrency is one. Category/priority classification truncates to the configured training length (128 tokens by default). Location NER uses overlapping windows with original-text offsets, reconstructs BIO entities, and selects highest confidence then earliest occurrence. Only outer whitespace is trimmed.

The current repository's `Alla/train_arabert.py` trains one shared AraBERT encoder with `it_head` and `pr_head`. Its loader reuses one model instance when both classifier paths resolve to that directory. Separate Hugging Face sequence-classifier directories or repository IDs also work, with independently validated `id2label`. Remote custom Python code is disabled; missing/mismatched weights are rejected, rather than accepting newly initialized heads.

Initial `peopleAtRisk` is true only for `People at Risk / Medical`; `requiredSupport` starts empty. Analysts can correct both. The LLM only summarizes, never classifies or extracts location. Missing configuration, timeout, invalid/empty response or HTTP failure uses the first 800 characters of the original report. Summary source is persisted. No fake evaluation is returned.

Analysis responds with `incidentClass`, `priority`, `location`, `peopleAtRisk`, `requiredSupport`, `summary`, plus optional `analysisToken`. This signed, text-bound receipt carries measured duration, confidence scores, all entities and original model labels through the existing frontend's analyze-then-save object spread. It expires after 24 hours by default. It is signed, not encrypted, and is not an authentication mechanism. Save verifies it before persisting metadata. Without a receipt, reviewed/manual records remain supported, with null confidences/duration and `summary_source=manual`; no model scores are fabricated. A receipt may be saved more than once; deduplication is future work.

PATCH changes only six reviewed fields and appends one edit row per changed field in the same transaction, using a row lock. Model predictions/confidences, original text and creation time remain unchanged; confidence refers to the original prediction, not a corrected label. `summary_source` records initial generation provenance. Delete cascades to corrections.

## Prerequisites and local setup

Python 3.12, PostgreSQL 16+, Node/pnpm for the existing frontend. CPU inference is supported; trained checkpoints may need several GB of RAM. The API never automatically downloads a substitute model when a required local checkpoint is missing.

From the repository root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements-ml.txt
cp .env.example .env
# Windows: Copy-Item .env.example .env
```

Edit `.env` before starting. Generate a signing key using `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Keep it stable across restarts. Production requires at least 32 characters. Do not commit secrets.

## Configuration

See `.env.example` for the full list. Required for real inference: `DATABASE_URL`, `CATEGORY_MODEL_PATH`, `PRIORITY_MODEL_PATH`, `LOCATION_MODEL_PATH`. Demo authentication is enabled by default and requires `DEMO_API_TOKEN` (32-512 non-whitespace ASCII characters). Production additionally requires `APP_ENV=production` and `ANALYSIS_SIGNING_KEY`, and rejects `DEMO_AUTH_ENABLED=false`. `MODEL_DEVICE=cpu` is the default; `cuda` fails clearly if unavailable. `INFERENCE_MAX_CONCURRENCY`, queue timeout, token limits and database pool size are configurable.

Repository-local model paths, when running from `backend/`:

```dotenv
CATEGORY_MODEL_PATH=../Alla/models/arabert
PRIORITY_MODEL_PATH=../Alla/models/arabert
LOCATION_MODEL_PATH=../Ritaj/Marbert_for_location
```

The current local AraBERT `multitask_model.pt` and MARBERT `model.safetensors` have passed real API inference and browser integration. They are ignored by Git and must be deployed/mounted separately with tokenizer, configuration and label mapping files. The multi-task loader constructs the encoder from config and strictly loads the full checkpoint, so a separate encoder safetensors file is not required. No checkpoint was retrained or modified during integration.

For separately exported classifiers, set the two paths independently; each needs complete trained sequence-classification weights and semantic `id2label`, not generic `LABEL_0` names. Local custom multi-task bundles require `label_mappings.json` and `multitask_model.pt`. Standard HF model IDs are supported; repository-specific custom bundles must be local. Use trusted artifacts.

For CRUD development without models use `INFERENCE_MODE=disabled`; analyze then returns 503, never fabricated predictions. This mode is prohibited in production. Tests inject fake adapters instead.

## Database, migrations and Supabase

Local example, replacing the password:

```dotenv
DATABASE_URL=postgresql+asyncpg://balaagh:YOUR_PASSWORD@localhost:5432/balaagh
DATABASE_SSL=false
```

Use Supabase's direct PostgreSQL connection, or **session pooler** on port 5432 if the VM lacks IPv6. Use the connection details supplied by your own Supabase project; pooler username differs from the direct username. Do not use the transaction pooler/6543 for this configuration. Percent-encode reserved password characters. Set `DATABASE_SSL=true` for verified TLS. If the project's CA is not in the system trust store, download it from Supabase Database Settings → SSL Configuration → Download Certificate, and set `DATABASE_SSL_CA_FILE` to that file's local/container path. This adds the CA only to the database SSL context and preserves hostname/certificate verification. Do not disable verification to work around a certificate error. Do not put `sslmode` into an asyncpg URL. No Supabase JavaScript dependency is involved.

```bash
alembic upgrade head
alembic current
# Review PostgreSQL migration SQL without applying it:
alembic upgrade head --sql
```

Run migrations once per deployment before starting the API. Startup does not call `create_all`. `reports` stores reviewed fields, confidence columns, JSONB extracted entities/original predictions, initial summary source, UTC timestamps and numeric `analysis_time_ms`. `report_edits` stores report FK, field, before/after strings and timestamp. IDs are numeric. Incident/priority/location/creation and edit lookup timestamps have indexes; label/confidence constraints guard invalid data.

Migration `0002_private_report_tables` enables RLS on `public.reports`, `public.report_edits` and `public.alembic_version`, and revokes PUBLIC/anon/authenticated privileges on those tables and their ID sequences. It creates no client policies. FastAPI continues to use its direct table-owner connection; RLS is not forced on the owner. Optional Supabase roles are checked before revocation, so ordinary PostgreSQL remains supported; SQLite tests skip the security statements. Downgrading this revision deliberately retains protections rather than reopening access. A future non-owner backend role needs an explicitly reviewed grant/policy before switching connections. Supabase service credentials remain server-only; API access is separately protected by the shared demo bearer-key dependency.

The legacy SQLite/demo store is not migrated automatically. Back up any existing data and explicitly review an import before using it as real reports.

## Start and connect the frontend

```bash
python -m scripts.test_models
# Equivalent direct invocation from backend/:
python scripts/test_models.py
# Optional independent location-model check:
python -m scripts.test_models --location-only
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --no-access-log
```

Development reload is optional, but it reloads models on every restart. Use one process on small machines; more workers duplicate model memory. Open `/docs` for the live API and `/api/healthz` for DB/model indicators.

In `Platform/artifacts/balaagh-ai/.env.local`:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
```

The value is the backend origin, without `/api`. Run `pnpm --dir Platform --filter @workspace/balaagh-ai dev` from the repository root. Keep the exact frontend origin in `CORS_ORIGINS`; no wildcard or credentials are used. For GitHub Pages, set repository Actions variable `VITE_API_BASE_URL` to the HTTPS backend origin and rebuild. Vite variables are build-time values. Location-filter choices now come from saved location summaries, so Arabic NER results are filterable. Existing browser-path deep links require a host SPA fallback; this backend does not serve the static frontend.

## Demo access

All application-data routes require `Authorization: Bearer <demo access key>`. `/api/healthz` and API documentation/schema endpoints stay public. A missing, malformed, duplicate or incorrect header returns 401 with `WWW-Authenticate: Bearer`. The shared key is held as a backend secret and compared in constant time; it is never returned or logged. Explicit `DEMO_AUTH_ENABLED=false` is available for isolated local testing only; the default is enabled and production cannot disable it.

The React app asks for the key at runtime and stores it only in origin-scoped `sessionStorage`. The generated-client mutator attaches the header, pauses requests while the dialog is open, and clears rejected credentials on 401. Reauthentication preserves mounted form state and refreshes queries without replaying failed mutations. Lock demo clears the tab credential. Standard tab-session storage survives refresh and ends when the tab closes; browser session-restore features can restore session state, so use Lock demo on shared machines. No key belongs in `VITE_*`, source control, URLs, cookies or localStorage. See [DEMO_RUNBOOK.md](../DEMO_RUNBOOK.md) for private setup and verification.

## Endpoints

| Method | Path | Result |
|---|---|---|
| GET | `/api/healthz` | Status and non-sensitive dependency indicators |
| POST | `/api/reports/analyze` | Analysis fields and signed metadata receipt |
| POST | `/api/reports` | Persist reviewed fields + `originalText`; 201 Report |
| GET | `/api/reports` | Direct Report array |
| GET | `/api/reports/edits` | Newest field corrections first |
| GET/PATCH/DELETE | `/api/reports/{id}` | Read/correct/delete; 404 if absent, 204 on delete |
| GET | `/api/dashboard/summary` | DB counts, six most recent records, distributions |
| GET | `/api/locations/summary` | Counts by nonempty saved primary location |
| GET | `/api/analytics/summary` | DB distributions and optional genuine evaluation |

List accepts `search`, `incidentClass`, `priority`, `location`, `sort=date|priority|incidentClass`. Search covers original text, summary, location and class with escaped literal wildcards and bound ORM parameters. Responses have camelCase keys and no `data` envelope. `analysisTime` is formatted seconds, or empty for unknown/manual durations. There is no report-status workflow.

Analytics accepts optional `incidentClass`, `priority`, `location`, `peopleAtRisk=true|false`, `dateFrom`, and `dateTo`. Class, priority and primary location match exactly; supplied filters combine with AND. Dates use `YYYY-MM-DD` and include both selected creation dates in `REPORTS_TIMEZONE`. Invalid values or reversed date ranges return 422. Omit a parameter to leave it unrestricted.

Every analytics distribution and `peopleAtRisk` count uses the same filters. `totalFiltered` is the matching report count, including reports with an empty location/support; without filters it is the full report count. `evaluation` remains the configured model evaluation artifact (or null), independent of report filters. The frontend exports the applied analytics response, not unsaved filter selections. This extension requires no database migration; deploy/restart the backend before deploying the updated frontend.

Errors use `{"error":{"code":"...","message":"...","requestId":"..."}}`. Validation is 422, absent reports 404, capacity/DB failures 503, unexpected failures 500 and oversized bodies 413. Report input is trimmed, 5–5000 characters. Body size is bounded, including chunked requests. The model receipt is validated against the original text and rejected if changed, expired or tampered with.

## Optional LLM and evaluation

Set `LLM_ENABLED=true`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` (API prefix ending in `/v1` where appropriate) and optional timeout. Summarization uses httpx and an OpenAI-compatible `/chat/completions` endpoint. User reports are treated as data in a strict summarization prompt. A prompt cannot guarantee factual correctness: analysts must still review summaries. Secrets, report content, provider error bodies and database connection strings are not logged.

`MODEL_EVALUATION_JSON` may reference an explicitly supplied, genuine metrics artifact with keys `accuracy`, `precision`, `recall`, `macroF1` (fractions), and `confusionMatrix` (square nonnegative counts). Missing/invalid configuration returns null. The existing `Alla/results/arabert/metrics.json` is a different nested format and lacks a confusion matrix; do not manufacture one or configure that file directly. Export a valid artifact from actual held-out predictions, or leave evaluation unavailable.

## Tests and client generation

```bash
python -m pip install -r requirements-dev.txt
pytest -q
ruff check app tests scripts migrations
ruff format --check app tests scripts migrations
python -m compileall -q app scripts migrations
```

Tests use an ephemeral test-only bearer key, fake model adapters and temporary SQLite databases with the real Alembic migration. They do not download/load model weights or call an LLM. SQLite is allowed only for `APP_ENV=test`; production uses PostgreSQL/JSONB. Set `TEST_DATABASE_URL` to an empty, disposable `postgresql+asyncpg://...` database to run the PostgreSQL migration/CRUD/cascade test. The backend CI workflow provisions PostgreSQL for this test. Never point tests at production data.

The real-model HTTP/Supabase/browser verification is recorded separately in [INTEGRATION_CHECK.md](INTEGRATION_CHECK.md). Both model-test invocation styles have subprocess import/argument tests; the already-working model behavior is unchanged.

OpenAPI is in `Platform/lib/api-spec/openapi.yaml`. Change it before regenerating; do not edit generated files:

```bash
cd ../Platform
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/balaagh-ai run build
```

## Docker and VM deployment

```bash
cd backend
docker build -t balaagh-api .
docker run --rm --env-file .env -p 127.0.0.1:8000:8000 \
  -v /srv/balaagh/models:/models:ro balaagh-api
```

Set model paths inside the container to their `/models/...` locations. The build copies only backend code and requirements, not `.env`, datasets or weights; it runs as a non-root user and installs CPU torch. For Supabase, run migration as a one-off container using the same environment and override the command with `alembic upgrade head`.

For a local PostgreSQL + API stack, add `POSTGRES_PASSWORD` (URL-safe), `CATEGORY_MODEL_DIR`, `LOCATION_MODEL_DIR` to `.env` (absolute host paths). The compose example mounts the repository multi-task classifier once for both heads:

```bash
docker compose up -d db
docker compose run --rm api alembic upgrade head
docker compose up -d api
```

Use a reverse proxy for TLS, rate limits and request timeouts on a VM. Keep PostgreSQL private, restrict the API's inbound access as appropriate, and configure explicit CORS origins. A shared bearer key protects demo API access. It grants all data operations to every key holder, with no individual accounts or roles. Per-user authentication/authorization, rate limiting, pagination, deduplication and geocoding remain follow-up work before public operational use. The current frontend still maps known location strings locally.

## Troubleshooting

- Startup model failure: check each path, trained weights, label map and configured device; run the model sanity script first. Do not substitute untrained checkpoints.
- Database failure: verify network, user/password, Supabase direct/session endpoint and TLS; apply migrations.
- Analysis returns 503: check disabled mode or queue saturation; retain original input and retry.
- Save rejects receipt: reanalyze unchanged text; ensure all instances share the signing key.
- Empty map markers: extracted names may not exist in the frontend's city lookup; this does not mean NER failed.
- Metrics unavailable: supply the genuine supported JSON format or leave null.
- Browser request fails: verify the build-time API origin, HTTPS, CORS origin, and GitHub Pages SPA fallback.

Implementation references: [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/), [SQLAlchemy asyncio](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html), [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase verified TLS](https://supabase.com/docs/guides/platform/ssl-enforcement).
