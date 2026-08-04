const BASE_URL = process.env.REACT_APP_API_URL || "";

// Absolute base for full-page redirects (e.g. OAuth flows) that can't go
// through fetch(). Empty string in dev falls back to same-origin (CRA proxy).
export const apiBaseUrl = BASE_URL;

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

export function authHeaders() {
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

async function handleResponse(response, method = "GET", requestPath = "") {
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
  // Lets a walkthrough step advance on a real successful write rather than on a
  // click that may or may not have done anything. One dispatch here covers every
  // endpoint, because every call in this client funnels through handleResponse.
  window.dispatchEvent(new CustomEvent("clubpm:api-success", {
    detail: { method, path: requestPath },
  }));
  return body;
}

export async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  return handleResponse(response, "GET", path);
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
  return handleResponse(response, "POST", path);
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
  return handleResponse(response, "PUT", path);
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
  return handleResponse(response, "PATCH", path);
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

  // del() parses no body (many endpoints 204), so it can't go through
  // handleResponse — dispatch the walkthrough signal here instead.
  window.dispatchEvent(new CustomEvent("clubpm:api-success", {
    detail: { method: "DELETE", path },
  }));
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

// ── Task archiving ──────────────────────────────────────────────

export const archiveTask       = (id) => post(`/api/tasks/${id}/archive`, {});
export const unarchiveTask     = (id) => post(`/api/tasks/${id}/unarchive`, {});
export const bulkArchive       = (ids, archived) => post(`/api/tasks/bulk-archive`, { ids, archived });
export const getArchivedTasks  = (projectId) => get(`/api/projects/${projectId}/tasks?archived=1`);

// ── Blockers ─────────────────────────────────────────────────

export const getProjectBlockers = (projectId) => get(`/api/projects/${projectId}/blockers`);
export const createBlocker      = (projectId, data) => post(`/api/projects/${projectId}/blockers`, data);
export const updateBlocker      = (id, data) => patch(`/api/blockers/${id}`, data);

// ── Vault (Constellation Vault CAD change management) ──────────

export const getVault             = (projectId) => get(`/api/projects/${projectId}/vault`);
export const getVaultItem         = (id) => get(`/api/vault/items/${id}`);
export const patchVaultItem       = (id, body) => patch(`/api/vault/items/${id}`, body);
export const deleteVaultItem      = (id) => del(`/api/vault/items/${id}`);
export const checkoutVaultItem    = (id, body) => post(`/api/vault/items/${id}/checkout`, body);
export const releaseVaultCheckout = (id) => del(`/api/vault/items/${id}/checkout`);
export const promoteVaultItem     = (id) => post(`/api/vault/items/${id}/promote`, {});
export const getVaultItemHistory  = (id) => get(`/api/vault/items/${id}/history`);
export const patchVaultSettings   = (projectId, body) => patch(`/api/projects/${projectId}/vault/settings`, body);
export const vaultDownloadUrl     = (versionId) => `${BASE_URL}/api/vault/versions/${versionId}/download`;

// Multipart vault upload (new item or new version) with a live progress
// callback. get/post/patch/del only send JSON, and fetch() has no upload
// progress event, so this goes straight through XHR (same FormData idiom as
// uploadBlogImage, plus xhr.upload.onprogress).
export function uploadVaultFile(path, file, fields = {}, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}${path}`);
    xhr.withCredentials = true;
    // Bearer token for cross-origin users whose session cookie is blocked —
    // same auth the JSON helpers and uploadBlogImage send.
    Object.entries(authHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let body = null; try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(Object.assign(new Error(body?.error || `Upload failed (${xhr.status})`), { status: xhr.status, body }));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    const fd = new FormData();
    fd.append("file", file);
    Object.entries(fields).forEach(([k, v]) => v != null && fd.append(k, v));
    xhr.send(fd);   // no Content-Type header — FormData sets the multipart boundary
  });
}

// ── Change requests (Constellation Vault CAD change management) ──

export const listCrs   = (projectId, status) =>
  get(`/api/projects/${projectId}/change-requests${status ? `?status=${encodeURIComponent(status)}` : ""}`);
export const createCr  = (projectId, body) => post(`/api/projects/${projectId}/change-requests`, body);
export const getCr     = (id) => get(`/api/change-requests/${id}`);
export const patchCr   = (id, body) => patch(`/api/change-requests/${id}`, body);
export const cancelCr  = (id) => post(`/api/change-requests/${id}/cancel`, {});
export const approveCr = (id, body = {}) => post(`/api/change-requests/${id}/approve`, body);
export const rejectCr  = (id, body = {}) => post(`/api/change-requests/${id}/reject`, body);
export const getCrPendingCount = () => get(`/api/change-requests/pending/count`);

// Vault BOM / where-used (Pack C)
export const addVaultBomLink    = (itemId, body) => post(`/api/vault/items/${itemId}/bom`, body);
export const updateVaultBomLink = (itemId, childItemId, body) => patch(`/api/vault/items/${itemId}/bom/${childItemId}`, body);
export const removeVaultBomLink = (itemId, childItemId) => del(`/api/vault/items/${itemId}/bom/${childItemId}`);

// Short-lived signed URL for <a href>/<img> access to vault binaries (those
// elements can't carry the Bearer header). Returns { url, expiresAt }.
export const getVaultVersionDownloadUrl = (versionId) => get(`/api/vault/versions/${versionId}/download-url`);

// Vault AI copilot (Pack B)
export const askVault             = (projectId, question) => post(`/api/projects/${projectId}/vault/ask`, { question });
export const checkVaultDuplicates = (projectId, body) => post(`/api/projects/${projectId}/vault/check-duplicates`, body);
export const aiCrReleaseNotes     = (id) => post(`/api/change-requests/${id}/ai-release-notes`, {});
export const aiCrImpact           = (id) => post(`/api/change-requests/${id}/ai-impact`, {});

// ── AI action plan ─────────────────────────────────────────────

export const suggestActions = (projectId, goal) => post(`/api/projects/${projectId}/ai-suggest-actions`, { goal });
export const executePlan    = (projectId, actions) => post(`/api/projects/${projectId}/ai-execute-plan`, { actions });

// ── Challenges / Achievements ─────────────────────────────────

export const getActiveChallenges  = () => get('/api/challenges/active');
export const claimChallenge       = (id) => post(`/api/challenges/${id}/claim`, {});
export const getAchievements      = () => get('/api/challenges/achievements');
export const getChallengeHistory  = (days = 30) => get(`/api/challenges/history?days=${days}`);
export const getChallengesCatalog = () => get('/api/challenges/catalog');

// ── Blog editor ───────────────────────────────────────────────

export const listBlogPosts   = (params = '') => get(`/api/blog/posts${params}`);
export const getBlogPost      = (id) => get(`/api/blog/posts/${id}`);
export const createBlogPost   = (data) => post('/api/blog/posts', data);
export const generateBlogPost = (data) => post('/api/blog/posts/generate', data);
// Generates the article doc without creating a post — for the in-editor AI panel.
export const generateBlogDoc  = (data) => post('/api/blog/posts/generate-doc', data);
export const updateBlogPost   = (id, data) => patch(`/api/blog/posts/${id}`, data);
export const previewBlogPost = (id, contentJson) => post(`/api/blog/posts/${id}/preview`, { contentJson });
export const deleteBlogPost   = (id) => del(`/api/blog/posts/${id}`);
export const publishBlogPost  = (id) => post(`/api/blog/posts/${id}/publish`, {});
export const scheduleBlogPost = (id, scheduledAt) => post(`/api/blog/posts/${id}/schedule`, { scheduledAt });
export const unpublishBlogPost = (id) => post(`/api/blog/posts/${id}/unpublish`, {});
export const archiveBlogPost  = (id) => post(`/api/blog/posts/${id}/archive`, {});
export const listBlogRevisions = (id) => get(`/api/blog/posts/${id}/revisions`);
export const rollbackBlogRevision = (id, revId) => post(`/api/blog/posts/${id}/revisions/${revId}/rollback`, {});
export const listBlogTags     = () => get('/api/blog/tags');
export const createBlogTag    = (name) => post('/api/blog/tags', { name });
export const listBlogCategories = () => get('/api/blog/categories');
export const createBlogCategory = (name) => post('/api/blog/categories', { name });
export const setBlogTaxonomy  = (id, tagIds, categoryIds) => put(`/api/blog/posts/${id}/taxonomy`, { tagIds, categoryIds });
export const listBlogSnippets = () => get('/api/blog/snippets');
export const createBlogSnippet = (name, contentJson) => post('/api/blog/snippets', { name, contentJson });
export const updateBlogSnippet = (id, data) => patch(`/api/blog/snippets/${id}`, data);
export const deleteBlogSnippet = (id) => del(`/api/blog/snippets/${id}`);
export const addBlogAuthor    = (id, memberId, role) => post(`/api/blog/posts/${id}/authors`, { memberId, role });
export const removeBlogAuthor = (id, memberId) => del(`/api/blog/posts/${id}/authors/${memberId}`);
export const listBlogAnnotations = (id) => get(`/api/blog/posts/${id}/annotations`);
export const addBlogAnnotation = (id, body, parentId) => post(`/api/blog/posts/${id}/annotations`, { body, parentId });

// ── Blog / press-kit review threads ──────────────────────────
export const listBlogThreads        = (docType, docId) => get(`/api/blog/docs/${docType}/${docId}/threads`);
export const createBlogThread       = (docType, docId, body) => post(`/api/blog/docs/${docType}/${docId}/threads`, body);
export const setBlogThreadStatus    = (threadId, status) => patch(`/api/blog/threads/${threadId}`, { status });
export const addBlogThreadComment   = (threadId, body) => post(`/api/blog/threads/${threadId}/comments`, { body });
export const editBlogThreadComment  = (threadId, commentId, body) => patch(`/api/blog/threads/${threadId}/comments/${commentId}`, { body });
export const deleteBlogThreadComment = (threadId, commentId) => del(`/api/blog/threads/${threadId}/comments/${commentId}`);

// ── Blog / press-kit AI ──────────────────────────────────────
export const blogAiAsk      = (docType, docId, question) => post('/api/blog/ai/ask', { docType, docId, question });
export const blogAiEdit     = (docType, docId, body) => post('/api/blog/ai/edit', { docType, docId, ...body });
export const blogAiComplete = (docType, docId, before) => post('/api/blog/ai/complete', { docType, docId, before });

// ws(s):// base for the embedded Hocuspocus collab server (backend/src/collab/blogCollab.ts,
// mounted at /collab/blog). Mirrors BASE_URL's origin, swapping the http(s) scheme for ws(s);
// falls back to the current page's origin so the CRA dev proxy forwards the upgrade request.
export function getBlogCollabWsUrl() {
  const origin = BASE_URL || window.location.origin;
  return `${origin.replace(/^http/, 'ws')}/collab/blog`;
}

// ── Press Kit ────────────────────────────────────────────────
export const getPressKit            = (projectId)         => get(`/api/projects/${projectId}/press-kit`);
export const generatePressKit       = (projectId, config) => post(`/api/projects/${projectId}/press-kit/generate`, config);
export const updatePressKitConfig   = (projectId, config) => patch(`/api/projects/${projectId}/press-kit`, config);
export const publishPressKit        = (projectId)         => post(`/api/projects/${projectId}/press-kit/publish`, {});
export const getPressKitRevisions   = (projectId)         => get(`/api/projects/${projectId}/press-kit/revisions`);
export const restorePressKitRevision = (projectId, revId) => post(`/api/projects/${projectId}/press-kit/revisions/${revId}/restore`, {});
// REST fallback save for the press-kit body (used when the collab WS is down).
export const updatePressKitContent   = (projectId, contentJson) => patch(`/api/projects/${projectId}/press-kit/content`, { contentJson });
export const deletePressKit = (projectId) => del(`/api/projects/${projectId}/press-kit`);

// Authenticated file download for press-kit exports (a plain <a href> omits the
// Bearer header). Mirrors downloadMeetingPollIcs.
export async function downloadPressKitExport(projectId, format, projectName = 'press-kit') {
  const ext = ({ pdf: 'pdf', docx: 'docx', md: 'md', html: 'html' })[format] || 'txt';
  const response = await fetch(`${BASE_URL}/api/projects/${projectId}/press-kit/export?format=${format}`, {
    credentials: 'include',
    headers: { ...authHeaders() },
  });
  if (!response.ok) {
    // Surface the server's reason — a 503 tells the user PDF is unavailable on
    // this server but the other formats still work, which 'Export failed' hides.
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error ?? 'Export failed');
  }
  const blob = await response.blob();
  const safe = String(projectName).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'press-kit';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${safe}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ws(s):// base for the press-kit Hocuspocus namespace (backend/src/collab/pressKitCollab.ts).
export function getPressKitCollabWsUrl() {
  const origin = BASE_URL || window.location.origin;
  return `${origin.replace(/^http/, 'ws')}/collab/presskit`;
}

// ── Courses (Outreach → Courses) ─────────────────────────────
export const listCourses    = ()        => get('/api/outreach/courses');
export const getCourse      = (id)      => get(`/api/outreach/courses/${id}`);
export const createCourse   = (data)    => post('/api/outreach/courses', data);
export const updateCourse   = (id, data) => patch(`/api/outreach/courses/${id}`, data);
export const publishCourse  = (id)      => post(`/api/outreach/courses/${id}/publish`, {});
export const archiveCourse  = (id)      => post(`/api/outreach/courses/${id}/archive`, {});
export const deleteCourse   = (id)      => del(`/api/outreach/courses/${id}`);

// ── AI course generation ─────────────────────────────────────
// Two stages behind a CourseGenJob row: startCourseGen drafts an outline, the
// author edits it (saveCourseGenOutline), then runCourseGen writes the bodies.
// Both stages return immediately — poll getCourseGenJob for status/progress.
export const startCourseGen       = (data)  => post('/api/outreach/courses/generate', data);
export const listCourseGenJobs    = ()      => get('/api/outreach/courses/generate');
export const getCourseGenJob      = (jobId) => get(`/api/outreach/courses/generate/${jobId}`);
export const saveCourseGenOutline = (jobId, outline) =>
  patch(`/api/outreach/courses/generate/${jobId}`, { outline });
export const runCourseGen         = (jobId) => post(`/api/outreach/courses/generate/${jobId}/run`, {});
export const cancelCourseGen      = (jobId) => del(`/api/outreach/courses/generate/${jobId}`);

// The only course endpoint that returns a section's `contentJson`; the tree
// endpoints omit bodies to keep the whole-course payload small.
export const getCourseSection     = (sectionId)           => get(`/api/outreach/courses/sections/${sectionId}`);
export const createCourseSection  = (courseId, data)      => post(`/api/outreach/courses/${courseId}/sections`, data);
export const updateCourseSection  = (sectionId, data)     => patch(`/api/outreach/courses/sections/${sectionId}`, data);
export const deleteCourseSection  = (sectionId)           => del(`/api/outreach/courses/sections/${sectionId}`);
export const createCourseModule = (courseId, data)  => post(`/api/outreach/courses/${courseId}/modules`, data);
export const updateCourseModule = (moduleId, data)  => patch(`/api/outreach/courses/modules/${moduleId}`, data);
export const deleteCourseModule = (moduleId)        => del(`/api/outreach/courses/modules/${moduleId}`);
// tree: [{ moduleId, sectionIds: [] }, …] — must list EVERY module and section
// of the course exactly once, or the server 400s rather than half-applying.
export const saveCourseStructure = (courseId, tree) => put(`/api/outreach/courses/${courseId}/structure`, { tree });

export const listCourseQuestions   = (sectionId)            => get(`/api/outreach/courses/sections/${sectionId}/questions`);
// `scope` bounds which family of questions the whole-set replace may delete:
// 'quiz' = untimed only, 'popup' = in-video only, 'all' = both. The quiz editor
// only ever loads untimed questions, so without a scope its save would delete
// the section's in-video pop-ups as collateral.
export const replaceCourseQuestions = (sectionId, questions, scope = 'all') =>
  put(`/api/outreach/courses/sections/${sectionId}/questions`, { questions, scope });
export const saveCourseQuestion    = (sectionId, question)  => post(`/api/outreach/courses/sections/${sectionId}/questions`, question);
export const deleteCourseQuestion  = (sectionId, questionId) => del(`/api/outreach/courses/sections/${sectionId}/questions/${questionId}`);

// ── Course slides (SLIDES sections) ──────────────────────────
// Whether the bot account still holds drive.readonly. Only the Google Slides
// *link* import needs it; .pdf and .pptx work without.
export const getSlideCapabilities  = ()            => get('/api/outreach/courses/slide-capabilities');
export const listCourseSlides      = (sectionId)   => get(`/api/outreach/courses/sections/${sectionId}/slides`);
export const saveCourseSlideMeta   = (sectionId, slides) =>
  put(`/api/outreach/courses/sections/${sectionId}/slides`, { slides });

/**
 * No ids → clear the whole deck. With ids → delete only those, which is how a
 * re-import removes the old pages once the new ones are safely stored.
 *
 * `del` above cannot carry a body, and adding one to it would change every
 * existing caller — so this speaks to the same fetch/auth contract directly.
 */
export async function clearCourseDeck(sectionId, ids) {
  const response = await fetch(
    `${BASE_URL}/api/outreach/courses/sections/${sectionId}/slides`,
    {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() },
      body: JSON.stringify(ids?.length ? { ids } : {}),
    }
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error ?? 'Could not remove those slides');
  }
  return response.json().catch(() => ({ ok: true }));
}

export const clearCourseAudio = (sectionId) => del(`/api/outreach/courses/sections/${sectionId}/audio`);
export const recordCourseSlideProgress = (sectionId, index) =>
  post(`/api/outreach/courses/sections/${sectionId}/slide-progress`, { index });

/** Multipart narration upload with progress. Mirrors uploadVaultFile. */
export function uploadCourseAudio(sectionId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/api/outreach/courses/sections/${sectionId}/audio`);
    xhr.withCredentials = true;
    Object.entries(authHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body = null; try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body?.error || `Audio upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during audio upload'));
    const fd = new FormData();
    fd.append('audio', file);
    xhr.send(fd);   // no Content-Type header — FormData sets the multipart boundary
  });
}

// Learner-side. The server clamps `positionSec` against wall-clock × max rate,
// so a fabricated jump is rejected there — these are the UX half of the lock.
export const recordCourseVideoProgress = (sectionId, positionSec) =>
  post(`/api/outreach/courses/sections/${sectionId}/video-progress`, { positionSec });
export const answerCoursePopup = (sectionId, questionId, answerIds) =>
  post(`/api/outreach/courses/sections/${sectionId}/popup-answer`, { questionId, answerIds });

// The gated learner payload. Locked sections arrive WITHOUT `contentJson` /
// `videoConfig` — the player trusts that omission rather than re-deriving the gate.
// `preview` is honoured server-side for the author/admin only: every section
// unlocked, and no enrollment created.
export const getLearnerCourse = (slug, { preview = false } = {}) =>
  get(`/api/outreach/courses/${slug}/learn${preview ? '?preview=1' : ''}`);
// Completion responses carry the reward envelope (xpDelta / progressMilestones /
// achievementUnlocks), so `handleResponse` fires RewardFlux and the quest toasts
// with no extra wiring on the page.
export const completeCourseSection = (sectionId) =>
  post(`/api/outreach/courses/sections/${sectionId}/complete`, {});
export const submitCourseQuiz = (sectionId, responses) =>
  post(`/api/outreach/courses/sections/${sectionId}/quiz/attempts`, { responses });

export const assignCourse = (courseId, memberIds, dueDate = null) =>
  post(`/api/outreach/courses/${courseId}/assign`, { memberIds, dueDate });

// Admin reporting (author-or-admin for the first two; admin-or-self for the third).
export const getCourseProgress     = (courseId) => get(`/api/outreach/courses/${courseId}/progress`);
export const getCourseQuizAnalysis = (courseId) => get(`/api/outreach/courses/${courseId}/quiz-analysis`);
export const getMemberCourseProgress = (memberId) => get(`/api/outreach/courses/progress/member/${memberId}`);

// ws(s):// base for the course-section Hocuspocus namespace (backend/src/collab/courseCollab.ts).
// The Yjs document name is a CourseSection.id.
export function getCourseCollabWsUrl() {
  const origin = BASE_URL || window.location.origin;
  return `${origin.replace(/^http/, 'ws')}/collab/course`;
}

// ── Meeting scheduler (when2meet availability polls) ─────────

export const listMeetingPolls = (params = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== '')
  ).toString();
  return get(`/api/meeting-polls${q ? `?${q}` : ''}`);
};
export const getMeetingPoll        = (id)        => get(`/api/meeting-polls/${id}`);
export const getMeetingPollByToken = (token)     => get(`/api/meeting-polls/token/${token}`);
export const createMeetingPoll     = (data)      => post('/api/meeting-polls', data);
export const updateMeetingPoll     = (id, data)  => patch(`/api/meeting-polls/${id}`, data);
export const deleteMeetingPoll     = (id)        => del(`/api/meeting-polls/${id}`);
export const submitAvailability    = (id, slots) => put(`/api/meeting-polls/${id}/response`, { slots });
export const getMeetingPollResponses = (id)      => get(`/api/meeting-polls/${id}/responses`);
export const remindMeetingPoll     = (id)        => post(`/api/meeting-polls/${id}/remind`, {});
export const finalizeMeetingPoll   = (id, start, end) => post(`/api/meeting-polls/${id}/finalize`, { start, end });

// Public (guest shareable link) — auth optional; a logged-in member passes
// their Bearer token in the body so cookie-blocked browsers still identify them.
export const getPublicPoll = (token) => get(`/api/public/polls/${token}`);
export const submitPublicAvailability = (token, { guestName, slots, authToken }) =>
  put(`/api/public/polls/${token}/response`, { guestName, slots, authToken });

// Download the finalized meeting's .ics via authenticated fetch → blob, so it
// works under both cookie and Bearer auth (a plain <a href> omits the header).
export async function downloadMeetingPollIcs(id, filename = 'meeting.ics') {
  const response = await fetch(`${BASE_URL}/api/meeting-polls/${id}/ics`, {
    credentials: 'include',
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new ApiError(response.status, 'Failed to download calendar file');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Build a "Add to Google Calendar" template URL entirely client-side (no backend).
export function googleCalendarUrl({ title, description, location, start, end }) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Meeting',
    dates: `${fmt(start)}/${fmt(end)}`,
    ...(description ? { details: description } : {}),
    ...(location ? { location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Multipart image upload → { url, width, height }. Do NOT set Content-Type:
// the browser fills in the multipart boundary from the FormData body.
export async function uploadBlogImage(file) {
  const form = new FormData();
  form.append('image', file);
  const response = await fetch(`${BASE_URL}/api/blog/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', ...authHeaders() },
    body: form,
  });
  return handleResponse(response);
}

// AI alt-text suggestion. Reuses the outreach endpoint, whose handler only
// reads `imageUrl` from the body and ignores the :id path param.
export const suggestBlogAltText = (imageUrl) =>
  post('/api/outreach/submissions/blog/ai/alt-text', { imageUrl });

// Mirror of backend proxyImageSrc: rewrite legacy Drive image URLs so already-
// published posts display in the editor too. New uploads are already proxied.
const DRIVE_ID_RE = /(?:drive\.google\.com\/uc\?[^"']*?[?&]id=|drive\.google\.com\/file\/d\/|lh3\.googleusercontent\.com\/d\/)([a-zA-Z0-9_-]{10,})/;
export function proxyImageSrc(src) {
  if (!src) return src;
  const m = String(src).match(DRIVE_ID_RE);
  if (!m) return src;
  return `${BASE_URL}/api/public/blog-image/${m[1]}`;
}

// Google Drive bot account connection (Workstream A — see
// docs/superpowers/specs/2026-07-06-clubpm-drive-multirepo-design.md §3).
// Connect is a full-page redirect to /auth/google (see GoogleDriveConnectButton),
// not a fetch call, so there is no connect() helper here.
export const getGoogleDriveStatus = () => get("/auth/google/status");
export const disconnectGoogleDrive = () => del("/auth/google");

// Multi-repo GitHub integration (Workstream B — see
// docs/superpowers/specs/2026-07-06-clubpm-drive-multirepo-design.md §4).
// All repos linked to a project are equal (no "primary" repo); adding a repo
// appends a new ProjectRepo row rather than replacing a single project field.
export const listProjectRepos  = (projectId) => get(`/api/github/projects/${projectId}/repos`);
export const addProjectRepo    = (projectId, url) => post(`/api/github/projects/${projectId}/repos`, { url });
export const updateProjectRepo = (repoId, body) => patch(`/api/github/repos/${repoId}`, body);
export const removeProjectRepo = (repoId) => del(`/api/github/repos/${repoId}`);

// ── Walkthrough tours ────────────────────────────────────────
export const recordTourProgress = (sectionId, stepIndex) =>
  post(`/api/outreach/courses/sections/${sectionId}/tour-progress`, { stepIndex });

export const reportTourBreakage = (sectionId, payload) =>
  post(`/api/outreach/courses/sections/${sectionId}/tour-breakage`, payload);

export const listTourBreakages = (sectionId) =>
  get(`/api/outreach/courses/sections/${sectionId}/tour-breakages`);

export const ensureTrainingProject = () => post(`/api/training-project`, {});
