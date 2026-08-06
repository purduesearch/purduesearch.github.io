# Domain Cutover Runbook — purduesearch.org

Step-by-step execution guide for moving the site to `purduesearch.org` and the
Constellation backend to `api.purduesearch.org`.

The code changes are already merged (see
`docs/superpowers/specs/2026-08-05-purduesearch-org-migration-design.md` for the design
and rationale). Everything below is manual: DNS, dashboards, and one SSH edit.

**Total hands-on time:** roughly 45 minutes, plus waiting on GitHub's certificate
(usually 10–20 minutes, occasionally hours).

**Safety property:** through Phase 7, the old hostnames keep working. Nothing here is
irreversible until Phase 8, which is deliberately days later.

---

## Phase 0 — Pre-flight

Do this before touching DNS. It takes five minutes and turns the rest into verification
rather than guesswork.

### 0.1 Confirm you have access

| System | Where | What you need |
|---|---|---|
| Cloudflare | dash.cloudflare.com | Admin on the `purduesearch.org` zone |
| GitHub repo | Settings tab visible | Admin on `purduesearch/purduesearch.github.io` |
| Slack app | api.slack.com/apps | Owner/admin of the SEARCH workspace app |
| GitHub App | github.com/settings/apps | Owner of the Constellation GitHub App |
| Google Cloud | console.cloud.google.com | Editor on the project holding the OAuth client |
| Resend | resend.com/domains | Team access |
| Oracle box | SSH or Actions | `ORACLE_*` secrets already work (they do — `deploy-backend.yml` uses them) |

### 0.2 Get the Oracle box's public IP

Easiest path, no SSH needed — **Actions → Provision Backend Domain (manual) → Run
workflow**, leave `mode: diagnose`, and read the `## This host's public IP` line.

Or, if you have SSH: `curl -sS https://api.ipify.org`

Write it down. You need it for the `api` DNS record.

> Do **not** use the IP that `search-constellation.duckdns.org` resolves to without
> checking it against the above. DuckDNS entries go stale if the updater ever stopped.

### 0.3 Record a working baseline

So you can tell "broken by the migration" from "already broken":

- [ ] `https://purduesearch.github.io` loads
- [ ] ClubPM login works (Slack OAuth round trip completes)
- [ ] Open a blog post in the editor — the collab indicator connects (no `wss://` errors in console)
- [ ] `curl -sS https://search-constellation.duckdns.org/api/health` returns JSON

---

## Phase 1 — DNS (Cloudflare)

### 1.1 Clear out placeholder records

Cloudflare usually creates parked records when a zone is added. In **DNS → Records**,
delete any existing `A`, `AAAA`, or `CNAME` on `@` or `www` before adding yours. Leave any
MX/TXT records for email alone.

### 1.2 Add the records

**DNS → Records → Add record**, once per row. The proxy toggle defaults to **Proxied** —
you must switch each one to **DNS only**.

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| A | `@` | `185.199.108.153` | DNS only | Auto |
| A | `@` | `185.199.109.153` | DNS only | Auto |
| A | `@` | `185.199.110.153` | DNS only | Auto |
| A | `@` | `185.199.111.153` | DNS only | Auto |
| AAAA | `@` | `2606:50c0:8000::153` | DNS only | Auto |
| AAAA | `@` | `2606:50c0:8001::153` | DNS only | Auto |
| AAAA | `@` | `2606:50c0:8002::153` | DNS only | Auto |
| AAAA | `@` | `2606:50c0:8003::153` | DNS only | Auto |
| CNAME | `www` | `purduesearch.github.io` | DNS only | Auto |
| A | `api` | *(Oracle IP from 0.2)* | DNS only | Auto |

### 1.3 Why grey cloud is not optional

- **Apex:** GitHub issues the Pages certificate by validating over plain HTTP against the
  origin. A proxied record hides the origin and issuance never completes — the Settings
  page sits on "certificate in progress" indefinitely.
- **`api`:** proxying puts Cloudflare's TLS in front of the certbot cert on the Oracle box.
  Besides needing SSL mode reconciled to Full (strict), it interposes a proxy on the
  `/collab/blog`, `/collab/presskit`, and `/collab/course` WebSocket upgrade paths. That is
  the exact failure `fix-collab-websocket.yml` exists to chase down. Leave `api` grey
  permanently.

Once GitHub reports the certificate issued, you *may* proxy the apex if you want
Cloudflare's caching. Optional, and easy to do later.

### 1.4 Set SSL/TLS mode

**SSL/TLS → Overview → Full (strict)**. It has no effect while everything is grey-clouded,
but it's the only correct setting if you ever proxy the apex, and a wrong value here
(Flexible) causes redirect loops that are miserable to debug months later.

### 1.5 Verify

```bash
nslookup purduesearch.org 1.1.1.1        # expect the four 185.199.x.153 addresses
nslookup www.purduesearch.org 1.1.1.1    # expect a CNAME to purduesearch.github.io
nslookup api.purduesearch.org 1.1.1.1    # expect the Oracle IP, and ONLY that
```

If `api` returns a `104.x` or `172.67.x` address, it's still proxied — fix the toggle.

Give it 2–5 minutes. Cloudflare propagates fast; you do not need to wait hours.

---

## Phase 2 — GitHub Pages

### 2.1 Merge and deploy

```bash
git checkout main
git merge migrate-purduesearch-org
git push origin main
```

This triggers **Deploy to GitHub Pages**. Watch it finish in the Actions tab.

### 2.2 Set the custom domain

Go to **Settings → Pages**, type `purduesearch.org` into **Custom domain**, and click
**Save**.

Do this by hand. The field does **not** self-populate from the artifact's `CNAME` file —
until you set it, Pages still reports the site as living at `purduesearch.github.io`, and
`https://purduesearch.org` serves GitHub's `*.github.io` certificate, so every browser
shows a privacy/certificate error. That error is the expected pre-Save state, not a
symptom of bad DNS.

> **Why you need both the field and the file:** the Settings field is what triggers
> certificate issuance. The `public/CNAME` file is what reaches the *served site* —
> deployment goes through `actions/upload-pages-artifact`, which publishes `build/`, so
> the `CNAME` that the Settings UI writes to the default branch is never read. Drop the
> file and a later deploy can leave the domain unclaimed.

### 2.3 Wait for the certificate

Settings → Pages shows a DNS check and a certificate status. Expect, in order:

1. "Domain does not resolve to the GitHub Pages server" — normal for a few minutes
2. "DNS check successful"
3. "Certificate is being provisioned" — usually 10–20 minutes
4. Certificate issued, and the **Enforce HTTPS** checkbox becomes clickable

### 2.4 Enable Enforce HTTPS

Tick it as soon as it's available. Until you do, `http://purduesearch.org` serves
unencrypted.

### 2.5 Verify

```bash
curl -sSI https://purduesearch.org | head -3
# HTTP/2 200

curl -sSI https://purduesearch.github.io | head -5
# HTTP/2 301 ... location: https://purduesearch.org/

curl -sSI https://www.purduesearch.org | head -5
# HTTP/2 301 ... location: https://purduesearch.org/
```

Then in a browser: load `https://purduesearch.org`, click through a few program pages, and
confirm the padlock is clean. View source and check `<link rel="canonical">` points at
`purduesearch.org`.

**At this point the public site has moved.** ClubPM still talks to DuckDNS — that's Phase 3.

---

## Phase 3 — Backend hostname + TLS

### 3.1 Diagnose

**Actions → Provision Backend Domain (manual) → Run workflow**

- `mode`: `diagnose`
- `domain`: `api.purduesearch.org`
- `backend_port`: `auto`
- `certbot_email`: leave blank for now

Read the output and confirm:

- `## DNS for api.purduesearch.org` ends with `-> matches this host ✓`
- `## Existing certbot certificates` lists the DuckDNS cert (proves certbot is installed
  and working on this box)
- `## Backend listening on port N` shows a listener
- The local health check returns a 2xx/3xx/4xx, not `(failed)`

If DNS doesn't match, stop and fix Phase 1. The `apply` step deliberately refuses to run
certbot in that state — Let's Encrypt allows only five validation failures per hostname per
hour, and burning them costs you the cutover window.

### 3.2 Apply

Re-run the same workflow with:

- `mode`: `apply`
- `certbot_email`: a real address you monitor (expiry warnings go here)

The workflow will: add the `$connection_upgrade` map if missing, write
`/etc/nginx/sites-available/clubpm-api.purduesearch.org` **alongside** the existing DuckDNS
block, `nginx -t`, reload, run `certbot --nginx`, re-validate, reload again, then probe all
three `/collab/*` paths.

Success looks like:

```
✅ api.purduesearch.org is serving HTTPS and upgrading WebSockets.
```

### 3.3 If certbot fails

The plain-HTTP server block stays in place and nothing else changed. Common causes:

| Symptom | Cause | Fix |
|---|---|---|
| Timeout during challenge | Port 80 blocked | Check the Oracle Cloud security list *and* the instance's iptables. (Both are almost certainly already open — DuckDNS HTTPS works.) |
| "Incorrect validation certificate" | Record still proxied | Grey-cloud `api` in Cloudflare, wait 2 min, re-run |
| Rate limited | Too many failed attempts | Wait one hour |

### 3.4 Verify

```bash
curl -sS https://api.purduesearch.org/api/health
# expect JSON

curl -sSI http://api.purduesearch.org/api/health | head -3
# expect 301 to https

curl -sS https://api.purduesearch.org/api/public/blog | head -c 200
# expect a JSON array of published posts
```

The DuckDNS hostname still answers identically. Both are live — that's the rollback path.

---

## Phase 4 — Server environment

### 4.1 Connect

If you have SSH, use it. If not, **Actions → Server Maintenance (manual)** with
`ssh_public_key` set to your `~/.ssh/id_ed25519.pub` contents will restore direct access.

### 4.2 Find the right `.env`

`backend/src/app.ts` starts with `import "dotenv/config"`, which resolves `.env` relative to
the process's working directory. Confirm where that is:

```bash
pm2 describe clubpm-backend | grep -E "exec cwd|script path"
```

Almost certainly `/opt/clubpm/backend`, so the file is `/opt/clubpm/backend/.env`.

> `.env` is gitignored, so the `git reset --hard origin/main` in `deploy-backend.yml`
> leaves it untouched. Your edits survive deploys.

### 4.3 Back it up, then edit

```bash
cd /opt/clubpm/backend
cp .env .env.bak-$(date -u +%Y%m%d%H%M%S)
nano .env
```

Set these. Add `CORS_EXTRA_ORIGINS` and `APP_BASE_URL` if they aren't present yet:

```ini
BACKEND_URL=https://api.purduesearch.org
FRONTEND_URL=https://purduesearch.org
CORS_EXTRA_ORIGINS=https://purduesearch.github.io
APP_BASE_URL=https://purduesearch.org
GOOGLE_OAUTH_REDIRECT_URI=https://api.purduesearch.org/auth/google/callback
```

**Do not** put a list in `FRONTEND_URL`. It stays single-valued because roughly ten modules
read it to *build* outbound links — Slack deep links, OAuth redirects. A comma in there
produces a malformed URL in every one of them. Additional origins belong in
`CORS_EXTRA_ORIGINS`, which is CORS-only.

Leave `CORS_EXTRA_ORIGINS` populated through Phase 8. It is what lets a rollback work
without a server change.

### 4.4 Restart

```bash
pm2 restart clubpm-backend
pm2 logs clubpm-backend --lines 40
```

A plain `restart` is sufficient — dotenv re-reads the file on each process start.

Watch the startup log for `🌐 Frontend expected at https://purduesearch.org`.

### 4.5 Verify CORS accepts both origins

```bash
curl -sSI -H "Origin: https://purduesearch.org" \
  https://api.purduesearch.org/api/health | grep -i access-control-allow-origin
# access-control-allow-origin: https://purduesearch.org

curl -sSI -H "Origin: https://purduesearch.github.io" \
  https://api.purduesearch.org/api/health | grep -i access-control-allow-origin
# access-control-allow-origin: https://purduesearch.github.io
```

Both must echo back. If the second is missing, `CORS_EXTRA_ORIGINS` didn't load — check for
a typo or stray quotes, and restart again.

---

## Phase 5 — OAuth consoles

All three still point at DuckDNS. **Add** the new URLs rather than replacing, so logins
in flight during the switch don't fail.

### 5.1 Slack

api.slack.com/apps → your app → **OAuth & Permissions** → Redirect URLs → **Add New
Redirect URL**:

```
https://api.purduesearch.org/auth/slack/callback
```

Click **Save URLs**. Keep the DuckDNS entry until Phase 8.

### 5.2 GitHub App

github.com/settings/apps → your app → **General**:

- **Callback URL** — add `https://api.purduesearch.org/auth/github/callback`
  (the field accepts multiple; use "Add callback URL")
- **Webhook URL** — change to `https://api.purduesearch.org/api/github/webhook`

> The webhook URL is a **single** field, so this one is a hard switch rather than an
> addition. It's safe: both hostnames route to the same backend process, so deliveries
> land in the same handler either way.

Click **Save changes**.

### 5.3 Google

console.cloud.google.com → **APIs & Services → Credentials** → your OAuth 2.0 Client ID →
**Authorized redirect URIs** → **ADD URI**:

```
https://api.purduesearch.org/auth/google/callback
```

**SAVE**. Google's changes can take a few minutes to take effect.

This must match `GOOGLE_OAUTH_REDIRECT_URI` from step 4.3 exactly — trailing slashes count.

### 5.4 Resend (email)

resend.com/domains → **Add Domain** → `purduesearch.org` → region **us-east-1**.

Resend generates a DKIM value unique to you. Add all four records back in Cloudflare
(**DNS only**, as always):

| Type | Name | Content | Priority |
|---|---|---|---|
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |
| TXT | `resend._domainkey` | *(copy from Resend)* | — |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | — |

Back in Resend, click **Verify DNS Records**. Usually verifies within minutes.

`emailService.ts` already defaults its sender to `newsletter@purduesearch.org`, so no code
or env change is needed — these records are what make that address authenticate instead of
landing in spam.

---

## Phase 6 — Point the frontend at the new backend

### 6.1 Update the secret

Repo → **Settings → Secrets and variables → Actions** → `REACT_APP_API_URL` → **Update**:

```
https://api.purduesearch.org
```

No trailing slash — `clubPmClient.js` concatenates paths that already start with `/`.

### 6.2 Redeploy

**Actions → Deploy to GitHub Pages → Run workflow** on `main`.

The value is baked in at build time, so a redeploy is mandatory; changing the secret alone
does nothing.

### 6.3 Verify the new bundle picked it up

```bash
curl -sS https://purduesearch.org/ \
  | grep -oE 'static/js/main\.[a-z0-9]+\.js' | head -1
```

Fetch that bundle and confirm it contains `api.purduesearch.org` and not the DuckDNS name.

Then hard-reload the site in a browser (Ctrl+Shift+R) — the old bundle is cached.

---

## Phase 7 — Smoke test

Work through these on `https://purduesearch.org`. Keep DevTools open on the Network and
Console tabs; a CORS or mixed-content failure shows up there first.

**Public site**
- [ ] Home, About, and each program page render with images
- [ ] Search returns results and the paths read `purduesearch.org/...`
- [ ] `/blog` lists posts (this is a live backend call — proves CORS works)
- [ ] Open a blog post; check the canonical tag in view-source
- [ ] `/legal/privacy.html` and `/legal/terms.html` load

**ClubPM**
- [ ] Log out fully, then log in via Slack — the full OAuth round trip
- [ ] Dashboard loads with stats, quests, and leaderboard populated
- [ ] Open a project, drag a task between kanban columns (write path + optimistic update)
- [ ] Open a task, post a comment
- [ ] Open the blog editor — collab connects, no `wss://` errors in console
- [ ] Upload a small file to a project's vault (exercises the 512M nginx limit)
- [ ] Notifications bell populates (proves the SSE stream survives the proxy)

**Integrations**
- [ ] Trigger a Slack notification (a comment mention) — the deep link in the DM should
      point at `purduesearch.org/clubpm/...`
- [ ] Push a commit to a linked repo and confirm the GitHub webhook lands
- [ ] Reconnect Google Drive from a project's files tab

**Browsers** — test in at least Chrome and **Brave**. Brave blocks the cross-site cookie,
so it exercises the Bearer-token fallback path specifically.

### 7.1 Search Console

- Add `purduesearch.org` as a new property (DNS verification via a Cloudflare TXT record
  is easiest)
- Submit `https://purduesearch.org/sitemap.xml`
- If `purduesearch.github.io` is already a verified property, use **Settings → Change of
  Address** to formally signal the move. This preserves ranking far better than relying on
  the 301 alone.

---

## Phase 8 — Cleanup (wait ~1–2 weeks)

Do **not** rush this. Everything below removes a rollback path.

Wait until: no CORS errors in backend logs from the old origin, Search Console shows
`purduesearch.org` being indexed, and nobody has reported a broken bookmark.

- [ ] Remove `CORS_EXTRA_ORIGINS` from `/opt/clubpm/backend/.env`; `pm2 restart clubpm-backend`
- [ ] Remove the DuckDNS redirect URL from the Slack app and the GitHub App
- [ ] Remove the DuckDNS nginx server block (`sudo rm /etc/nginx/sites-enabled/<old>`,
      `sudo nginx -t`, `sudo systemctl reload nginx`)
- [ ] `sudo certbot delete --cert-name search-constellation.duckdns.org`
- [ ] Release the DuckDNS entry
- [ ] Consider the `sameSite` follow-up below

### The sameSite follow-up

With the old origin gone, `purduesearch.org` and `api.purduesearch.org` share an eTLD+1 —
they are **same-site**. `backend/src/app.ts` can then change:

```ts
sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
```

to `"lax"` in both branches. That restores real cookie auth in Brave and Safari, which
currently fall back to the HMAC Bearer token in localStorage. It's a genuine security and
reliability improvement, and it is only possible *after* the old cross-site origin is
dropped — which is why it isn't part of the migration itself.

Worth its own small PR with a round of auth testing.

---

## Rollback

| Phase reached | To roll back | Time |
|---|---|---|
| 1 (DNS) | Delete the records | Minutes |
| 2 (Pages) | Clear Custom domain in Settings → Pages, revert `public/CNAME`, redeploy | ~5 min |
| 3 (backend TLS) | Nothing to undo — the new vhost is additive, DuckDNS untouched | — |
| 4 (env) | `cp .env.bak-<ts> .env && pm2 restart clubpm-backend` | ~1 min |
| 5 (consoles) | Old URLs were never removed | — |
| 6 (secret) | Set `REACT_APP_API_URL` back to the DuckDNS URL, re-run the Pages deploy | ~3 min |
| 8 (cleanup) | **No easy rollback.** Re-provisioning DuckDNS + certs is real work | Hours |

The common case — "ClubPM broke after the switch" — is fixed by reverting the secret and
redeploying. No DNS wait, no server change.

---

## Quick reference

| Thing | Value |
|---|---|
| Public site | `https://purduesearch.org` |
| Backend | `https://api.purduesearch.org` |
| Health check | `https://api.purduesearch.org/api/health` |
| Old site (redirects) | `https://purduesearch.github.io` |
| Old backend (until Phase 8) | `https://search-constellation.duckdns.org` |
| Server env file | `/opt/clubpm/backend/.env` |
| pm2 process | `clubpm-backend` |
| Provisioning workflow | Actions → "Provision Backend Domain (manual)" |
| WS troubleshooting | Actions → "Fix Collab WebSocket (manual)" (`domain` input) |
