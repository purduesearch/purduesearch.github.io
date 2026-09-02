// Member engagement profile. Single surface for everything about a member:
// rank, avatar, XP heatmap, cosmetics, badges, plus contact rows, projects,
// recent activity, GitHub stats, and inline edit (own profile only).

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  get, getActivity, patch, post,
  getAiProviders, linkAiProvider, unlinkAiProvider, getAiModels, saveAiPreferences,
} from "../../api/clubPmClient";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import RankBadge, { RANK_META } from "../../components/clubpm/RankBadge";
import BadgePicker from "../../components/clubpm/BadgePicker";
import XpHeatmap from "../../components/clubpm/XpHeatmap";
import AvatarPortrait from "../../components/clubpm/avatar/AvatarPortrait";
import GhStatsSection from "../../components/clubpm/GhStatsSection";
import GitHubConnectButton from "../../components/clubpm/github/GitHubConnectButton";
import TrainingStatusStrip from "../../components/clubpm/courses/TrainingStatusStrip";
import { progressToNextRank } from "../../clubpm/engagement/rankProgress";
import { tzOffset, copyToClipboard, activityLabels } from "../../clubpm/members/memberShared";
import { MemberName, useCosmeticStyles } from "../../clubpm/cosmetics/CosmeticStylesContext";

const AI_PROVIDERS = [
  { id: "ANTHROPIC", label: "Anthropic", icon: "fa-brain", hint: "Claude models" },
  { id: "OPENAI",    label: "OpenAI",    icon: "fa-robot", hint: "GPT models" },
];

const AI_TIER_ROWS = [
  { id: "high",   label: "High complexity",
    blurb: "Project Ask, AI action plans, blog expansion, course generation, AI reports." },
  { id: "medium", label: "Medium complexity",
    blurb: "Task enrichment, duplicate detection, natural-language and image task creation, grading." },
  { id: "low",    label: "Low complexity",
    blurb: "Inline autocomplete in the blog editor." },
];

// Bring-your-own AI provider. Own profile only — a key is personal, and there is no
// sharing path by design. The key itself is never read back from the API, so it only
// lives in state for as long as the link form is open.
function AiModelsSection() {
  const [credentials, setCredentials] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [modelsByProvider, setModelsByProvider] = useState({});
  const [linking, setLinking] = useState(null);   // provider id or null
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);

  const loadModels = useCallback(async (provider) => {
    try {
      const { models } = await getAiModels(provider);
      setModelsByProvider((prev) => ({ ...prev, [provider]: models }));
    } catch {
      setModelsByProvider((prev) => ({ ...prev, [provider]: [] }));
    }
  }, []);

  const refresh = useCallback(async () => {
    const data = await getAiProviders();
    setCredentials(data.credentials || []);
    setPreferences(data.preferences || null);
    for (const c of data.credentials || []) {
      if (c.status === "ACTIVE") loadModels(c.provider);
    }
  }, [loadModels]);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const linked = (provider) => credentials.find((c) => c.provider === provider);

  async function handleLink(provider) {
    setBusy(true);
    try {
      await linkAiProvider(provider, keyInput.trim());
      setKeyInput("");
      setLinking(null);
      await refresh();
      toast.success(`${provider === "ANTHROPIC" ? "Anthropic" : "OpenAI"} account linked`);
    } catch (err) {
      toast.error(err?.message || "Could not link that key");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink(provider) {
    setBusy(true);
    try {
      await unlinkAiProvider(provider);
      await refresh();
      toast.success("Account unlinked");
    } catch {
      toast.error("Could not unlink that account");
    } finally {
      setBusy(false);
    }
  }

  async function handleTierChange(tier, patchValue) {
    const next = { ...preferences, [tier]: { ...preferences[tier], ...patchValue } };
    // Switching provider clears the model — a Claude id is meaningless to OpenAI.
    if (patchValue.provider) {
      next[tier].model = patchValue.provider === "GEMINI"
        ? null
        : (modelsByProvider[patchValue.provider]?.[0]?.id ?? null);
    }
    setPreferences(next);
    try {
      const { preferences: saved } = await saveAiPreferences(next);
      setPreferences(saved);
    } catch (err) {
      toast.error(err?.message || "Could not save that preference");
      refresh().catch(() => {});
    }
  }

  return (
    <div className="cpm-profile-card pm-ai-models">
      <h3 className="pm-ai-models-title">
        <i className="fas fa-microchip" aria-hidden="true" /> AI Models
      </h3>
      <p className="pm-ai-models-intro">
        By default every AI feature runs on the club's shared Gemini key, which has a
        small daily budget for the heaviest features. Link your own account to use it
        instead — it is used only for AI you trigger, and never by anyone else.
      </p>

      <div className="pm-ai-provider-grid">
        {AI_PROVIDERS.map((p) => {
          const cred = linked(p.id);
          return (
            <div key={p.id} className="pm-ai-provider-card">
              <div className="pm-ai-provider-head">
                <i className={`fas ${p.icon}`} aria-hidden="true" />
                <span className="pm-ai-provider-name">{p.label}</span>
                {cred && (
                  <span className={`pm-ai-badge pm-ai-badge--${cred.status.toLowerCase()}`}>
                    {cred.status === "ACTIVE" ? "Linked" : "Key rejected"}
                  </span>
                )}
              </div>
              <p className="pm-ai-provider-hint">{p.hint}</p>

              {cred ? (
                <div className="pm-ai-provider-actions">
                  <code className="pm-ai-key-hint">sk-…{cred.keyHint}</code>
                  <button type="button" className="clubpm-btn-ghost"
                          disabled={busy} onClick={() => handleUnlink(p.id)}>
                    Unlink
                  </button>
                </div>
              ) : linking === p.id ? (
                <form className="pm-ai-link-form"
                      onSubmit={(e) => { e.preventDefault(); handleLink(p.id); }}>
                  <input type="password" className="cpm-form-input" autoComplete="off"
                         placeholder={`Paste your ${p.label} API key`}
                         value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
                  <p className="pm-ai-consent">
                    Project data included in AI prompts will be sent to {p.label} under
                    your own account, and billed to it.
                  </p>
                  <div className="pm-ai-provider-actions">
                    <button type="submit" className="clubpm-btn-primary"
                            disabled={busy || !keyInput.trim()}>Save key</button>
                    <button type="button" className="clubpm-btn-ghost"
                            onClick={() => { setLinking(null); setKeyInput(""); }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button type="button" className="clubpm-btn-primary"
                        onClick={() => setLinking(p.id)}>Link account</button>
              )}
            </div>
          );
        })}
      </div>

      {preferences && (
        <div className="pm-ai-tiers">
          <h4 className="pm-ai-tiers-title">Model per task type</h4>
          {AI_TIER_ROWS.map((tier) => {
            const pref = preferences[tier.id] || { provider: "GEMINI", model: null };
            const models = modelsByProvider[pref.provider] || [];
            return (
              <div key={tier.id} className="pm-ai-tier-row">
                <div className="pm-ai-tier-meta">
                  <span className="pm-ai-tier-label">{tier.label}</span>
                  <span className="pm-ai-tier-blurb">{tier.blurb}</span>
                </div>
                <div className="pm-ai-tier-controls">
                  <select className="cpm-form-input" value={pref.provider}
                          onChange={(e) => handleTierChange(tier.id, { provider: e.target.value })}>
                    <option value="GEMINI">Built-in (Gemini)</option>
                    {credentials.filter((c) => c.status === "ACTIVE").map((c) => (
                      <option key={c.provider} value={c.provider}>
                        {c.provider === "ANTHROPIC" ? "Anthropic" : "OpenAI"}
                      </option>
                    ))}
                  </select>
                  {pref.provider !== "GEMINI" && (
                    <select className="cpm-form-input" value={pref.model || ""}
                            onChange={(e) => handleTierChange(tier.id, { model: e.target.value })}>
                      {models.length === 0 && <option value="">Loading models…</option>}
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>{m.displayName}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { memberId: routeId } = useParams();
  const { member: authMember } = useClubPmAuth();
  const memberId = routeId ?? authMember?.id;
  const isSelf = memberId === authMember?.id;

  const [profile, setProfile] = useState(null);
  const [xpHistory, setXpHistory] = useState([]);
  const [activity, setActivity] = useState([]);
  const [cosmetics, setCosmetics] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editMode, setEditMode] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = () => {
      if (memberId) get(`/api/members/${memberId}/cosmetics`).then(setCosmetics).catch(() => {});
    };
    window.addEventListener("avatar-updated", handler);
    return () => window.removeEventListener("avatar-updated", handler);
  }, [memberId]);

  const load = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    try {
      const [p, h, c, detail, act] = await Promise.all([
        get(`/api/members/${memberId}/profile`),
        get(`/api/members/${memberId}/xp-history`),
        get(`/api/members/${memberId}/cosmetics`),
        get(`/api/members/${memberId}`),
        getActivity(memberId, 365).catch(() => ({ activity: [] })),
      ]);
      // Merge: /profile drives identity (rank/xp/doubloons); /:id brings projects,
      // activityLogs, email, bio, title, timezone, githubLogin, role.
      setProfile({ ...detail, ...p });
      setXpHistory(h);
      setActivity(act?.activity ?? []);
      setCosmetics(c);
    } catch (err) {
      console.error("Load profile error:", err);
    } finally {
      setLoading(false);
    }
  }, [memberId, authMember?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile) return;
    setEditBio(profile.bio ?? "");
    setEditDisplayName(profile.displayName ?? "");
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await patch("/api/members/me", {
        bio: editBio,
        displayName: editDisplayName,
      });
      await load();
      setEditMode(false);
    } catch (err) {
      console.error("Failed to save profile:", err);
    } finally {
      setSaving(false);
    }
  };

  const { refresh: refreshCosmeticStyles } = useCosmeticStyles();
  const [equipping, setEquipping] = useState(null);

  const handleEquip = async (slot, cosmeticId) => {
    setEquipping(cosmeticId ?? slot);
    try {
      await post("/api/shop/equip", { slot, cosmeticId });
      const next = await get(`/api/members/${memberId}/cosmetics`);
      setCosmetics(next);
      await load();
      refreshCosmeticStyles();
      window.dispatchEvent(new CustomEvent("avatar-updated"));
    } catch (err) {
      toast.error(err.message ?? "Failed to equip");
    } finally {
      setEquipping(null);
    }
  };

  if (loading || !profile) {
    return <div style={{ padding: 24 }}>Loading profile…</div>;
  }

  const rankInfo = progressToNextRank(profile.xp);
  const badges = profile.ownedBadges ?? [];

  return (
    <div className="cpm-profile-grid">
      {/* ── Left column ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Identity + rank card */}
        <div className="cpm-profile-card">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
            <AvatarPortrait member={profile} size={56} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                <MemberName memberId={profile.id}>{profile.displayName}</MemberName>
              </div>
              <div style={{ color: "var(--clubpm-text-muted, #636b7a)", fontSize: 13 }}>@{profile.slackHandle}</div>
              {profile.title && (
                <div style={{ fontSize: 12, color: "var(--pm-text-secondary)", marginTop: 2 }}>{profile.title}</div>
              )}
              <div className="pm-member-badges" style={{ marginTop: 6 }}>
                <span className={`pm-member-role-badge ${profile.isAdmin ? "admin" : (profile.role?.toLowerCase() || "member")}`}>
                  {profile.isAdmin ? "Admin" : profile.role === "LEAD" ? "Lead" : "Member"}
                </span>
              </div>
            </div>
          </div>

          <div className="cpm-profile-contact">
            {profile.email && (
              <div className="cpm-profile-contact-row" onClick={() => copyToClipboard(profile.email)} title="Copy email">
                <i className="fas fa-envelope" />
                <span>{profile.email}</span>
                <i className="fas fa-copy cpm-profile-copy-icon" />
              </div>
            )}
            {profile.timezone && tzOffset(profile.timezone) && (
              <div className="cpm-profile-contact-row">
                <i className="fas fa-clock" />
                <span>{tzOffset(profile.timezone)} ({profile.timezone})</span>
              </div>
            )}
            {profile.githubLogin && (
              <div className="cpm-profile-contact-row">
                <i className="fab fa-github" />
                <a href={`https://github.com/${profile.githubLogin}`} target="_blank" rel="noreferrer">@{profile.githubLogin}</a>
              </div>
            )}
          </div>

          {profile.bio && !editMode && (
            <div className="cpm-profile-bio">{profile.bio}</div>
          )}

          {isSelf && !editMode && (
            <button type="button" className="cpm-profile-edit-btn" onClick={() => setEditMode(true)}>
              <i className="fas fa-pencil-alt" aria-hidden="true" /> Edit profile
            </button>
          )}
          {isSelf && editMode && (
            <div className="cpm-profile-edit-form">
              <label>
                Display name
                <input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} />
              </label>
              <label>
                Bio
                <textarea value={editBio} onChange={e => setEditBio(e.target.value)} rows={3} />
              </label>
              <div className="cpm-profile-edit-actions">
                <button type="button" className="cpm-profile-edit-cancel" onClick={() => setEditMode(false)} disabled={saving}>Cancel</button>
                <button type="button" className="cpm-profile-edit-save" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }} data-tour-id="profile.rank">
            <RankBadge rank={profile.rank} />
          </div>

          <div style={{ marginTop: 12, fontSize: 13, color: "var(--clubpm-text-muted, #636b7a)" }}>
            {rankInfo.next
              ? `${profile.xp.toLocaleString()} XP · ${rankInfo.xpToNext.toLocaleString()} to ${RANK_META[rankInfo.next.rank].label}`
              : `${profile.xp.toLocaleString()} XP · max rank reached`}
          </div>
          <div className="cpm-xp-bar"><div className="cpm-xp-bar-fill" style={{ width: `${rankInfo.pct}%` }} /></div>

          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="cpm-doubloons">
              <i className="fas fa-coins" aria-hidden="true" />
              {profile.doubloons.toLocaleString()} doubloons
            </span>
            {profile.pendingCount > 0 && isSelf && (
              <span style={{ fontSize: 12, color: "var(--clubpm-text-muted, #636b7a)" }}>
                {profile.pendingCount} reward{profile.pendingCount > 1 ? "s" : ""} awaiting admin review
              </span>
            )}
          </div>
        </div>

        {/* Avatar */}
        <div className="cpm-profile-card" data-tour-id="profile.avatar" style={{ position: "relative", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, overflow: "hidden" }}>
          <AvatarPortrait member={profile} size={260} />
        </div>
      </div>

      {/* ── Right column ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Your own safety-training standing; renders nothing on someone else's profile */}
        <TrainingStatusStrip isSelf={isSelf} />

        {/* Daily activity (XP heatmap + streak outline on kept days) */}
        <div className="cpm-profile-card" data-tour-id="profile.history">
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            Daily activity
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: '#ff8c3a' }}>
              <i className="fas fa-fire" aria-hidden="true" /> streak kept
            </span>
          </h3>
          <XpHeatmap data={xpHistory} activity={activity} />
        </div>

        {/* Projects */}
        <div className="cpm-profile-card">
          <h3 style={{ marginTop: 0 }}>Projects ({profile.projects?.length ?? 0})</h3>
          {(profile.projects ?? []).length === 0 ? (
            <div style={{ color: "var(--clubpm-text-muted, #636b7a)" }}>No projects yet</div>
          ) : (
            <div className="pm-member-drawer-projects">
              {profile.projects.map(pm => {
                const p = pm.project;
                const myTasks = p.tasks?.length ?? 0;
                const done = p.tasks?.filter(t => t.status === "DONE").length ?? 0;
                const pct = myTasks > 0 ? Math.round((done / myTasks) * 100) : 0;
                const dotClass = { ACTIVE: "cpm-dot-active", PAUSED: "cpm-dot-paused", COMPLETED: "cpm-dot-done", ARCHIVED: "cpm-dot-muted" }[p.status] ?? "cpm-dot-muted";
                return (
                  <Link key={p.id} to={`/clubpm/projects/${p.id}`} className="pm-member-drawer-project-row">
                    <span className={`cpm-status-dot ${dotClass}`} />
                    <span className="pm-member-drawer-project-name">{p.name}</span>
                    <span className="pm-member-drawer-project-tasks">{myTasks} task{myTasks !== 1 ? "s" : ""}</span>
                    {myTasks > 0 && (
                      <div className="pm-member-drawer-project-bar">
                        <div className="pm-member-drawer-project-fill" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="cpm-profile-card">
          <h3 style={{ marginTop: 0 }}>Recent activity</h3>
          {(profile.activityLogs ?? []).length === 0 ? (
            <div style={{ color: "var(--clubpm-text-muted, #636b7a)" }}>No recent activity</div>
          ) : (
            <div className="pm-member-drawer-activity">
              {profile.activityLogs.slice(0, 10).map(log => (
                <div key={log.id} className="pm-member-drawer-activity-row">
                  <span className="pm-member-drawer-activity-dot" />
                  <span className="pm-member-drawer-activity-text">
                    {activityLabels[log.eventType] ?? log.eventType.toLowerCase().replace(/_/g, " ")}
                    {log.project && <span className="pm-member-drawer-activity-project"> · {log.project.name}</span>}
                  </span>
                  <span className="pm-member-drawer-activity-time">
                    {new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Integrations — only on your own profile; GitHub connect lives here so the sidebar stays clean */}
        {isSelf && (
          <div className="cpm-profile-card">
            <h3 style={{ marginTop: 0 }}>Integrations</h3>
            <GitHubConnectButton />
          </div>
        )}

        {/* Bring-your-own AI provider — own profile only; keys are personal */}
        {isSelf && <AiModelsSection />}

        {/* GitHub stats — only renders if member has githubLogin AND a project with a repo */}
        {profile.githubLogin && <GhStatsSection memberId={memberId} />}

        {/* Cosmetic locker */}
        <div className="cpm-profile-card">
          <h3 style={{ marginTop: 0 }}>Cosmetics</h3>
          {(() => {
            const SLOTS = [
              { slot: "theme",     category: "DASHBOARD_THEME", label: "Dashboard theme" },
              { slot: "frame",     category: "NAME_FRAME",      label: "Name frame"      },
              { slot: "border",    category: "BORDER",          label: "Avatar border"   },
              { slot: "animation", category: "ANIMATION",       label: "Animation"       },
            ];
            const owned = cosmetics.map(mc => ({ ...mc.cosmetic, equippedSlot: mc.equippedSlot }));

            return SLOTS.map(({ slot, category, label }) => {
              const items   = owned.filter(c => c.category === category);
              const current = items.find(c => c.equippedSlot === slot) ?? null;

              return (
                <div key={slot} className="cpm-locker-slot">
                  <div className="cpm-locker-slot-label">{label}</div>
                  {items.length === 0 ? (
                    <div className="cpm-locker-empty">None owned — check the <Link to="/clubpm/shop">shop</Link>.</div>
                  ) : (
                    <div className="cpm-cosmetic-grid">
                      {items.map(c => {
                        const active = current?.id === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={!isSelf || equipping !== null}
                            onClick={() => handleEquip(slot, active ? null : c.id)}
                            title={isSelf ? (active ? "Click to unequip" : "Click to equip") : undefined}
                            className={`cpm-cosmetic-chip cpm-rarity-${c.rarity.toLowerCase()}${active ? " cpm-cosmetic-chip--active" : ""}`}
                          >
                            <span className="cpm-cosmetic-name">{c.name}</span>
                            <span className="cpm-cosmetic-meta">
                              {active ? "equipped" : c.rarity.toLowerCase()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>

        {/* Badges */}
        <div className="cpm-profile-card">
          <h3 style={{ marginTop: 0 }}>Badges</h3>
          {badges.length === 0
            ? <div style={{ color: "var(--clubpm-text-muted, #636b7a)" }}>No badges yet — keep contributing!</div>
            : (
              <>
                <BadgePicker
                  badges={badges}
                  activeBadgeId={profile.equippedBadgeId ?? null}
                  editable={isSelf}
                  rank={profile.rank}
                  onChange={(id) => setProfile(p => ({
                    ...p,
                    equippedBadgeId: id,
                    equippedBadge: id ? (badges.find(b => b.id === id) ?? null) : null,
                  }))}
                />
                {isSelf && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--clubpm-text-muted, #636b7a)" }}>
                    Click a badge to make it your active badge — it shows next to your name in the sidebar and on the leaderboard.
                  </div>
                )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
