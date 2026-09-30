# Balaagh_AI

Arabic crisis-report analysis and analyst review for CrisisLens Libya / Balaagh AI.

- Frontend: `Platform/artifacts/balaagh-ai` (React, Vite, TanStack Query).
- Primary backend: [`backend/README.md`](backend/README.md) (FastAPI, trained AraBERT/MARBERT inference, PostgreSQL, Alembic).
- Shared frontend contract: `Platform/lib/api-spec/openapi.yaml`; regenerate clients with `pnpm --dir Platform --filter @workspace/api-spec run codegen`.
- Legacy Express demo: `Platform/artifacts/api-server`; not used by the new backend deployment.

Follow the backend README for setup, required model artifacts, migrations, tests and Docker. The current local AraBERT and MARBERT checkpoints have passed real API and browser integration checks against Supabase. Model files remain deployment artifacts and are not committed. See [`backend/INTEGRATION_CHECK.md`](backend/INTEGRATION_CHECK.md) for verified results and remaining deployment requirements.
