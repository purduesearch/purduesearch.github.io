// Storage for a member's own third-party AI API keys.
//
// This is the ONLY module that touches MemberAiCredential. Keys are AES-GCM
// encrypted with INTEGRATION_TOKEN_KEY, exactly like Member.githubAccessToken and
// Member.slackUserToken. No endpoint returns a key and no log line prints one —
// `keyHint` (last 4 chars) is the only plaintext fragment that ever leaves here.

import type { AiProvider, AiCredentialStatus, MemberAiCredential } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { encryptSecret, decryptSecret } from "../../utils/crypto.js";

/** Providers that require a member-supplied key. GEMINI is the built-in and is not one. */
export type KeyedProvider = Extract<AiProvider, "ANTHROPIC" | "OPENAI">;

/** What the API is allowed to return: everything except the key itself. */
export interface SafeCredential {
  provider:       AiProvider;
  keyHint:        string;
  status:         AiCredentialStatus;
  lastError:      string | null;
  lastVerifiedAt: Date | null;
}

/** Last 4 characters, for "sk-…WXYZ" in the UI. Short keys are returned as-is
 *  rather than padded — a key that short is invalid anyway and will be rejected
 *  at link time by the live verification call. */
export function keyHintOf(apiKey: string): string {
  return apiKey.slice(-4);
}

/** GEMINI is keyless. Storing a row for it would create a credential nothing reads. */
export function assertKeyedProvider(provider: AiProvider): asserts provider is KeyedProvider {
  if (provider !== "ANTHROPIC" && provider !== "OPENAI") {
    throw new Error(`Provider ${provider} does not accept a member-supplied key`);
  }
}

/** Strip the encrypted key by construction — never by spreading and deleting, so a
 *  future column added to the model cannot leak into a response by default. */
export function toSafeCredential(row: MemberAiCredential): SafeCredential {
  return {
    provider:       row.provider,
    keyHint:        row.keyHint,
    status:         row.status,
    lastError:      row.lastError,
    lastVerifiedAt: row.lastVerifiedAt,
  };
}

const NOTIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Transient-failure notifications are throttled to one per provider per day, so a
 *  provider outage cannot spam a member's notification feed on every AI click. */
export function shouldNotify(lastNotifiedAt: Date | null, now: Date = new Date()): boolean {
  if (!lastNotifiedAt) return true;
  return now.getTime() - lastNotifiedAt.getTime() >= NOTIFY_INTERVAL_MS;
}

/** Create or replace a member's key for one provider. Re-linking resets status to
 *  ACTIVE and clears the previous error. */
export async function storeCredential(
  memberId: string,
  provider: AiProvider,
  apiKey: string
): Promise<SafeCredential> {
  assertKeyedProvider(provider);
  const encrypted = encryptSecret(apiKey);
  if (!encrypted) throw new Error("Could not encrypt key (is INTEGRATION_TOKEN_KEY set?)");

  const row = await prisma.memberAiCredential.upsert({
    where:  { memberId_provider: { memberId, provider } },
    create: {
      memberId, provider,
      apiKey: encrypted, keyHint: keyHintOf(apiKey),
      status: "ACTIVE", lastVerifiedAt: new Date(),
    },
    update: {
      apiKey: encrypted, keyHint: keyHintOf(apiKey),
      status: "ACTIVE", lastError: null,
      lastVerifiedAt: new Date(), lastNotifiedAt: null,
    },
  });
  return toSafeCredential(row);
}

/** Decrypted key for a member+provider, or null when unusable. Returns null for an
 *  INVALID credential so callers degrade to Gemini without a per-call retry storm
 *  against a key the provider has already rejected. */
export async function getUsableKey(
  memberId: string,
  provider: AiProvider
): Promise<string | null> {
  if (provider === "GEMINI") return null;
  const row = await prisma.memberAiCredential.findUnique({
    where: { memberId_provider: { memberId, provider } },
  });
  if (!row || row.status === "INVALID") return null;
  return decryptSecret(row.apiKey);
}

export async function listCredentials(memberId: string): Promise<SafeCredential[]> {
  const rows = await prisma.memberAiCredential.findMany({ where: { memberId } });
  return rows.map(toSafeCredential);
}

export async function deleteCredential(memberId: string, provider: AiProvider): Promise<void> {
  await prisma.memberAiCredential
    .delete({ where: { memberId_provider: { memberId, provider } } })
    .catch(() => { /* already gone — unlink is idempotent */ });
}

/** The provider rejected the key itself (401/403). Park it so no later call retries. */
export async function markInvalid(
  memberId: string,
  provider: AiProvider,
  error: string
): Promise<void> {
  await prisma.memberAiCredential
    .update({
      where: { memberId_provider: { memberId, provider } },
      data:  { status: "INVALID", lastError: error.slice(0, 500) },
    })
    .catch(() => { /* row removed mid-flight; nothing to park */ });
}

export async function markNotified(memberId: string, provider: AiProvider): Promise<void> {
  await prisma.memberAiCredential
    .update({
      where: { memberId_provider: { memberId, provider } },
      data:  { lastNotifiedAt: new Date() },
    })
    .catch(() => { /* row removed mid-flight */ });
}

export async function getCredentialRow(
  memberId: string,
  provider: AiProvider
): Promise<MemberAiCredential | null> {
  return prisma.memberAiCredential.findUnique({
    where: { memberId_provider: { memberId, provider } },
  });
}
