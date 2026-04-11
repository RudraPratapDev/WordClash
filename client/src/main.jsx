import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Wake up the Render backend as early as possible so it's ready by the time the user interacts.
fetch(`${import.meta.env.VITE_SOCKET_URL}/api/health`).catch(() => {});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
