import React, { useState, useEffect, createContext, useContext } from "react";
import { get } from "../api/clubPmClient";

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
    get("/auth/me")
      .then(setMember)
      .catch(() => setMember(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
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
