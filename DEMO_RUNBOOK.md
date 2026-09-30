# Balaagh AI temporary demo runbook

Current status: shared demo-key authentication is implemented. FastAPI stays private on `127.0.0.1:8000`. No Cloudflare tunnel has been started and GitHub Pages has not been redeployed. Public exposure still requires the host's explicit approval after verification.

Local verification completed on 2026-09-30: real-model Analyze, Save, detail, Edit/history, Dashboard invalidation, Locations, Analytics filters/Clear, CSV/JSON and Delete passed in the production frontend build. Wrong/stale keys returned 401 and were discarded; correct keys restored access; a fresh tab had no credential. No unexpected browser console errors or runtime exceptions occurred. Supabase directly confirmed test reports 8–11 and their edit rows were absent. Token scans passed for built assets, source files, URLs/request bodies, logs and error responses. Workspace typecheck/build passed; the unchanged backend suite previously passed 99 tests with 1 skipped. One Analytics request took about 31 seconds before returning 200; the full rerun passed with a longer verification wait. The public tunnel/Pages path remains untested until explicitly authorized.

Frontend: https://rana-eltekbali.github.io/Balaagh_AI/. Source branch: `main`; Pages branch: `gh-pages`, root folder. Run the following commands from the repository root unless specified otherwise.

## 1. Configure the private demo key

A real key has already been generated in ignored `backend/.env`. Keep it there; do not regenerate it just to start the existing demo. For initial setup or an intentional rotation, this writes a fresh key directly to that ignored file without printing it:

```powershell
.\backend\.venv\Scripts\python.exe -c "from dotenv import set_key; import secrets; set_key('backend/.env', 'DEMO_API_TOKEN', secrets.token_urlsafe(48)); set_key('backend/.env', 'DEMO_AUTH_ENABLED', 'true')"
```

Required local settings:

```dotenv
DEMO_AUTH_ENABLED=true
DEMO_API_TOKEN=<private generated value, only in backend/.env>
CORS_ORIGINS=http://localhost:5173,https://rana-eltekbali.github.io
LLM_ENABLED=false
```

Preserve `DATABASE_URL`, `DATABASE_SSL=true`, `DATABASE_SSL_CA_FILE`, model paths and `ANALYSIS_SIGNING_KEY`. The demo key is separate from the analysis-receipt signing key. Never put it in any `VITE_*` variable, GitHub settings, repository file, URL, cookie, or frontend build. Read/copy it privately from the local `.env` for trusted participants. Rotate and restart FastAPI if it is disclosed.

Auth defaults to enabled. A missing/invalid key fails startup; production rejects disabling auth. `DEMO_AUTH_ENABLED=false` is only for explicitly isolated local tests. Each key holder can read, create, edit and delete reports; this shared key does not provide per-user accounts or roles.

## 2. Start FastAPI

Skip if the authenticated server is already running. In its own PowerShell terminal:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```

Wait for `Application startup complete`. Restart after changes to auth or CORS. Never disable certificate or hostname verification. Keep one model worker.

## 3. Check public health and protected access locally

From a second terminal at the repository root:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/healthz
.\backend\.venv\Scripts\python.exe -c "import httpx; print(httpx.get('http://127.0.0.1:8000/api/reports').status_code)"
.\backend\.venv\Scripts\python.exe -c "from dotenv import dotenv_values; import httpx; key=dotenv_values('backend/.env')['DEMO_API_TOKEN']; print(httpx.get('http://127.0.0.1:8000/api/dashboard/summary', headers={'Authorization': 'Bearer '+key}).status_code)"
```

Expect healthy database/models, `llmEnabled=false`, then **401** without a key and **200** with the key. The commands print no credential. All application-data routes, including Analyze and `/submit` actions, require the bearer header. Health and API documentation/schema remain public. CORS permits only the configured origins and allows `Authorization`; it is not a substitute for authentication.

## 4. Start Cloudflare only after explicit approval

No tunnel is running as part of this verification. Once approved, open another terminal at the repository root:

```powershell
.\.tools\cloudflared\cloudflared.exe tunnel --url http://127.0.0.1:8000
```

The official portable executable is already available locally with its published SHA-256 verified. A fresh Windows machine can use `winget install --id Cloudflare.cloudflared --exact` ([official downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)). Do not create an account tunnel or Windows service for this temporary demo.

Copy the generated `https://....trycloudflare.com` origin. Verify public `/api/healthz` succeeds and unauthenticated `/api/reports` still returns 401 before sharing the site. Do not expose PostgreSQL directly. [Quick Tunnel URLs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) change after restart.

## 5. Set the public API origin and deploy the prepared source

Only the public origin belongs in the GitHub repository variable; never append `/api` or include the key.

```powershell
$demoOrigin = Read-Host 'Paste the HTTPS Quick Tunnel origin (without /api)'
gh variable set VITE_API_BASE_URL --repo Rana-Eltekbali/Balaagh_AI --body $demoOrigin
```

UI alternative: repository Settings ? Secrets and variables ? Actions ? Variables ? `VITE_API_BASE_URL`. If CLI permissions deny changes, the repository owner must set it there. Pages settings must use **Deploy from a branch ? gh-pages ? / (root)**.

The auth/preparation changes are local until committed and pushed. Review the diff, then publish the intended changes:

```powershell
git diff --stat
git add -- .github/workflows/deploy.yml DEMO_RUNBOOK.md Platform/artifacts/balaagh-ai Platform/lib/api-client-react/src Platform/lib/api-spec/openapi.yaml backend
git diff --cached --stat
git commit -m "Protect temporary demo API with runtime bearer access"
git push origin main
```

The push triggers `.github/workflows/deploy.yml`: Node 20, pnpm 12, frozen workspace install, codegen, TypeScript, frontend build and `gh-pages` publication. It validates `VITE_API_BASE_URL` and adds `404.html` for SPA routes. No static API snapshots are published. The local verification build targets localhost and must not be uploaded; let Actions rebuild with the actual tunnel origin.

For a later URL change with the code already on `main`, update the variable and redeploy:

```powershell
gh workflow run deploy.yml --repo Rana-Eltekbali/Balaagh_AI --ref main
gh run list --repo Rana-Eltekbali/Balaagh_AI --workflow deploy.yml --limit 1
```

## 6. Enter the key and run the demo

Open https://rana-eltekbali.github.io/Balaagh_AI/. Enter the privately shared key in **Demo access key**. The generated client sends it only in `Authorization: Bearer ...`. It is stored in backend-origin-scoped `sessionStorage`, not compiled into JavaScript. A wrong/stale key produces 401, is discarded, and opens the dialog again; drafts remain mounted. Failed writes require an explicit retry.

Refresh preserves the key in the same tab. A fresh tab/session requires the key again. Use **Lock demo** before leaving a shared machine: browser session-restore features may restore tab session data. Do not save the key with a password manager or share DevTools/header captures containing it.

Verify Analyze with an Arabic temporary report, save, detail, one edit, edit history, Dashboard, Locations, Analytics filters/Clear, CSV and JSON. Delete only that test report and verify its edit rows are removed. The Arabic-only `/submit` page uses the same token; it has no anonymous write endpoint. Genuine predictions are not guaranteed to match a preselected label; keep LLM disabled and evaluation nullable.

Check the public origin in Network and distinguish deliberate 401 tests from unexpected failures. Check direct visits to `/Balaagh_AI/analyze`, `/reports`, `/reports/<existing-id>`, `/locations`, `/analytics`, and `/submit`, all under `/Balaagh_AI/`. GitHub's SPA fallback can return HTTP 404 for the initial deep-link document while rendering the app; API calls should still succeed.

## 7. Stop safely

Stop `cloudflared` first with Ctrl+C and confirm the public health URL is unreachable. Then stop FastAPI with Ctrl+C. For hidden processes started by assisted setup, verify the command line against the recorded PID in `.cache/demo-backend.pid` before stopping; never stop unrelated Python processes.

The laptop must stay powered on, awake and connected to the Internet. FastAPI and `cloudflared` must both stay running during the demo. After any tunnel restart, update the GitHub variable and rebuild Pages. This is a controlled shared-key demo, not a production service with individual authorization and rate limiting.
