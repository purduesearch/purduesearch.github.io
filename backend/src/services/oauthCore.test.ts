import assert from "node:assert/strict";
import {
  OAuthError, OAUTH_SCOPES, OAUTH_TTL_MS, DEFAULT_ALLOWED_REDIRECT_URIS,
  validatePkceChallenge, verifyPkceS256, isAllowedRedirectUri, assertAllowedRedirectUri,
  validateScopes, parseScopes, generateOpaqueToken, hashOpaqueToken, expiresAt, isExpired,
} from "./oauthCore.js";

let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`PASS ${name}`); }
const rejects = (run: () => void, code: string) => assert.throws(run, (err: unknown) =>
  err instanceof OAuthError && err.code === code && err.status === 400);
// RFC 7636 Appendix B.
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

test("RFC 7636 S256 vector verifies", () => {
  assert.equal(validatePkceChallenge(challenge, "S256"), challenge);
  assert.equal(verifyPkceS256(verifier, challenge), true);
});
test("an incorrect valid-length verifier is refused", () => assert.equal(verifyPkceS256("a".repeat(43), challenge), false));
test("PKCE verifier length, alphabet, and runtime type are enforced", () => {
  for (const invalid of ["a".repeat(42), "a".repeat(129), "a".repeat(42) + "+", "a".repeat(42) + "é", null, [], 42]) {
    assert.equal(verifyPkceS256(invalid, challenge), false);
  }
});
test("challenge length, alphabet, and canonical pad bits are enforced", () => {
  const noncanonical = challenge.slice(0, -1) + "N";
  assert.equal(Buffer.from(noncanonical, "base64url").toString("base64url"), challenge);
  for (const invalid of [challenge + "=", challenge.slice(1), "a".repeat(44), challenge.slice(0, -1) + "+", noncanonical, null, {}, 1]) {
    rejects(() => validatePkceChallenge(invalid), "invalid_request");
    assert.equal(verifyPkceS256(verifier, invalid), false);
  }
});
test("plain and unknown PKCE methods are refused", () => {
  for (const method of ["plain", "s256", "", null, 1]) rejects(() => validatePkceChallenge(challenge, method), "invalid_request");
});

const callback = DEFAULT_ALLOWED_REDIRECT_URIS[0];
test("default callback matches exactly", () => {
  assert.equal(isAllowedRedirectUri(callback), true);
  assert.equal(assertAllowedRedirectUri(callback), callback);
});
test("redirect lookalikes, changed path, encoding, and normalization never match", () => {
  for (const invalid of [
    callback + "/", callback + "?next=evil", callback + "#fragment", callback + "#",
    callback.replace("claude.ai", "claude.ai.evil.test"), callback.replace("claude.ai", "CLAUDE.AI"),
    callback.replace("https:", "http:"), callback.replace("claude.ai", "evil.test@claude.ai"),
    callback.replace("claude.ai", "claude.ai:443"), callback.replace("auth_callback", "%61uth_callback"),
    " " + callback, callback + "\n", null, {}, 1,
  ]) assert.equal(isAllowedRedirectUri(invalid), false);
});
test("allow-list entries still require safe HTTPS URLs without credentials or fragments", () => {
  for (const invalid of ["http://localhost/callback", "javascript:alert(1)", "https://user:pass@example.test/cb", "https://@example.test/cb", "https://example.test/cb#", "https://example.test/cb\n"]) {
    assert.equal(isAllowedRedirectUri(invalid, [invalid]), false);
  }
});
test("an explicitly allowed HTTPS query string is retained exactly", () => {
  const uri = "https://example.test/callback?tenant=1";
  assert.equal(assertAllowedRedirectUri(uri, [uri]), uri);
  assert.equal(isAllowedRedirectUri(uri, []), false);
  rejects(() => assertAllowedRedirectUri(callback, []), "invalid_redirect_uri");
});

test("omitted scopes default to read only", () => assert.deepEqual(parseScopes(undefined), ["constellation.read"]));
test("known scope sets preserve the caller's order and never add scopes", () => {
  const all = [...OAUTH_SCOPES];
  assert.deepEqual(parseScopes(all.join(" ")), all);
  assert.deepEqual(validateScopes([all[1], all[0]]), [all[1], all[0]]);
  assert.deepEqual(validateScopes([all[0]]), [all[0]]);
});
test("unknown scopes, duplicates, empty values and malformed separators are refused", () => {
  for (const value of ["", " ", "unknown", "constellation.read constellation.read", " constellation.read", "constellation.read ", "constellation.read  constellation.plan", "constellation.read\tconstellation.plan", "constellation.read\n", null, [], 1]) {
    rejects(() => parseScopes(value), "invalid_scope");
  }
  rejects(() => validateScopes([]), "invalid_scope");
});
test("planning and delete scopes require their narrower prerequisite scopes", () => {
  for (const scopes of [["constellation.plan"], ["constellation.plan.delete"], ["constellation.read", "constellation.plan.delete"], ["constellation.plan", "constellation.plan.delete"]]) {
    rejects(() => validateScopes(scopes), "invalid_scope");
  }
});
test("contacts is opt-in, requires read, and the full four-scope set is valid", () => {
  assert.equal(OAUTH_SCOPES.length, 4);
  assert.equal((OAUTH_SCOPES as readonly string[]).includes("constellation.contacts"), true);
  assert.deepEqual(validateScopes(["constellation.read", "constellation.contacts"]), ["constellation.read", "constellation.contacts"]);
  assert.deepEqual(parseScopes("constellation.read constellation.plan constellation.contacts"), ["constellation.read", "constellation.plan", "constellation.contacts"]);
  rejects(() => validateScopes(["constellation.contacts"]), "invalid_scope");
  rejects(() => validateScopes(["constellation.plan", "constellation.contacts"]), "invalid_scope");
  assert.deepEqual(validateScopes([...OAUTH_SCOPES]), [...OAUTH_SCOPES]);
});

test("opaque credentials use 256-bit base64url randomness with no identity payload", () => {
  const tokens = Array.from({ length: 64 }, () => generateOpaqueToken());
  assert.equal(new Set(tokens).size, tokens.length);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(token, "base64url").length, 32);
    assert.equal(Buffer.from(token, "base64url").toString("base64url"), token);
  }
});
test("credentials persist as stable SHA256 digests instead of plaintext", () => {
  assert.equal(hashOpaqueToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const token = generateOpaqueToken();
  assert.match(hashOpaqueToken(token), /^[0-9a-f]{64}$/);
  assert.notEqual(hashOpaqueToken(token), token);
  assert.notEqual(hashOpaqueToken(token), hashOpaqueToken(token + "x"));
});
test("lifetime policies match the connector contract", () => {
  assert.deepEqual(OAUTH_TTL_MS, { access: 3_600_000, refresh: 2_592_000_000, pending: 600_000, code: 300_000, draft: 3_600_000 });
  const now = new Date("2026-11-13T12:00:00.000Z");
  for (const kind of Object.keys(OAUTH_TTL_MS) as (keyof typeof OAUTH_TTL_MS)[]) {
    assert.equal(expiresAt(kind, now).getTime() - now.getTime(), OAUTH_TTL_MS[kind]);
  }
  assert.equal(now.toISOString(), "2026-11-13T12:00:00.000Z");
});
test("expiration is inclusive and invalid dates fail closed", () => {
  const now = new Date("2026-11-13T12:00:00.000Z");
  assert.equal(isExpired(new Date(now.getTime() + 1), now), false);
  assert.equal(isExpired(new Date(now), now), true);
  assert.equal(isExpired(new Date(now.getTime() - 1), now), true);
  assert.equal(isExpired(new Date(NaN), now), true);
  assert.equal(isExpired(now, new Date(NaN)), true);
  rejects(() => expiresAt("access", new Date(NaN)), "invalid_request");
});
test("OAuth errors carry only a public description, protocol code and status", () => {
  const error = new OAuthError("invalid_token", "Token unavailable", 401);
  assert.equal(error.name, "OAuthError");
  assert.equal(error.code, "invalid_token");
  assert.equal(error.status, 401);
  assert.equal(error.message, "Token unavailable");
});
console.log(`oauthCore: ${passed} passed, 0 failed`);
