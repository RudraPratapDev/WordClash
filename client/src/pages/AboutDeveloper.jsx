import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Lightbulb, MessageSquare } from 'lucide-react';

const API_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export default function AboutDeveloper() {
  const coffeeUrl = import.meta.env.VITE_COFFEE_URL || 'https://buymeacoffee.com/';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('issue');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!isModalOpen) return undefined;

    function onKeydown(event) {
      if (event.key === 'Escape') {
        setIsModalOpen(false);
      }
    }

    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [isModalOpen]);

  async function submitFeedback(event) {
    event.preventDefault();
    setStatusMessage('');
    setSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: feedbackType,
          title,
          message,
          contactEmail,
          page: 'panda-den',
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setStatusMessage(payload.message || 'Unable to submit right now.');
        return;
      }

      setStatusMessage('Thanks. Your feedback has been sent.');
      setTitle('');
      setMessage('');
      setContactEmail('');
      setTimeout(() => {
        setIsModalOpen(false);
        setStatusMessage('');
      }, 1100);
    } catch (_error) {
      setStatusMessage('Unable to reach feedback service.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-center">
      <div className="panel hero-card about-card">
        <div className="about-nav-row">
          <Link to="/" className="about-back-link">← Back to Home</Link>
          <div className="about-feedback-subtle-row">
            <button
              type="button"
              className="about-feedback-subtle-btn"
              onClick={() => {
                setFeedbackType('issue');
                setIsModalOpen(true);
                setStatusMessage('');
              }}
            >
              Report issue
            </button>
            <button
              type="button"
              className="about-feedback-subtle-btn"
              onClick={() => {
                setFeedbackType('suggestion');
                setIsModalOpen(true);
                setStatusMessage('');
              }}
            >
              Suggestion
            </button>
          </div>
        </div>
        <p className="label">Panda Den</p>
        <h2 className="hero-title">Lazy Panda’s Build Lab</h2>
        <p className="hero-subtitle">
          A cozy build corner where ideas turn into playful apps, curious experiments, and polished experiences.
          The mission is simple: make useful things that feel fun to use.
        </p>

        <div className="about-grid">
          <article className="about-tile">
            <h3>How I Build The Fun Stuff</h3>
            <p>Quick prototypes, clean system thinking, and tiny delight details that make products feel alive.</p>
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
        <div className="about-actions-row">
          <a className="about-coffee-btn" href={coffeeUrl} target="_blank" rel="noreferrer">Buy Lazy Panda a coffee</a>
        </div>
      </div>

      {isModalOpen ? (
        <div className="feedback-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="feedback-modal panel" onClick={(event) => event.stopPropagation()}>
            <div className="feedback-modal-head">
              <div>
                <p className="label">Panda Den Inbox</p>
                <h3>{feedbackType === 'issue' ? 'Report an issue' : 'Share a suggestion'}</h3>
              </div>
              <button type="button" className="ghost-btn" onClick={() => setIsModalOpen(false)}>
                Close
              </button>
            </div>
            <p className="feedback-modal-subtitle">
              This goes directly to the Panda Den queue and helps improve Word Clash.
            </p>
            <form className="feedback-form" onSubmit={submitFeedback}>
              <div className="feedback-type-row" role="group" aria-label="Feedback type">
                <button
                  type="button"
                  className={`feedback-type-btn ${feedbackType === 'issue' ? 'active' : ''}`}
                  onClick={() => setFeedbackType('issue')}
                >
                  <AlertTriangle size={16} />
                  Issue
                </button>
                <button
                  type="button"
                  className={`feedback-type-btn ${feedbackType === 'suggestion' ? 'active' : ''}`}
                  onClick={() => setFeedbackType('suggestion')}
                >
                  <Lightbulb size={16} />
                  Suggestion
                </button>
              </div>

              <label className="label" htmlFor="feedback-title">Title</label>
              <input
                id="feedback-title"
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Short summary"
                minLength={5}
                maxLength={120}
                required
              />

              <label className="label" htmlFor="feedback-message">Details</label>
              <textarea
                id="feedback-message"
                className="input feedback-textarea"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What happened or what should be improved"
                minLength={10}
                maxLength={2000}
                required
              />

              <label className="label" htmlFor="feedback-email">Contact email (optional)</label>
              <input
                id="feedback-email"
                className="input"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                maxLength={120}
              />

              {statusMessage ? <p className="form-error">{statusMessage}</p> : null}

              <div className="feedback-actions">
                <button type="submit" className="btn" disabled={submitting}>
                  <MessageSquare size={16} />
                  {submitting ? 'Sending...' : 'Send to Panda Den'}
                </button>
                <button type="button" className="ghost-btn" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
