// Pure rules for sub-project roll-up settings. No Prisma import: callers pass rows in.

export const ROLLUP_FLAGS = [
  "tasks",
  "github",
  "slack",
  "vault",
  "milestones",
  "insights",
  "parentMembersCanEdit",
  "aiContext",
] as const;
export type RollupFlag = (typeof ROLLUP_FLAGS)[number];

export const DEFAULT_ROLLUP_COLOR = "#6c5ce7";

export type RollupSettings = Record<RollupFlag, boolean> & {
  tagEnabled: boolean;
  tagLabel: string | null;
  tagColor: string | null;
};

export const ROLLUP_OFF: RollupSettings = {
  tasks: false,
  github: false,
  slack: false,
  vault: false,
  milestones: false,
  insights: false,
  parentMembersCanEdit: false,
  aiContext: false,
  tagEnabled: false,
  tagLabel: null,
  tagColor: null,
};

const BOOLEAN_KEYS = [...ROLLUP_FLAGS, "tagEnabled"] as const;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_LABEL = 40;

/** Merge a stored row (or null) onto ROLLUP_OFF. */
export function settingsFromRow(row: Partial<RollupSettings> | null): RollupSettings {
  const out: RollupSettings = { ...ROLLUP_OFF };
  if (!row) return out;
  for (const key of BOOLEAN_KEYS) out[key] = row[key] === true;
  out.tagLabel = row.tagLabel ?? null;
  out.tagColor = row.tagColor ?? null;
  return out;
}

/** Validate a PUT body. Unknown keys are ignored. */
export function normalizeRollupPatch(
  body: unknown,
): { ok: true; patch: Partial<RollupSettings> } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be an object" };
  }
  const src = body as Record<string, unknown>;
  const patch: Partial<RollupSettings> = {};

  for (const key of BOOLEAN_KEYS) {
    if (!(key in src) || src[key] === undefined) continue;
    if (typeof src[key] !== "boolean") return { ok: false, error: `${key} must be a boolean` };
    patch[key] = src[key] as boolean;
  }

  if ("tagLabel" in src && src.tagLabel !== undefined) {
    if (src.tagLabel === null) patch.tagLabel = null;
    else if (typeof src.tagLabel !== "string") return { ok: false, error: "tagLabel must be a string or null" };
    else {
      const label = src.tagLabel.trim();
      if (label.length > MAX_LABEL) return { ok: false, error: `tagLabel must be at most ${MAX_LABEL} characters` };
      patch.tagLabel = label || null;
    }
  }

  if ("tagColor" in src && src.tagColor !== undefined) {
    if (src.tagColor === null) patch.tagColor = null;
    else if (typeof src.tagColor !== "string" || !COLOR_RE.test(src.tagColor)) {
      return { ok: false, error: "tagColor must be a #rrggbb hex color or null" };
    } else patch.tagColor = src.tagColor;
  }

  return { ok: true, patch };
}

/** The client-facing badge for one child. */
export function rollupBadge(child: { id: string; name: string }, s: RollupSettings) {
  return {
    projectId: child.id,
    projectName: child.name,
    label: s.tagLabel?.trim() || child.name,
    color: s.tagColor || DEFAULT_ROLLUP_COLOR,
    tagEnabled: s.tagEnabled,
  };
}

/** Children that contribute `flag`: not ARCHIVED and the flag is on. */
export function contributingChildren<T extends { status: string; rollup: Partial<RollupSettings> | null }>(
  children: T[],
  flag: RollupFlag,
): T[] {
  return children.filter((c) => c.status !== "ARCHIVED" && c.rollup?.[flag] === true);
}

/** Pure edit rule shared by channelAuth and the payload (Phase 3 fills deps). */
export function canEditProjectRule(input: {
  slackChannelId: string | null;
  inChannel: boolean;
  addedManually: boolean;
  /** parentMembersCanEdit on AND member on parent roster. */
  viaParent: boolean;
}): boolean {
  return !input.slackChannelId || input.inChannel || input.addedManually || input.viaParent;
}
