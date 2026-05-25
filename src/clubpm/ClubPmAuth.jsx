import React, { useState, useEffect, createContext, useContext } from "react";
import { get, setStoredToken, clearStoredToken } from "../api/clubPmClient";

const AuthContext = createContext({
  member: null,
  loading: true,
  logout: () => {},
});

export function useClubPmAuth() {
  return useContext(AuthContext);
}

export function ClubPmAuthProvider({ children }) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let freshToken = false;

    // Primary: extract Bearer token from query parameter (?lt=...).
    // Query params survive cross-origin redirects reliably in all browsers including Firefox.
    const params = new URLSearchParams(window.location.search);
    const lt = params.get("lt");
    if (lt) {
      setStoredToken(lt);
      freshToken = true;
      params.delete("lt");
      const cleaned = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (cleaned ? `?${cleaned}` : "") + window.location.hash
      );
    }

    // Fallback: extract from hash fragment (#lt=...) for backwards compat with
    // any in-flight sessions that still use the old redirect format.
    if (!freshToken) {
      const hash = window.location.hash;
      if (hash.startsWith("#lt=")) {
        setStoredToken(hash.slice(4));
        freshToken = true;
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }

    const doAuth = (canRetry) => {
      get("/auth/me")
        .then((m) => {
          setMember(m);
          setLoading(false);
        })
        .catch((err) => {
          // One retry after 250ms if we just consumed a fresh token and hit a 401.
          // Covers the rare race where localStorage hasn't flushed before the read.
          if (canRetry && freshToken && err?.status === 401) {
            setTimeout(() => doAuth(false), 250);
          } else {
            setMember(null);
            setLoading(false);
          }
        });
    };

    doAuth(true);
  }, []);

  const logout = () => {
    clearStoredToken();
    get("/auth/logout")
      .catch(() => {})
      .finally(() => {
        setMember(null);
        window.location.href = "/clubpm/login";
      });
  };

  return (
    <AuthContext.Provider value={{ member, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
