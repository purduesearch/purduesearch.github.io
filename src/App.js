import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import ScrollToTop from './components/ScrollToTop';
import ReadingProgress from './components/ReadingProgress';
import PageWrapper from './components/PageWrapper';
import { ClubPmAuthProvider, useClubPmAuth } from './clubpm/ClubPmAuth';
import ClubPmNavBar from './components/clubpm/ClubPmNavBar';
import ClubPmLogin from './pages/ClubPM/Login';
import ClubPmDashboard from './pages/ClubPM/Dashboard';
import ClubPmProjectDetail from './pages/ClubPM/ProjectDetail';
import ClubPmGanttView from './pages/ClubPM/GanttView';
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

// ── Club PM protected route wrapper ──────────────────────────

function ClubPmProtectedPage({ children }) {
  const { member, loading } = useClubPmAuth();

  if (loading) {
    return (
      <div className="clubpm-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="cpm-spinner" />
      </div>
    );
  }

  if (!member) {
    return <Navigate to="/clubpm/login" replace />;
  }

  return (
    <div className="clubpm-app">
      <ClubPmNavBar />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
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
          <Route path="/clubpm/login" element={
            <div className="clubpm-app">
              <ClubPmNavBar />
              <ClubPmLogin />
            </div>
          } />
          <Route path="/clubpm" element={<ClubPmProtectedPage><ClubPmDashboard /></ClubPmProtectedPage>} />
          <Route path="/clubpm/projects/:id" element={<ClubPmProtectedPage><ClubPmProjectDetail /></ClubPmProtectedPage>} />
          <Route path="/clubpm/projects/:id/gantt" element={<ClubPmProtectedPage><ClubPmGanttView /></ClubPmProtectedPage>} />

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
      <ScrollToTop />
      <ClubPmAuthProvider>
        <AnimatedRoutes />
      </ClubPmAuthProvider>
    </BrowserRouter>
  );
}

export default App;
