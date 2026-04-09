import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import { useSocket } from './hooks/useSocket';
import { Sun, Moon } from 'lucide-react';
import useGameStore from './store/useGameStore';
import './index.css';

function App() {
  const { isConnected } = useSocket();
  const { isDarkMode, toggleTheme } = useGameStore();
  const coffeeUrl = import.meta.env.VITE_COFFEE_URL || 'https://buymeacoffee.com/';

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="topbar container">
          <div>
            <p className="topbar-kicker">Multiplayer Word Battle</p>
            <h1 className="brand">Word Clash</h1>
          </div>
          <div className="topbar-actions">
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
          </Routes>
        </main>

        <footer className="app-footer container">
          <a href={coffeeUrl} target="_blank" rel="noreferrer">Support the developer with a coffee</a>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
