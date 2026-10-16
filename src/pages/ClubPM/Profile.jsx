// Member profile. One surface for everything about a member, organised as tabs
// next to a sticky identity card:
//   Overview   daily activity, skills snapshot, recent activity, GitHub stats
//   Quests     streak, daily/weekly/monthly quests, achievements (own profile)
//   Skills     the full skills view (own: evidence/claims/privacy; teammate: endorse)
//   Training   safety-training standing (own profile)
//   Projects   project membership with task breakdown
//   Customize  badges, cosmetics, integrations
// The active tab lives in `?tab=` so links and the guided tour can target it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { get, getActivity, patch, post, skillsApi } from "../../api/clubPmClient";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import BadgePicker from "../../components/clubpm/BadgePicker";
import XpHeatmap from "../../components/clubpm/XpHeatmap";
import GhStatsSection from "../../components/clubpm/GhStatsSection";
import GitHubConnectButton from "../../components/clubpm/github/GitHubConnectButton";
import IcsFeedConnect from "../../components/clubpm/IcsFeedConnect";
import TrainingStatusStrip from "../../components/clubpm/courses/TrainingStatusStrip";
import SkillsWorkspace from "./SkillsWorkspace";
import MemberSkillsCard from "../../components/clubpm/skills/MemberSkillsCard";
import ProfileSidebar from "../../components/clubpm/profile/ProfileSidebar";
import ProfileTabs from "../../components/clubpm/profile/ProfileTabs";
import ProjectsTab from "../../components/clubpm/profile/ProjectsTab";
import QuestsTab, { useQuestData } from "../../components/clubpm/profile/QuestsTab";
import { progressToNextRank } from "../../clubpm/engagement/rankProgress";
import { activityLabels } from "../../clubpm/members/memberShared";
import { useCosmeticStyles } from "../../clubpm/cosmetics/CosmeticStylesContext";

const COSMETIC_SLOTS = [
  { slot: "theme",     category: "DASHBOARD_THEME", label: "Dashboard theme" },
  { slot: "frame",     category: "NAME_FRAME",      label: "Name frame"      },
  { slot: "border",    category: "BORDER",          label: "Avatar border"   },
  { slot: "animation", category: "ANIMATION",       label: "Animation"       },
];

/** A few of the member's strongest skills, linking to the Skills tab. */
function SkillsSnapshot({ memberId, isSelf, onOpen }) {
  const [state, setState] = useState({ status: "loading", skills: [], total: 0 });

  useEffect(() => {
    let live = true;
    (isSelf ? skillsApi.me() : skillsApi.member(memberId))
      .then((d) => {
        if (!live) return;
        if (d?.hidden) { setState({ status: "hidden", skills: [], total: 0 }); return; }
        const all = (d?.groups ?? []).flatMap(g => (g.skills ?? []).map(s => ({
          id: s.skillId,
          name: s.name,
          level: s.level ?? (s.provenances?.find(p => p.provenance === "AI_INFERRED") ?? s.provenances?.[0])?.level ?? 0,
        })));
        all.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
        setState({ status: "ready", skills: all.slice(0, 8), total: all.length });
      })
      .catch(() => { if (live) setState({ status: "error", skills: [], total: 0 }); });
    return () => { live = false; };
  }, [memberId, isSelf]);

  return (
    <div className="cpm-profile-card">
      <div className="cpm-pf-head">
        <h2>Skills {state.total > 0 && <span className="cpm-skill-count">{state.total}</span>}</h2>
      </div>
      {state.status === "loading" && <p className="cpm-pf-empty">Loading…</p>}
      {state.status === "hidden" && <p className="cpm-pf-empty">Skills are private.</p>}
      {state.status === "error" && <p className="cpm-pf-empty">Skills could not be loaded.</p>}
      {state.status === "ready" && state.total === 0 && <p className="cpm-pf-empty">Nothing inferred yet. Skills appear after the weekly analysis.</p>}
      {state.status === "ready" && state.total > 0 && (
        <div className="cpm-pf-tags">
          {state.skills.map(s => (
            <button key={s.id} type="button" className="cpm-pf-tag" onClick={onOpen} title={`Level ${s.level} of 5`}>
              {s.name}<em>L{s.level}</em>
            </button>
          ))}
        </div>
      )}
      {state.status === "ready" && state.total > 0 && (
        <button type="button" className="cpm-pf-btn cpm-pf-btn--ghost" onClick={onOpen}>
          Open skills workspace <i className="fas fa-arrow-right" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function RecentActivity({ logs }) {
  return (
    <div className="cpm-profile-card">
      <div className="cpm-pf-head"><h2>Recent activity</h2></div>
      {logs.length === 0 ? (
        <p className="cpm-pf-empty">No recent activity.</p>
      ) : (
        <div className="cpm-pf-acts">
          {logs.slice(0, 8).map(log => (
            <div key={log.id} className="cpm-pf-act">
              <i aria-hidden="true" />
              <span>
                {activityLabels[log.eventType] ?? log.eventType.toLowerCase().replace(/_/g, " ")}
                {log.project && <span className="cpm-pf-act-proj"> · {log.project.name}</span>}
              </span>
              <time>{new Date(log.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { memberId: routeId } = useParams();
  const { member: authMember } = useClubPmAuth();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // `silent` refreshes in place (after a save, equip or claim) without
  // unmounting the tabs behind a loading screen.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!memberId) return;
    if (!silent) setLoading(true);
    try {
      const [p, h, c, detail, act] = await Promise.all([
        get(`/api/members/${memberId}/profile`),
        get(`/api/members/${memberId}/xp-history`),
        get(`/api/members/${memberId}/cosmetics`),
        get(`/api/members/${memberId}`),
        getActivity(memberId, 365).catch(() => ({ activity: [] })),
      ]);
      // /profile drives identity (rank/xp/doubloons); /:id brings projects,
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
  }, [memberId]);

  // A different member's profile starts from a clean slate.
  useEffect(() => { setProfile(null); setEditMode(false); }, [memberId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile) return;
    setEditBio(profile.bio ?? "");
    setEditDisplayName(profile.displayName ?? "");
  }, [profile]);

  const quests = useQuestData(isSelf, () => load({ silent: true }));

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await patch("/api/members/me", { bio: editBio, displayName: editDisplayName });
      await load({ silent: true });
      setEditMode(false);
      toast.success("Profile saved");
    } catch (err) {
      toast.error(err?.message ?? "Could not save your profile");
    } finally {
      setSaving(false);
    }
  }, [editBio, editDisplayName, load]);

  const { refresh: refreshCosmeticStyles } = useCosmeticStyles();
  const [equipping, setEquipping] = useState(null);

  const handleEquip = async (slot, cosmeticId) => {
    setEquipping(cosmeticId ?? slot);
    try {
      await post("/api/shop/equip", { slot, cosmeticId });
      setCosmetics(await get(`/api/members/${memberId}/cosmetics`));
      await load({ silent: true });
      refreshCosmeticStyles();
      window.dispatchEvent(new CustomEvent("avatar-updated"));
      toast.success(cosmeticId ? "Equipped" : "Unequipped");
    } catch (err) {
      toast.error(err.message ?? "Failed to equip");
    } finally {
      setEquipping(null);
    }
  };

  const tabs = useMemo(() => {
    const t = [{ id: "overview", label: "Overview", icon: "fa-gauge-high" }];
    if (isSelf) t.push({ id: "quests", label: "Quests", icon: "fa-trophy", badge: quests.claimable || null, badgeLabel: "ready to claim" });
    t.push({ id: "skills", label: "Skills", icon: "fa-bolt" });
    if (isSelf) t.push({ id: "training", label: "Training", icon: "fa-certificate" });
    t.push({ id: "projects", label: "Projects", icon: "fa-diagram-project" });
    t.push({ id: "customize", label: isSelf ? "Customize" : "Cosmetics", icon: "fa-wand-magic-sparkles" });
    return t;
  }, [isSelf, quests.claimable]);

  const requested = searchParams.get("tab");
  const tab = tabs.some(t => t.id === requested) ? requested : "overview";
  const setTab = useCallback((id) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id === "overview") next.delete("tab"); else next.set("tab", id);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // 1-N switch tabs, E edits the profile. Ignored while typing or with modifiers.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el?.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= tabs.length) { setTab(tabs[n - 1].id); return; }
      if (e.key.toLowerCase() === "e" && isSelf && profile) setEditMode(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs, setTab, isSelf, profile]);

  if (!profile) {
    return <div className="cpm-pf-loading">{loading ? "Loading profile…" : "This profile could not be loaded."}</div>;
  }

  const rankInfo = progressToNextRank(profile.xp);
  const badges = profile.ownedBadges ?? [];
  const projects = (profile.projects ?? []).map(pm => pm.project).filter(Boolean);
  const owned = cosmetics.map(mc => ({ ...mc.cosmetic, equippedSlot: mc.equippedSlot }));
  const dailyOpen = quests.active.daily.filter(q => !q.completedAt).length;

  return (
    <div className="cpm-pf">
      <ProfileSidebar
        profile={profile}
        isSelf={isSelf}
        rankInfo={rankInfo}
        edit={{
          active: editMode, saving, bio: editBio, displayName: editDisplayName,
          setBio: setEditBio, setDisplayName: setEditDisplayName,
          start: () => setEditMode(true),
          cancel: () => { setEditMode(false); setEditBio(profile.bio ?? ""); setEditDisplayName(profile.displayName ?? ""); },
          save: handleSave,
        }}
      />

      <main className="cpm-pf-main">
        <ProfileTabs tabs={tabs} active={tab} onChange={setTab} />

        <section
          key={tab}
          className="cpm-pf-panel"
          role="tabpanel"
          id={`cpm-pf-panel-${tab}`}
          aria-labelledby={`cpm-pf-tab-${tab}`}
        >
          {tab === "overview" && (
            <>
              {isSelf && quests.claimable > 0 && (
                <button type="button" className="cpm-pf-callout" onClick={() => setTab("quests")}>
                  <i className="fas fa-gift" aria-hidden="true" />
                  <span><b>{quests.claimable} quest reward{quests.claimable > 1 ? "s" : ""}</b> ready to claim</span>
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </button>
              )}
              {isSelf && quests.claimable === 0 && dailyOpen > 0 && (
                <button type="button" className="cpm-pf-callout cpm-pf-callout--quiet" onClick={() => setTab("quests")}>
                  <i className="fas fa-sun" aria-hidden="true" />
                  <span>{dailyOpen} daily quest{dailyOpen > 1 ? "s" : ""} in progress</span>
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </button>
              )}

              <div className="cpm-profile-card" data-tour-id="profile.history">
                <div className="cpm-pf-head">
                  <h2>Daily activity</h2>
                  <span className="cpm-pf-kept"><i className="fas fa-fire" aria-hidden="true" /> streak kept</span>
                </div>
                <XpHeatmap data={xpHistory} activity={activity} />
                <div className="cpm-pf-sub">Hover a day for details. Last 52 weeks.</div>
              </div>

              <div className="cpm-pf-grid2">
                <SkillsSnapshot memberId={memberId} isSelf={isSelf} onOpen={() => setTab("skills")} />
                <RecentActivity logs={profile.activityLogs ?? []} />
              </div>

              {profile.githubLogin && <GhStatsSection memberId={memberId} />}
            </>
          )}

          {tab === "quests" && isSelf && <QuestsTab data={quests} />}

          {tab === "skills" && (
            isSelf
              ? <SkillsWorkspace />
              : <MemberSkillsCard memberId={memberId} displayName={profile.displayName} />
          )}

          {tab === "training" && isSelf && (
            <TrainingStatusStrip isSelf emptyText="No safety trainings are assigned to you yet." />
          )}

          {tab === "projects" && <ProjectsTab projects={projects} />}

          {tab === "customize" && (
            <>
              <div className="cpm-profile-card">
                <div className="cpm-pf-head">
                  <h2>Badges</h2>
                  {isSelf && <span className="cpm-pf-sub">Your active badge shows beside your name and on the leaderboard</span>}
                </div>
                {badges.length === 0 ? (
                  <p className="cpm-pf-empty">No badges yet. Keep contributing.</p>
                ) : (
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
                )}
              </div>

              <div className={isSelf ? "cpm-pf-grid2" : undefined}>
                <div className="cpm-profile-card">
                  <div className="cpm-pf-head"><h2>Cosmetics</h2></div>
                  {COSMETIC_SLOTS.map(({ slot, category, label }) => {
                    const items = owned.filter(c => c.category === category);
                    const current = items.find(c => c.equippedSlot === slot) ?? null;
                    return (
                      <div key={slot} className="cpm-locker-slot">
                        <div className="cpm-locker-slot-label">{label}</div>
                        {items.length === 0 ? (
                          <div className="cpm-locker-empty">
                            None owned{isSelf ? <> — check the <Link to="/clubpm/shop">shop</Link>.</> : "."}
                          </div>
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
                                  <span className="cpm-cosmetic-meta">{active ? "equipped" : c.rarity.toLowerCase()}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isSelf && (
                  <div className="cpm-profile-card">
                    <div className="cpm-pf-head"><h2>Integrations</h2></div>
                    <GitHubConnectButton />
                    <IcsFeedConnect />
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <div className="cpm-pf-keys" aria-hidden="true">
          Shortcuts: <kbd>1</kbd>–<kbd>{tabs.length}</kbd> switch tabs{isSelf ? <>, <kbd>E</kbd> edit profile</> : null}
        </div>
      </main>
    </div>
  );
}
