import React, { useEffect } from 'react';

const SHORTCUTS = [
  { key: 'n',      label: 'New submission',          context: 'Board / Calendar' },
  { key: 'c',      label: 'Switch to Composer tab',  context: 'Global' },
  { key: '/',      label: 'Focus search / filter',   context: 'Board / CRM' },
  { key: '?',      label: 'Show this help modal',    context: 'Global' },
  { key: 'Esc',    label: 'Close modal / drawer',    context: 'Global' },
  { key: '1–6',    label: 'Jump to tab (Composer…Insights)', context: 'Global' },
];

export default function KeyboardShortcutsModal({ onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        <table className="pm-shortcuts-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Action</th>
              <th>Context</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map(s => (
              <tr key={s.key}>
                <td><kbd className="pm-shortcuts-kbd">{s.key}</kbd></td>
                <td className="pm-shortcuts-action">{s.label}</td>
                <td className="pm-shortcuts-context">{s.context}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
