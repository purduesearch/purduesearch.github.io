const BASE_URL = process.env.REACT_APP_API_URL || "";

const TOKEN_KEY = "clubpm_auth_token";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Optional viewport origin set by a UI action right before it triggers a
// reward-granting request. Lets reward particles spawn at the action site
// (e.g. the card the user just dropped) instead of screen center.
// Auto-cleared after a short TTL so stale origins don't leak.
let _nextRewardOrigin = null;
let _nextRewardOriginTimer = null;

export function setNextRewardOrigin(x, y, ttlMs = 1500) {
  if (typeof x !== "number" || typeof y !== "number") return;
  _nextRewardOrigin = { x, y };
  if (_nextRewardOriginTimer) clearTimeout(_nextRewardOriginTimer);
  _nextRewardOriginTimer = setTimeout(() => { _nextRewardOrigin = null; }, ttlMs);
}

function dispatchRewardSignals(payload) {
  if (!payload || typeof payload !== "object") return;
  // Achievement auto-unlocks are surfaced by the task PATCH endpoint when the
  // server granted their XP/DB silently. Roll those into the visible delta so
  // RewardFlux fires, then emit a separate event so the modal listener can pop.
  const achievementUnlocks = Array.isArray(payload.achievementUnlocks) ? payload.achievementUnlocks : [];
  const achXp = achievementUnlocks.reduce((s, a) => s + Number(a?.xpReward ?? 0), 0);
  const achDb = achievementUnlocks.reduce((s, a) => s + Number(a?.doubloonReward ?? 0), 0);
  const xpDelta = Number(payload.xpDelta ?? 0) + achXp;
  const doubloonsDelta = Number(payload.doubloonsDelta ?? 0) + achDb;
  const rankAfter = payload.rankAfter ?? null;
  const rankBefore = payload.rankBefore ?? null;

  // Queued reward (admin-gated task completion) — no delta, but still surface
  // a confirmation toast so the user knows the action was registered.
  if (payload.queued === true && payload.taskTitle) {
    window.dispatchEvent(new CustomEvent("clubpm:reward-queued", {
      detail: { taskTitle: payload.taskTitle },
    }));
  }

  for (const unlock of achievementUnlocks) {
    if (!unlock?.name) continue;
    window.dispatchEvent(new CustomEvent("clubpm:achievement-unlocked", { detail: unlock }));
  }

  if (xpDelta || doubloonsDelta) {
    const origin = _nextRewardOrigin;
    _nextRewardOrigin = null;
    if (_nextRewardOriginTimer) { clearTimeout(_nextRewardOriginTimer); _nextRewardOriginTimer = null; }
    window.dispatchEvent(new CustomEvent("clubpm:reward-granted", {
      detail: {
        xpDelta,
        doubloonsDelta,
        newXp: payload.newXp ?? null,
        newDoubloons: payload.newDoubloons ?? null,
        origin,
      },
    }));
  }
  if (rankAfter && rankBefore && rankAfter !== rankBefore) {
    window.dispatchEvent(new CustomEvent("clubpm:member-updated"));
  } else if (xpDelta || doubloonsDelta) {
    window.dispatchEvent(new CustomEvent("clubpm:member-updated"));
  }

  // Cosmetic unlock popup — fires whenever any response grants a new cosmetic.
  // Supported fields: unlockedCosmetic (single) or unlockedCosmetics (array).
  const singles = payload.unlockedCosmetic
    ? [payload.unlockedCosmetic]
    : Array.isArray(payload.unlockedCosmetics)
      ? payload.unlockedCosmetics
      : [];
  for (const cosmetic of singles) {
    if (!cosmetic?.name) continue;
    window.dispatchEvent(new CustomEvent("clubpm:cosmetic-unlocked", { detail: cosmetic }));
  }

  // Quest / challenge progress milestones — fires a toast at 25/50/75/100% bands.
  // progressMilestones: [{ challengeId, challengeName?, pct }]
  const milestones = Array.isArray(payload.progressMilestones) ? payload.progressMilestones : [];
  for (const m of milestones) {
    if (typeof m?.pct !== "number") continue;
    window.dispatchEvent(new CustomEvent("clubpm:challenge-progress", { detail: m }));
  }
}

async function handleResponse(response) {
  if (response.status === 401) {
    // Throw without redirecting. AppShell already redirects via React Router's
    // <Navigate> when member is null — a hard window.location redirect would
    // hit a GitHub Pages 404 for any /clubpm/* route, and would also fire on
    // 401s from non-auth endpoints (e.g. Slack integration) even when the user's
    // own token is valid.
    throw new ApiError(401, "Not authenticated");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(
      response.status,
      body.error ?? "Request failed"
    );
  }

  const body = await response.json();
  dispatchRewardSignals(body);
  return body;
}

export async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  return handleResponse(response);
}

export async function post(path, data) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function put(path, data) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function patch(path, data) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function del(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });

  if (response.status === 401) {
    throw new ApiError(401, "Not authenticated");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(
      response.status,
      body.error ?? "Delete failed"
    );
  }
}

// ── Engagement: streak / inventory / shop consumables ─────────

// Tiny module-scope cache so multiple consumers (StreakBadge + dashboard tile)
// don't trigger duplicate network calls within the freshness window.
let _streakCache = { memberId: null, fetchedAt: 0, data: null, inflight: null };
const STREAK_CACHE_TTL_MS = 5_000;

export async function getStreak(memberId, { force = false } = {}) {
  const now = Date.now();
  if (
    !force &&
    _streakCache.memberId === memberId &&
    _streakCache.data &&
    now - _streakCache.fetchedAt < STREAK_CACHE_TTL_MS
  ) {
    return _streakCache.data;
  }
  if (_streakCache.inflight && _streakCache.memberId === memberId) {
    return _streakCache.inflight;
  }
  _streakCache.memberId = memberId;
  _streakCache.inflight = get(`/api/members/${memberId}/streak`).then((data) => {
    _streakCache.data = data;
    _streakCache.fetchedAt = Date.now();
    _streakCache.inflight = null;
    return data;
  }).catch((err) => {
    _streakCache.inflight = null;
    throw err;
  });
  return _streakCache.inflight;
}

export function invalidateStreakCache() {
  _streakCache = { memberId: null, fetchedAt: 0, data: null, inflight: null };
}

export async function getActivity(memberId, days = 30) {
  return get(`/api/members/${memberId}/activity?days=${days}`);
}

export async function pollCelebration() {
  return get(`/api/members/me/celebration`);
}

export async function getInventory() {
  return get(`/api/inventory`);
}

export async function useInventoryItem(itemKey) {
  return post(`/api/inventory/use`, { itemKey });
}

export async function getConsumables() {
  return get(`/api/shop/consumables`);
}

export async function purchaseConsumable(itemKey) {
  return post(`/api/shop/purchase-consumable`, { itemKey });
}

// ── Progress snapshot ─────────────────────────────────────────
//
// Per-user snapshot of the milestone-progress values they last saw, so we can
// animate bars from the old value to the new on project mount. Saves are
// fire-and-forget; failures are logged but never block the UI.

export async function getProgressSnapshot() {
  try { return await get("/api/members/me/progress-snapshot"); }
  catch { return null; }
}

export function saveProgressSnapshot(payload) {
  return put("/api/members/me/progress-snapshot", payload).catch(err => {
    console.warn("[clubpm] saveProgressSnapshot failed", err);
  });
}

// ── Challenges / Achievements ─────────────────────────────────

export const getActiveChallenges  = () => get('/api/challenges/active');
export const claimChallenge       = (id) => post(`/api/challenges/${id}/claim`, {});
export const getAchievements      = () => get('/api/challenges/achievements');
export const getChallengeHistory  = (days = 30) => get(`/api/challenges/history?days=${days}`);
export const getChallengesCatalog = () => get('/api/challenges/catalog');
