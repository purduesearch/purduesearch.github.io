// Caches the memberId → { border, frame, animation } css-slug map so any
// avatar chip can render a member's equipped cosmetics without the endpoint
// that returned that member having to join through MemberCosmetic.
//
// Refetches when a cosmetic is equipped or unlocked (the `avatar-updated` and
// `clubpm:cosmetic-unlocked` window events).

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { get } from "../../api/clubPmClient";

const EMPTY = { border: null, frame: null, animation: null };

const CosmeticStylesContext = createContext(null);

export function useCosmeticStyles() {
  const ctx = useContext(CosmeticStylesContext);
  // Tolerate being rendered outside the provider (e.g. a public route reusing
  // a ClubPM component) — callers get the empty shape rather than a crash.
  return ctx ?? { stylesFor: () => EMPTY, refresh: () => {} };
}

export default function CosmeticStylesProvider({ children }) {
  const [map, setMap] = useState({});

  const refresh = useCallback(() => {
    get("/api/members/cosmetic-styles")
      .then(data => setMap(data ?? {}))
      .catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    window.addEventListener("avatar-updated", refresh);
    window.addEventListener("clubpm:cosmetic-unlocked", refresh);
    return () => {
      window.removeEventListener("avatar-updated", refresh);
      window.removeEventListener("clubpm:cosmetic-unlocked", refresh);
    };
  }, [refresh]);

  const value = useMemo(() => ({
    stylesFor: (memberId) => {
      const m = memberId ? map[memberId] : null;
      if (!m) return EMPTY;
      return {
        border:    m.border    ?? null,
        frame:     m.frame     ?? null,
        animation: m.animation ?? null,
      };
    },
    refresh,
  }), [map, refresh]);

  return (
    <CosmeticStylesContext.Provider value={value}>
      {children}
    </CosmeticStylesContext.Provider>
  );
}
