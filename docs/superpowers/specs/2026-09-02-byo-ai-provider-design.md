# Bring-Your-Own AI Provider (Anthropic / OpenAI) — Design

**Date:** 2026-09-02
**Status:** Approved, not yet implemented

## Problem

Every AI feature in ClubPM runs on a single shared Gemini key. The "complex" lane
(`generateJsonComplex` / `generateTextComplex`) is capped at **25 requests per day for the
entire club**, shared by project Ask, AI action plans, blog expansion, course generation,
and several scheduled reports. One member working through an AI-heavy afternoon starves
everyone else, and the only degradation path is a silent fall back to the weaker standard
model.

This design lets a member link their own Anthropic or OpenAI account and choose, per
complexity tier, which provider and model their own AI calls run on.

## Scope

**In scope:** every AI call a logged-in member triggers.

**Out of scope:** the ~30 cron jobs in `backend/src/slack/scheduler.ts`. They have no member
context, so there is no key to spend and no consent to rely on. They stay on Gemini
permanently.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Credential type | Pasted API key, AES-GCM encrypted at rest | Neither Anthropic nor OpenAI offers a public OAuth flow that mints third-party API access. "Linking an account" can only mean a key. |
| Ownership | Personal only | A member's key is used only for calls that member triggers. Never readable or usable by anyone else, no project sharing, no admin override. Nobody's card gets charged by a teammate's click. |
| Selector | Global default **per complexity tier**, set in Profile | Three tiers (high / medium / low). No per-surface override UI. |
| Failure behavior | Fall back to Gemini, notify once | Matches the existing fail-open habit (complex-quota fallback, `COMPLETE_UNGRADED` grading). A feature must never break because a key expired. |
| Model list | Fetched live from the provider | Always current, and doubles as key validation at link time. |

---

## 1. Data model

### 1.1 New table

```prisma
enum AiProvider {
  GEMINI
  ANTHROPIC
  OPENAI
}

enum AiCredentialStatus {
  ACTIVE
  INVALID
}

model MemberAiCredential {
  id             String              @id @default(cuid())
  memberId       String
  provider       AiProvider          // never GEMINI — that is the built-in, keyless provider
  apiKey         String              // AES-GCM, via backend/src/utils/crypto.ts
  keyHint        String              // last 4 chars, plaintext, for the UI only
  status         AiCredentialStatus  @default(ACTIVE)
  lastError      String?
  lastVerifiedAt DateTime?
  lastNotifiedAt DateTime?           // throttles the "your key failed" notification
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
  member         Member              @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([memberId, provider])
  @@index([memberId])
}
```

`GEMINI` is a member of the enum because tier preferences name it as a provider, but a
`MemberAiCredential` row must never carry it — Gemini needs no per-member key. The service
layer rejects `GEMINI` on credential create.

### 1.2 Tier preferences

One nullable `Json` column on `Member`:

```prisma
aiModelPrefs Json?
```

Shape:

```json
{
  "high":   { "provider": "ANTHROPIC", "model": "claude-opus-5" },
  "medium": { "provider": "OPENAI",    "model": "gpt-…" },
  "low":    { "provider": "GEMINI",    "model": null }
}
```

`null` column, a missing tier key, or `provider: "GEMINI"` all mean "use the built-in
Gemini lane". Every existing member is therefore already in a valid state and the migration
needs no backfill.

**Write rule:** the column is always written whole, spreading the previous value — the same
convention every `CourseSection` config column follows. Never key-by-key.

---

## 2. Tier split

The three tiers map onto rate-limit lanes that already exist in `geminiService.ts`. This is
a relabelling of existing call sites, not a reclassification exercise.

| Tier | Current helper | Gemini lane | Features |
|---|---|---|---|
| **high** | `generateJsonComplex`, `generateTextComplex` | 25 req/day | project Ask, AI action plans, blog expansion, course generation, AI risk/capacity reports, vault context |
| **medium** | `generateJson`, `generateText`, `generateJsonFromImage`, `generateJsonFromDocument` | 30 RPM | task AI-enrich, duplicate detection, NL→task, image→task, deadline suggestion, rubric grading, outreach AI |
| **low** | `generateTextFast` | 15 RPM | inline autocomplete in the blog editor |

---

## 3. Provider abstraction

New directory `backend/src/services/ai/`:

### 3.1 `types.ts`

```ts
export type AiTier = "high" | "medium" | "low";

export interface AiCall {
  prompt: string;
  json: boolean;
  cacheKey?: string;
  maxOutputTokens?: number;
  image?: { base64: string; mimeType: "image/png" | "image/jpeg" | "image/webp" };
}

export interface AiModelInfo {
  id: string;
  displayName: string;
}

export interface AiAdapter {
  provider: AiProvider;
  run(call: AiCall, tier: AiTier, model: string | null): Promise<string>;
  listModels(): Promise<AiModelInfo[]>;
  /** Max characters of document text this provider can accept in one prompt. */
  maxPromptChars: number;
}
```

Adapters return a raw string. JSON parsing (including fence stripping) happens once, in the
router, so every provider behaves identically to today's `generateJson`.

### 3.2 `anthropicAdapter.ts`

Uses the official `@anthropic-ai/sdk`.

- `thinking: { type: "adaptive" }` on every call. Do **not** disable thinking: on Claude
  Opus 5 a disabled-thinking request can leak `<thinking>` tags into the visible response,
  and lowering `effort` is the cheaper, safer way to control cost.
- Tier → `output_config.effort`: high → `"high"`, medium → `"medium"`, low → `"low"`.
- **Never send `temperature`, `top_p`, or `top_k`.** Claude Opus 5 and Sonnet 5 reject them
  with a 400. This is the single most likely porting mistake, because the Gemini path has no
  such restriction.
- JSON mode: our `generateJson` callers pass no JSON Schema, so structured outputs
  (`output_config.format`) are not usable. Instead append a "respond with only a JSON
  object, no prose, no code fences" instruction and strip fences on parse.
- `max_tokens`: 16000 default, or `call.maxOutputTokens` when the caller supplies one.
- `listModels()` → `GET /v1/models`, which is also the key-validation call.

### 3.3 `openaiAdapter.ts`

Uses the official `openai` SDK, chat completions with
`response_format: { type: "json_object" }` on the JSON path.
`listModels()` → `/v1/models`, filtered to text-generation models (drop embeddings, TTS,
moderation, image, and legacy ids).

### 3.4 `geminiAdapter.ts`

A thin wrapper over the existing `geminiService` exports. It changes nothing about
`geminiService.ts` itself — the three rate-limit lanes, the daily-quota fallback, and the
`isModelUnusable` degradation all stay exactly as they are. Tier selects which existing
helper to call.

### 3.5 `aiRouter.ts`

The only module call sites import.

```ts
export async function runJson<T>(ctx: AiCtx, tier: AiTier, call: AiCall): Promise<T | null>;
export async function runText(ctx: AiCtx, tier: AiTier, call: AiCall): Promise<string>;
```

`AiCtx` is `{ memberId?: string }`. A missing `memberId` (crons, public endpoints) routes
straight to Gemini.

Resolution order:

1. Read `member.aiModelPrefs[tier]`.
2. If it names a provider other than `GEMINI`, load that member's `MemberAiCredential`.
   Missing row, or `status: INVALID` → Gemini.
3. Otherwise decrypt the key and dispatch to that adapter.

---

## 4. Response cache

`geminiService`'s in-process cache is keyed on the caller-supplied `cacheKey` alone. Once
more than one provider can answer the same prompt, that key must be namespaced:

```
`${provider}:${model ?? "default"}:${cacheKey}`
```

Without this, a member who selects Claude reads a Gemini-generated answer out of the cache
for any prompt another member already ran, and never sees the model they chose.

## 5. Rate limits

Gemini's three global counters (`requestLog`, `complexRequestLog`, `fastRequestLog`) apply
only to the Gemini adapter. A call routed to a member's own Anthropic or OpenAI key does not
touch them.

This is the actual payoff of the feature: a member on a linked account stops consuming the
club-wide 25-req/day complex quota, leaving more of it for everyone still on the built-in
provider.

---

## 6. Failure handling

| Failure | Credential effect | This call | Notification |
|---|---|---|---|
| 401 / 403 (bad, revoked, or unfunded key) | `status = INVALID`, `lastError` set | Retry on Gemini | In-app notification, once |
| 429 / 5xx / network / timeout | none | Retry on Gemini | At most once per 24 h per provider (`lastNotifiedAt`) |
| Response unparseable as JSON | none | Retry on Gemini | none, logged only |

Once a credential is `INVALID`, every later call skips the provider entirely until the
member re-links — no per-call retry storm against a dead key.

The provider error is never surfaced to the user as a failed feature. The notification is
the only user-visible signal, and it points at Profile → AI Models.

---

## 7. API surface

All routes under `requireAuth`. Every handler reads **`req.memberId`**, never
`req.session` — the Bearer-authentication convention that has already caused this bug class
13 times in this codebase.

```
GET    /api/ai/providers                    linked providers + current tier prefs
POST   /api/ai/providers                    { provider, apiKey }
DELETE /api/ai/providers/:provider          unlink
GET    /api/ai/providers/:provider/models   live model list
PUT    /api/ai/preferences                  { high, medium, low }
```

- `GET /providers` returns `{ provider, keyHint, status, lastVerifiedAt, lastError }` per
  linked provider plus the member's `aiModelPrefs`. **It never returns `apiKey`.**
- `POST /providers` verifies the key by calling that provider's models endpoint before
  storing anything. A key that fails verification is rejected with a 400 and never written.
  Re-posting an existing provider replaces the key and resets `status` to `ACTIVE`.
- `GET /providers/:provider/models` calls the provider with the member's key, filters to
  text-generation models, and caches per member for 1 hour in process.
- `PUT /preferences` validates each tier: the provider must be `GEMINI` or a linked
  `ACTIVE` provider, and for non-Gemini the model must appear in that provider's fetched
  list. Any violation rejects the whole request with a 400 — no partial writes.

---

## 8. Frontend

New **AI Models** section in `src/pages/ClubPM/Profile.jsx`:

- **Provider cards** (Anthropic, OpenAI). Unlinked shows a "Link" button opening a modal
  with a `type="password"` field, a paste target, and a one-line consent note: project data
  contained in AI prompts will be sent to that provider under the member's own account.
  Linked shows `sk-…AB12`, a status badge, and "Unlink".
- **Three tier rows** (High / Medium / Low complexity), each with a provider `<select>` and
  a model `<select>` populated from `GET …/models`, plus a plain-English line naming what
  that tier drives (per §2).
- The key is never rendered back after submission and never stored in component state past
  the submit call.

Client helpers go in `src/api/clubPmClient.js`. CSS is appended to
`public/clubpm-theme.css` — this surface only ever renders under `/clubpm/*`.

---

## 9. Known constraints

**Document truncation differs per provider.** `generateJsonFromDocument` currently truncates
at 3,600,000 characters, sized for Gemini. Claude Opus 5 accepts 1M *tokens* and OpenAI's
ceiling is lower still, so each adapter carries its own `maxPromptChars` and the router
truncates against the adapter actually selected. Consequence: grading a long PDF on a linked
account may truncate earlier than the same document on Gemini. This is accepted, not a bug —
but it is why `maxPromptChars` lives on the adapter rather than in the shared helper.

**Prompts are provider-neutral.** All existing prompts were written and tuned against
Gemini. They are not being rewritten per provider in this work. Output quality on a linked
account may differ from Gemini in either direction; per-provider prompt tuning is deliberately
deferred.

**Two new backend dependencies:** `@anthropic-ai/sdk` and `openai`.

---

## 10. Security

- Keys are encrypted with the existing `encryptSecret` / `decryptSecret` helpers
  (`INTEGRATION_TOKEN_KEY`), identical to `githubAccessToken` and `slackUserToken`.
- No endpoint returns a key. No log line prints one. `keyHint` (last 4 chars) is the only
  plaintext fragment stored.
- Every read and write is scoped by `req.memberId`. There is no admin path to another
  member's key, and no project-sharing path — deliberately, per the ownership decision.
- Unlinking deletes the row. Deleting a member cascades.

---

## 11. Testing

| File | Covers |
|---|---|
| `aiRouter.test.ts` | tier resolution incl. missing/INVALID credential; 401 marks INVALID; 429 does not; notify-once throttle; cache key includes provider + model; missing `memberId` routes to Gemini |
| `credentialService.test.ts` | encrypt/decrypt round-trip; `GEMINI` rejected on create; serialized responses never contain `apiKey` |
| `aiPreferences.test.ts` | rejects unlinked provider; rejects unknown model; writes the Json column whole rather than key-by-key |
| `anthropicAdapter.test.ts` | never sends `temperature`/`top_p`/`top_k`; tier → effort mapping; fence-stripping parse |
| `openaiAdapter.test.ts` | JSON response_format on the JSON path; model-list filtering |

---

## 12. Rollout

The feature is inert until a member links a key. No existing behavior changes for anyone who
does nothing: `aiModelPrefs` is null, every tier resolves to Gemini, and every call takes the
path it takes today. There is no feature flag and no migration risk beyond the additive
schema change.
