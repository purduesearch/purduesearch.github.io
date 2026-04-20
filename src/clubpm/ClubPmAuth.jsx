import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { get } from '../api/clubPmClient';

const ClubPmAuthContext = createContext({
  member: null,
  loading: false,
  logout: () => {},
});

export function useClubPmAuth() {
  return useContext(ClubPmAuthContext);
}

export function ClubPmAuthProvider({ children }) {
  const location = useLocation();
  const isClubPm = location.pathname.startsWith('/clubpm');
  const [member, setMember] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!isClubPm || hasFetched.current) return;
    hasFetched.current = true;
    get('/auth/me')
      .then(setMember)
      .catch(() => setMember(null))
      .finally(() => setAuthChecked(true));
  }, [isClubPm]);

  const loading = isClubPm && !authChecked;

  const logout = () => {
    get('/auth/logout')
      .catch(() => {})
      .finally(() => {
        setMember(null);
        setAuthChecked(false);
        hasFetched.current = false;
        window.location.href = '/clubpm/login';
      });
  };

  return (
    <ClubPmAuthContext.Provider value={{ member, loading, logout }}>
      {children}
    </ClubPmAuthContext.Provider>
  );
}
