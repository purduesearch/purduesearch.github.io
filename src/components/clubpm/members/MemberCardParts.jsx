import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { get, skillsApi } from "../../../api/clubPmClient";
import KudosButton from "../KudosButton";
import { tzOffset, copyToClipboard } from "../../../clubpm/members/memberShared";
import { pickSkillHighlights } from "../../../clubpm/members/skillHighlights";

// Pieces shared by the Members-page card and the double-click assignee card, so
// the two show the same facts, skills and actions.

const skillCache = new Map(); // memberId -> Promise<payload | null>
const detailCache = new Map(); // memberId -> Promise<member | null>

function cached(map, id, load) {
  if (!map.has(id)) map.set(id, Promise.resolve().then(load).catch(() => { map.delete(id); return null; }));
  return map.get(id);
}

// Load once the element scrolls near view; a roster of 100 cards should not fire 100 requests up front.
function useNearView(enabled) {
  const ref = useRef(null);
  const [near, setNear] = useState(!enabled);
  useEffect(() => {
    if (near) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near];
}

/** Full member record (email, timezone, counts) for chips that only carry a slim member. */
export function useMemberDetail(member) {
  const [detail, setDetail] = useState(null);
  const id = member?.id;
  useEffect(() => {
    let live = true;
    if (!id) return undefined;
    cached(detailCache, id, () => get(`/api/members/${encodeURIComponent(id)}`)).then((d) => { if (live) setDetail(d); });
    return () => { live = false; };
  }, [id]);
  return detail && detail.id === id ? { ...member, ...detail } : member;
}

export function MemberFacts({ member }) {
  const { email, timezone, _count } = member;
  const offset = tzOffset(timezone);
  const tasks = _count?.tasks;
  const projects = _count?.projects;
  return (
    <>
      {(email || offset) && (
        <div className="pm-member-card-body">
          {email && (
            <button type="button" className="pm-member-email-btn" onClick={(e) => { e.stopPropagation(); copyToClipboard(email); }} title="Click to copy email">
              <i className="fas fa-envelope" aria-hidden="true" />
              <span>{email}</span>
            </button>
          )}
          {offset && (
            <div className="pm-member-tz"><i className="fas fa-clock" aria-hidden="true" /><span>{offset}</span></div>
          )}
        </div>
      )}
      {(tasks != null || projects != null) && (
        <div className="pm-member-stats">
          {tasks != null && <span className="pm-member-stat"><i className="fas fa-tasks" aria-hidden="true" />{tasks} task{tasks !== 1 ? "s" : ""}</span>}
          {projects != null && <span className="pm-member-stat"><i className="fas fa-folder" aria-hidden="true" />{projects} project{projects !== 1 ? "s" : ""}</span>}
        </div>
      )}
    </>
  );
}

const TYPE_LABELS = { TOOL: "Tool", TECHNIQUE: "Technique", DOMAIN: "Domain", SOFT_SKILL: "Soft skill" };

function SkillChip({ skill, distinct }) {
  const type = String(skill.type || "TOOL").toLowerCase().replace("_", "-");
  const typeLabel = TYPE_LABELS[skill.type] ?? "Skill";
  return (
    <li
      className={`cpm-mc-skill cpm-mc-skill--${type}${distinct ? " cpm-mc-skill--distinct" : ""}`}
      title={`${skill.name} · ${typeLabel}${skill.area ? ` · ${skill.area}` : ""} · level ${skill.level} of 5${skill.verifiedByLead ? " · lead verified" : ""}`}
    >
      <span className="cpm-mc-skill-name">{skill.name}</span>
      <span className="cpm-mc-skill-pips" aria-label={`Level ${skill.level} of 5`}>
        {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= skill.level ? "on" : ""} />)}
      </span>
      {skill.verifiedByLead && <i className="fas fa-circle-check cpm-mc-skill-verified" aria-hidden="true" />}
    </li>
  );
}

export function MemberSkillStrip({ memberId, lazy = false }) {
  const [ref, near] = useNearView(lazy);
  const [state, setState] = useState({ loading: true, data: null });
  useEffect(() => {
    if (!near) return undefined;
    let live = true;
    cached(skillCache, memberId, () => skillsApi.member(memberId)).then((data) => { if (live) setState({ loading: false, data }); });
    return () => { live = false; };
  }, [memberId, near]);

  const { top, distinct, total } = pickSkillHighlights(state.data);
  let body;
  if (state.loading) body = <div className="cpm-mc-skills-note">{near ? "Loading skills…" : " "}</div>;
  else if (state.data?.hidden) body = <div className="cpm-mc-skills-note">Skills are private.</div>;
  else if (total === 0) body = <div className="cpm-mc-skills-note">No skills recorded yet.</div>;
  else {
    body = (
      <ul className="cpm-mc-skill-list" aria-label="Top and distinctive skills">
        {top.map((s) => <SkillChip key={s.skillId} skill={s} />)}
        {distinct.map((s) => <SkillChip key={s.skillId} skill={s} distinct />)}
      </ul>
    );
  }
  // A failed or empty load for a card in a list should not leave an empty heading.
  if (!state.loading && !state.data) return <div ref={ref} />;
  return (
    <div ref={ref} className="cpm-mc-skills" onClick={(e) => e.stopPropagation()}>
      <div className="cpm-mc-skills-head">
        <span>Skills</span>
        {total > 0 && <span className="cpm-skill-count">{total}</span>}
      </div>
      {body}
    </div>
  );
}

export function MemberActions({ member, onMessage, children }) {
  return (
    <div className="pm-member-card-actions" onClick={(e) => e.stopPropagation()}>
      <Link to={`/clubpm/profile/${member.id}`} className="pm-member-card-profile-btn" title="View full profile">
        <i className="fas fa-user" aria-hidden="true" />
      </Link>
      <KudosButton memberId={member.id} displayName={member.displayName} />
      {children}
      {onMessage && (
        <button type="button" className="pm-member-card-message-btn" title={`Message ${member.displayName}`} aria-label={`Message ${member.displayName}`} onClick={() => onMessage(member)}>
          <i className="fas fa-comment" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
