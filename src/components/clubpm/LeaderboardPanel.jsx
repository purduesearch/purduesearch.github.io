import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { get } from "../../api/clubPmClient";
import RankBadge from "./RankBadge";
import AvatarPortrait from "./avatar/AvatarPortrait";

const SEMESTERS = [
  { value: "",            label: "All-time" },
  { value: "FALL_2025",   label: "Fall 2025" },
  { value: "SPRING_2026", label: "Spring 2026" },
  { value: "FALL_2026",   label: "Fall 2026" },
];

const TEAMS = ["", "Software", "Outreach", "Research", "Business", "Systems"];

export default function LeaderboardPanel() {
  const [semester, setSemester] = useState("");
  const [team, setTeam] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (semester) qs.set("semester", semester);
    if (team)     qs.set("team", team);
    const q = qs.toString();
    get(`/api/leaderboard${q ? `?${q}` : ""}`)
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [semester, team]);

  useEffect(() => { load(); }, [load]);

  const maxXp = rows.reduce((m, r) => Math.max(m, r.xp ?? 0), 0) || 1;

  return (
    <div className="cpm-leaderboard-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>
          <i className="fas fa-trophy" aria-hidden="true" /> Leaderboard
        </h3>
        <div className="cpm-leaderboard-controls">
          <select value={semester} onChange={e => setSemester(e.target.value)}>
            {SEMESTERS.map(s => <option key={s.value || "all"} value={s.value}>{s.label}</option>)}
          </select>
          <select value={team} onChange={e => setTeam(e.target.value)}>
            {TEAMS.map(t => <option key={t || "all"} value={t}>{t || "All teams"}</option>)}
          </select>
        </div>
      </div>

      {loading && <div className="cpm-pending-empty">Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="cpm-pending-empty">No XP earned in this window yet.</div>
      )}
      {!loading && rows.length > 0 && (
        <table className="cpm-leaderboard-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
              <th>Member</th>
              <th>Rank</th>
              <th>Team</th>
              <th style={{ width: "30%" }}>XP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.position}</td>
                <td>
                  <Link
                    to={`/clubpm/profile/${r.id}`}
                    style={{ color: "inherit", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <AvatarPortrait member={r} size={24} />
                    {r.displayName}
                  </Link>
                </td>
                <td><RankBadge rank={r.rank} /></td>
                <td>{r.team ?? "—"}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: "var(--clubpm-surface-200, #f3f4f6)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round((r.xp / maxXp) * 100)}%`, height: "100%", background: "var(--clubpm-accent-primary, #0ea5e9)" }} />
                    </div>
                    <span style={{ fontSize: 12, minWidth: 50, textAlign: "right" }}>{(r.xp ?? 0).toLocaleString()}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
