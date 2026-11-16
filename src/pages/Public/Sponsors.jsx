// Sponsor portal (public route, its own auth). Magic-link sign-in, then the talent directory, introduction
// requests and (when the API turns it on) a posting form. The sign-in token never stays in the URL and the
// Bearer lives in sessionStorage only. Nothing here ranks or scores members.
import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import SEOHead from '../../components/SEOHead';
import SponsorDirectory from '../../components/sponsor/SponsorDirectory';
import { IntroList, PostingForm } from '../../components/sponsor/SponsorActivity';
import {
  SponsorApiError, clearSponsorToken, exchangeToken, getMe, getSponsorToken, logout, requestLogin, setSponsorToken,
} from '../../api/sponsorClient';

const SENT_MESSAGE = 'If that address belongs to an active sponsor account, a sign-in link is on its way. Check your inbox.';

function LoginForm({ notice }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);

  const submit = async e => {
    e.preventDefault();
    if (inFlight.current || !email.trim()) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await requestLogin(email.trim());
    } catch {
      // The same message is shown whatever happens, so nothing here reveals whether an account exists.
    } finally {
      inFlight.current = false;
      setBusy(false);
      setSent(true);
    }
  };

  return (
    <section className="sponsor-section sponsor-login" aria-labelledby="sponsor-login-title">
      <h2 id="sponsor-login-title">Sponsor sign-in</h2>
      {notice && <p className="sponsor-notice" role="status">{notice}</p>}
      {sent ? (
        <p className="sponsor-note" role="status">{SENT_MESSAGE}</p>
      ) : (
        <form className="sponsor-form" onSubmit={submit} noValidate>
          <label htmlFor="sponsor-email">Work email</label>
          <input
            id="sponsor-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <div className="sponsor-actions">
            <button type="submit" className="sponsor-btn" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
          </div>
        </form>
      )}
      <p className="sponsor-note">
        Sponsor accounts are set up by the SEARCH team. To become a sponsor or hire members, write to us through the contact page.
      </p>
    </section>
  );
}

export default function Sponsors() {
  const [phase, setPhase] = useState('checking');
  const [sponsor, setSponsor] = useState(null);
  const [features, setFeatures] = useState({});
  const [notice, setNotice] = useState('');
  const [introKey, setIntroKey] = useState(0);
  const started = useRef(false);

  const toLogin = useCallback(message => {
    clearSponsorToken();
    setSponsor(null);
    setFeatures({});
    setNotice(message || '');
    setPhase('login');
  }, []);

  const sessionEnded = useCallback(() => toLogin('Your session ended. Please sign in again.'), [toLogin]);

  const loadMe = useCallback(async () => {
    try {
      const me = await getMe();
      setSponsor(me.sponsor);
      setFeatures(me.features || {});
      setPhase('in');
    } catch (err) {
      if (err instanceof SponsorApiError && err.status === 401) sessionEnded();
      else if (err instanceof SponsorApiError && err.status === 503) toLogin('Sign-in is temporarily unavailable.');
      else toLogin('The portal could not be reached right now. Please try again.');
    }
  }, [sessionEnded, toLogin]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('t');
    if (t) {
      // Strip the single-use token before anything else so it never lingers in history.
      params.delete('t');
      const qs = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
      exchangeToken(t)
        .then(session => { setSponsorToken(session.token); return loadMe(); })
        .catch(err => {
          if (err instanceof SponsorApiError && err.status === 503) toLogin('Sign-in is temporarily unavailable.');
          else if (err instanceof SponsorApiError && err.status === 401) toLogin('That sign-in link is invalid or has expired. Request a new one below.');
          else toLogin('We could not sign you in just now. Please try again.');
        });
    } else if (getSponsorToken()) {
      loadMe();
    } else {
      setPhase('login');
    }
  }, [loadMe, toLogin]);

  const signOut = async () => {
    try { await logout(); } catch { /* the local session is cleared either way */ }
    toLogin('You are signed out.');
  };

  return (
    <>
      <SEOHead
        title="Sponsors and employers"
        description="Sponsor sign-in for Purdue SEARCH. Meet members who chose to share their verified work."
        canonical="/sponsors"
        noindex
      />
      <Navbar />
      <main id="main-content" className="sponsor-page">
        <header className="sponsor-hero">
          <p className="sponsor-eyebrow">Sponsors</p>
          <h1>Meet the members behind the work</h1>
          <p className="sponsor-lede">
            Members decide whether to appear here. You see only verified results, and a member&apos;s contact details
            reach you only if they accept your request.
          </p>
        </header>

        {phase === 'checking' && <p className="sponsor-note" role="status">Loading…</p>}
        {phase === 'login' && <LoginForm notice={notice} />}
        {phase === 'in' && (
          <>
            <div className="sponsor-bar">
              <p>
                Signed in as <strong>{sponsor?.name || sponsor?.email}</strong>
                {sponsor?.org?.name ? <> from <strong>{sponsor.org.name}</strong></> : null}
              </p>
              <button type="button" className="sponsor-btn sponsor-btn--ghost" onClick={signOut}>Sign out</button>
            </div>
            <SponsorDirectory onUnauthorized={sessionEnded} onIntroSent={() => setIntroKey(k => k + 1)} />
            <IntroList refreshKey={introKey} onUnauthorized={sessionEnded} />
            {features.postings === true && <PostingForm onUnauthorized={sessionEnded} />}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
