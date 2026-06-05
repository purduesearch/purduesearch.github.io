import React, { useEffect } from 'react';
import { useShortcutsRegistry } from '../../clubpm/ShortcutsRegistry';

function keyLabel(keys) {
  if (typeof keys === 'string') return keys;
  return keys.join(' ');
}

export default function KeyboardShortcutsModal({ onClose }) {
  const { getShortcuts } = useShortcutsRegistry() ?? {};

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const all = getShortcuts ? getShortcuts() : [];
  const global = all.filter(s => s.scope === 'global');

  const byPage = new Map();
  for (const s of all) {
    if (s.scope === 'page') {
      if (!byPage.has(s.pageId)) byPage.set(s.pageId, []);
      byPage.get(s.pageId).push(s);
    }
  }

  return (
    <div className="pm-shortcuts-backdrop" onClick={onClose}>
      <div className="pm-shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-shortcuts-header">
          <span className="pm-shortcuts-title">
            <i className="fas fa-keyboard" aria-hidden="true" />
            Keyboard Shortcuts
          </span>
          <button className="pm-shortcuts-close" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        {global.length > 0 && (
          <div className="pm-shortcuts-section">
            <div className="pm-shortcuts-section-label">Global</div>
            <table className="pm-shortcuts-table">
              <tbody>
                {global.map(s => (
                  <tr key={s.id}>
                    <td><kbd className="pm-shortcuts-kbd">{keyLabel(s.keys)}</kbd></td>
                    <td className="pm-shortcuts-action">{s.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {[...byPage.entries()].map(([pageId, list]) => (
          <div className="pm-shortcuts-section" key={pageId}>
            <div className="pm-shortcuts-section-label">
              {pageId.charAt(0).toUpperCase() + pageId.slice(1)}
            </div>
            <table className="pm-shortcuts-table">
              <tbody>
                {list.map(s => (
                  <tr key={s.id}>
                    <td><kbd className="pm-shortcuts-kbd">{keyLabel(s.keys)}</kbd></td>
                    <td className="pm-shortcuts-action">{s.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
