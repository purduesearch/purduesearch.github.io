import React, { useState, useEffect, createContext, useContext } from "react";
import { get, getStoredToken, setStoredToken, clearStoredToken } from "../api/clubPmClient";

const BASE_URL = process.env.REACT_APP_API_URL || "";

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

    console.log("[ClubPmAuth] mount — href:", window.location.href);

    // Primary: extract Bearer token from query parameter (?lt=...).
    // Query params survive cross-origin redirects reliably in all browsers including Firefox.
    const params = new URLSearchParams(window.location.search);
    const lt = params.get("lt");
    console.log("[ClubPmAuth] lt param:", lt ? lt.slice(0, 12) + "…" : "(none)");
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
      console.log("[ClubPmAuth] hash:", hash ? hash.slice(0, 20) : "(none)");
      if (hash.startsWith("#lt=")) {
        setStoredToken(hash.slice(4));
        freshToken = true;
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }

    console.log("[ClubPmAuth] freshToken:", freshToken, "storedToken:", getStoredToken() ? "present" : "absent");

    const doAuth = (canRetry) => {
      const token = getStoredToken();
      console.log("[ClubPmAuth] doAuth canRetry:", canRetry, "token:", token ? "present" : "absent");
      fetch(`${BASE_URL}/auth/me`, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
        .then(async (res) => {
          console.log("[ClubPmAuth] /auth/me status:", res.status);
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
