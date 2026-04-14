import React, { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import BlogCard from '../components/BlogCard';
import SEOHead from '../components/SEOHead';

const Blog = () => {
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

  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Blog',
      'name': 'Purdue SEARCH Blog',
      'url': 'https://purduesearch.github.io/blog',
      'description': 'Latest news and updates from Purdue SEARCH — student-led space analog research at Purdue University.',
      'publisher': {
        '@type': 'Organization',
        'name': 'Purdue SEARCH',
        'url': 'https://purduesearch.github.io/',
      },
    });
    document.head.appendChild(script);
    return () => { if (document.head.contains(script)) document.head.removeChild(script); };
  }, []);

  return (
    <div>
      <SEOHead
        title="Blog &amp; News"
        description="Latest news and updates from Purdue SEARCH — student-led space analog research at Purdue University."
        canonical="/blog"
      />
      <Navbar />
      <div id="main-content" className="jumbotron jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/Purdue_Sky.webp)' }}>
        <div className="container text-center">
          <h1 className="display-2 mb-4">Blog</h1>
          <p className="header-sub-title" style={{ fontWeight: 'bold', fontSize: '120%' }}>
            Latest news and updates from Purdue SEARCH.
          </p>
        </div>
      </div>

      <section id="blog" className="bg-grey">
        <div className="container">
          <div className="section-content">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Latest <b>News</b></h2>
              <p className="section-sub-title">Recent highlights from SEARCH programs, competitions, and research.</p>
            </div>

            {/* 2024–25 */}
            <h3><b>2024–25</b></h3><br />
            <div className="row">
              <div className="col-md-12 blog-holder">
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <BlogCard
                      image="/research/ICES2025_Research.webp"
                      imageAlt="ICES 2025 Conference"
                      tag="Research"
                      title="ICES 2025 Conference"
                      href="/research"
                      date="2025"
                      excerpt="SEARCH presents microgreen chamber research at the International Conference on Environmental Systems — connecting our LEAF initiative work to the global space life sciences community."
                      author="SEARCH Research Team"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2023–24 */}
            <h3 className="mt-5"><b>2023–24</b></h3><br />
            <div className="row">
              <div className="col-md-12 blog-holder">
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <BlogCard
                      image="/software/2023_24/SUITS/bg.webp"
                      imageAlt="NASA SUITS 2024"
                      tag="NASA"
                      title="NASA SUITS 2024"
                      href="/software/suits"
                      date="30 May 2024"
                      excerpt="SEARCH competed in NASA's SUITS augmented-reality challenge at Johnson Space Center, presenting an AR HUD for astronaut EVA operations to NASA engineers and industry evaluators."
                      author="Hrishikesh Viswanath"
                    />
                  </div>
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up" data-aos-delay="100">
                    <BlogCard
                      image="/research/2023_24/rascal/astros-pup-pr-hab-horizontal4.webp"
                      imageAlt="NASA RASC-AL 2024"
                      tag="NASA"
                      title="NASA RASC-AL 2024"
                      href="/research/rascal"
                      date="3 Mar 2024"
                      excerpt="SEARCH presented a Mars surface habitat concept at NASA's RASC-AL design challenge, competing against top universities before NASA engineers and space industry professionals."
                      author="Hrishikesh Viswanath"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2022–23 */}
            <h3 className="mt-5"><b>2022–23</b></h3><br />
            <div className="row">
              <div className="col-md-12 blog-holder">
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <BlogCard
                      image="/analogs/2022/mdrs_bg.webp"
                      imageAlt="MDRS Utah Analog Mission"
                      tag="MDRS"
                      title="SEARCH Goes to Mars!"
                      href="/analogs/mdrs-utah"
                      date="18 Feb 2024"
                      excerpt="Six SEARCH members simulated Mars surface operations at the Mars Desert Research Station in Utah — conducting EVAs, science experiments, and habitat operations in a pressurized analog environment."
                      author="Hrishikesh Viswanath"
                    />
                  </div>
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up" data-aos-delay="100">
                    <BlogCard
                      image="/research/2022_23/mars_mission.webp"
                      imageAlt="NASA RASC-AL 2023"
                      tag="NASA"
                      title="NASA RASC-AL 2023"
                      href="/research/rascal"
                      date="3 Mar 2023"
                      excerpt="SEARCH competed in the NASA RASC-AL challenge for a second consecutive year, refining our Mars habitat design and presenting to a panel of space exploration professionals."
                      author="Hrishikesh Viswanath"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Follow us */}
            <div className="text-center mt-5 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <p style={{ color: 'var(--color-muted)', marginBottom: '1rem' }}>
                Follow us for real-time updates
              </p>
              <a
                href="https://www.instagram.com/purdue_search/"
                className="btn-slide-outline mr-3"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span><i className="fab fa-instagram mr-1" aria-hidden="true" /> Instagram</span>
              </a>
              <a
                href="https://twitter.com/purduesearch"
                className="btn-slide-outline"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span><i className="fab fa-twitter mr-1" aria-hidden="true" /> Twitter</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Blog;
