import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';

gsap.registerPlugin(ScrollTrigger);

const Outreach = () => {
  const videoRef = useRef(null);
  const heroRef  = useRef(null);

  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  // GSAP ScrollTrigger — scrub video through hero extender
  useEffect(() => {
    const video = videoRef.current;
    const hero  = heroRef.current;
    if (!video || !hero) return;

    video.pause();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const initScrub = () => {
      if (video.duration <= 0) return;
      const st = ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
        onUpdate: (self) => {
          video.currentTime = self.progress * video.duration;
        },
      });
      return st;
    };

    let st;
    if (video.readyState >= 1) {
      st = initScrub();
    } else {
      video.addEventListener('loadedmetadata', () => { st = initScrub(); }, { once: true });
    }

    return () => {
      if (st) st.kill();
    };
  }, []);

  return (
    <div>
      <SEOHead
        title="Outreach Events"
        description="Purdue SEARCH hosts talks, watch parties, and networking events with scientists and engineers from NASA, SpaceX, SETI, Blue Origin, and more."
        canonical="/outreach"
      />
      <Navbar />

      {/* ===== SCROLL-SCRUBBED VIDEO HERO ===== */}
      <div id="main-content" className="hero-scroll-extender" ref={heroRef}>
      <div style={{ height: '100vh', overflow: 'hidden', background: '#12121c' }}>
        <video
          ref={videoRef}
          src="/outreach/Launch_Party.webm"
          muted
          playsInline
          preload="metadata"
          poster="/outreach.webp"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(18,18,28,0.30) 0%, rgba(18,18,28,0.65) 100%)', zIndex: 1 }} />
        <div className="container text-center" style={{ position: 'relative', zIndex: 2, top: '50%', transform: 'translateY(-50%)' }}>
          <h1 className="display-2 mb-4" style={{ color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
            Outreach Events
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem', maxWidth: '560px', margin: '0 auto' }}>
            Talks, events, and community engagement — bringing space exploration to the Purdue campus and beyond.
          </p>
        </div>
      </div>
      </div>{/* /hero-scroll-extender */}

      {/* ===== TABLING ===== */}
      <section id="outreach-tabling">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Campus <b>Tabling</b></h2>
            <p className="section-sub-title">
              SEARCH reaches new members and spreads space science enthusiasm through regular
              tabling events across Purdue's campus.
            </p>
          </div>
          <div className="tabling-layout" data-aos="fade-up">
            <div>
              <img loading="lazy" src="/outreach/Tabling_Outreach.webp" alt="SEARCH Tabling" style={{ width: '100%', borderRadius: '10px', objectFit: 'cover', aspectRatio: '4/3' }} />
            </div>
            <div className="tabling-video-wrap" style={{ borderRadius: '10px', overflow: 'hidden' }}>
              <video
                src="/outreach/Tabling_Wheel.webm"
                autoPlay
                loop
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
            <div>
              <img loading="lazy" src="/outreach/Tabling2_Outreach.webp" alt="SEARCH Tabling 2" style={{ width: '100%', borderRadius: '10px', objectFit: 'cover', aspectRatio: '4/3' }} />
            </div>
          </div>
          <div className="row mt-5">
            <div className="col-lg-8 offset-lg-2 text-center" data-aos="fade-up">
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Our tabling events feature interactive demonstrations, prize wheels, and
                one-on-one conversations about SEARCH's research projects and mission.
                Whether it's a student fair or a faculty showcase, SEARCH shows up to
                share the excitement of analog spaceflight with the Purdue community.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PAST EVENTS ===== */}
      <section id="blog" className="bg-grey">
        <div className="container">
          <div className="section-content">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Past <b>Events</b></h2>
              <p className="section-sub-title">Here's an overview of all of SEARCH's outreach events</p>
            </div>

            <div className="row">
              <div className="col-md-12 blog-holder">
                <h3><b>2024</b></h3><br />
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2024/dune.webp" alt="Dune Watch Party" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Movie Night</small></h6></div>
                        <div className="blog-title"><h4>Dune Watch Party</h4></div>
                        <div className="blog-meta"><p className="blog-date">1 Mar 2024</p><p className="blog-comment">7:30PM ARMS 1028</p></div>
                        <div className="blog-desc"><p>All you Sci-Fi Nerds out there, Join us for a Dune 2 Pre-gaming with a Dune 1 watch Party!</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2024/farah.webp" alt="Talk with Dr. Farah" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Talk</small></h6></div>
                        <div className="blog-title"><h4>Talk with Dr. Farah from SETI Institute</h4></div>
                        <div className="blog-meta"><p className="blog-date">20 Feb 2024</p><p className="blog-comment">7PM LWSN Commons</p></div>
                        <div className="blog-desc"><p>Learn about the space research happening at SETI institute, how radio telescopes work. There may or may not be a live demo of operating the telescope remotely from Purdue!</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2023/millionmiles.webp" alt="A Million Miles Away" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Movie Night</small></h6></div>
                        <div className="blog-title"><h4>A Million Miles Away</h4></div>
                        <div className="blog-meta"><p className="blog-date">26 Jan 2024</p><p className="blog-comment">7PM ARMS 1021</p></div>
                        <div className="blog-desc"><p>Join us for a movie night on a cold January evening (Because too many people had exams in November)!</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-md-12 blog-holder">
                <h3><b>2023</b></h3><br />
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2023/millionmiles.webp" alt="A Million Miles Away" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Movie Night</small></h6></div>
                        <div className="blog-title"><h4>A Million Miles Away</h4></div>
                        <div className="blog-meta"><p className="blog-date">7 Nov 2023</p><p className="blog-comment">7PM ARMS 1021</p></div>
                        <div className="blog-desc"><p>Join us for a movie night on a cold November evening!</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2023/meetngreet.webp" alt="Meet N Greet" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Meet and Greet</small></h6></div>
                        <div className="blog-title"><h4>Meet N' Greet with NASA Flight Directors</h4></div>
                        <div className="blog-meta"><p className="blog-date">7 Nov 2023</p><p className="blog-comment">4PM ARMS 3326</p></div>
                        <div className="blog-desc"><p>Meet with Purdue Alumni Allison Bolinger and Ronak Dave and Learn what it means to be a NASA Flight Director</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2023/bake.webp" alt="SEARCH Bake Sale" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Fundraising</small></h6></div>
                        <div className="blog-title"><h4>SEARCH Bake Sale</h4></div>
                        <div className="blog-meta"><p className="blog-date">7 Nov 2023</p><p className="blog-comment">9:30AM - 4:30PM WALC</p></div>
                        <div className="blog-desc"><p>Come to Our bake sale for some delicious homemade banana bread and cookies.</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2023/fagin.webp" alt="Talk with Max Fagin" /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Talk</small></h6></div>
                        <div className="blog-title"><h4>Talk with Max Fagin</h4></div>
                        <div className="blog-meta"><p className="blog-date">28 Sept 2023</p><p className="blog-comment">8PM WTHR 104</p></div>
                        <div className="blog-desc"><p>Max is an aerospace engineer at Blue Origin. He will talk about the realistic future of our solar systems and the different plans for colonization, how the visions of SpaceX, Blue Origin and NASA differ</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2023/piyush.webp" alt="Talk with Piyush Kohpkar" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Talk</small></h6></div>
                        <div className="blog-title"><h4>Talk with Piyush Kohpkar</h4></div>
                        <div className="blog-meta"><p className="blog-date">15 Sept 2023</p><p className="blog-comment">6:30-8:30PM ARMS 1109</p></div>
                        <div className="blog-desc"><p>Piyush is a member of MOXIE/MARS 2020 Rover Science Team and has assisted with the design and build of NASA's 2020 MARS Perseverance Rover and contributed to first ever oxygen production on MARS</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2023/manufacturing.webp" alt="Indiana Manufacturing Institute Visit" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Lab Visit</small></h6></div>
                        <div className="blog-title"><h4>Indiana Manufacturing Institute Visit</h4></div>
                        <div className="blog-meta"><p className="blog-date">28 Apr 2023</p></div>
                        <div className="blog-desc"><p>Get a general view of how composites are manufactured, in aeronautical and aerospace applications</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up" data-aos-delay={200}>
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2023/slava.webp" alt="Talk with Slava Turyshev" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Talk</small></h6></div>
                        <div className="blog-title"><h4>Talk with Slava Turyshev</h4></div>
                        <div className="blog-meta"><p className="blog-date">24 Apr 2023</p><p className="blog-comment">6-7PM ARMS 1010</p></div>
                        <div className="blog-desc"><p>Slava Turyshev is a Astrophysicist at the NASA Jet Propulsion Laboratory and an expert in high precision Spacecraft navigation, solar system dynamics and astrometry.</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up" data-aos-delay={400}>
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2023/sirisha.webp" alt="Networking with Sirisha Bandla" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Talk</small></h6></div>
                        <div className="blog-title"><h4>Networking with Sirisha Bandla</h4></div>
                        <div className="blog-meta"><p className="blog-date">4 Apr 2023</p><p className="blog-comment">11:00 - 12:00 PM FRNY 1043</p></div>
                        <div className="blog-desc"><p>Sirisha Bandla is a Purdue Alum and the second Indian born woman Astronaut. She is the vice president of Government Affairs and Research Operations for Virgin Galactic.</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2023/movie.webp" alt="Interstellar" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Movie Night</small></h6></div>
                        <div className="blog-title"><h4>Interstellar</h4></div>
                        <div className="blog-meta"><p className="blog-date">24 Mar 2023</p><p className="blog-comment">6PM FRNY G124</p></div>
                        <div className="blog-desc"><p>Join us for an Interstellar Watch Party!</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-md-12 blog-holder">
                <h3><b>2022</b></h3><br />
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2022/moses.webp" alt="Michael Moses" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Talk</small></h6></div>
                        <div className="blog-title"><h4>One on One Session with Mr. Michael Moses</h4></div>
                        <div className="blog-meta"><p className="blog-date">7 Nov 2022</p><p className="blog-comment">1:40-2:10PM WALC 2007</p></div>
                        <div className="blog-desc"><p>Mr. Moses is the President of Space Missions and Safety for Virgin Galactic. This is a member only Event</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up" data-aos-delay={400}>
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2022/matt.webp" alt="Dr. Matt Greenhouse" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Talk</small></h6></div>
                        <div className="blog-title"><h4>Talk with Dr. Matt Greenhouse</h4></div>
                        <div className="blog-meta"><p className="blog-date">3 November 2022</p><p className="blog-comment">6-8PM ARMS 1010</p></div>
                        <div className="blog-desc"><p>Dr. Greenhouse is a JWST Integrated Science Instrument Module Project Scientist at NASA Goddard Space Flight Center</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up" data-aos-delay={200}>
                    <div className="blog-item">
                      <div className="blog-img"><img loading="lazy" src="/outreach/2022/hasan.webp" alt="Dr. Hashima Hasan" style={{ maxHeight: '100%', height: '100%' }} /></div>
                      <div className="blog-text">
                        <div className="blog-tag"><h6><small>Talk</small></h6></div>
                        <div className="blog-title"><h4>Talk with Dr. Hashima Hasan</h4></div>
                        <div className="blog-meta"><p className="blog-date">28 Oct 2022</p><p className="blog-comment">5-6PM ARMS B061</p></div>
                        <div className="blog-desc"><p>Dr. Hasan is a JWST Deputy Program Scientist and Education &amp; Public Outreach Lead for Astrophysics at NASA</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Outreach;
