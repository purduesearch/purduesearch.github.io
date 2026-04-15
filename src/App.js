import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import ScrollToTop from './components/ScrollToTop';
import ReadingProgress from './components/ReadingProgress';
import PageWrapper from './components/PageWrapper';
import Home from './pages/Home';
import About from './pages/About';
import Research from './pages/Research';
import SA2TP from './pages/SA2TP';
import Software from './pages/Software';
import Analogs from './pages/Analogs';
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

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <>
      <ReadingProgress />
      <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageWrapper><Home /></PageWrapper>} />
        <Route path="/about" element={<PageWrapper><About /></PageWrapper>} />
        <Route path="/research" element={<PageWrapper><Research /></PageWrapper>} />
        <Route path="/research/rascal" element={<PageWrapper><Rascal /></PageWrapper>} />
        <Route path="/sa2tp" element={<PageWrapper><SA2TP /></PageWrapper>} />
        <Route path="/sa2tp/crew1" element={<PageWrapper><Crew1 /></PageWrapper>} />
        <Route path="/sa2tp/rod-interview" element={<PageWrapper><RodInterview /></PageWrapper>} />
        <Route path="/software" element={<PageWrapper><Software /></PageWrapper>} />
        <Route path="/software/suits" element={<PageWrapper><Suits /></PageWrapper>} />
        <Route path="/analogs" element={<PageWrapper><Analogs /></PageWrapper>} />
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
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

export default App;
