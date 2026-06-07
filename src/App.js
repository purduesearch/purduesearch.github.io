import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import ScrollToTop from './components/ScrollToTop';
import ReadingProgress from './components/ReadingProgress';
import PageWrapper from './components/PageWrapper';
import { ClubPmAuthProvider } from './clubpm/ClubPmAuth';
import { ShortcutsProvider } from './clubpm/ShortcutsRegistry';
import GlobalShortcutsSetup from './components/clubpm/GlobalShortcutsSetup';
import AppShell from './components/clubpm/AppShell';
import { ProjectNavProvider } from './clubpm/ProjectNavContext';
import ClubPmLogin from './pages/ClubPM/Login';
import ClubPmDashboard from './pages/ClubPM/Dashboard';
import ClubPmProjectDetail from './pages/ClubPM/ProjectDetail';
import ClubPmGanttView from './pages/ClubPM/GanttView';
import ClubPmMembersView from './pages/ClubPM/MembersView';
import NotificationCenter from './components/clubpm/NotificationCenter';
import NotificationPreferences from './components/clubpm/NotificationPreferences';
import CalendarPage from './pages/ClubPM/CalendarPage';
import AdminView from './pages/ClubPM/AdminView';
import OutreachHub from './pages/ClubPM/OutreachHub';
import PublicCampaign from './pages/PublicCampaign';
import EventRsvp from './pages/Public/EventRsvp';
import Archive from './pages/Archive';
import BlogPost from './pages/BlogPost';
import Home from './pages/Home';
import About from './pages/About';
import Research from './pages/Research';
import SA2TP from './pages/SA2TP';
import Software from './pages/Software';
import Business from './pages/Business';
import AstroUSA from './pages/AstroUSA';
import Outreach from './pages/Outreach';
import Contact from './pages/Contact';
import Blog from './pages/Blog';
import Suits from './pages/Software/Suits';
import Rascal from './pages/Research/Rascal';
import Crew1 from './pages/SA2TP/Crew1';
import RodInterview from './pages/SA2TP/RodInterview';
import AstroOverview from './pages/AstroUSA/Overview';
import AstroArchitecture from './pages/AstroUSA/Architecture';
import AstroHydroponics from './pages/AstroUSA/Hydroponics';
import NotFound from './pages/NotFound';
import SearchResults from './pages/SearchResults';

// ── ClubPM lazy routes (avoid pulling R3F/three into the main bundle) ──
const ClubPmProfile  = lazy(() => import('./pages/ClubPM/Profile'));
const ClubPmShop     = lazy(() => import('./pages/ClubPM/Shop'));
const ChallengesPage = lazy(() => import('./pages/ClubPM/ChallengesPage'));

// ── Club PM protected route wrapper ──────────────────────────

function ClubPmProtectedPage({ children }) {
  return (
    <ProjectNavProvider>
      <AppShell>{children}</AppShell>
    </ProjectNavProvider>
  );
}

// ── Main site animated routes ─────────────────────────────────

function AnimatedRoutes() {
  const location = useLocation();
  const isClubPm = location.pathname.startsWith('/clubpm');

  return (
    <>
      {!isClubPm && <ReadingProgress />}
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Club PM routes */}
          <Route path="/clubpm/login" element={<ClubPmLogin />} />
          <Route path="/clubpm" element={<ClubPmProtectedPage><ClubPmDashboard /></ClubPmProtectedPage>} />
          <Route path="/clubpm/projects/:id" element={<ClubPmProtectedPage><ClubPmProjectDetail /></ClubPmProtectedPage>} />
          <Route path="/clubpm/projects/:id/gantt" element={<ClubPmProtectedPage><ClubPmGanttView /></ClubPmProtectedPage>} />
          <Route path="/clubpm/members" element={<ClubPmProtectedPage><ClubPmMembersView /></ClubPmProtectedPage>} />
          <Route path="/clubpm/notifications" element={<ClubPmProtectedPage><NotificationCenter /></ClubPmProtectedPage>} />
          <Route path="/clubpm/notifications/preferences" element={<ClubPmProtectedPage><NotificationPreferences /></ClubPmProtectedPage>} />
          <Route path="/clubpm/calendar" element={<ClubPmProtectedPage><CalendarPage /></ClubPmProtectedPage>} />
          <Route path="/clubpm/admin" element={<ClubPmProtectedPage><AdminView /></ClubPmProtectedPage>} />
          {/* Backward-compat: legacy /meeting-notes URLs now redirect to /admin. Keep for one release. */}
          <Route path="/clubpm/meeting-notes" element={<Navigate to="/clubpm/admin" replace />} />
          <Route path="/clubpm/outreach" element={<ClubPmProtectedPage><OutreachHub /></ClubPmProtectedPage>} />
          <Route path="/clubpm/profile" element={<ClubPmProtectedPage><Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}><ClubPmProfile /></Suspense></ClubPmProtectedPage>} />
          <Route path="/clubpm/profile/:memberId" element={<ClubPmProtectedPage><Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}><ClubPmProfile /></Suspense></ClubPmProtectedPage>} />
          <Route path="/clubpm/shop" element={<ClubPmProtectedPage><Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}><ClubPmShop /></Suspense></ClubPmProtectedPage>} />
          <Route path="/clubpm/challenges" element={<ClubPmProtectedPage><Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}><ChallengesPage /></Suspense></ClubPmProtectedPage>} />

          {/* Public outreach routes (no auth) */}
          <Route path="/rsvp/:eventId" element={<EventRsvp />} />
          <Route path="/r/c/:slug" element={<PublicCampaign />} />
          <Route path="/r/archive" element={<Archive />} />

          {/* Main site routes */}
          <Route path="/" element={<PageWrapper><Home /></PageWrapper>} />
          <Route path="/about" element={<PageWrapper><About /></PageWrapper>} />
          <Route path="/research" element={<PageWrapper><Research /></PageWrapper>} />
          <Route path="/research/rascal" element={<PageWrapper><Rascal /></PageWrapper>} />
          <Route path="/sa2tp" element={<PageWrapper><SA2TP /></PageWrapper>} />
          <Route path="/sa2tp/crew1" element={<PageWrapper><Crew1 /></PageWrapper>} />
          <Route path="/sa2tp/rod-interview" element={<PageWrapper><RodInterview /></PageWrapper>} />
          <Route path="/software" element={<PageWrapper><Software /></PageWrapper>} />
          <Route path="/software/suits" element={<PageWrapper><Suits /></PageWrapper>} />
          <Route path="/business" element={<PageWrapper><Business /></PageWrapper>} />
          <Route path="/astrousa" element={<PageWrapper><AstroUSA /></PageWrapper>} />
          <Route path="/astrousa/overview" element={<PageWrapper><AstroOverview /></PageWrapper>} />
          <Route path="/astrousa/architecture" element={<PageWrapper><AstroArchitecture /></PageWrapper>} />
          <Route path="/astrousa/hydroponics" element={<PageWrapper><AstroHydroponics /></PageWrapper>} />
          <Route path="/outreach" element={<PageWrapper><Outreach /></PageWrapper>} />
          <Route path="/contact" element={<PageWrapper><Contact /></PageWrapper>} />
          <Route path="/blog" element={<PageWrapper><Blog /></PageWrapper>} />
          <Route path="/blog/:slug" element={<PageWrapper><BlogPost /></PageWrapper>} />
          <Route path="/search" element={<PageWrapper><SearchResults /></PageWrapper>} />
          <Route path="*" element={<PageWrapper><NotFound /></PageWrapper>} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ShortcutsProvider>
        <ScrollToTop />
        <ClubPmAuthProvider>
          <GlobalShortcutsSetup />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--pm-bg-elevated)',
                color: 'var(--pm-text-primary)',
                border: '1px solid var(--pm-border)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#00e5c3', secondary: '#000' } },
              error:   { iconTheme: { primary: '#ff6b6b', secondary: '#fff' } },
              // Class hook so the `celebrate` variant (toast.success(msg, { className: 'pm-toast-celebrate' }))
              // gets the bright-teal glow + bigger size from search-theme.css.
              className: '',
            }}
          />
          <AnimatedRoutes />
        </ClubPmAuthProvider>
      </ShortcutsProvider>
    </BrowserRouter>
  );
}

export default App;
