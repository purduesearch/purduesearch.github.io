import { Link, useLocation } from 'react-router-dom';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';

export default function ClubPmNavBar() {
  const { member, logout } = useClubPmAuth();
  const { pathname } = useLocation();

  return (
    <nav className="cpm-navbar">
      <div className="cpm-navbar-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link to="/clubpm" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <span className="cpm-gradient-text" style={{ fontSize: '1.25rem', fontWeight: 700 }}>Club PM</span>
          </Link>
          <Link to="/clubpm" className={`cpm-navlink${pathname === '/clubpm' ? ' active' : ''}`}>
            Dashboard
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {member && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={member.displayName}
                  style={{ width: '2rem', height: '2rem', borderRadius: '50%', outline: '2px solid var(--color-surface-400)' }}
                />
              ) : (
                <div style={{
                  width: '2rem', height: '2rem', borderRadius: '50%',
                  background: 'var(--color-accent-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.875rem', fontWeight: 600, color: 'white',
                }}>
                  {member.displayName.charAt(0)}
                </div>
              )}
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {member.displayName}
              </span>
              <button
                onClick={logout}
                style={{
                  fontSize: '0.75rem', color: 'var(--color-text-muted)', background: 'none',
                  border: 'none', cursor: 'pointer', marginLeft: '0.5rem', transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.target.style.color = 'var(--color-text-primary)'}
                onMouseLeave={(e) => e.target.style.color = 'var(--color-text-muted)'}
              >
                Logout
              </button>
            </div>
          )}
          <Link to="/" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={(e) => e.target.style.color = 'var(--color-text-primary)'}
            onMouseLeave={(e) => e.target.style.color = 'var(--color-text-muted)'}
          >
            ← Main Site
          </Link>
        </div>
      </div>
    </nav>
  );
}
