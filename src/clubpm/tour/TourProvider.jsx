import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { recordTourProgress, reportTourBreakage } from "../../api/clubPmClient";

const TourContext = createContext(null);
export const useTour = () => useContext(TourContext);

const RESUME_KEY = "clubpm_tour_resume";

/** "/clubpm/projects/:id" matches "/clubpm/projects/abc123". */
function routeMatches(pattern, pathname) {
  if (!pattern || pattern === "*") return true;
  const p = pattern.split("/").filter(Boolean);
  const a = pathname.split("/").filter(Boolean);
  if (p.length !== a.length) return false;
  return p.every((seg, i) => seg.startsWith(":") || seg === a[i]);
}

export function TourProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [tour, setTour] = useState(null);     // { sectionId, tourId, steps, returnTo, projectId, preview }
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | running | paused

  const stepIndexRef = useRef(0);
  stepIndexRef.current = stepIndex;

  const step = tour?.steps[stepIndex] ?? null;
  const stepCount = tour?.steps.length ?? 0;

  // Resume a tour the learner paused or that survived a reload.
  useEffect(() => {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      setTour(saved.tour);
      setStepIndex(saved.stepIndex);
      setStatus("paused");
    } catch { sessionStorage.removeItem(RESUME_KEY); }
  }, []);

  useEffect(() => {
    if (!tour) { sessionStorage.removeItem(RESUME_KEY); return; }
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({ tour, stepIndex }));
  }, [tour, stepIndex]);

  const startTour = useCallback((config) => {
    // config.steps already has :trainingProjectId substituted by the caller.
    setTour(config);
    setStepIndex(config.resumeAt ?? 0);
    setStatus("running");
    if (config.entryRoute && !routeMatches(config.entryRoute, window.location.pathname)) {
      navigate(config.entryRoute);
    }
  }, [navigate]);

  const finish = useCallback(() => {
    const done = tour;
    sessionStorage.removeItem(RESUME_KEY);
    setTour(null); setStepIndex(0); setStatus("idle");
    if (done?.returnTo) navigate(done.returnTo, { state: { tourCompleted: done.sectionId } });
  }, [navigate, tour]);

  const goTo = useCallback((index) => {
    if (!tour) return;
    if (index >= tour.steps.length) { finish(); return; }
    setStepIndex(index);
    if (!tour.preview) {
      recordTourProgress(tour.sectionId, index).catch(() => {});
    }
  }, [tour, finish]);

  const next = useCallback(() => goTo(stepIndexRef.current + 1), [goTo]);

  const skipStep = useCallback(() => {
    // A skipped step still counts toward maxStepIndex. Refusing to let someone
    // finish a course over our own broken selector is the worse failure.
    next();
  }, [next]);

  const pause = useCallback(() => setStatus("paused"), []);
  const resume = useCallback(() => setStatus("running"), []);
  const stop = useCallback(() => {
    sessionStorage.removeItem(RESUME_KEY);
    setTour(null); setStepIndex(0); setStatus("idle");
  }, []);

  const reportBreakage = useCallback((anchor) => {
    if (!tour || tour.preview) return;
    reportTourBreakage(tour.sectionId, {
      stepId: step?.id ?? null, anchor, pathname: location.pathname,
    }).catch(() => {});
  }, [tour, step, location.pathname]);

  // Navigate to the step's declared route before the overlay hunts for it.
  useEffect(() => {
    if (status !== "running" || !step?.route) return;
    if (!routeMatches(step.route, location.pathname)) {
      navigate(step.route.replace(":id", tour.projectId ?? ""));
    }
  }, [status, step, location.pathname, navigate, tour]);

  // advance.on === "route"
  useEffect(() => {
    if (status !== "running" || step?.advance?.on !== "route") return;
    if (routeMatches(step.advance.match, location.pathname)) next();
  }, [status, step, location.pathname, next]);

  // advance.on === "api"
  useEffect(() => {
    if (status !== "running" || step?.advance?.on !== "api") return undefined;
    const onApi = (e) => {
      const { method, path } = e.detail ?? {};
      if (method !== step.advance.method) return;
      if (!routeMatches(step.advance.path, path)) return;
      next();
    };
    window.addEventListener("clubpm:api-success", onApi);
    return () => window.removeEventListener("clubpm:api-success", onApi);
  }, [status, step, next]);

  const value = useMemo(() => ({
    tour, step, stepIndex, stepCount, status,
    startTour, next, skipStep, pause, resume, stop, reportBreakage,
  }), [tour, step, stepIndex, stepCount, status,
       startTour, next, skipStep, pause, resume, stop, reportBreakage]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
