import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import AboutDeveloper from './pages/AboutDeveloper';
import { useSocket } from './hooks/useSocket';
import { Sun, Moon } from 'lucide-react';
import useGameStore from './store/useGameStore';
import './index.css';

function App() {
  const { isConnected } = useSocket();
  const { isDarkMode, toggleTheme } = useGameStore();

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar container">
          <div>
            <p className="topbar-kicker">Multiplayer Word Battle</p>
            <h1 className="brand">
              <Link to="/" className="brand-link">Word Clash</Link>
            </h1>
          </div>
          <div className="topbar-actions">
            <Link to="/about-developer" className="topbar-link">Panda Den</Link>
            <span className={`connection-pill ${isConnected ? 'online' : 'offline'}`}>
              {isConnected ? 'Online' : 'Offline'}
            </span>
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        <main className="container page-wrap">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/room/:roomId" element={<Lobby />} />
            <Route path="/game" element={<Game />} />
            <Route path="/about-developer" element={<AboutDeveloper />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
