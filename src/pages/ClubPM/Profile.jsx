// Member engagement profile. Single surface for everything about a member:
// rank, avatar, XP heatmap, cosmetics, badges, plus contact rows, projects,
// recent activity, GitHub stats, and inline edit (own profile only).

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { get, getActivity, patch } from "../../api/clubPmClient";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import RankBadge, { RANK_META } from "../../components/clubpm/RankBadge";
import CosmeticChip from "../../components/clubpm/CosmeticChip";
import BadgePicker from "../../components/clubpm/BadgePicker";
import XpHeatmap from "../../components/clubpm/XpHeatmap";
import AvatarPortrait from "../../components/clubpm/avatar/AvatarPortrait";
import GhStatsSection from "../../components/clubpm/GhStatsSection";
import GitHubConnectButton from "../../components/clubpm/github/GitHubConnectButton";
import { progressToNextRank } from "../../clubpm/engagement/rankProgress";
import { tzOffset, copyToClipboard, activityLabels, TEAMS } from "../../clubpm/members/memberShared";

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
  const [editTeam, setEditTeam] = useState("");
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
      // activityLogs, email, team, bio, title, timezone, githubLogin, role.
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
    setEditTeam(profile.team ?? "");
    setEditDisplayName(profile.displayName ?? "");
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await patch("/api/members/me", {
        bio: editBio,
        team: editTeam,
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

  if (loading || !profile) {
    return <div style={{ padding: 24 }}>Loading profile…</div>;
  }

  const rankInfo = progressToNextRank(profile.xp);
  const equipped = Object.values(profile.equippedCosmetics ?? {}).filter(Boolean);
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
              <div style={{ fontWeight: 700, fontSize: 18 }}>{profile.displayName}</div>
              <div style={{ color: "var(--clubpm-text-muted, #636b7a)", fontSize: 13 }}>@{profile.slackHandle}</div>
              {profile.title && (
                <div style={{ fontSize: 12, color: "var(--pm-text-secondary)", marginTop: 2 }}>{profile.title}</div>
              )}
              <div className="pm-member-badges" style={{ marginTop: 6 }}>
                <span className={`pm-member-role-badge ${profile.isAdmin ? "admin" : (profile.role?.toLowerCase() || "member")}`}>
                  {profile.isAdmin ? "Admin" : profile.role === "LEAD" ? "Lead" : "Member"}
                </span>
                {profile.team && <span className="pm-member-team-badge">{profile.team}</span>}
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
                Team
                <select value={editTeam} onChange={e => setEditTeam(e.target.value)}>
                  <option value="">Unassigned</option>
                  {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
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

          <div style={{ marginTop: 14 }}>
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
        <div className="cpm-profile-card" style={{ position: "relative", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, overflow: "hidden" }}>
          <AvatarPortrait member={profile} size={260} />
        </div>
      </div>

      {/* ── Right column ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Daily activity (XP heatmap + streak outline on kept days) */}
        <div className="cpm-profile-card">
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

        {/* GitHub stats — only renders if member has githubLogin AND a project with a repo */}
        {profile.githubLogin && <GhStatsSection memberId={memberId} />}

        {/* Equipped cosmetics */}
        <div className="cpm-profile-card">
          <h3 style={{ marginTop: 0 }}>Equipped</h3>
          {equipped.length === 0
            ? <div style={{ color: "var(--clubpm-text-muted, #636b7a)" }}>Nothing equipped yet.</div>
            : (
              <div className="cpm-cosmetic-grid">
                {equipped.map(c => <CosmeticChip key={c.id} cosmetic={c} />)}
              </div>
            )}
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

        {/* Inventory (non-badge, non-equipped) */}
        <div className="cpm-profile-card">
          <h3 style={{ marginTop: 0 }}>Inventory</h3>
          {(() => {
            const equippedIds = new Set(equipped.map(c => c.id));
            const inv = cosmetics
              .map(mc => mc.cosmetic)
              .filter(c => c.category !== "BADGE" && !equippedIds.has(c.id));
            return inv.length === 0
              ? <div style={{ color: "var(--clubpm-text-muted, #636b7a)" }}>Empty.</div>
              : <div className="cpm-cosmetic-grid">{inv.map(c => <CosmeticChip key={c.id} cosmetic={c} />)}</div>;
          })()}
        </div>
      </div>
    </div>
  );
}
