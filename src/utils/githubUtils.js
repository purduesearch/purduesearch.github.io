// Frontend GitHub URL/identifier helpers — mirrors backend parseRepoUrl().

const REPO_PATTERNS = [
  /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
  /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i,
];

export function parseRepoInput(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  for (const re of REPO_PATTERNS) {
    const m = re.exec(trimmed);
    if (m) return { owner: m[1], repo: m[2], slug: `${m[1]}/${m[2]}` };
  }
  return null;
}

export function repoUrl(ownerOrSlug, repo) {
  if (repo) return `https://github.com/${ownerOrSlug}/${repo}`;
  return `https://github.com/${ownerOrSlug}`;
}

// Pick a readable foreground color for a label given a 6-char hex background.
// GitHub stores label colors as bare hex strings (no #).
export function labelContrast(hex) {
  if (!hex || hex.length !== 6) return "#fff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // YIQ luminance
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000" : "#fff";
}

export function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

// Best-guess language for syntax highlighting from a file path.
export function languageFromPath(path) {
  if (!path) return "text";
  const ext = path.split(".").pop()?.toLowerCase();
  const map = {
    js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx",
    py: "python", rb: "ruby", go: "go", rs: "rust",
    java: "java", kt: "kotlin", swift: "swift",
    c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp",
    sh: "bash", zsh: "bash", bash: "bash",
    sql: "sql", json: "json", yml: "yaml", yaml: "yaml",
    toml: "toml", xml: "xml", html: "html", htm: "html",
    css: "css", scss: "scss", sass: "sass", less: "less",
    md: "markdown", markdown: "markdown",
    php: "php", lua: "lua", r: "r", scala: "scala",
    prisma: "prisma", graphql: "graphql", proto: "protobuf",
    dockerfile: "dockerfile",
  };
  return map[ext] ?? "text";
}

export const ICON = {
  issue: "fa-circle-dot",
  issueClosed: "fa-circle-check",
  pr: "fa-code-pull-request",
  prMerged: "fa-code-merge",
  branch: "fa-code-branch",
  commit: "fa-code-commit",
  file: "fa-file-code",
  folder: "fa-folder",
  star: "fa-star",
  fork: "fa-code-fork",
  check: "fa-check-circle",
  failed: "fa-times-circle",
  pending: "fa-clock",
};
