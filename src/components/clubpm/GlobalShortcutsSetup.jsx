import { useNavigate } from 'react-router-dom';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import { useShortcutsRegistry } from '../../clubpm/ShortcutsRegistry';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';

export default function GlobalShortcutsSetup() {
  const navigate = useNavigate();
  const { showHelp, setShowHelp } = useShortcutsRegistry();

  useKeyboardShortcuts([
    { id: 'global.nav.dashboard', keys: ['g', 'd'], scope: 'global', description: 'Go to Dashboard',     action: () => navigate('/clubpm') },
    { id: 'global.nav.events',    keys: ['g', 'e'], scope: 'global', description: 'Go to Calendar',      action: () => navigate('/clubpm/calendar') },
    { id: 'global.nav.outreach',  keys: ['g', 'o'], scope: 'global', description: 'Go to Outreach',      action: () => navigate('/clubpm/outreach') },
    { id: 'global.nav.members',   keys: ['g', 'm'], scope: 'global', description: 'Go to Members',       action: () => navigate('/clubpm/members') },
    { id: 'global.nav.notes',     keys: ['g', 'n'], scope: 'global', description: 'Go to Meeting Notes', action: () => navigate('/clubpm/meeting-notes') },
    { id: 'global.help',          keys: '?',        scope: 'global', description: 'Show keyboard shortcuts', action: () => setShowHelp(s => !s) },
  ]);

  if (!showHelp) return null;
  return <KeyboardShortcutsModal onClose={() => setShowHelp(false)} />;
}
