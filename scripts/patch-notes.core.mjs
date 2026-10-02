// Constellation patch notes — every rule lives here, and every function here is
// pure (no git, no fs), so `npm run test:scripts` covers the whole policy.
// The git plumbing is in scripts/patch-notes.mjs; the maintainer guide is
// docs/PATCH-NOTES.md.

export const CONFIG = {
  // Releases are annotated git tags named <tagPrefix><semver>. The daily
  // workflow (.github/workflows/patch-notes.yml) creates them; nothing else
  // stores a version.
  tagPrefix: 'constellation-v',
  firstVersion: '1.0.0',

  // A commit is a Constellation change when it touches at least one path that
  // starts with an `include` prefix and does not match an `exclude` pattern.
  include: [
    'backend/',
    'src/pages/ClubPM/',
    'src/components/clubpm/',
    'src/clubpm/',
    'src/api/clubPmClient.js',
    'public/clubpm-theme.css',
  ],
  exclude: [
    /\.test\.[cm]?[jt]sx?$/,
    /\.md$/,
    /(^|\/)__(tests|fixtures)__\//,
  ],

  // Conventional Commit types that reach members, in display order. Any other
  // type (refactor, chore, docs, test, ci, build, style, revert) is left out.
  sections: [
    { type: 'feat', title: 'New' },
    { type: 'perf', title: 'Improved' },
    { type: 'fix', title: 'Fixed' },
  ],
  // Section for a commit that is included only because of a Patch-Note trailer.
  fallbackType: 'perf',
  // Any `feat` bumps the minor version; anything else bumps the patch.
  // Major versions are never automatic — tag one by hand (see the guide).
  minorTypes: ['feat'],

  // Display names for scopes that title-casing gets wrong.
  scopeLabels: {
    ai: 'AI',
    api: 'API',
    cr: 'Change requests',
    crm: 'CRM',
    github: 'GitHub',
    pm: 'Constellation',
    ui: 'Interface',
  },

  // Commit trailer that rewrites a note (`Patch-Note: Friendlier wording`) or
  // drops the commit (`Patch-Note: skip`).
  trailer: 'Patch-Note',

  // Same effect as the trailer, for commits that are already pushed: a commit
  // SHA (or a unique prefix of at least 7 characters) → note text or 'skip'.
  // Wins over the trailer.
  overrides: {
  },

  // Oldest releases fall off the generated file past this count.
  maxReleases: 100,
};

const SUBJECT_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSubject(subject) {
  const m = SUBJECT_RE.exec(subject.trim());
  if (!m) return { type: null, scope: null, breaking: false, description: subject.trim() };
  return { type: m[1].toLowerCase(), scope: m[2] || null, breaking: !!m[3], description: m[4].trim() };
}

export function touchesConstellation(files, config = CONFIG) {
  return files.some(file =>
    config.include.some(prefix => file.startsWith(prefix))
    && !config.exclude.some(re => re.test(file)));
}

export function scopeLabel(scope, config = CONFIG) {
  if (!scope) return null;
  const key = scope.toLowerCase();
  if (config.scopeLabels[key]) return config.scopeLabels[key];
  return key.split(/[-_/ ]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function tidy(text) {
  const t = text.trim().replace(/\.+$/, '');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/**
 * One commit → one note, or null when members should not see it.
 * commit = { sha, subject, trailer, files }; `trailer` is the Patch-Note value
 * ('' when absent).
 */
export function noteFor(commit, config = CONFIG) {
  const pinned = Object.keys(config.overrides)
    .find(prefix => prefix.length >= 7 && commit.sha.startsWith(prefix));
  const override = (pinned ? config.overrides[pinned] : commit.trailer || '').trim();
  if (override.toLowerCase() === 'skip') return null;

  const { type, scope, description } = parseSubject(commit.subject);
  const listed = config.sections.some(s => s.type === type);

  if (override) {
    return {
      type: listed ? type : config.fallbackType,
      scope: scopeLabel(scope, config),
      text: tidy(override),
      sha: commit.sha,
    };
  }
  if (!listed || !touchesConstellation(commit.files, config)) return null;
  return { type, scope: scopeLabel(scope, config), text: tidy(description), sha: commit.sha };
}

/** Notes for one release, grouped into the configured sections (empty ones dropped). */
export function buildSections(commits, config = CONFIG) {
  const seen = new Set();
  const byType = new Map(config.sections.map(s => [s.type, []]));
  // git log lists newest first; show a release's notes in the order they landed.
  for (const commit of [...commits].reverse()) {
    const note = noteFor(commit, config);
    if (!note) continue;
    const key = `${note.type}|${note.scope}|${note.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byType.get(note.type).push({ text: note.text, scope: note.scope, sha: note.sha.slice(0, 8) });
  }
  return config.sections
    .map(s => ({ type: s.type, title: s.title, items: byType.get(s.type) }))
    .filter(s => s.items.length > 0);
}

export function parseVersion(tag, config = CONFIG) {
  if (!tag.startsWith(config.tagPrefix)) return null;
  const m = SEMVER_RE.exec(tag.slice(config.tagPrefix.length));
  return m ? m.slice(1).map(Number) : null;
}

export function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function nextVersion(previous, sections, config = CONFIG) {
  if (!previous) return config.firstVersion;
  const [major, minor, patch] = previous;
  const minorBump = sections.some(s => config.minorTypes.includes(s.type));
  return minorBump ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

/**
 * releases = [{ version, date, baseline, sections }] in any order → the
 * payload the Constellation "What's new" page fetches, newest first. The
 * oldest tag has nothing to compare against, so the caller marks it
 * `baseline` with no sections.
 */
export function buildPayload(releases, generatedAt, config = CONFIG) {
  const sorted = [...releases].sort((a, b) =>
    compareVersions(b.version.split('.').map(Number), a.version.split('.').map(Number)));
  return {
    generatedAt,
    current: sorted[0]?.version ?? null,
    releases: sorted.slice(0, config.maxReleases),
  };
}
