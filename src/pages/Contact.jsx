import React, { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import PublicEventsCalendar from '../components/events/PublicEventsCalendar';
import ExternalLink from '../components/ExternalLink';
import { SLACK_JOIN_URL } from '../lib/siteLinks';

const Contact = () => {
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  return (
    <div>
      <SEOHead
        title="Contact"
        description="Get in touch with Purdue SEARCH. Reach out to join our team, ask about research collaborations, or learn about upcoming events."
        canonical="/contact"
      />
      <Navbar solid />
      <main id="main-content" className="contact-page">
      <h1 className="sr-only">Contact Us</h1>

      <section id="contact-form" className="bg-white">
        <div className="container">
          <div className="section-content">
            <div className="title-wrap" data-aos="fade-up">
              <h2 className="section-title">Get In Touch</h2>
              <p className="section-sub-title">
                Have a question or want to learn more about SEARCH? Fill out the form below.
              </p>
            </div>
            <div className="row">
              <div className="col-md-10 offset-md-1 mt-4" data-aos="fade-up">
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px', boxShadow: '0 4px 24px rgba(18,18,28,0.10)' }}>
                  <iframe
                    src="https://forms.gle/8PUCmvD63rwyPYZy9"
                    width="100%"
                    height="700"
                    frameBorder="0"
                    marginHeight="0"
                    marginWidth="0"
                    title="SEARCH Contact Form"
                    style={{ display: 'block' }}
                  >
                    Loading…
                  </iframe>
                </div>
                <p className="text-center mt-3" style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                  If the form doesn't load,{' '}
                  <ExternalLink href="https://forms.gle/8PUCmvD63rwyPYZy9">
                    open it directly
                  </ExternalLink>.
                </p>
              </div>
            </div>
          </div>

          <div className="section-content pt-0">
            <div className="title-wrap" data-aos="fade-up">
              <h2 className="section-title">Where To Find Us?</h2>
            </div>
            <div className="row text-center mt-4">
              <div className="col-md-3" data-aos="fade-up">
                <i className="fas fa-map-marker-alt fs-40 py-4 d-block" aria-hidden="true" />
                <h3 className="contact-card-title">LOCATION</h3>
                <p>Purdue University, West Lafayette, IN</p>
              </div>
              <div className="col-md-3" data-aos="fade-up" data-aos-delay={200}>
                <i className="fas fa-clock fs-40 py-4 d-block" aria-hidden="true" />
                <h3 className="contact-card-title">MEETING TIME</h3>
                <p>Weekly during the semester — see <a href="#events">Upcoming Events below</a></p>
              </div>
              <div className="col-md-3" data-aos="fade-up" data-aos-delay={400}>
                <i className="fab fa-instagram fs-40 py-4 d-block" aria-hidden="true" />
                <h3 className="contact-card-title">SOCIAL</h3>
                <p>
                  <ExternalLink href="https://www.instagram.com/purdue_search/">@purdue_search</ExternalLink> on Instagram
                </p>
              </div>
              <div className="col-md-3" data-aos="fade-up" data-aos-delay={600}>
                <i className="fas fa-envelope fs-40 py-4 d-block" aria-hidden="true" />
                <h3 className="contact-card-title">EMAIL US</h3>
                <p>
                  <a href="mailto:purduesearch@gmail.com">
                    purduesearch@gmail.com
                  </a>
                </p>
                <p>
                  <ExternalLink href={SLACK_JOIN_URL} style={{ fontSize: '0.875rem' }}>
                    Join our Slack
                  </ExternalLink>
                </p>
                <p>
                  <ExternalLink href="https://forms.gle/BF1xNLWT6H1Zhupf8" style={{ fontSize: '0.875rem' }}>
                    Share Feedback
                  </ExternalLink>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicEventsCalendar />
      </main>

      <Footer />
    </div>
  );
};

export default Contact;
