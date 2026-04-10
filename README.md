<p align="center">
   <img src="client/public/favicon.svg" alt="Word Clash icon" width="84" height="84" />
</p>

<h1 align="center">Word Clash</h1>

<p align="center">
   A real-time word battle that turns friendly chats into full competition mode.
</p>

<p align="center">
   <a href="https://word-clash-kappa.vercel.app/"><strong>Play Live</strong></a> •
   <a href="#for-devs-quick-start"><strong>Run Locally</strong></a>
</p>

## Welcome To The Arena

Word Clash is built for game-night energy.
You and your friends race on the same timer, throw guesses under pressure, and climb the leaderboard one round at a time.

One room code. One shared countdown. Zero chill.

## Why It Hits Different

- Real-time tension: everyone feels the same ticking clock.
- Instant party setup: host, share code, start.
- Skill and speed both matter: cleaner guesses, better points.
- Solo mode when friends are offline.
- Designed like a game, not a form.

## The 30-Second Flow

1. Open the game.
2. Pick your player name.
3. Create a room or join with a code.
4. Race to solve before the round ends.
5. Repeat until someone earns the bragging rights.

## Modes You Can Jump Into

- Multiplayer Room: private lobby, custom settings, shared chaos.
- Solo Blitz: quick start, clean focus, instant replay.

## Live Version

- https://word-clash-kappa.vercel.app/

## Built For Moments Like

- "One more round."
- "No way you solved that that fast."
- "Rematch right now."
- "I am playing solo while everyone is asleep."

## For Devs (Quick Start)

Project layout:

- `client/` -> React app
- `server/` -> Node + Socket.IO backend

Environment basics:

- Frontend uses `VITE_SOCKET_URL`
- Backend uses `CORS_ORIGINS`

Run locally:

```bash
# terminal 1
cd server
npm install
npm start

# terminal 2
cd client
npm install
npm run dev
```
