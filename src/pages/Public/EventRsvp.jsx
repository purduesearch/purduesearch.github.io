import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_BASE  = process.env.REACT_APP_API_URL ?? "";
const TOKEN_KEY = "clubpm_auth_token";

function fmt(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }) + " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function EventRsvp() {
  const { eventId } = useParams();

  const [event,          setEvent]          = useState(null);
  const [pageLoading,    setPageLoading]     = useState(true);
  const [notFound,       setNotFound]        = useState(false);

  // Constellation (Slack) member auto-fill
  const [member,         setMember]          = useState(null);   // { displayName, email, avatarUrl }
  const [memberLoading,  setMemberLoading]   = useState(true);   // checking token on mount

  // Form
  const [name,           setName]            = useState("");
  const [email,          setEmail]           = useState("");
  const [submitting,     setSubmitting]      = useState(false);
  const [done,           setDone]            = useState(false);
  const [error,          setError]           = useState("");

  // Load event info
  useEffect(() => {
    fetch(`${API_BASE}/api/public/events/${eventId}/rsvp-info`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { setEvent(data); setPageLoading(false); })
      .catch(code => { setNotFound(code === 404); setPageLoading(false); });
  }, [eventId]);

  // Check if the user is already signed in via Constellation and auto-fill
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setMemberLoading(false); return; }

    fetch(`${API_BASE}/auth/me`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
      .then(r => r.ok ? r.json() : null)
      .then(m => {
        if (m) {
          setMember(m);
          setName(m.displayName ?? "");
          setEmail(m.email ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setMemberLoading(false));
  }, []);

  const constellationLoginUrl =
    `${API_BASE}/auth/slack?returnTo=${encodeURIComponent(`/rsvp/${eventId}`)}`;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim()) {
      setError("Please enter your name and email.");
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const body  = {
        name:  name.trim(),
        email: email.trim().toLowerCase(),
        ...(token ? { authToken: token } : {}),
      };
      const res = await fetch(`${API_BASE}/api/public/events/${eventId}/rsvp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      setDone(true);
    } catch (err) {
      setError(err.message ?? "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / error screens ──────────────────────────────────

  if (pageLoading) {
    return (
      <div className="er-wrap">
        <div className="er-card"><p className="er-muted">Loading…</p></div>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="er-wrap">
        <div className="er-card">
          <h1 className="er-title">Event not found</h1>
          <p className="er-muted">This event may have been removed or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  // ── Success screen ───────────────────────────────────────────

  if (done) {
    return (
      <div className="er-wrap">
        <div className="er-card er-card--success">
          <div className="er-success-icon">
            <i className="fas fa-check-circle" aria-hidden="true" />
          </div>
          <h1 className="er-title">You're registered!</h1>
          <p className="er-event-name">{event.title}</p>
          <p className="er-muted">{fmt(event.startTime)}</p>
          {event.location && !event.isVirtual && (
            <p className="er-location">
              <i className="fas fa-map-marker-alt" aria-hidden="true" /> {event.location}
            </p>
          )}
          {event.isVirtual && (
            <p className="er-location">
              <i className="fas fa-video" aria-hidden="true" /> Virtual meeting
            </p>
          )}
          <p className="er-muted" style={{ marginTop: 20 }}>See you there, {name}!</p>
        </div>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────

  return (
    <div className="er-wrap">
      <div className="er-card">
        <div className="er-brand">
          <span className="er-brand-name">SEARCH</span>
          <span className="er-brand-dot" />
          <span className="er-brand-sub">Purdue University</span>
        </div>

        <h1 className="er-title">{event.title}</h1>

        <div className="er-meta">
          <span className="er-meta-item">
            <i className="fas fa-calendar-alt" aria-hidden="true" />
            {fmt(event.startTime)}
          </span>
          {event.location && !event.isVirtual && (
            <span className="er-meta-item">
              <i className="fas fa-map-marker-alt" aria-hidden="true" />
              {event.location}
            </span>
          )}
          {event.isVirtual && (
            <span className="er-meta-item">
              <i className="fas fa-video" aria-hidden="true" />
              Virtual
            </span>
          )}
        </div>

        {event.description && (
          <p className="er-description">{event.description}</p>
        )}

        {/* ── Constellation sign-in strip ── */}
        {!memberLoading && (
          member ? (
            <div className="er-constellation-strip er-constellation-strip--signed-in">
              {member.avatarUrl
                ? <img src={member.avatarUrl} alt="" className="er-constellation-avatar" />
                : <div className="er-constellation-avatar er-constellation-avatar--initials">
                    {(member.displayName ?? "?").slice(0, 2).toUpperCase()}
                  </div>
              }
              <div className="er-constellation-info">
                <span className="er-constellation-label">Signed in via Constellation</span>
                <span className="er-constellation-name">{member.displayName}</span>
              </div>
              <button
                type="button"
                className="er-constellation-switch"
                onClick={() => { setMember(null); setName(""); setEmail(""); }}
                title="Use a different account"
              >
                Switch
              </button>
            </div>
          ) : (
            <div className="er-constellation-strip">
              <div className="er-constellation-icon">
                <i className="fas fa-star" aria-hidden="true" />
              </div>
              <div className="er-constellation-info">
                <span className="er-constellation-label">SEARCH member?</span>
                <span className="er-constellation-sub">Sign in to auto-fill your info</span>
              </div>
              <a
                href={constellationLoginUrl}
                className="er-constellation-btn"
              >
                Sign in with Constellation
              </a>
            </div>
          )
        )}

        {/* ── RSVP form ── */}
        <form className="er-form" onSubmit={handleSubmit} noValidate>
          <label className="er-label" htmlFor="er-name">Full name</label>
          <input
            id="er-name"
            className="er-input"
            type="text"
            placeholder="Ada Lovelace"
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="name"
            required
          />

          <label className="er-label" htmlFor="er-email">Email address</label>
          <input
            id="er-email"
            className="er-input"
            type="email"
            placeholder="ada@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          {error && <p className="er-error">{error}</p>}

          <button className="er-submit" type="submit" disabled={submitting}>
            {submitting ? "Registering…" : "Register for this event"}
          </button>
        </form>

        <p className="er-footer">Purdue SEARCH Club · purduesearch.org</p>
      </div>
    </div>
  );
}
