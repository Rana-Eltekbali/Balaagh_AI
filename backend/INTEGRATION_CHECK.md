# Integration verification — 2026-09-30

Final TLS verification and API checks ran against the restarted FastAPI process on port 8000, the configured Supabase Session Pooler, and the existing trained AraBERT/MARBERT checkpoints. `LLM_ENABLED=false`. The earlier real browser check used Vite on `http://localhost:5173/Balaagh_AI/`. No credentials, SSL settings or model files were changed during this final pass. Existing frontend layout and routes were preserved.

## Final TLS and restart status

The stale API process (PID 30360) started before the `.env` TLS update. It was stopped after checking its command and port; the replacement (PID 19700) loaded the current configuration and completed startup. Health returned 200 with database/model indicators healthy and LLM disabled.

The actual application database factory loaded the configured CA with `DATABASE_SSL=true`. A successful live connection's SSL object confirmed `CERT_REQUIRED`, `check_hostname=True`, a peer certificate, and a server hostname matching the configured host. Negotiation used **TLS 1.3 / TLS_AES_256_GCM_SHA384 / 256 bits**. Production settings validation also passed. The configured CA path and credentials were not printed or changed.

`pg_stat_ssl` returned `ssl=false` with null protocol/cipher on both the inspection connection and the running API's downstream PostgreSQL session, identified during an update blocked briefly on our own test row. The configured endpoint is Supabase's Session Pooler: this PostgreSQL view describes the pooler-to-database hop, whereas the client SSL object verifies application-to-pooler TLS. We do not claim the downstream hop uses TLS. No SSL verification was disabled to obtain a passing result. [Supabase connection architecture](https://supabase.com/docs/guides/database/connecting-to-postgres), [PostgreSQL pg_stat_ssl](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-SSL-VIEW).

## Real analysis

Input: `اندلع حريق في منزل بمنطقة سوق الجمعة`

The endpoint returned:

```json
{
  "incidentClass": "Fire / Explosion",
  "priority": "Medium",
  "location": "سوق الجمعة",
  "peopleAtRisk": false,
  "requiredSupport": "",
  "summary": "اندلع حريق في منزل بمنطقة سوق الجمعة",
  "analysisToken": "[present; signed receipt omitted]"
}
```

Verified receipt metadata and the actual stored row agreed:

| Value | Actual result |
|---|---|
| Incident confidence | 0.997329592704773 |
| Priority confidence | 0.7759988903999329 |
| Location confidence | 0.9897339046001434 |
| Extracted entity | `سوق الجمعة`, start 26, end 36, confidence 0.9897339046001434 |
| Analysis duration | 2163.706 ms for the final verification request |
| Summary source | `fallback` |
| Original model labels | Fire / Explosion; Medium; سوق الجمعة |

Confidence values, all entities and numeric duration remain in signed metadata/database storage rather than being added to the existing visible UI response fields. The UI report response formats duration as `analysisTime: "2.16s"`. The initial risk rule remains category equals `People at Risk / Medical`; the LLM is not a startup dependency.

## Live PostgreSQL flow

Analyze 200 → create 201 → list 200 → detail 200 → patch Medium to High 200 → edit history 200 → dashboard/location/analytics 200 → delete 204 → deleted detail 404. The static edit-history route resolved correctly.

The row retained original text, reviewed class/priority/location, all three confidence scores, all extracted entities, original model predictions, risk flag, support, summary/source, UTC creation/update timestamps and numeric analysis duration. Editing changed `updated_at` and appended one Medium → High correction. Original confidence, model priority `Medium`, entities, original text and creation timestamp were unchanged. Deletion cascaded to edit history.

With the one edited report present, real database aggregates were:

```json
{
  "dashboard": {
    "totalReports": 1,
    "criticalReports": 0,
    "highPriority": 1,
    "reportsToday": 1
  },
  "locations": [{
    "location": "سوق الجمعة",
    "reports": 1,
    "criticalReports": 0,
    "peopleAtRisk": 0
  }],
  "analytics": {
    "byIncidentClass": [{"label": "Fire / Explosion", "count": 1}],
    "byPriority": [{"label": "High", "count": 1}],
    "byLocation": [{"label": "سوق الجمعة", "count": 1}],
    "bySupport": [],
    "peopleAtRisk": 0,
    "evaluation": null
  }
}
```

No evaluation metrics were fabricated. A second save with a visible priority correction also retained the signed original model scores/labels. Every test-created report was deleted; final counts were zero reports and zero edits, matching the starting state.

## Receipts, CORS and health

- Valid signatures passed. Tampered signature, genuinely signed expired receipt, changed original text, and an attempted client-supplied confidence field each returned 422.
- Separate unsigned payload modifications to incident confidence, priority confidence, location confidence, extracted entities and processing time each returned 422. The correctly signed values matched the persisted row, including numeric duration, and remained unchanged after the analyst edit.
- The signing key was not returned in any tested response. Receipts are signed, not encrypted, and are not user authentication. Manual saves without receipts retain null model confidence.
- `http://localhost:5173` preflight returned 200 with that explicit origin and no credentials header. An unlisted origin returned 400 without an allow-origin header.
- Health returned exactly `{"status":"ok","database":"ok","modelsLoaded":true,"llmEnabled":false}` with no credentials or filesystem paths.

## Supabase security

The database initially had RLS disabled and no policies on all three application tables. Applied additive migration `0002_private_report_tables`; the direct `postgres` owner connection remained functional.

Live checks confirmed RLS enabled, FORCE RLS disabled, no client policies, and no PUBLIC/anon/authenticated table grants on `reports`, `report_edits` and `alembic_version`. All 24 anonymous/authenticated SELECT/INSERT/UPDATE/DELETE attempts and four sequence-access attempts were denied with PostgreSQL SQLSTATE `42501`. Checks used rolled-back transactions. Actual owner CRUD succeeded after hardening. This tests PostgreSQL role enforcement, not a separately authenticated PostgREST HTTP request.

The former client TLS/CA blocker is resolved. The configured CA loads successfully with certificate and hostname verification enabled. The application uses `DATABASE_SSL_CA_FILE` to supplement system trust for the database connection. The local `.env` credentials/settings were preserved. The pooler/downstream distinction is documented above; PostgreSQL's downstream SSL flag is not used as a substitute for inspecting the client TLS connection. [Official SSL instructions](https://supabase.com/docs/guides/platform/ssl-enforcement)

## Earlier actual browser workflow

Ran installed Chrome 154 headlessly with a separate temporary profile, controlling real DOM input/clicks through CDP. The supplied browser-control tool could not initialize, so this required no additional packages. No API responses were mocked.

Passed: Analyze Report → real prediction visible → Save → Saved Reports → Arabic location filter → Report Detail → Edit priority to High → Dashboard counts/recent report → Locations card → Analytics with evaluation unavailable → confirmed Delete → empty dashboard/edit history. Zero JavaScript exceptions and zero failed API responses were observed during the successful run. Query refreshes were awaited before checking aggregate values.

`سوق الجمعة` appears in location summaries/cards but is not in the existing coordinate lookup, so the UI reports that its coordinates are unknown and does not plot a marker. Geocoding was not added. External basemap tiles were not verified.

## Validation and portability

Final checks were executed separately:

| Command/check | Final result |
|---|---|
| `python -m pytest -q` | 51 passed, 1 skipped, 1 warning in 5.05 s |
| `python -m alembic current` | `0002_private_report_tables (head)` |
| Runtime OpenAPI generation | OpenAPI 3.1.0; 8 paths, 11 operations, 16 component schemas |
| `pnpm --dir Platform --filter @workspace/api-spec run codegen` | React/Zod generation and library compilation passed; Orval 8.30.0 |
| `pnpm --dir Platform run typecheck` | Passed: libraries plus four app/scripts projects |
| `pnpm --dir Platform --filter @workspace/balaagh-ai run build` | Passed in 16.75 s; 1,814 modules |

The pytest warning is Starlette's existing httpx TestClient deprecation. The frontend bundle is 560.47 KB (170.45 KB gzip), with existing chunk-size and tooltip sourcemap warnings. Client generation was initially not executed because automatic approval review reached a tooling usage limit; the authorized retry completed successfully. No tooling block remains for these checks. The earlier Ruff lint, 42-file formatting check and compileall passed; no runtime source was changed in this final verification pass.

Live Alembic revision is `0002_private_report_tables (head)`; `alembic check` reported no new upgrade operations. Disposable PostgreSQL pytest remains opt-in because `TEST_DATABASE_URL` is not configured; live Supabase CRUD/security checks above ran separately without treating Supabase as a disposable test database. Docker/Linux execution was not performed on this Windows host.

Production model/CA/database paths are configurable. Commands run from `backend/`; path handling uses `pathlib`, timestamps use UTC, and `tzdata` supports `Africa/Tripoli` on Windows/Linux. Both model-script invocation styles have passing subprocess startup/help tests. Checkpoints were not reloaded solely to repeat the user's already-successful standalone sanity test; real endpoint inference was verified.

## Deployment starting point

Client TLS is verified. Remaining public-deployment work is API authentication/authorization or an authenticated gateway, rate limiting, production HTTPS/origins and target-host/container validation. Analyst CRUD is currently unauthenticated; Supabase RLS does not replace API authorization. LLM credentials and a genuine evaluation artifact can remain unset; fallback summarization and null evaluation are intentional.

Set these values in the deployment environment (paths/domains below are examples to replace; retain existing credentials and signing key):

```dotenv
APP_ENV=production
DATABASE_URL=<existing Supabase Session Pooler SQLAlchemy URL>
DATABASE_SSL=true
DATABASE_SSL_CA_FILE=/srv/balaagh/certs/supabase-ca.crt
CATEGORY_MODEL_PATH=/srv/balaagh/models/arabert
PRIORITY_MODEL_PATH=/srv/balaagh/models/arabert
LOCATION_MODEL_PATH=/srv/balaagh/models/location
ANALYSIS_SIGNING_KEY=<existing stable secret, at least 32 characters>
CORS_ORIGINS=https://frontend.example.com
INFERENCE_MODE=real
MODEL_DEVICE=cpu
LLM_ENABLED=false
REPORTS_TIMEZONE=Africa/Tripoli
```

For a Linux VM, run from `backend/` behind the HTTPS reverse proxy, using the deployment environment above:

```bash
APP_ENV=production .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```

For the existing container, use its existing CMD (binds `0.0.0.0` inside the container), keep the host port private, and mount the CA and models read-only at their configured container paths. The existing Compose file is a local PostgreSQL development stack and overrides the database URL/SSL flag; it is not the Supabase production launch configuration.

Frontend production configuration is the backend HTTPS **origin**, without `/api`:

```bash
VITE_API_BASE_URL=https://api.example.com pnpm --dir Platform --filter @workspace/balaagh-ai run build
```

Replace the example domain with the actual deployment origin. For the existing GitHub Pages workflow, set the repository Actions variable `VITE_API_BASE_URL` to the same value before running it. Vite embeds this value at build time. Serve the generated `dist/public` assets with the application's existing `/Balaagh_AI/` base and SPA fallback.

Deployment order: provision the protected host/gateway and mount trusted artifacts → configure production environment → run `python -m alembic upgrade head` once → start one API worker → check health and TLS on that host → configure/rebuild/deploy frontend → repeat one report create/edit/delete smoke test through HTTPS. No deployment was executed during this verification.
