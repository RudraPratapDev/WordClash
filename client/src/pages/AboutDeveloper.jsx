import { Link } from 'react-router-dom';

export default function AboutDeveloper() {
  const coffeeUrl = import.meta.env.VITE_COFFEE_URL || 'https://buymeacoffee.com/';

  return (
    <section className="page-center">
      <div className="panel hero-card about-card">
        <div className="about-nav-row">
          <Link to="/" className="about-back-link">← Back to Home</Link>
        </div>
        <p className="label">Panda Den</p>
        <h2 className="hero-title">Lazy Panda’s Build Lab</h2>
        <p className="hero-subtitle">
          A tiny corner of the internet where full-stack systems, playful UX, and AI experiments collide.
          The mission is simple: build useful things that feel alive.
        </p>

        <div className="about-grid">
          <article className="about-tile">
            <h3>Core Skill Combo</h3>
            <p>Realtime architecture + thoughtful interface design + practical AI.</p>
          </article>

          <article className="about-tile">
            <h3>Work Philosophy</h3>
            <p>Ship quickly, monitor honestly, iterate relentlessly, and keep it human.</p>
          </article>

          <article className="about-tile">
            <h3>Off-Hours Mode</h3>
            <p>Open-source dives, AI paper rabbit holes, and rebuilding old ideas better.</p>
          </article>

          <article className="about-tile">
            <h3>Fun Build Ritual</h3>
            <p>Tea first, logs second, then one very ambitious TODO list.</p>
          </article>
        </div>

        <p className="about-coffee-line">
          If this project made your day better, fuel the next one with coffee.
        </p>
        <a className="about-coffee-btn" href={coffeeUrl} target="_blank" rel="noreferrer">Buy Lazy Panda a coffee</a>
      </div>
    </section>
  );
}
