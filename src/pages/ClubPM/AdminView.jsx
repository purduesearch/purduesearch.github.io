// Admin landing page. Hosts:
//   1. Pending reward approvals (was on the Dashboard for admins).
//   2. Event reward config (was on the Dashboard for admins).
//   3. The full Meeting Notes generator (renamed from MeetingNotesView).
//
// Non-admins are redirected to /clubpm by the guard below.

import { Navigate } from "react-router-dom";
import { useClubPmAuth } from "../../clubpm/ClubPmAuth";
import PendingRewardsPanel from "../../components/clubpm/PendingRewardsPanel";
import EventRewardConfigPanel from "../../components/clubpm/EventRewardConfigPanel";
import GoogleDriveConnectButton from "../../components/clubpm/GoogleDriveConnectButton";
import MeetingNotesView from "./MeetingNotesView";

export default function AdminView() {
  const { member, loading } = useClubPmAuth();

  // While the session is loading, render nothing to avoid a flash of content.
  if (loading) return null;

  // Redirect non-admins back to the member dashboard.
  if (!member?.isAdmin) return <Navigate to="/clubpm" replace />;

  return (
    <div className="pm-admin-page" style={{
      display: "flex", flexDirection: "column", gap: 24,
      padding: "24px 28px",
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

      <section>
        <PendingRewardsPanel />
      </section>

      <section>
        <EventRewardConfigPanel />
      </section>

      <section>
        <div className="cpm-profile-card">
          <h3 style={{ marginTop: 0 }}>Integrations</h3>
          <GoogleDriveConnectButton />
        </div>
      </section>

      <section>
        <MeetingNotesView />
      </section>
    </div>
  );
}
