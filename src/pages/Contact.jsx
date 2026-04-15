import React, { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';

const Contact = () => {
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/Purdue_Sky.webp';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  return (
    <div>
      <SEOHead
        title="Contact"
        description="Get in touch with Purdue SEARCH. Reach out to join our team, ask about research collaborations, or learn about upcoming events."
        canonical="/contact"
      />
      <Navbar />
      <div id="main-content" className="jumbotron jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/Purdue_Sky.webp)' }}>
        <div className="container text-center">
          <h1 className="display-2 mb-4">Contact Us</h1>
        </div>
      </div>

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
                  <a href="https://forms.gle/8PUCmvD63rwyPYZy9" target="_blank" rel="noopener noreferrer">
                    open it directly
                  </a>.
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
                <span className="lnr lnr-location fs-40 py-4 d-block" />
                <h5>LOCATION</h5>
                <p>Purdue University, West Lafayette, IN</p>
              </div>
              <div className="col-md-3" data-aos="fade-up" data-aos-delay={200}>
                <span className="lnr lnr-clock fs-40 py-4 d-block" />
                <h5>MEETING TIME</h5>
                <p>Weekly meetings during semester</p>
              </div>
              <div className="col-md-3" data-aos="fade-up" data-aos-delay={400}>
                <span className="lnr lnr-phone fs-40 py-4 d-block" />
                <h5>SOCIAL</h5>
                <p>@purdue_search on Instagram</p>
              </div>
              <div className="col-md-3" data-aos="fade-up" data-aos-delay={600}>
                <span className="lnr lnr-envelope fs-40 py-4 d-block" />
                <h5>EMAIL US</h5>
                <p>
                  <a href="mailto:purduesearch@gmail.com">
                    purduesearch@gmail.com
                  </a>
                </p>
                <p>
                  <a href="https://forms.gle/8PUCmvD63rwyPYZy9" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem' }}>
                    Apply via Google Form
                  </a>
                </p>
                <p>
                  <a href="https://forms.gle/BF1xNLWT6H1Zhupf8" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem' }}>
                    Share Feedback
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Contact;
