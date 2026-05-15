export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background effects */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse at 20% 50%, rgba(108, 92, 231, 0.15) 0%, transparent 50%), " +
            "radial-gradient(ellipse at 80% 20%, rgba(253, 121, 168, 0.1) 0%, transparent 50%), " +
            "radial-gradient(ellipse at 50% 80%, rgba(0, 206, 201, 0.1) 0%, transparent 50%)",
        }}
      />

      {/* Floating orbs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-5 animate-pulse"
        style={{ background: "var(--color-accent-primary)", filter: "blur(80px)" }} />
      <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full opacity-5 animate-pulse"
        style={{ background: "var(--color-accent-pink)", filter: "blur(60px)", animationDelay: "1s" }} />

      <div className="relative z-10 text-center animate-fade-in">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-5xl font-extrabold gradient-text mb-3">Club PM</h1>
          <p className="text-[var(--color-text-secondary)] text-lg max-w-md mx-auto leading-relaxed">
            Slack-first project management for student engineering &amp; research clubs
          </p>
        </div>

        {/* Sign in card */}
        <div className="glass-card p-8 max-w-sm mx-auto">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(108, 92, 231, 0.2), rgba(253, 121, 168, 0.2))",
                border: "1px solid var(--color-border)",
              }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent-primary)" }}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-1">
              Welcome
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Sign in with your Slack workspace account
            </p>
          </div>

          <a
            id="slack-login-btn"
            href="/auth/slack"
            className="btn-primary w-full justify-center no-underline"
            style={{ display: "flex" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
            Sign in with Slack
          </a>

          <p className="text-xs text-[var(--color-text-muted)] mt-4">
            Your Slack workspace admin must have approved this app
          </p>
        </div>

        {/* Feature highlights */}
        <div className="mt-12 grid grid-cols-3 gap-6 max-w-lg mx-auto">
          {[
            { icon: "⚡", label: "Slack Commands" },
            { icon: "📊", label: "Gantt Charts" },
            { icon: "🔔", label: "Auto Reminders" },
          ].map((feat) => (
            <div key={feat.label} className="text-center">
              <div className="text-2xl mb-1">{feat.icon}</div>
              <div className="text-xs text-[var(--color-text-muted)]">{feat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
