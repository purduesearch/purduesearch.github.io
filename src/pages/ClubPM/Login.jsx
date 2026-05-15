import React from "react";
import Navbar from "../../components/Navbar";

export default function Login() {
  return (
    <>
    <Navbar />
    <div className="clubpm-app pm-login-root">
      {/* Star field layers */}
      <div className="pm-stars-sm" />
      <div className="pm-stars-md" />
      <div className="pm-stars-lg" />

      <div className="pm-login-content">
        {/* Wordmark */}
        <div className="pm-login-wordmark">
          <h1 style={{ fontFamily: "var(--pm-font-display)", color: "var(--pm-accent-teal)", textShadow: "0 0 30px rgba(0,229,204,0.4)", fontSize: "3.5rem", fontWeight: 800, letterSpacing: "-1px", margin: 0 }}>
            Club PM
          </h1>
          <p className="pm-login-typewriter">
            Mission control for student engineering teams
          </p>
        </div>

        {/* Sign-in card */}
        <div className="pm-login-card">
          {/* Orbit icon */}
          <div className="pm-orbit-ring">
            <div className="pm-orbit-ring-dot" />
            <div className="pm-icon-core">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>

          <h2 style={{ fontFamily: "var(--pm-font-display)", color: "var(--pm-text-primary)", fontSize: "1.4rem", fontWeight: 700, margin: "0 0 4px 0" }}>
            Welcome back
          </h2>
          <p style={{ color: "var(--pm-text-secondary)", fontSize: "0.875rem", margin: "0 0 24px 0" }}>
            Sign in with your Slack workspace account
          </p>

          <a
            id="slack-login-btn"
            href="/auth/slack"
            className="pm-slack-btn"
          >
            <span className="pm-slack-btn-shimmer" />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
            <span>Sign in with Slack</span>
          </a>

          <p style={{ fontSize: "0.75rem", color: "var(--pm-text-muted)", marginTop: "16px" }}>
            Your Slack workspace admin must have approved this app
          </p>
        </div>

        {/* Feature highlights */}
        <div className="pm-login-features">
          <div className="pm-login-feature">
            <div className="pm-login-feature-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <span>Slack Commands</span>
          </div>
          <div className="pm-login-feature">
            <div className="pm-login-feature-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="4" x2="8" y2="20"/></svg>
            </div>
            <span>Gantt Charts</span>
          </div>
          <div className="pm-login-feature">
            <div className="pm-login-feature-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <span>Auto Reminders</span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
