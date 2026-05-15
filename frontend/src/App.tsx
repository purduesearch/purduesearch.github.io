import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useState, useEffect, createContext, useContext } from "react";
import type { MemberWithDetails } from "./types";
import { get } from "./api/client";
import Dashboard from "./pages/Dashboard";
import ProjectDetail from "./pages/ProjectDetail";
import GanttView from "./pages/GanttView";
import Login from "./pages/Login";

// ── Auth Context ─────────────────────────────────────────────

interface AuthContextValue {
  member: MemberWithDetails | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  member: null,
  loading: true,
  logout: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ── App ──────────────────────────────────────────────────────

export default function App() {
  const [member, setMember] = useState<MemberWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<MemberWithDetails>("/auth/me")
      .then(setMember)
      .catch(() => setMember(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    get("/auth/logout")
      .catch(() => {})
      .finally(() => {
        setMember(null);
        window.location.href = "/login";
      });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent-primary)] border-t-transparent animate-spin" />
          <p className="text-[var(--color-text-secondary)] text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ member, loading, logout }}>
      {member && <NavBar />}
      <main className="flex-1">
        <Routes>
          <Route path="/login" element={member ? <Navigate to="/" /> : <Login />} />
          <Route path="/" element={member ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/projects/:id" element={member ? <ProjectDetail /> : <Navigate to="/login" />} />
          <Route path="/projects/:id/gantt" element={member ? <GanttView /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </AuthContext.Provider>
  );
}

// ── Navigation Bar ───────────────────────────────────────────

function NavBar() {
  const { member, logout } = useAuth();
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--color-border)]"
      style={{
        background: "rgba(10, 10, 18, 0.85)",
        backdropFilter: "blur(16px)",
      }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="text-xl font-bold gradient-text">Club PM</span>
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            <NavLink to="/" active={location.pathname === "/"}>
              Dashboard
            </NavLink>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {member && (
            <div className="flex items-center gap-3">
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={member.displayName}
                  className="w-8 h-8 rounded-full ring-2 ring-[var(--color-surface-400)]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--color-accent-primary)] flex items-center justify-center text-sm font-semibold">
                  {member.displayName.charAt(0)}
                </div>
              )}
              <span className="text-sm text-[var(--color-text-secondary)] hidden sm:block">
                {member.displayName}
              </span>
              <button
                onClick={logout}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer ml-2"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline ${
        active
          ? "text-[var(--color-accent-primary)] bg-[var(--color-surface-200)]"
          : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-200)]"
      }`}
    >
      {children}
    </Link>
  );
}
