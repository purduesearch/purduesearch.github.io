import React, { useState, useEffect } from "react";
import { get } from "../../api/clubPmClient";

const SC = { TODO: "#94a3b8", IN_PROGRESS: "#3b82f6", BLOCKED: "#ef4444", DONE: "#22c55e" };
const SL = { TODO: "To Do", IN_PROGRESS: "In Progress", BLOCKED: "Blocked", DONE: "Done" };

export default function ReportingView({ projectId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get(`/api/reporting/project/${projectId}`).then(setReport).catch(console.error).finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 rounded-full border-2 border-[var(--clubpm-accent-primary)] border-t-transparent clubpm-animate-spin" /></div>;
  if (!report) return <p className="text-[var(--clubpm-text-muted)]">Failed to load report.</p>;

  const { burndown, statusCounts, overdueCount } = report;
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const cW = 800, cH = 200;
  const mx = burndown.length > 0 ? Math.max(...burndown.map(p => p.total), 1) : 1;
  const tX = i => (i / Math.max(burndown.length - 1, 1)) * cW;
  const tY = v => cH - (v / mx) * (cH - 20);
  const mkLine = key => burndown.map((p, i) => `${i === 0 ? "M" : "L"} ${tX(i)} ${tY(p[key])}`).join(" ");

  return (
    <div className="space-y-8 clubpm-animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[["Total Tasks", total, ""], ["Completed", statusCounts.DONE||0, "text-[var(--clubpm-accent-green)]"], ["In Progress", statusCounts.IN_PROGRESS||0, "text-[var(--clubpm-accent-cyan)]"], ["Overdue", overdueCount, overdueCount > 0 ? "text-red-400" : ""]].map(([l,v,c]) => (
          <div key={l} className="clubpm-glass-card p-5 text-center">
            <p className={`text-3xl font-bold ${c || "text-[var(--clubpm-text-primary)]"}`}>{v}</p>
            <p className="text-xs text-[var(--clubpm-text-muted)] mt-1 uppercase tracking-wider">{l}</p>
          </div>
        ))}
      </div>

      <div className="clubpm-glass-card p-6">
        <h3 className="text-sm font-semibold text-[var(--clubpm-text-primary)] mb-4 uppercase tracking-wider">Task Distribution</h3>
        {total > 0 ? (<>
          <div className="flex h-8 rounded-full overflow-hidden mb-4">
            {Object.entries(statusCounts).map(([s, c]) => c === 0 ? null : (
              <div key={s} style={{ width: `${(c/total)*100}%`, backgroundColor: SC[s], transition: "width 0.5s" }} className="flex items-center justify-center text-[10px] font-bold text-white" title={`${SL[s]}: ${c}`}>{(c/total)*100 >= 8 ? `${Math.round((c/total)*100)}%` : ""}</div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            {Object.entries(statusCounts).map(([s, c]) => (
              <div key={s} className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: SC[s] }} /><span className="text-xs text-[var(--clubpm-text-secondary)]">{SL[s]}: {c}</span></div>
            ))}
          </div>
        </>) : <p className="text-sm text-[var(--clubpm-text-muted)]">No tasks.</p>}
      </div>

      {burndown.length > 1 && (
        <div className="clubpm-glass-card p-6">
          <h3 className="text-sm font-semibold text-[var(--clubpm-text-primary)] mb-4 uppercase tracking-wider">Burndown Chart</h3>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${cW} ${cH + 30}`} className="w-full min-w-[600px]">
              {[0,.25,.5,.75,1].map(p => <line key={p} x1={0} y1={tY(mx*p)} x2={cW} y2={tY(mx*p)} stroke="var(--clubpm-border)" strokeDasharray="4" opacity={0.5} />)}
              <path d={`${mkLine("completed")} L ${tX(burndown.length-1)} ${cH} L 0 ${cH} Z`} fill="#22c55e" opacity={0.1} />
              <path d={mkLine("total")} fill="none" stroke="#94a3b8" strokeWidth={2} opacity={0.5} />
              <path d={mkLine("remaining")} fill="none" stroke="#3b82f6" strokeWidth={2.5} />
              <path d={mkLine("completed")} fill="none" stroke="#22c55e" strokeWidth={2.5} />
              {burndown.filter((_,i) => i % Math.max(1, Math.floor(burndown.length/8)) === 0).map((p,i) => <text key={i} x={tX(burndown.indexOf(p))} y={cH+20} fontSize={10} fill="var(--clubpm-text-muted)" textAnchor="middle">{p.date.slice(5)}</text>)}
            </svg>
          </div>
          <div className="flex gap-6 mt-3">
            {[["#94a3b8","Total"],["#3b82f6","Remaining"],["#22c55e","Completed"]].map(([c,l]) => <div key={l} className="flex items-center gap-2"><div className="w-4 h-0.5 rounded" style={{backgroundColor:c}} /><span className="text-xs text-[var(--clubpm-text-muted)]">{l}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
