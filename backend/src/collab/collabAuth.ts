import type { DocAccessLevel } from "@prisma/client";
import { verifyBearerToken } from "../api/auth.js";
import { resolveDocAccess, atLeast, type DocRef } from "../services/docAccessService.js";

/**
 * Anything below EDIT rides a read-only connection. Hocuspocus honours this in
 * MessageReceiver by dropping inbound sync updates, which is the only
 * enforcement a hostile client cannot skip — the editor's `editable` flag is
 * cosmetic.
 */
export function shouldBeReadOnly(level: DocAccessLevel): boolean {
  return !atLeast(level, "EDIT");
}

/**
 * Shared onAuthenticate body for all three collab namespaces. Mutates
 * `connectionConfig.readOnly`, which Hocuspocus reads when it constructs the
 * Connection (see ClientConnection.createConnection) — there is no return value
 * that does it.
 */
export async function authenticateCollab(
  token: string,
  ref: DocRef,
  connectionConfig: { readOnly: boolean },
): Promise<{ memberId: string; level: DocAccessLevel }> {
  if (!token) throw new Error("Not authenticated");

  const memberId = await verifyBearerToken(token);
  if (!memberId) throw new Error("Not authenticated");

  const level = await resolveDocAccess(memberId, ref);
  if (!level) throw new Error("Forbidden");

  connectionConfig.readOnly = shouldBeReadOnly(level);
  return { memberId, level };
}
