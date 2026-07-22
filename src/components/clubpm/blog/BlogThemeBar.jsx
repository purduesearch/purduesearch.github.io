import React from 'react';

const FONTS = [['syne-dmsans', 'Syne / DM Sans'], ['oswald-lato', 'Oswald / Lato'], ['montserrat-worksans', 'Montserrat / Work Sans']];

export default function BlogThemeBar({ theme, onChange }) {
  const t = theme || { accent: '#00e5cc', fontPair: 'syne-dmsans', width: 'wide' };
  const set = (patch) => onChange({ ...t, ...patch });
  return (
    <div className="cpm-blog-themebar" contentEditable={false}>
      <span className="cpm-blog-themebar-lab">Theme</span>
      <label title="Accent color"><input type="color" value={t.accent} onChange={(e) => set({ accent: e.target.value })} /></label>
      <select value={t.fontPair} onChange={(e) => set({ fontPair: e.target.value })}>
        {FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select value={t.width} onChange={(e) => set({ width: e.target.value })}>
        <option value="narrow">Narrow</option><option value="wide">Wide</option>
      </select>
    </div>
  );
}
