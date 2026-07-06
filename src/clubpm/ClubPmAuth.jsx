import React, { useState, useEffect, useCallback, createContext, useContext } from "react";
import { get, getStoredToken, setStoredToken, clearStoredToken } from "../api/clubPmClient";

const BASE_URL = process.env.REACT_APP_API_URL || "";

const AuthContext = createContext({
  member: null,
  loading: true,
  logout: () => {},
  refetchMember: () => {},
});

export function useClubPmAuth() {
  return useContext(AuthContext);
}

export function ClubPmAuthProvider({ children }) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetchMember = useCallback(() => {
    const token = getStoredToken();
    if (!token) return Promise.resolve(null);
    return fetch(`${BASE_URL}/auth/me`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (res.ok) {
          const m = await res.json();
          setMember(m);
          return m;
        }
        return null;
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    const handler = () => { refetchMember(); };
    window.addEventListener("clubpm:member-updated", handler);
    return () => window.removeEventListener("clubpm:member-updated", handler);
  }, [refetchMember]);

  useEffect(() => {
    let freshToken = false;

    // Primary: extract Bearer token from query parameter (?lt=...).
    // Query params survive cross-origin redirects reliably in all browsers including Firefox.
    const params = new URLSearchParams(window.location.search);
    const lt = params.get("lt");
    if (lt) {
      setStoredToken(lt);
      // Honor returnTo so Constellation sign-in from public pages (e.g. /rsvp/:id)
      // redirects back to the originating page instead of /clubpm.
      // Only accept relative same-origin paths (must start with "/" and not "//",
      // which browsers treat as a protocol-relative URL to another host) to
      // prevent an open redirect / token-overwrite via a crafted returnTo value.
      const rawReturnTo = params.get("returnTo");
      const returnTo =
        rawReturnTo && rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
          ? rawReturnTo
          : "/clubpm";
      window.location.replace(returnTo);
      return;
    }

    // Fallback: extract from hash fragment (#lt=...) for backwards compat with
    // any in-flight sessions that still use the old redirect format.
    const hash = window.location.hash;
    if (hash.startsWith("#lt=")) {
      setStoredToken(hash.slice(4));
      freshToken = true;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    const doAuth = (canRetry) => {
      const token = getStoredToken();
      fetch(`${BASE_URL}/auth/me`, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
        .then(async (res) => {
          if (res.ok) {
            const m = await res.json();
            setMember(m);
            setLoading(false);
          } else if (res.status === 401 && canRetry && freshToken) {
            // One retry after 250ms if we just consumed a fresh token and hit a 401.
            // Use direct fetch (not get()) to avoid handleResponse's redirect firing
            // before the retry can run.
            setTimeout(() => doAuth(false), 250);
          } else {
            setMember(null);
            setLoading(false);
          }
        })
        .catch(() => {
          setMember(null);
          setLoading(false);
        });
    };

    doAuth(true);
  }, []);

  const logout = () => {
    // Call the logout endpoint first (while the Bearer token is still stored)
    // so the server can revoke it; clearing the token before the request would
    // send it with no Authorization header and leave the token un-revoked.
    get("/auth/logout")
      .catch(() => {})
      .finally(() => {
        clearStoredToken();
        setMember(null);
        window.location.href = "/clubpm/login";
      });
  };

  return (
    <AuthContext.Provider value={{ member, loading, logout, refetchMember }}>
      {children}
    </AuthContext.Provider>
  );
}
