import React from "react";

// Source / tag chips and the Source filter for items rolled up from sub-projects.
// Local items carry no `rollup` key, so `!item.rollup` means "this project".

export function RollupSourceChip({ rollup }) {
  if (!rollup) return null;
  return (
    <span className="cpm-rollup-source" title={`From sub-project ${rollup.projectName}`}>
      <i className="fas fa-sitemap" aria-hidden="true" /> {rollup.projectName}
    </span>
  );
}

export function RollupTagChip({ rollup }) {
  if (!rollup?.tagEnabled) return null;
  const color = rollup.color;
  return (
    <span
      className="cpm-rollup-tag"
      title={rollup.label}
      style={{ background: `${color}22`, border: `1px solid ${color}`, color }}
    >
      {rollup.label}
    </span>
  );
}

export function RollupSourceFilter({ sources, value, onChange }) {
  if (!sources || sources.length === 0) return null;
  return (
    <label className="cpm-rollup-filter">
      <span>Source</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="all">All</option>
        <option value="local">This project</option>
        {sources.map(s => <option key={s.projectId} value={s.projectId}>{s.projectName}</option>)}
      </select>
    </label>
  );
}

export function matchesSource(item, value) {
  if (value === "all") return true;
  if (value === "local") return !item.rollup;
  return item.rollup?.projectId === value;
}
