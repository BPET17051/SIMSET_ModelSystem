---
description: Production deployment workflow for the SiMSET Cloudflare Pages site with encoding preflight checks.
---

# /deploy - SiMSET Cloudflare Pages Deployment

$ARGUMENTS

---

## Purpose

Use this workflow to deploy the static site in `website/` to Cloudflare Pages.
This workflow blocks deployment when it detects BOM, mojibake, or UTF-8 decode issues.

Current active Pages project from local CLI access:

- Production project: `simset-showroom`
- Production domain: `https://simset-showroom.pages.dev`
- Publish directory: `website/`
- GitHub Actions workflow: `.github/workflows/deploy-production.yml`

Notes:

- Older docs may mention `simset-modelsystem.pages.dev`.
- Current local `wrangler pages project list` output shows `simset-showroom`.
- This workflow deploys only to a project name confirmed by CLI access.

---

## Sub-commands

```text
/deploy check       - Run pre-deployment checks only
/deploy preview     - Upload current website/ as a preview deployment
/deploy production  - Upload current website/ to production
/deploy rollback    - Restore an earlier deployment from Cloudflare dashboard or CLI history
```

---

## Required Preflight

Run all checks before every deploy:

```powershell
python .agent\scripts\encoding_guard.py website
node --check website\app.js
node --check website\borrow.js
node --check website\track.js
node --check website\js\tracking.js
node --check website\js\partials.js
node --check website\admin\login.js
node --check website\admin\admin.js
node --check website\admin\borrow-admin.js
node --check scripts\smoke-admin-selection.js
node --check scripts\smoke-keyboard-nav.js
node --check scripts\smoke-main-pages.js
node --check scripts\smoke-nav.js
npm run smoke:main-pages
npm run smoke:admin-selection
npm run smoke:keyboard-nav
npm run smoke:nav
npm run smoke:deploy-workflow
```

Pass criteria:

- `encoding_guard.py` returns `[OK]`
- All `node --check` commands exit with code `0`
- Smoke commands pass
- No unintended dirty changes in `website/`

Recommended manual checks before production:

- `https://simset-showroom.pages.dev/`
- `https://simset-showroom.pages.dev/borrow.html`
- `https://simset-showroom.pages.dev/tracking.html`
- `https://simset-showroom.pages.dev/admin/`

---

## Deployment Commands

Preview deploy:

```powershell
npx wrangler pages deploy website --project-name simset-showroom --branch encoding-preview
```

Production deploy:

```powershell
npx wrangler pages deploy website --project-name simset-showroom
```

GitHub Actions production deploy:

```text
Actions > Deploy Production > Run workflow
```

Operator checklist:

- `docs/GITHUB_RELEASE_CHECKLIST.md`

Required repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

GitHub environment protection setup:

1. Open `Settings > Environments > production`
2. Enable `Required reviewers`
3. Add at least one approver for production releases
4. Optionally restrict deployment branches to `main` or `master`

Important:

- The workflow already uses `environment: production`
- The approval gate is configured in GitHub UI at environment level
- Repository files alone cannot enforce reviewer identity without that environment setting

If account data changes, verify project names with:

```powershell
npx wrangler pages project list
```

Do not deploy to guessed project names.

---

## Post-Deploy Verification

After deploy, verify:

```powershell
python .agent\scripts\encoding_guard.py website
Invoke-WebRequest https://simset-showroom.pages.dev/ -UseBasicParsing | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest https://simset-showroom.pages.dev/admin/ -UseBasicParsing | Select-Object -ExpandProperty StatusCode
Invoke-WebRequest https://simset-showroom.pages.dev/tracking.html -UseBasicParsing | Select-Object -ExpandProperty StatusCode
```

Manual browser checks:

- Thai text renders correctly on home, borrow, tracking, and admin login pages
- No mojibake sequences appear in UI text
- Admin login error text renders correctly
- Legacy `track.html` redirect still works

---

## Encoding Guardrails

To prevent mojibake and BOM regressions:

1. Keep source files in UTF-8 without BOM
2. Respect `.editorconfig` and `.gitattributes`
3. Run `python .agent\scripts\encoding_guard.py website` before every deploy
4. Prefer editors explicitly configured for UTF-8
5. Avoid copy and paste paths that can reinterpret Thai text as ANSI or Windows-1252
6. If a file looks corrupted in PowerShell, confirm with UTF-8-aware read before editing

Useful verification commands:

```powershell
python .agent\scripts\encoding_guard.py .
python -c "from pathlib import Path; print(Path('website/admin/index.html').read_text(encoding='utf-8')[:200])"
```

---

## Rollback

If deployment has broken Thai text or corrupted pages:

1. Open Cloudflare Pages deployment history for `simset-showroom`
2. Promote the last known good deployment
3. Re-run `encoding_guard.py` locally
4. Diff affected files before re-deploying

---

## Release Note Template

```markdown
## Deployment Complete

- Environment: production
- Platform: Cloudflare Pages
- Project: simset-showroom
- Publish directory: website/

### Checks
- encoding_guard.py: pass
- JS syntax checks: pass
- smoke:main-pages: pass
- smoke:nav: pass
- smoke:deploy-workflow: pass

### Verification
- /: OK
- /borrow.html: OK
- /tracking.html: OK
- /admin/: OK

### Encoding Status
- No UTF-8 BOM found in deployed source set
- No mojibake markers detected locally before deploy
```
