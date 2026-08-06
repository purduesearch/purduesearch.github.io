import React from "react";
import Navbar from "../../components/Navbar";
import SEOHead from "../../components/SEOHead";

/**
 * Constellation sign-in — and the application home page.
 *
 * This route carries double duty. Above the fold it is the members' sign-in
 * panel; below it is the content that used to live as a standalone static page
 * at /constellation/ — what the application is, what members use it for, how it
 * uses Google Drive data, and who operates it. That second half is what a
 * Google OAuth reviewer reads, so the scope table and the Limited Use language
 * must not be trimmed for visual tidiness.
 */
export default function Login() {
  return (
    <>
    <Navbar />
    <SEOHead
      title="Constellation — project system for SEARCH at Purdue University"
      description="Constellation is the project-management system used by SEARCH, a registered student organization at Purdue University. It connects Slack, Google Drive, and GitHub so club project work has one recorded state."
      canonical="/clubpm/login"
      fullTitle
    />
    <div className="clubpm-app pm-login-root">
      {/* Star field layers */}
      <div className="pm-stars-sm" />
      <div className="pm-stars-md" />
      <div className="pm-stars-lg" />

      <div className="pm-login-hero">
        <div className="pm-login-content">
          {/* Wordmark */}
          <div className="pm-login-wordmark">
            <h1 style={{ fontFamily: "var(--pm-font-display)", color: "var(--pm-accent-teal)", textShadow: "0 0 30px rgba(0,229,204,0.4)", fontSize: "3.5rem", fontWeight: 800, letterSpacing: "-1px", margin: 0 }}>
              Constellation
            </h1>
            <p className="pm-login-typewriter">
              Track your missions across the stars
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
              href={`${process.env.REACT_APP_API_URL || ''}/auth/slack`}
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

      {/* A real anchor, not a decorative chevron: it gives the sign-in view a
          keyboard-reachable route to the application home page content, and gives
          the Google OAuth console a deep link straight to the scope table. */}
      <a className="pm-login-scroll-cue" href="#about-constellation">
        <span>About Constellation</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
        </svg>
      </a>

      <main className="pm-login-doc" id="about-constellation">

        <section className="pm-login-doc-section">
          <span className="pm-login-eyebrow">Application home page</span>
          <h2>What Constellation is</h2>
          <p className="pm-login-lede">
            SEARCH (Space and Earth Analogs Research Chapter) is a registered student
            organization at Purdue University. Its members run analog astronaut training,
            bioastronautics research, space habitat design, and outreach programs — work that
            spans dozens of people, several semesters, and a constant turnover of students.
          </p>
          <p>
            Constellation is the internal web application SEARCH built to manage that work. One
            idea sits underneath it: <strong>work has a state, and the state lives in one
            place</strong> — not in someone&apos;s memory, not in a Slack thread from three weeks
            ago, and not in a Drive folder that four people have a different version of.
          </p>
          <p>
            It doesn&apos;t replace Slack, Google Drive, or GitHub — it connects them, so the state
            of a project lives in one place instead of four.
          </p>

          {/* The integration map, drawn as a constellation: the club's three existing
              tools connected to the system that links them. Edges exist only where a
              real integration does. */}
          <svg className="pm-login-figure" viewBox="0 0 620 380" role="img"
               aria-label="Diagram: Constellation at the centre, connected to Slack, Google Drive, and GitHub.">
            <g className="pm-cst-edges">
              <line className="pm-cst-edge" x1="300" y1="200" x2="95"  y2="105" />
              <line className="pm-cst-edge" x1="300" y1="200" x2="525" y2="130" />
              <line className="pm-cst-edge" x1="300" y1="200" x2="365" y2="330" />
            </g>

            <g aria-hidden="true">
              <circle className="pm-cst-star" cx="60"  cy="250" r="1.6" />
              <circle className="pm-cst-star" cx="170" cy="320" r="1.2" />
              <circle className="pm-cst-star" cx="245" cy="60"  r="1.4" />
              <circle className="pm-cst-star" cx="430" cy="45"  r="1.2" />
              <circle className="pm-cst-star" cx="580" cy="230" r="1.5" />
              <circle className="pm-cst-star" cx="500" cy="300" r="1.2" />
              <circle className="pm-cst-star" cx="120" cy="180" r="1.1" />
              <circle className="pm-cst-star" cx="390" cy="150" r="1.3" />
              <circle className="pm-cst-star" cx="215" cy="255" r="1.2" />
              <circle className="pm-cst-star" cx="555" cy="75"  r="1.1" />
            </g>

            <g className="pm-cst-nodes">
              <g className="pm-cst-node">
                <circle className="pm-cst-node-ring" cx="95" cy="105" r="9" />
                <circle className="pm-cst-node-core" cx="95" cy="105" r="3.5" />
                <text className="pm-cst-label" x="95" y="80" textAnchor="middle">Slack</text>
              </g>
              <g className="pm-cst-node">
                <circle className="pm-cst-node-ring" cx="525" cy="130" r="9" />
                <circle className="pm-cst-node-core" cx="525" cy="130" r="3.5" />
                <text className="pm-cst-label" x="525" y="105" textAnchor="middle">Google Drive</text>
              </g>
              <g className="pm-cst-node">
                <circle className="pm-cst-node-ring" cx="365" cy="330" r="9" />
                <circle className="pm-cst-node-core" cx="365" cy="330" r="3.5" />
                <text className="pm-cst-label" x="365" y="357" textAnchor="middle">GitHub</text>
              </g>
            </g>

            <g className="pm-cst-hub">
              <circle className="pm-cst-hub-ring" cx="300" cy="200" r="15" />
              <circle className="pm-cst-hub-core" cx="300" cy="200" r="5.5" />
              <text className="pm-cst-label-hub" x="300" y="243" textAnchor="middle">Constellation</text>
            </g>
          </svg>

          <div className="pm-login-callout">
            <p>
              <strong>Private application.</strong> Constellation is used only by members of
              SEARCH, who sign in with the club&apos;s Slack workspace. It is not a public service
              and has no public sign-up. There is no paid tier and no advertising.
            </p>
          </div>
        </section>

        <section className="pm-login-doc-section">
          <h2>What members use it for</h2>
          <dl className="pm-login-does">
            <div>
              <dt>Projects and tasks</dt>
              <dd>A board per project, with assignments, priorities, due dates, dependencies,
                and a record of who changed what.</dd>
            </div>
            <div>
              <dt>Milestones and blockers</dt>
              <dd>Marking why something is stuck in a way the system understands, so it shows
                up in reports instead of being rediscovered later.</dd>
            </div>
            <div>
              <dt>Files and CAD parts</dt>
              <dd>A parts vault with version history, check-out, and change requests, backed by
                the club&apos;s Google Drive.</dd>
            </div>
            <div>
              <dt>Events and scheduling</dt>
              <dd>Meeting polls, RSVPs, and a shared calendar for club activities.</dd>
            </div>
            <div>
              <dt>Outreach and writing</dt>
              <dd>Drafting and publishing the club&apos;s blog posts and press material, and keeping
                track of sponsor and partner relationships.</dd>
            </div>
            <div>
              <dt>Training</dt>
              <dd>Internal courses that teach new members how the club works, with progress
                tracked per person.</dd>
            </div>
          </dl>
        </section>

        <section className="pm-login-doc-section">
          <h2>How Constellation uses Google Drive</h2>

          <div className="pm-login-callout">
            <p>
              <strong>Constellation connects one Google account, owned and controlled by the
              club.</strong> Individual members never connect personal Google accounts, and
              Constellation does not offer &ldquo;sign in with Google&rdquo; — members authenticate through
              the club&apos;s Slack workspace. A club administrator connects the shared account once,
              and can disconnect it at any time.
            </p>
          </div>

          <p>
            SEARCH keeps its documents, CAD files, images, and presentation decks in Google
            Drive. Constellation reads and writes those files so that a part in the vault, an
            image in a blog post, or a deck in a training course is the same file the club
            already has in Drive — rather than a second copy that drifts out of date.
          </p>

          <div className="pm-login-table-wrap">
            <table className="pm-login-table">
              <thead>
                <tr>
                  <th scope="col">Permission requested</th>
                  <th scope="col">What it is used for</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>https://www.googleapis.com/auth/drive</code></td>
                  <td>
                    Create and organize the club&apos;s project folders in Drive; upload and
                    download CAD files and their revisions in the parts vault; store images
                    used in published blog posts; read presentation decks that members link
                    to a training course and convert them for display; and list the contents
                    of a project&apos;s Drive folder inside the project&apos;s Files tab.
                  </td>
                </tr>
                <tr>
                  <td><code>openid</code>, <code>email</code></td>
                  <td>
                    Read the email address of the connected account, so administrators can
                    confirm which Google account Constellation is using and detect if the
                    wrong one was connected.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            Constellation reaches only files the connected club account can already access.
            Data received from Google APIs is used solely for the features described above. It
            is not sold, not used for advertising, and not used to train generalized artificial
            intelligence models. The full commitments, including the Google API Services User
            Data Policy Limited Use requirements, are set out in the{" "}
            <a href="/legal/privacy.html#google-data">Privacy Policy</a>.
          </p>
        </section>

        <section className="pm-login-doc-section">
          <h2>Who operates Constellation</h2>
          <p>
            Constellation is built and operated by <strong>SEARCH — Space and Earth Analogs
            Research Chapter</strong>, a registered student organization at Purdue University in
            West Lafayette, Indiana, United States.
          </p>
          <div className="pm-login-callout">
            <p>
              SEARCH is student-run. Constellation is not an official service of Purdue
              University, and the University does not operate or administer it.
            </p>
          </div>
          <p>
            Questions about the application, including requests from reviewers who need a guided
            walkthrough of an account they cannot sign up for, can be sent to{" "}
            <a href="mailto:purduesearch@gmail.com">purduesearch@gmail.com</a>.
          </p>
        </section>

        <section className="pm-login-doc-section">
          <h2>Policies</h2>
          <ul>
            <li><a href="/legal/privacy.html">Privacy Policy</a> — what Constellation collects,
              how it is used, and how to have it removed.</li>
            <li><a href="/legal/terms.html">Terms of Service</a> — the terms that govern use of
              Constellation and the SEARCH website.</li>
          </ul>
        </section>

      </main>

      <footer className="pm-login-footer">
        <div className="pm-login-footer-inner">
          <div>
            <a href="/">SEARCH home</a>
            <a href="/legal/privacy.html">Privacy Policy</a>
            <a href="/legal/terms.html">Terms of Service</a>
            <a href="/contact">Contact</a>
          </div>
          <p>© 2026 SEARCH of Purdue University</p>
        </div>
      </footer>
    </div>
    </>
  );
}
