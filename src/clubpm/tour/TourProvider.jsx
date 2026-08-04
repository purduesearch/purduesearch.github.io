import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { recordTourProgress, reportTourBreakage } from "../../api/clubPmClient";
import { findAnchor } from "./anchorDom";
import TourOverlay from "./TourOverlay";

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

/**
 * Fill the project id into a step route.
 *
 * Returns null when a placeholder is left over — a tour that does not provision
 * a training project still declares `:id` routes for screens it reaches by
 * clicking (the blog editor, the course editor). Navigating there with an empty
 * segment produces "/clubpm/outreach/blog//edit", which is a 404 the learner
 * cannot get out of. Refusing to navigate leaves them where they are, which the
 * anchor timeout then degrades into a skippable step.
 */
function resolveRoute(pattern, projectId) {
  if (!pattern || pattern === "*") return null;
  const filled = projectId
    ? pattern.replace(/:(id|trainingProjectId|projectId)\b/g, projectId)
    : pattern;
  return /:[A-Za-z]/.test(filled) ? null : filled;
}

export function TourProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [tour, setTour] = useState(null);     // { sectionId, tourId, steps, returnTo, projectId, preview }
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | running | paused

  const stepIndexRef = useRef(0);
  const advancingRef = useRef(false);

  useEffect(() => { stepIndexRef.current = stepIndex; }, [stepIndex]);

  const step = tour?.steps[stepIndex] ?? null;
  const stepCount = tour?.steps.length ?? 0;

  // Resume a tour the learner paused or that survived a reload.
  useEffect(() => {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (!saved?.tour?.steps?.length) throw new Error("empty");
      setTour(saved.tour);
      setStepIndex(Math.min(saved.stepIndex ?? 0, saved.tour.steps.length - 1));
      setStatus("paused");
    } catch { sessionStorage.removeItem(RESUME_KEY); }
  }, []);

  useEffect(() => {
    if (!tour) return;
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({ tour, stepIndex }));
  }, [tour, stepIndex]);

  const startTour = useCallback((config) => {
    advancingRef.current = false;
    setTour(config);
    setStepIndex(config.resumeAt ?? 0);
    stepIndexRef.current = config.resumeAt ?? 0;
    setStatus("running");
    const entry = resolveRoute(config.entryRoute, config.projectId);
    if (entry && !routeMatches(config.entryRoute, window.location.pathname)) {
      navigate(entry);
    }
  }, [navigate]);

  const clear = useCallback(() => {
    sessionStorage.removeItem(RESUME_KEY);
    advancingRef.current = false;
    setTour(null); setStepIndex(0); setStatus("idle");
  }, []);

  const finish = useCallback(() => {
    const done = tour;
    clear();
    if (!done?.returnTo) return;
    // An author previewing their own course must come back to the preview, not
    // be marked as having completed a section they were only inspecting — the
    // whole point of preview mode is that it records nothing.
    navigate(done.returnTo, {
      state: done.preview ? null : { tourCompleted: done.sectionId },
    });
  }, [clear, navigate, tour]);

  const goTo = useCallback((index) => {
    if (!tour) return;
    if (index >= tour.steps.length) { finish(); return; }
    const bounded = Math.max(0, index);
    stepIndexRef.current = bounded;
    setStepIndex(bounded);
    if (!tour.preview) {
      // The server clamps to a high-water mark, so stepping backwards to re-read
      // a step cannot cost the learner the progress they already earned.
      recordTourProgress(tour.sectionId, bounded).catch(() => {});
    }
  }, [tour, finish]);

  const next = useCallback(() => {
    // Advance signals can arrive more than once for one action — a click that
    // both matches the anchor and triggers a navigation, say. Without this latch
    // a single click would skip two steps.
    if (advancingRef.current) return;
    advancingRef.current = true;
    window.setTimeout(() => { advancingRef.current = false; }, 350);
    goTo(stepIndexRef.current + 1);
  }, [goTo]);

  const back = useCallback(() => {
    if (stepIndexRef.current <= 0) return;
    advancingRef.current = false;
    goTo(stepIndexRef.current - 1);
  }, [goTo]);

  const skipStep = useCallback(() => {
    // A skipped step still counts toward maxStepIndex. Refusing to let someone
    // finish a course over our own broken selector is the worse failure.
    next();
  }, [next]);

  const pause = useCallback(() => setStatus("paused"), []);
  const resume = useCallback(() => setStatus("running"), []);

  /** Exit returns to the course rather than abandoning the learner inside the
   *  training project with no way back to where they came from. */
  const stop = useCallback(() => {
    const returnTo = tour?.returnTo;
    clear();
    if (returnTo) navigate(returnTo);
  }, [clear, navigate, tour]);

  const reportBreakage = useCallback((anchor) => {
    if (!tour || tour.preview) return;
    reportTourBreakage(tour.sectionId, {
      stepId: step?.id ?? null, anchor, pathname: location.pathname,
    }).catch(() => {});
  }, [tour, step, location.pathname]);

  // Navigate to the step's declared route before the overlay hunts for it.
  useEffect(() => {
    if (status !== "running" || !step?.route) return;
    if (routeMatches(step.route, location.pathname)) return;
    const target = resolveRoute(step.route, tour?.projectId);
    if (target) navigate(target);
  }, [status, step, location.pathname, navigate, tour]);

  // advance.on === "route"
  useEffect(() => {
    if (status !== "running" || step?.advance?.on !== "route") return;
    if (routeMatches(step.advance.match, location.pathname)) next();
  }, [status, step, location.pathname, next]);

  // advance.on === "click"
  //
  // Capture phase, so a handler that stops propagation cannot hide the click
  // from us, and deferred by a tick so the app's own handler — usually the one
  // that opens the modal or navigates — runs against the step that asked for it
  // rather than against the next one.
  useEffect(() => {
    if (status !== "running" || step?.advance?.on !== "click") return undefined;
    const onClick = (event) => {
      const el = findAnchor(step.anchor);
      if (!el) return;
      const target = event.target;
      if (el !== target && !el.contains(target)) return;
      window.setTimeout(next, 0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [status, step, next]);

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
    startTour, next, back, skipStep, pause, resume, stop, reportBreakage,
  }), [tour, step, stepIndex, stepCount, status,
       startTour, next, back, skipStep, pause, resume, stop, reportBreakage]);

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay />
    </TourContext.Provider>
  );
}
