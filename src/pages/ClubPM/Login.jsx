export default function Login() {
  return (
    <div className="clubpm-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Background effects */}
      <div
        style={{
          position: 'absolute', inset: 0, opacity: 0.3,
          background:
            'radial-gradient(ellipse at 20% 50%, rgba(108, 92, 231, 0.15) 0%, transparent 50%), ' +
            'radial-gradient(ellipse at 80% 20%, rgba(253, 121, 168, 0.1) 0%, transparent 50%), ' +
            'radial-gradient(ellipse at 50% 80%, rgba(0, 206, 201, 0.1) 0%, transparent 50%)',
        }}
      />

      {/* Floating orbs */}
      <div className="cpm-animate-pulse" style={{
        position: 'absolute', top: '25%', left: '25%',
        width: '16rem', height: '16rem', borderRadius: '50%', opacity: 0.05,
        background: 'var(--color-accent-primary)', filter: 'blur(80px)',
      }} />
      <div className="cpm-animate-pulse" style={{
        position: 'absolute', bottom: '25%', right: '25%',
        width: '12rem', height: '12rem', borderRadius: '50%', opacity: 0.05,
        background: 'var(--color-accent-pink)', filter: 'blur(60px)', animationDelay: '1s',
      }} />

      <div className="cpm-animate-fade-in" style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
        {/* Logo */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 className="cpm-gradient-text" style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            Club PM
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.125rem', maxWidth: '28rem', margin: '0 auto', lineHeight: 1.625 }}>
            Slack-first project management for student engineering &amp; research clubs
          </p>
        </div>

        {/* Sign in card */}
        <div className="cpm-glass-card" style={{ padding: '2rem', maxWidth: '20rem', margin: '0 auto' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{
              width: '4rem', height: '4rem', margin: '0 auto 1rem',
              borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(108, 92, 231, 0.2), rgba(253, 121, 168, 0.2))',
              border: '1px solid var(--color-border)',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-accent-primary)' }}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.25rem' }}>
              Welcome
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              Sign in with your Slack workspace account
            </p>
          </div>

          <a
            href="/auth/slack"
            className="cpm-btn-primary"
            style={{ display: 'flex', width: '100%', justifyContent: 'center' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
            Sign in with Slack
          </a>

          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '1rem' }}>
            Your Slack workspace admin must have approved this app
          </p>
        </div>

        {/* Feature highlights */}
        <div style={{ marginTop: '3rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', maxWidth: '32rem', margin: '3rem auto 0' }}>
          {[
            { icon: '⚡', label: 'Slack Commands' },
            { icon: '📊', label: 'Gantt Charts' },
            { icon: '🔔', label: 'Auto Reminders' },
          ].map((feat) => (
            <div key={feat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{feat.icon}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{feat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
