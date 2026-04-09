# Word Clash

A real-time multiplayer word battle game built with React + Vite on the frontend and Node.js + Socket.IO on the backend.

## Features

- Live multiplayer rooms with room-code sharing
- Unique target word per round (no repeats within a match)
- Automatic round progression and score tracking
- Suggested usernames (you can regenerate or edit)
- Auto-assigned player avatars/icons
- Room setup customization (players, word length, rounds, timer)
- Fast in-memory word validation sets for 4/5/6 letter games
- Multi-source dictionary fallback checks (free APIs)
- Chat, leaderboard, and opponent progress panels
- Responsive UI optimized for desktop and mobile

## Tech Stack

- Frontend: React, Vite, Zustand, Socket.IO Client
- Backend: Node.js, Express, Socket.IO
- Deployment: Vercel (frontend), Render (backend)

## Project Structure

```bash
wordle/
  client/   # React app
  server/   # Express + Socket.IO server
```

## Environment Variables

### Frontend (Vercel)

Create `client/.env` for local dev (and set in Vercel Project Settings for production):

```env
VITE_SOCKET_URL=https://your-render-service.onrender.com
VITE_COFFEE_URL=https://buymeacoffee.com/yourname
```

### Backend (Render)

Create `server/.env` for local dev (and set in Render Environment settings for production):

```env
PORT=3001
CORS_ORIGINS=https://your-vercel-app.vercel.app
WORD_VALIDATION_TIMEOUT_MS=2500
```

For multiple frontend domains:

```env
CORS_ORIGINS=https://app-a.vercel.app,https://app-b.vercel.app
```

## Run Locally

### 1) Backend

```bash
cd server
npm install
npm start
```

### 2) Frontend

```bash
cd client
npm install
npm run dev
```

Frontend defaults to `http://localhost:5173`; backend defaults to `http://localhost:3001`.

## Deployment Guide

### Deploy Backend on Render

1. Create a new Web Service from the `server` folder.
2. Build command: `npm install`
3. Start command: `npm start`
4. Add env vars:
   - `PORT=3001`
   - `CORS_ORIGINS=https://your-vercel-app.vercel.app`
5. Deploy and copy the Render service URL.

### Deploy Frontend on Vercel

1. Import the `client` folder as a project.
2. Framework preset: Vite.
3. Add env var:
   - `VITE_SOCKET_URL=https://your-render-service.onrender.com`
4. Deploy.

`client/vercel.json` already includes SPA rewrites so route refreshes work.

## Production Checklist

- Set `VITE_SOCKET_URL` in Vercel to Render URL
- Set `CORS_ORIGINS` in Render to Vercel URL
- Confirm `/api/health` on backend returns OK
- Verify room creation/join/guess flow from deployed frontend

## Scripts

### Client

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run preview` - preview production build

### Server

- `npm start` - start backend server
- `npm run generate:words` - rebuild 4/5/6 bucket lists from `data/words_alpha.txt`

## Word Validation Strategy

The server uses a two-stage validation pipeline:

1. Fast local check (Set lookup)
   - Pre-generated buckets in `server/src/game/wordBuckets.json`
   - `4`, `5`, and `6` letter words are loaded into in-memory `Set`s
2. Fallback dictionary check (parallel API calls)
   - `freedictionaryapi.com`
   - `dictionaryapi.dev`
   - `wiktionary` API
   - `datamuse`

If any fallback source confirms the word, it is accepted.

## Support The Developer

If this project helped you and you want to buy the developer a coffee, add your preferred support link here:

- Buy Me a Coffee: `https://buymeacoffee.com/yourname`
- GitHub Sponsors: `https://github.com/sponsors/yourname`

## License

MIT (or update this section with your preferred license).
