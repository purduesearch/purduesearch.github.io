import { Link } from 'react-router-dom';
import { Player } from '@lottiefiles/react-lottie-player';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const NotFound = () => (
  <div>
    <title>404 — Page Not Found | Purdue SEARCH</title>
    <meta name="description" content="The page you're looking for doesn't exist or has been moved. Return to the Purdue SEARCH homepage." />
    <Navbar />
    <div
      id="main-content"
      className="jumbotron jumbotron-single d-flex align-items-center"
      style={{ backgroundImage: 'url(/Purdue_Sky.webp)', minHeight: '72vh' }}
    >
      <div className="container text-center">
        <div className="lottie-404-wrap">
          <Player
            autoplay
            loop
            src="/animations/astronaut-float.json"
            style={{ height: 200, width: 200 }}
          />
        </div>
        <h1
          className="display-1 mb-3 float-anim"
          style={{ color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700 }}
        >
          404
        </h1>
        <h2 className="mb-4" style={{ color: 'rgba(255,255,255,0.85)' }}>Page Not Found</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem', marginBottom: '2rem' }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <span className="orbit-ring-cta">
          <Link
            to="/"
            className="btn-slide-fill"
            style={{ padding: '0.65rem 2rem', display: 'inline-block' }}
          >
            <span>Return Home</span>
          </Link>
        </span>
      </div>
    </div>
    <Footer />
  </div>
);

export default NotFound;
