import React, { useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';

const About = () => {
  const sweepRefs = useRef([]);

  useEffect(() => {
    if (window.AOS) {
      window.AOS.init({ once: true });
    }
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/about/About_Hero.webp';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  // IntersectionObserver drives the sweep-in reveal for each section
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sweepRefs.current.forEach(el => el && el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    sweepRefs.current.forEach(el => el && observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const addSweepRef = (el) => {
    if (el && !sweepRefs.current.includes(el)) sweepRefs.current.push(el);
  };

  return (
    <>
      <SEOHead
        title="About Us"
        description="Meet the student leaders and faculty advisors behind Purdue SEARCH — Purdue University's premier space analog research and astronaut training organization."
        canonical="/about"
      />
      <Navbar />

      {/* ===== HERO ===== */}
      <div id="main-content" className="jumbotron jumbotron-single d-flex align-items-center"
        style={{ backgroundImage: 'url(/about/About_Hero.webp)' }}>
        <div className="container text-center">
          <h1 className="display-3 mb-4" style={{ fontFamily: 'Oswald, sans-serif' }}>About Us</h1>
          <p className="header-sub-title" style={{ fontWeight: 'bold', fontSize: '120%' }}>
            For decades, Purdue University researchers have been pioneers in space technology advancement
            and exploration. Heralded "The Cradle of Astronauts" and boasting a world-leading program in
            Aeronautics and Astronautics, Purdue remains the top research institution for many space-related
            disciplines.
          </p>
        </div>
      </div>

      {/* ===== MISSION ===== */}
      <section id="about-mission" className="about-section">
        <div className="container">
          <div className="about-section-inner section-sweep" ref={addSweepRef}>
            <span className="about-section-label">What We Stand For</span>
            <h2>Mission</h2>
            <p>
              SEARCH’s mission is to advance human space exploration and spaceflight-relevant research by 
              developing analog habitats and operations, leading student-driven research projects, and 
              providing hands-on training that prepares Purdue students to become future leaders in aerospace 
              and related fields.
            </p>
            <p>
              SEARCH of Purdue supports this mission by promoting learning, innovation, and engagement in human space exploration. We pursue this mission by aiming to:
              <li>Advance research and technology that strengthen human space exploration capabilities through collaborative research and development, student competitions, and analog programs.</li>
              <li>Cultivate interdisciplinary collaboration between students and departments with diverse interests and areas of expertise.</li>
              <li>Connect students directly with faculty, researchers, and mentors to expand networking opportunities and encourage involvement in both SEARCH projects and broader university research efforts.</li>
              <li>Foster a community that celebrates space exploration and supports members’ passions through social events and shared experiences.</li>
              <li>Provide personal and professional development opportunities that help members pursue careers in space through mentorship and program participation.</li>
              <li>Build external institutional partnerships and secure funding that advance Purdue’s research and technology related to human spaceflight and exploration.</li>
              <li>Increase campus-wide awareness of space exploration and research through an open guest lecture series.</li>
              <li>Inspire younger generations to engage in space exploration through K-12 outreach events.</li>
            </p>
            <p>
              If you are interested in any of these activities, please connect with us — all contact
              information is on the Contact page.
            </p>
          </div>
        </div>
      </section>

      {/* ===== BACKGROUND ===== */}
      <section id="about-background" className="about-section">
        <div className="container">
          <div className="about-section-inner section-sweep" ref={addSweepRef}>
            <span className="about-section-label">Our Origins</span>
            <h2>Background</h2>
            <p>
              Founded in the summer of 2022, SEARCH of Purdue was created as a multidisciplinary organization 
              focused on increasing Purdue’s involvement in human space exploration. The organization was 
              established to unite students, faculty, staff, and alumni with diverse interests and expertise 
              in a shared effort to support spaceflight-relevant research, hands-on projects, and professional 
              development. Since its founding, SEARCH has grown into a collaborative community centered on 
              analog habitat development, research initiatives, experiential training, outreach, and broader 
              engagement in space exploration. By building this foundation, SEARCH continues to foster innovation, 
              interdisciplinary collaboration, and meaningful participation in human space exploration across Purdue’s campus.
            </p>
            <p>
              We aim to involve the student community in research projects that expand our understanding
              of space exploration. The club has participated in NASA competitions such as RASC-AL and
              NASA SUITS. In 2023, the team was selected as one of the finalists for SUITS 2024, to
              present their VR spacesuit interface to NASA scientists in Houston.
            </p>
          </div>
        </div>
      </section>

      {/* ===== OPERATIONS ===== */}
      <section id="about-operations" className="about-section">
        <div className="container">
          <div className="about-section-inner section-sweep" ref={addSweepRef}>
            <span className="about-section-label">How We Operate</span>
            <h2>Operations</h2>
            <p>
              Beyond its student-led research efforts, SEARCH maintains an active outreach program that 
              connects Purdue students with researchers, engineers, and industry professionals involved 
              in space exploration. Through semesterly events such as guest lectures, panels, and networking 
              opportunities, the organization helps students build connections with the broader aerospace 
              community.
            </p>
            <p>
              SEARCH operates through several subteams, including Research, Astronaut Training, 
              Software, ASTRO-USA, Business, and Outreach. Each subteam takes ownership of its initiatives 
              while contributing to the organization’s broader goals. This operating structure supports both 
              focused project leadership and interdisciplinary collaboration across SEARCH.
            </p>
          </div>
        </div>
      </section>

      {/* ===== PLANS AND GOALS ===== */}
      <section id="about-goals" className="about-section">
        <div className="container">
          <div className="about-section-inner section-sweep" ref={addSweepRef}>
            <span className="about-section-label">Looking Ahead</span>
            <h2>Plans &amp; Goals</h2>
            <p>
              SEARCH’s vision is to make Purdue a national leader in student-driven human space exploration 
              and analog research by creating a sustainable pipeline from student interest to interdisciplinary 
              collaboration, hands-on experience, research leadership, and real-world impact.
            </p>
            <p>
              In the near future, SEARCH plans to build a self-sustaining, innovative, and inclusive
              lunar habitat to foster interdisciplinary research and development. The organization hopes
              to leverage the collective expertise of its members and partners to design an analog
              biosphere prepared to support human life under extreme extraterrestrial conditions through
              research, design, and prototyping of a self-contained structure.
            </p>
            <p>
              On the research side, we are working to qualify our microgreen growth chamber for NASA's
              LEAF initiative, establishing SEARCH as a recognized contributor to space-based agriculture
              science. We also continue to expand the Student Analog Astronaut Training Program, with the
              goal of making it accessible to a broader cohort of Purdue students each year.
            </p>
          </div>
        </div>
      </section>

      {/* ===== OFFICERS 2026–2027 ===== */}
      <section id="who-we-are" className="bg-white">
        <div className="container">

          <div className="title-wrap" data-aos="fade-up">
            <h2 className="section-title">Introducing our <br />Officers for the <b>2026–2027 Academic Year</b></h2>
          </div>

          <div className="row" style={{ top: '20px' }}>
            <div className="col-md-10 offset-md-1 features-holder">
              <div className="row">
                <div className="col-md-4 col-sm-12 text-center mt-4">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/john.webp" width="150px" className="officer-photo" alt="John Peters" /></div>
                    <h4>John Peters</h4><h5>President</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/myles.webp" width="150px" className="officer-photo" alt="Myles Bryan" /></div>
                    <h4>Myles Bryan</h4><h5>Vice President</h5>
                  </div>
                </div>
                <div className="col-md-4 col-sm-12 text-center">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/brayden.webp" width="150px" className="officer-photo" alt="Brayden Quale" /></div>
                    <h4>Brayden Quale</h4><h5>Treasurer</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/sam.webp" width="150px" className="officer-photo" alt="Sam Waymire" /></div>
                    <h4>Sam Waymire</h4><h5>Astronaut Training Lead</h5>
                  </div>
                </div>
                <div className="col-md-4 col-sm-12 text-center mt-4">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/shruti.webp" width="150px" className="officer-photo" alt="Shruti Subramaniyan" /></div>
                    <h4>Shruti Subramaniyan</h4><h5>Research Co-Lead</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/henry.webp" width="150px" className="officer-photo" alt="Henry Ewald" /></div>
                    <h4>Henry Ewald</h4><h5>Research Co-Lead</h5>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row" style={{ top: '20px' }}>
            <div className="col-md-10 offset-md-1 features-holder">
              <div className="row">
                <div className="col-md-4 col-sm-12 text-center mt-4">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/swastik.webp" width="150px" className="officer-photo" alt="Swastik Patel" /></div>
                    <h4>Swastik Patel</h4><h5>Software Lead</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/heer.webp" width="150px" className="officer-photo" alt="Heer Meta" /></div>
                    <h4>Heer Meta</h4><h5>Business Lead</h5>
                  </div>
                </div>
                <div className="col-md-4 col-sm-12 text-center">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/melissa.webp" width="150px" className="officer-photo" alt="Melissa Cook" /></div>
                    <h4>Melissa Cook</h4><h5>Outreach Lead</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/ethan.webp" width="150px" className="officer-photo" alt="Ethan Williamson" /></div>
                    <h4>Ethan Williamson</h4><h5>ASTRO-USA Chief Engineer</h5>
                  </div>
                </div>
                <div className="col-md-4 col-sm-12 text-center mt-4">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/vijay.webp" width="150px" className="officer-photo" alt="Vijay Muthmukumar" /></div>
                    <h4>Vijay Muthmukumar</h4><h5>ASTRO-USA Project Manager</h5>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ===== OFFICERS 2027–2028 ===== */}
      <section id="officers-2027" className="bg-white" style={{ paddingTop: 0 }}>
        <div className="container">

          <div className="title-wrap" data-aos="fade-up">
            <h2 className="section-title">Elected Officers for <b>2027–2028</b></h2>
          </div>

          <div className="row" style={{ top: '20px' }}>
            <div className="col-md-10 offset-md-1 features-holder">
              <div className="row">
                <div className="col-md-4 col-sm-12 text-center mt-4">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/john.webp" width="150px" className="officer-photo" alt="John Peters" /></div>
                    <h4>John Peters</h4><h5>President</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/myles.webp" width="150px" className="officer-photo" alt="Myles Bryan" /></div>
                    <h4>Myles Bryan</h4><h5>Vice President</h5>
                  </div>
                </div>
                <div className="col-md-4 col-sm-12 text-center">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/brayden.webp" width="150px" className="officer-photo" alt="Brayden Quale" /></div>
                    <h4>Brayden Quale</h4><h5>Treasurer</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/sam.webp" width="150px" className="officer-photo" alt="Sam Waymire" /></div>
                    <h4>Sam Waymire</h4><h5>Astronaut Training Lead</h5>
                  </div>
                </div>
                <div className="col-md-4 col-sm-12 text-center mt-4">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/shruti.webp" width="150px" className="officer-photo" alt="Shruti Subramaniyan" /></div>
                    <h4>Shruti Subramaniyan</h4><h5>Research Co-Lead</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/henry.webp" width="150px" className="officer-photo" alt="Henry Ewald" /></div>
                    <h4>Henry Ewald</h4><h5>Research Co-Lead</h5>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row" style={{ top: '20px' }}>
            <div className="col-md-10 offset-md-1 features-holder">
              <div className="row">
                <div className="col-md-4 col-sm-12 text-center mt-4">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/azeem.webp" width="150px" className="officer-photo" alt="Azeem Ehtisham" /></div>
                    <h4>Azeem Ehtisham</h4><h5>Software Co-Lead</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/jason.webp" width="150px" className="officer-photo" alt="Jason White" /></div>
                    <h4>Jason White</h4><h5>Software Co-Lead</h5>
                  </div>
                </div>
                <div className="col-md-4 col-sm-12 text-center">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/melissa.webp" width="150px" className="officer-photo" alt="Melissa Cook" /></div>
                    <h4>Melissa Cook</h4><h5>Outreach Co-Lead</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/katie.webp" width="150px" className="officer-photo" alt="Katie Downs" /></div>
                    <h4>Katie Downs</h4><h5>Outreach Co-Lead</h5>
                  </div>
                </div>
                <div className="col-md-4 col-sm-12 text-center mt-4">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/chelsea.webp" width="150px" className="officer-photo" alt="Chelsea Garcia" /></div>
                    <h4>Chelsea Garcia</h4><h5>ASTRO-USA Chief Engineer</h5>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/keegan.webp" width="150px" className="officer-photo" alt="Keegan Breese" /></div>
                    <h4>Keegan Breese</h4><h5>ASTRO-USA Project Manager</h5>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Academic Advisors & Founders */}
          <div className="container">
            <div className="section-content">
              <div className="title-wrap" data-aos="fade-up">
                <h2 className="section-title">Academic <b>Advisors</b> and <b>Founders</b></h2>
              </div>
              <div className="row" style={{ top: '20px' }}>
                <div className="col-md-10 offset-md-1 features-holder">
                  <div className="row">
                    <div className="col-md-4 col-sm-12 text-center mt-4">
                      <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                        <div className="my-4"><img loading="lazy" src="/officers/advisors/porterfield.webp" width="150px" className="officer-photo" alt="Dr. Marshall Porterfield" /></div>
                        <h4>Dr. Marshall Porterfield</h4><h5>Primary Advisor</h5><p>Professor of Biological Engineering &amp; Space Biophysics</p>
                      </div>
                    </div>
                    <div className="col-md-4 col-sm-12 text-center">
                      <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                        <div className="my-4"><img loading="lazy" src="/officers/advisors/bera.webp" width="150px" className="officer-photo" alt="Dr. Aniket Bera" /></div>
                        <h4>Dr. Aniket Bera</h4><h5>Software Advisor</h5><p>Associate Professor, CS</p>
                      </div>
                    </div>
                    <div className="col-md-4 col-sm-12 text-center mt-4">
                      <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                        <div className="my-4"><img loading="lazy" src="/officers/advisors/schmitt.webp" width="150px" className="officer-photo" alt="Rodrigo Schmitt" /></div>
                        <h4>Rodrigo Schmitt</h4><h5>Founder</h5><p>PhD Student, Purdue University</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Past Leadership Tables */}
              <div className="row">
                <div className="col-lg-12">
                  <div className="panel panel-default" style={{ width: '100%' }}>
                    <div className="panel-heading">
                      <h2><b>Past Leadership</b></h2>
                    </div>
                      <div className="panel-body">
                      <h5>Officers Spring 2025</h5>
                      <table className="table table-condensed table-striped table-bordered">
                        <thead><tr><th style={{ color: 'black' }}>Position</th><th style={{ color: 'black' }}>Name</th></tr></thead>
                        <tbody>
                          <tr><td>President</td><td>Brasen Garcia</td></tr>
                          <tr><td>Vice President</td><td>Sonali Garg</td></tr>
                          <tr><td>Treasurer</td><td>Brayden Quale</td></tr>
                          <tr><td>Astronaut Training Co-Lead</td><td>John Peters</td></tr>
                          <tr><td>Astronaut Training Co-Lead</td><td>Micah Ambrose</td></tr>
                          <tr><td>Research Co-Lead</td><td>Shruti Subramaniyan</td></tr>
                          <tr><td>Research Co-Lead</td><td>Manya Kadiwala</td></tr>
                          <tr><td>Software Lead</td><td>Swastik Patel</td></tr>
                          <tr><td>Outreach Lead</td><td>Matthew Scheer</td></tr>
                          <tr><td>Social Media and Marketing Lead</td><td>Nitya Jhaveri</td></tr>
                          <tr><td>ASTRO-USA Chief Engineer</td><td>Adriana Sanchez</td></tr>
                          <tr><td>ASTRO-USA Project Manager</td><td>Vijay Muthmukumar</td></tr>
                          <tr><td>Business Lead</td><td>Nathanael Herman</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="panel-body">
                      <h5>Officers 2024 Academic Year</h5>
                      <table className="table table-condensed table-striped table-bordered">
                        <thead><tr><th style={{ color: 'black' }}>Position</th><th style={{ color: 'black' }}>Name</th></tr></thead>
                        <tbody>
                          <tr><td>President</td><td>Nathanael Herman</td></tr>
                          <tr><td>Vice President</td><td>Ryan DeAngelis</td></tr>
                          <tr><td>Treasurer</td><td>Devyani Tyagi</td></tr>
                          <tr><td>Admin Lead</td><td>Hrishikesh Viswanath</td></tr>
                          <tr><td>Social Media Lead</td><td>Sharvari Deshpande</td></tr>
                          <tr><td>Research Co-Lead</td><td>Bella Crivello</td></tr>
                          <tr><td>Research Co-Lead</td><td>Brasen Garcia</td></tr>
                          <tr><td>Software Lead</td><td>Gurmehar Singh</td></tr>
                          <tr><td>Astronaut Training Lead</td><td>John Peters</td></tr>
                          <tr><td>ASTRO-USA Lead</td><td>Ilina Adhikari</td></tr>
                          <tr><td>Analog Programs Lead</td><td>Spruha Vashi</td></tr>
                          <tr><td>Outreach Co-Lead</td><td>Sonali Garg</td></tr>
                          <tr><td>Outreach Co-Lead</td><td>Matthew Scheer</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="panel-body">
                      <h5>Officers Summer and Fall 2023</h5>
                      <table className="table table-condensed table-striped table-bordered">
                        <thead><tr><th style={{ color: 'black' }}>Position</th><th style={{ color: 'black' }}>Name</th></tr></thead>
                        <tbody>
                          <tr><td>President</td><td>Rodrigo Schmitt</td></tr>
                          <tr><td>Vice President</td><td>Lainie Rapp</td></tr>
                          <tr><td>Treasurer</td><td>Ryan Williams</td></tr>
                          <tr><td>Social Media Lead</td><td>Sharvari Deshpande</td></tr>
                          <tr><td>Research Co-Lead</td><td>Nathanael Herman</td></tr>
                          <tr><td>Research Co-Lead</td><td>Ryan DeAngelis</td></tr>
                          <tr><td>Software Lead</td><td>Gurmehar Singh</td></tr>
                          <tr><td>SA<sup>2</sup>TP Lead</td><td>Émilie Laflèche</td></tr>
                          <tr><td>Analogs Lead</td><td>Robin Kuo</td></tr>
                          <tr><td>Outreach Co-Lead</td><td>Athena Tulac</td></tr>
                          <tr><td>Outreach Co-Lead</td><td>Sonali Garg</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="panel-body">
                      <h5>Officers Spring 2023</h5>
                      <table className="table table-condensed table-striped table-bordered">
                        <thead><tr><th style={{ color: 'black' }}>Position</th><th style={{ color: 'black' }}>Name</th></tr></thead>
                        <tbody>
                          <tr><td>President</td><td>Rodrigo Schmitt</td></tr>
                          <tr><td>Vice President</td><td>Spruha Vashi</td></tr>
                          <tr><td>Co-Treasurer</td><td>Khush Patel</td></tr>
                          <tr><td>Co-Treasurer</td><td>Mariana Aguilar</td></tr>
                          <tr><td>Social Media Lead</td><td>Lainie Rapp</td></tr>
                          <tr><td>Research Lead</td><td>Nathanael Herman</td></tr>
                          <tr><td>Webmaster</td><td>Gurmehar Singh</td></tr>
                          <tr><td>SA<sup>2</sup>TP Lead</td><td>Émilie Laflèche</td></tr>
                          <tr><td>Analogs Lead</td><td>Eshaana Aurora</td></tr>
                          <tr><td>Outreach Lead</td><td>Saranya Ravva</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="panel-body">
                      <h5>Officers Fall 2022</h5>
                      <table className="table table-condensed table-striped table-bordered">
                        <thead><tr><th style={{ color: 'black' }}>Position</th><th style={{ color: 'black' }}>Name</th></tr></thead>
                        <tbody>
                          <tr><td>President</td><td>Rodrigo Schmitt</td></tr>
                          <tr><td>Vice President</td><td>Spruha Vashi</td></tr>
                          <tr><td>Treasurer</td><td>Khush Patel</td></tr>
                          <tr><td>Social Media Lead</td><td>Lainie Rapp</td></tr>
                          <tr><td>Research Lead</td><td>Vignesh Sundararajan</td></tr>
                          <tr><td>Webmaster</td><td>Nathanael Herman</td></tr>
                          <tr><td>SA<sup>2</sup>TP Lead</td><td>Émilie Laflèche</td></tr>
                          <tr><td>Analogs Lead</td><td>Eshaana Aurora</td></tr>
                          <tr><td>Outreach Lead</td><td>Saranya Ravva</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      <Footer />
    </>
  );
};

export default About;
