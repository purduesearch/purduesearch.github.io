import { Suspense, lazy, useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import ScrollToTop from './components/ScrollToTop';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';
import ReadingProgress from './components/ReadingProgress';
import PageWrapper from './components/PageWrapper';
import { ClubPmAuthProvider } from './clubpm/ClubPmAuth';
import { ShortcutsProvider } from './clubpm/ShortcutsRegistry';
import GlobalShortcutsSetup from './components/clubpm/GlobalShortcutsSetup';
import { ProjectNavProvider } from './clubpm/ProjectNavContext';
import { lazyWithClubPmTheme } from './clubpm/loadClubPmTheme';
import { TourProvider } from './clubpm/tour/TourProvider';
import ClubPmLoading from './components/clubpm/ClubPmLoading';
import Home from './pages/Home';

// ── Public site lazy routes (code-split out of the main chunk) ──
const PublicCampaign = lazy(() => import('./pages/PublicCampaign'));
const EventRsvp = lazy(() => import('./pages/Public/EventRsvp'));
const PublicSchedule = lazy(() => import('./pages/Public/PublicSchedule'));
const Archive = lazy(() => import('./pages/Archive'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const About = lazy(() => import('./pages/About'));
const Research = lazy(() => import('./pages/Research'));
const SA2TP = lazy(() => import('./pages/SA2TP'));
const Software = lazy(() => import('./pages/Software'));
const Business = lazy(() => import('./pages/Business'));
const AstroUSA = lazy(() => import('./pages/AstroUSA'));
const Outreach = lazy(() => import('./pages/Outreach'));
const Contact = lazy(() => import('./pages/Contact'));
const Blog = lazy(() => import('./pages/Blog'));
const Suits = lazy(() => import('./pages/Software/Suits'));
const Rascal = lazy(() => import('./pages/Research/Rascal'));
const Crew1 = lazy(() => import('./pages/SA2TP/Crew1'));
const RodInterview = lazy(() => import('./pages/SA2TP/RodInterview'));
const AstroOverview = lazy(() => import('./pages/AstroUSA/Overview'));
const AstroArchitecture = lazy(() => import('./pages/AstroUSA/Architecture'));
const AstroHydroponics = lazy(() => import('./pages/AstroUSA/Hydroponics'));
const NotFound = lazy(() => import('./pages/NotFound'));
const SearchResults = lazy(() => import('./pages/SearchResults'));

// ── ClubPM lazy routes (avoid pulling the ClubPM app shell + pages into the main bundle) ──
// lazyWithClubPmTheme also fetches public/clubpm-theme.css alongside the chunk,
// so ClubPM CSS never reaches public visitors and these routes still paint
// fully styled on first render (the Suspense fallback covers both fetches).
const AppShell               = lazy(lazyWithClubPmTheme(() => import('./components/clubpm/AppShell')));
const ClubPmLogin            = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/Login')));
const ClubPmDashboard        = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/Dashboard')));
const ClubPmProjectDetail    = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/ProjectDetail')));
const ClubPmGanttView        = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/GanttView')));
const ClubPmMembersView      = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/MembersView')));
const NotificationCenter     = lazy(lazyWithClubPmTheme(() => import('./components/clubpm/NotificationCenter')));
const NotificationPreferences = lazy(lazyWithClubPmTheme(() => import('./components/clubpm/NotificationPreferences')));
const CalendarPage           = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/CalendarPage')));
const AdminView              = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/AdminView')));
const OutreachHub            = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/OutreachHub')));
const BlogEditorPage         = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/BlogEditorPage')));
const CoursesPage            = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/CoursesPage')));
const CourseEditorPage       = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/CourseEditorPage')));
const CoursePlayerPage       = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/CoursePlayerPage')));
const ClubPmProfile  = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/Profile')));
const ClubPmShop     = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/Shop')));
const ChallengesPage = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/ChallengesPage')));

// Old course URLs carried the id/slug in the middle of the path, so they need
// the param forwarded rather than a flat <Navigate to="…">.
function LegacyCourseRedirect({ suffix }) {
  const { id, slug } = useParams();
  return <Navigate to={`/clubpm/courses/${id ?? slug}/${suffix}`} replace />;
}

// ── Club PM protected route wrapper ──────────────────────────

// Dark boot screen rather than a bare div: the cream body background from
// search-theme.css is what shows through until clubpm-theme.css lands.
const clubPmFallback = <ClubPmLoading />;

function ClubPmProtectedPage({ children }) {
  return (
    <Suspense fallback={clubPmFallback}>
      <ProjectNavProvider>
        <AppShell>{children}</AppShell>
      </ProjectNavProvider>
    </Suspense>
  );
}

// ── Main site animated routes ─────────────────────────────────

function AnimatedRoutes() {
  const location = useLocation();
  const isClubPm = location.pathname.startsWith('/clubpm');

  // Keep the pre-paint flag from public/index.html in sync once the router
  // takes over, so entering /clubpm goes dark before the boot screen paints
  // and leaving it restores the cream public body. useLayoutEffect (not
  // useEffect) so the swap lands in the same frame as the route change.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('clubpm-route', isClubPm);
  }, [isClubPm]);

  return (
    <>
      {!isClubPm && <ReadingProgress />}
      <ChunkErrorBoundary>
        <Suspense fallback={null}>
          <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            {/* Club PM routes */}
            <Route path="/clubpm/login" element={<Suspense fallback={clubPmFallback}><ClubPmLogin /></Suspense>} />
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
            <Route path="/clubpm/outreach/blog/:id/edit" element={<ClubPmProtectedPage><BlogEditorPage /></ClubPmProtectedPage>} />
            {/* Courses moved out of the Outreach Hub into their own nav slot.
                The old /clubpm/outreach/courses/* paths are kept as redirects
                because course links are shared in Slack and pasted into docs. */}
            <Route path="/clubpm/courses" element={<ClubPmProtectedPage><CoursesPage /></ClubPmProtectedPage>} />
            <Route path="/clubpm/courses/:id/edit" element={<ClubPmProtectedPage><CourseEditorPage /></ClubPmProtectedPage>} />
            <Route path="/clubpm/courses/:slug/learn" element={<ClubPmProtectedPage><CoursePlayerPage /></ClubPmProtectedPage>} />
            <Route path="/clubpm/outreach/courses" element={<Navigate to="/clubpm/courses" replace />} />
            <Route path="/clubpm/outreach/courses/:id/edit" element={<LegacyCourseRedirect suffix="edit" />} />
            <Route path="/clubpm/outreach/courses/:slug/learn" element={<LegacyCourseRedirect suffix="learn" />} />
            <Route path="/clubpm/profile" element={<ClubPmProtectedPage><Suspense fallback={clubPmFallback}><ClubPmProfile /></Suspense></ClubPmProtectedPage>} />
            <Route path="/clubpm/profile/:memberId" element={<ClubPmProtectedPage><Suspense fallback={clubPmFallback}><ClubPmProfile /></Suspense></ClubPmProtectedPage>} />
            <Route path="/clubpm/shop" element={<ClubPmProtectedPage><Suspense fallback={clubPmFallback}><ClubPmShop /></Suspense></ClubPmProtectedPage>} />
            <Route path="/clubpm/challenges" element={<ClubPmProtectedPage><Suspense fallback={clubPmFallback}><ChallengesPage /></Suspense></ClubPmProtectedPage>} />

            {/* Public outreach routes (no auth) */}
            <Route path="/rsvp/:eventId" element={<EventRsvp />} />
            <Route path="/schedule/:token" element={<PublicSchedule />} />
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
        </Suspense>
      </ChunkErrorBoundary>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ShortcutsProvider>
        <ScrollToTop />
        <ClubPmAuthProvider>
          <TourProvider>
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
          </TourProvider>
        </ClubPmAuthProvider>
      </ShortcutsProvider>
    </BrowserRouter>
  );
}

export default App;
