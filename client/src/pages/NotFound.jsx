import { Link, useLocation } from 'react-router-dom';
import { Compass, House, RotateCcw } from 'lucide-react';

export default function NotFound() {
  const location = useLocation();

  return (
    <section className="page-center">
      <div className="panel hero-card notfound-card">
        <div className="notfound-grid" aria-hidden="true">
          <span className="notfound-tile">4</span>
          <span className="notfound-tile">0</span>
          <span className="notfound-tile">4</span>
        </div>

        <p className="label">Lost In The Lobby Maze</p>
        <h2 className="hero-title">Oops. This room does not exist.</h2>
        <p className="hero-subtitle">
          The route <strong>{location.pathname}</strong> is not a valid path in this arena.
          Take a shortcut back and keep the streak alive.
        </p>

        <div className="notfound-actions">
          <Link className="btn" to="/">
            <House size={16} /> Back Home
          </Link>
          <button className="btn btn-secondary" type="button" onClick={() => window.history.back()}>
            <RotateCcw size={16} /> Go Back
          </button>
          <Link className="ghost-btn" to="/about-developer">
            <Compass size={14} /> Visit Panda Den
          </Link>
        </div>
      </div>
    </section>
  );
}
