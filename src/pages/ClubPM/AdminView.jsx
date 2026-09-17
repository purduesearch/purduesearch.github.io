// Admin landing page. Hosts:
//   1. Pending reward approvals (was on the Dashboard for admins).
//   2. Event reward config (was on the Dashboard for admins).
//   3. The full Meeting Notes generator (renamed from MeetingNotesView).
//
// Non-admins are redirected to /clubpm by the guard below.

import { Navigate } from "react-router-dom";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import { useCompactLayout } from "../../clubpm/layout/compactLayout";
import PendingRewardsPanel from "../../components/clubpm/PendingRewardsPanel";
import EventRewardConfigPanel from "../../components/clubpm/EventRewardConfigPanel";
import GoogleDriveConnectButton from "../../components/clubpm/GoogleDriveConnectButton";
import SlackArchivePanel from "../../components/clubpm/SlackArchivePanel";
import MeetingNotesView from "./MeetingNotesView";

// Labelled groups for the phone jump list. Every section stays mounted and
// visible: collapsing them would hide the walkthrough anchors the admin tour
// measures (admin.rewards.pending / .config / .integrations), and the static
// anchor check cannot see that a target never renders.
const ADMIN_SECTIONS = [
  { id: "pm-admin-rewards", label: "Pending rewards", icon: "fas fa-gift" },
  { id: "pm-admin-config", label: "Reward config", icon: "fas fa-sliders" },
  { id: "pm-admin-integrations", label: "Integrations", icon: "fas fa-plug" },
  { id: "pm-admin-archive", label: "Slack archive", icon: "fab fa-slack" },
  { id: "pm-admin-notes", label: "Meeting notes", icon: "fas fa-file-lines" },
];

export default function AdminView() {
  const { member, loading } = useClubPmAuth();
  const compact = useCompactLayout();

  // While the session is loading, render nothing to avoid a flash of content.
  if (loading) return null;

  // Redirect non-admins back to the member dashboard.
  if (!member?.isAdmin) return <Navigate to="/clubpm" replace />;

  return (
    <div className="pm-admin-page" style={{
      display: "flex", flexDirection: "column", gap: compact ? 16 : 24,
      padding: compact ? "12px 0" : "24px 28px",
      color: "var(--pm-text-primary, #f0f2f7)",
    }}>
      <h2 style={{
        margin: 0,
        fontSize: 22, fontWeight: 700,
        color: "var(--pm-text-primary, #f0f2f7)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <i className="fas fa-screwdriver-wrench" aria-hidden="true" style={{ color: "var(--pm-accent-teal)" }} />
        Admin
      </h2>

      {compact && (
        <nav className="pm-m-source pm-m-admin-jump" aria-label="Admin sections">
          <span className="pm-m-source-label" id="admin-jump-label">Jump to</span>
          <div className="pm-m-chip-row" aria-labelledby="admin-jump-label">
            {ADMIN_SECTIONS.map(s => (
              <a key={s.id} className="pm-m-chip" href={`#${s.id}`}>
                <i className={s.icon} aria-hidden="true" /> {s.label}
              </a>
            ))}
          </div>
        </nav>
      )}

      <section id="pm-admin-rewards" data-tour-id="admin.rewards.pending">
        <PendingRewardsPanel />
      </section>

      <section id="pm-admin-config" data-tour-id="admin.rewards.config">
        <EventRewardConfigPanel />
      </section>

      <section id="pm-admin-integrations" data-tour-id="admin.integrations">
        <div className="cpm-profile-card">
          <h3 style={{ marginTop: 0 }}>Integrations</h3>
          <GoogleDriveConnectButton />
        </div>
      </section>

      <section id="pm-admin-archive">
        <SlackArchivePanel />
      </section>

      <section id="pm-admin-notes">
        <MeetingNotesView />
      </section>
    </div>
  );
}
