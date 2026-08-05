# Migrating to purduesearch.org

**Date:** 2026-08-05
**Status:** Approved, ready for implementation

## Goal

Move the public site from `purduesearch.github.io` to the newly purchased apex domain
`purduesearch.org`, and move the Constellation backend from
`search-constellation.duckdns.org` to `api.purduesearch.org`.

Hosting does not change: the site stays on GitHub Pages (built from this repo by
`.github/workflows/deploy.yml`), and the backend stays on the same Oracle box behind the
same nginx. Only hostnames, certificates, and the strings that reference them change.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Canonical site host | Apex `purduesearch.org` | Shortest URLs; `www` CNAMEs to it and redirects |
| Backend host | `api.purduesearch.org` | Conventional; also makes API same-site with the frontend |
| DNS provider | Cloudflare | Already in use (`CLOUDFLARE_*` vars exist in `.env.example`) |
| Cutover style | Dual-origin transition | Both old and new origins work; rollback is one secret change |
| Server TLS | GitHub Actions workflow | Matches existing `server-maint.yml` SSH-over-Actions pattern |
| Email | In scope | Resend sender already defaults to `newsletter@purduesearch.org` |

## Architecture

Three independent surfaces change, in this dependency order:

```
DNS (Cloudflare)
  ├─> GitHub Pages cert  ──> frontend strings + public/CNAME
  └─> Oracle certbot     ──> backend env + CORS
                              └─> OAuth consoles (Slack / GitHub / Google)
```

Nothing in the application's request path is restructured. The frontend continues to reach
the backend via `REACT_APP_API_URL` (a repo secret baked in at build time), and the backend
continues to build outbound links from `FRONTEND_URL` / `BACKEND_URL` / `APP_BASE_URL`.

---

## 1. DNS records (Cloudflare)

### Web + API

| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `@` | `185.199.108.153` | DNS only (grey) |
| A | `@` | `185.199.109.153` | DNS only |
| A | `@` | `185.199.110.153` | DNS only |
| A | `@` | `185.199.111.153` | DNS only |
| AAAA | `@` | `2606:50c0:8000::153` | DNS only |
| AAAA | `@` | `2606:50c0:8001::153` | DNS only |
| AAAA | `@` | `2606:50c0:8002::153` | DNS only |
| AAAA | `@` | `2606:50c0:8003::153` | DNS only |
| CNAME | `www` | `purduesearch.github.io` | DNS only |
| A | `api` | *(Oracle box public IP)* | DNS only (grey) |

**Proxy status is load-bearing, not cosmetic.**

- GitHub provisions the Pages certificate by validating the apex over plain HTTP. An
  orange-clouded apex hides the origin and cert issuance never completes.
- An orange-clouded `api` puts Cloudflare's TLS termination in front of the certbot cert on
  the Oracle box. Beyond the SSL-mode reconciliation that requires, it interposes a proxy on
  the `/collab/blog`, `/collab/presskit`, and `/collab/course` WebSocket upgrade paths — the
  exact failure mode `fix-collab-websocket.yml` exists to diagnose.

After GitHub reports "certificate issued," the apex *may* be switched to proxied. Leave
`api` on DNS-only.

### Email (Resend)

Add `purduesearch.org` as a domain in the Resend dashboard first; it generates the DKIM
value. Then:

| Type | Name | Value |
|---|---|---|
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey` | *(unique value from Resend)* |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
| TXT | `_dmarc` | `v=DMARC1; p=none;` |

`backend/src/services/emailService.ts:4` already defaults the sender to
`Purdue SEARCH <newsletter@purduesearch.org>`, so no code change is needed — these records
are what make that address actually authenticate.

---

## 2. Frontend changes

### `public/CNAME` (new file)

Contents: `purduesearch.org`

This file is **required** and is not redundant with the Settings → Pages field. Deployment
goes through `actions/upload-pages-artifact`, which publishes the `build/` directory. The
Settings → Pages custom-domain field writes a `CNAME` file to the default branch, which an
artifact-based deploy never reads. CRA copies `public/` verbatim into `build/`, so
`public/CNAME` is what actually lands in the published artifact.

Both are still needed: the file makes the deployed site claim the domain, the Settings field
is what triggers GitHub's certificate issuance.

### Base URL consolidation

`src/components/SEOHead.jsx:1` and `src/seo/schema.js:1` each declare their own
`https://purduesearch.github.io` constant, and three page files inline the same literal in
JSON-LD. Introduce:

- **`src/seo/siteUrl.js`** — exports `SITE_URL = 'https://purduesearch.org'`.

Consumers updated to import it:

| File | What |
|---|---|
| `src/components/SEOHead.jsx` | `BASE_URL` constant |
| `src/seo/schema.js` | `BASE` constant |
| `src/pages/Home.jsx:396-405` | 10 inline JSON-LD URLs |
| `src/pages/Blog.jsx:44,49` | 2 inline JSON-LD URLs |
| `src/pages/BlogPost.jsx:93` | canonical URL |

This is in scope because the migration would otherwise require editing the same literal in
five places, and the next domain-adjacent change would too.

### Static files

Straight hostname replacement:

- `public/sitemap.xml` — 21 `<loc>` entries
- `public/robots.txt` — sitemap line + llms.txt comment
- `public/llms.txt` — ~20 links
- `public/index.html` — `og:url`, `og:image`, `twitter:image`, JSON-LD `url` / `logo` / contact
- `public/legal/privacy.html` — canonical, description, body text, contact link
- `public/legal/terms.html` — canonical, body text, contact link
- `public/constellation/index.html` — canonical + `og:url`

### Display strings

Human-visible text that names the domain:

- `src/pages/SearchResults.jsx:109`
- `src/components/clubpm/PlatformPreview.jsx:200`
- `src/pages/Public/EventRsvp.jsx:257`
- `src/components/clubpm/AiAssistPanel.jsx:406` (input placeholder)

### Not changed

`docs/superpowers/plans/*` and `docs/perf/*` mention the old domain. These are historical
records of completed work; rewriting them would falsify the record.

---

## 3. Backend changes

### CORS: a new variable, not a comma-separated `FRONTEND_URL`

`backend/src/app.ts:80` passes `process.env.FRONTEND_URL` straight to `cors({ origin })`.
The obvious move — making `FRONTEND_URL` comma-separated — is wrong. `FRONTEND_URL` is read
in roughly ten other places to **build outbound links**:

- `backend/src/utils/blockKit.ts:63,870,1174`
- `backend/src/api/auth.ts:243`
- `backend/src/api/githubAuth.ts:67`
- `backend/src/api/googleAuth.ts:90`
- `backend/src/api/github.ts:508`
- `backend/src/api/tasks.ts:1006,1052`
- `backend/src/slack/home.ts:15,37`
- `backend/src/slack/modals.ts:933,1252`
- `backend/src/services/githubSyncService.ts:133`

A comma-separated value would produce a malformed URL in every one of them — broken Slack
deep links, broken OAuth redirects.

**Design:** `FRONTEND_URL` stays single-valued and canonical
(`https://purduesearch.org`). A new optional `CORS_EXTRA_ORIGINS` holds a comma-separated
list of additional allowed origins. `app.ts` builds the array:

```ts
const allowedOrigins = [
  process.env.FRONTEND_URL ?? "http://localhost:3000",
  ...(process.env.CORS_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

app.use(cors({ origin: allowedOrigins, credentials: true }));
```

During the transition `CORS_EXTRA_ORIGINS=https://purduesearch.github.io`. After the soak
period it is cleared, with no other code change.

### Hostname defaults

| File | Change |
|---|---|
| `backend/src/api/meetingPolls.ts:12` | `APP_BASE_URL` fallback → `https://purduesearch.org` |
| `backend/src/services/pressKitService.ts:297,298` | program-page + org links → new domain |
| `backend/src/services/pressKitService.ts:450` | footer text → new domain |
| `.env.example`, `backend/.env.example` | document new hostnames + `CORS_EXTRA_ORIGINS` |

### `pollService.ts:154` deliberately unchanged

```ts
`UID:${evt.uid}@purduesearch.github.io`
```

This is an iCalendar UID, not a link. RFC 5545 UIDs are opaque global identifiers; the
domain suffix is a uniqueness convention, never resolved. Changing it makes every calendar
client that already subscribed treat existing events as new ones — duplicate entries on
real people's calendars, with no way to retract them.

**Action:** leave the value alone; add a comment recording why, so a future
find-and-replace doesn't "fix" it.

### Session cookie stays `sameSite: "none"`

`backend/src/app.ts:102` sets `sameSite: "none"` in production because GitHub Pages → Oracle
is cross-site. That must remain true while `purduesearch.github.io` is still an accepted
origin.

Noted as a **follow-up, out of scope here**: once the old origin is dropped,
`purduesearch.org` and `api.purduesearch.org` share an eTLD+1, so the cookie can become
`"lax"`. That would restore cookie auth in Brave and Safari and make the HMAC Bearer-token
fallback (documented in `CLAUDE.md`) far less load-bearing. Doing it now would break the
transition period, so it is explicitly deferred.

---

## 4. Server provisioning

### New: `.github/workflows/provision-domain.yml`

Follows the established SSH-over-Actions pattern (`server-maint.yml`,
`fix-collab-websocket.yml`): `workflow_dispatch` only, `ORACLE_HOST` / `ORACLE_USER` /
`ORACLE_SSH_KEY` secrets, `script_stop: false` so diagnostics always print.

**Inputs**

- `mode`: `diagnose` (default) | `apply`
- `domain`: default `api.purduesearch.org`
- `backend_port`: default `auto` (detected from `proxy_pass`, matching
  `fix-collab-websocket.yml`)

**`diagnose`** — report only: nginx server blocks and which hostnames they serve, existing
certbot certificates and expiry, whether the new domain resolves to this host, whether the
backend port is listening.

**`apply`** — idempotent:

1. Verify `certbot` is present; report clearly and exit if not.
2. Confirm the new domain's DNS resolves to this box before requesting a cert (a
   premature request burns Let's Encrypt rate limit).
3. Write an nginx server block for the new domain **alongside** the existing DuckDNS block,
   not replacing it — both hostnames serve simultaneously, which is the rollback path.
   Include `location /collab/` with the `$connection_upgrade` map and `proxy_read_timeout
   3600s`, matching what `fix-collab-websocket.yml` injects, plus
   `client_max_body_size 512M` to match the vault-upload fix in `server-maint.yml`.
4. `nginx -t`; on failure restore the timestamped backup and exit non-zero.
5. `certbot --nginx -d <domain>` to obtain and install the certificate.
6. `nginx -t` again, reload, then verify: HTTPS reachable, and a WebSocket probe against
   `wss://<domain>/collab/blog` returns 101.

### Modified: `.github/workflows/fix-collab-websocket.yml`

`DOMAIN="search-constellation.duckdns.org"` is hardcoded at line 58. Becomes a
`workflow_dispatch` input defaulting to `api.purduesearch.org`, so the tool works against
either hostname during the transition.

### Unchanged

`deploy.yml` and `deploy-backend.yml` need no edits — they consume `REACT_APP_API_URL` and
the `ORACLE_*` secrets, both of which are configured outside the repo.

---

## 5. External configuration (manual)

Not code; part of the cutover runbook.

| Where | Change |
|---|---|
| Repo → Settings → Pages | Custom domain `purduesearch.org`; Enforce HTTPS once cert issues |
| Repo → Settings → Secrets | `REACT_APP_API_URL` → `https://api.purduesearch.org` |
| Oracle `/opt/clubpm/backend/.env` | `BACKEND_URL`, `FRONTEND_URL`, `CORS_EXTRA_ORIGINS`, `APP_BASE_URL`, `GOOGLE_OAUTH_REDIRECT_URI` |
| Slack app → OAuth & Permissions | **Add** `https://api.purduesearch.org/auth/slack/callback` (keep the old one until cutover completes) |
| GitHub App | Callback `https://api.purduesearch.org/auth/github/callback`; webhook `https://api.purduesearch.org/api/github/webhook` |
| Google Cloud console | Authorized redirect URI on the new host |
| Resend dashboard | Add + verify `purduesearch.org` domain |
| Google Search Console | Add `purduesearch.org` property; resubmit sitemap |

Slack and GitHub allow multiple redirect URIs; add rather than replace so in-flight logins
survive the switch.

---

## 6. Cutover sequence

1. Add all DNS records (grey cloud).
2. Set the custom domain in Settings → Pages. Wait for "certificate issued."
3. Merge the code changes; `deploy.yml` publishes with `public/CNAME`.
4. Verify `https://purduesearch.org` serves, and `purduesearch.github.io` 301-redirects to it.
5. Run `provision-domain.yml` in `diagnose`, then `apply`.
6. Verify `https://api.purduesearch.org/api/public/...` responds and the WS probe returns 101.
7. Update `.env` on the Oracle box (including `CORS_EXTRA_ORIGINS`); restart via pm2.
8. Update the OAuth consoles.
9. Update `REACT_APP_API_URL`; re-run `deploy.yml`.
10. Soak. Verify ClubPM login, a Slack deep link, blog collab editing, a vault upload.
11. **Cleanup (separate change):** clear `CORS_EXTRA_ORIGINS`, remove the DuckDNS nginx
    block, retire the DuckDNS entry, and consider the `sameSite: "lax"` follow-up.

**Rollback:** through step 10, both hostname pairs are live. Reverting means setting
`REACT_APP_API_URL` back and re-running `deploy.yml` — no server changes, no DNS wait.

## Verification

- `npm run build` at repo root succeeds
- `npx tsc --noEmit` in `backend/` succeeds
- `node scripts/check-tour-anchors.js` still passes (no anchors touched, but the build runs it)
- `rg "purduesearch\.github\.io" src/ public/ backend/src/` returns only the deliberate
  `pollService.ts` iCal UID
