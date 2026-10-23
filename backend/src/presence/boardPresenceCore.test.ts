import assert from "node:assert/strict";
import {
  LIMITS,
  LockTable,
  RateLimiter,
  parseClientMessage,
} from "./boardPresenceCore.js";

// parseClientMessage: cursor frames clamp and round fractions
assert.deepEqual(parseClientMessage(JSON.stringify(["c", "k:abc", 1500, -3])), { t: "c", anchor: "k:abc", x: 1000, y: 0 });
assert.deepEqual(parseClientMessage(JSON.stringify(["c", "b", 12.6, 0])), { t: "c", anchor: "b", x: 13, y: 0 });
assert.equal(parseClientMessage(JSON.stringify(["c", "x:1", 1, 1])), null);
assert.equal(parseClientMessage(JSON.stringify(["c", "k:a b", 1, 1])), null);

// parseClientMessage: drag start must name a grabbed id that is in the list
assert.equal(parseClientMessage(JSON.stringify(["ds", ["a", "b"], "z"])), null);
assert.deepEqual(parseClientMessage(JSON.stringify(["ds", ["a", "b"], "b"])), { t: "ds", ids: ["a", "b"], grabbed: "b" });

// parseClientMessage: unknown status is kept as null, not rejected
assert.deepEqual(parseClientMessage(JSON.stringify(["de", ["a"], "NOPE"])), { t: "de", ids: ["a"], status: null });
assert.deepEqual(parseClientMessage(JSON.stringify(["de", ["a"], "DONE"])), { t: "de", ids: ["a"], status: "DONE" });

// parseClientMessage: size and shape limits
assert.equal(parseClientMessage(JSON.stringify(["auth", "x".repeat(LIMITS.maxMessageBytes)])), null);
assert.equal(parseClientMessage(JSON.stringify({ t: "hb" })), null);
assert.equal(parseClientMessage("not json"), null);
const many = Array.from({ length: 201 }, (_, i) => `t${i}`);
assert.equal(parseClientMessage(JSON.stringify(["sel", many])), null);
assert.deepEqual(parseClientMessage(JSON.stringify(["sel", ["a", "a", "b"]])), { t: "sel", ids: ["a", "b"] });

// RateLimiter: 40 per second, then refused until the window rolls
{
  const rl = new RateLimiter();
  for (let i = 0; i < 40; i++) assert.equal(rl.allow(0), true);
  assert.equal(rl.allow(0), false);
  assert.equal(rl.allow(999), false);
  assert.equal(rl.allow(1000), true);
}

// LockTable: acquire, conflict, all-or-nothing
{
  const t = new LockTable();
  assert.deepEqual(t.tryAcquire(["a", "b"], "s1", "m1", 0), { ok: true });
  const conflict = t.tryAcquire(["c", "a"], "s2", "m2", 0);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.holder.sid, "s1");
  assert.equal(t.get("c"), undefined, "no partial grant on conflict");

  // same sid may re-acquire
  assert.deepEqual(t.tryAcquire(["a"], "s1", "m1", 1), { ok: true });

  // release only touches own ids
  assert.deepEqual(t.release("s2", ["a"]), []);
  assert.deepEqual(t.release("s1", ["a"]), ["a"]);
  assert.equal(t.get("a"), undefined);
  assert.equal(t.get("b")?.sid, "s1");
}

// LockTable: drop, then commit releases it; undropped locks are ignored
{
  const t = new LockTable();
  t.tryAcquire(["a", "b"], "s1", "m1", 0);
  t.markDropped("s1", ["a"], 10);
  assert.deepEqual(t.releaseCommitted(["b"]), []);
  assert.equal(t.get("b")?.sid, "s1");
  const released = t.releaseCommitted(["a"]);
  assert.deepEqual(released, [{ sid: "s1", memberId: "m1", ids: ["a"] }]);
  assert.equal(t.get("a"), undefined);
}

// LockTable: sweep, one reason per table
// expired: never renewed past lockTtlMs
{
  const t = new LockTable();
  t.tryAcquire(["a"], "s1", "m1", 0);
  assert.deepEqual(t.sweep(LIMITS.lockTtlMs + 1), [{ sid: "s1", memberId: "m1", ids: ["a"] }]);
}

// too long: renewed on time, but held past maxHoldMs
{
  const t = new LockTable();
  t.tryAcquire(["a"], "s1", "m1", 0);
  t.renew("s1", 59_000);
  assert.deepEqual(t.sweep(LIMITS.maxHoldMs), []);
  assert.deepEqual(t.sweep(LIMITS.maxHoldMs + 1), [{ sid: "s1", memberId: "m1", ids: ["a"] }]);
}

// stale drop: dropped, renewed, but no commit patch within dropGraceMs
{
  const t = new LockTable();
  t.tryAcquire(["a"], "s2", "m2", 0);
  t.markDropped("s2", ["a"], 1_000);
  t.renew("s2", 5_900);
  assert.deepEqual(t.sweep(1_000 + LIMITS.dropGraceMs), []);
  assert.deepEqual(t.sweep(1_000 + LIMITS.dropGraceMs + 1), [{ sid: "s2", memberId: "m2", ids: ["a"] }]);
}

// LockTable: sweep expiry on its own
{
  const t = new LockTable();
  t.tryAcquire(["a"], "s1", "m1", 0);
  assert.deepEqual(t.sweep(LIMITS.lockTtlMs), []);
  assert.deepEqual(t.sweep(LIMITS.lockTtlMs + 1), [{ sid: "s1", memberId: "m1", ids: ["a"] }]);
}

// LockTable: seed restores a mirrored lock and never overwrites a live one
{
  const t = new LockTable();
  t.seed("a", "m1", 0);
  assert.equal(t.get("a")?.sid, null);
  t.tryAcquire(["b"], "s1", "m1", 0);
  t.seed("b", "m2", 0);
  assert.equal(t.get("b")?.sid, "s1");
  assert.equal(t.get("b")?.memberId, "m1");
}

console.log("boardPresenceCore tests passed");
