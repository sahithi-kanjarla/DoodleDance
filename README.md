# DoodleDance

Draw a stick figure, switch on your webcam, and your drawing copies your moves. Then invite friends and dance together in a shared party room.

**Live:** https://doodledance.onrender.com
(It runs on a free server, so the first visit after a quiet period can take ~30 seconds to wake up.)

## What it does

1. **Draw** a character on the canvas, in any pose.
2. **Auto-rig:** the app finds the head, body and limbs in your drawing and builds a skeleton. If it gets something wrong, you drag the joints into place.
3. **Move:** your webcam tracks your pose in the browser and your drawing follows it. Your own line art is what moves.
4. **Party:** host a party, share the 6-letter code or invite link, and up to 12 people dance on the same floor. The host picks the theme, lights, effects and music.

Don't want to draw? There are ready-made characters to pick from. Don't have a camera? Your character just idles and bops to the music.

## Running it locally

You need Node.js 20 or newer.

```bash
git clone https://github.com/sahithi-kanjarla/DoodleDance.git
cd DoodleDance
npm install
npm run dev
```

Open http://localhost:5173. The webcam works on `localhost` and on HTTPS sites only.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` then `npm start` | Production mode: one server on port 8787 serves the site and the party server |
| `npm run dev:app` | Frontend only, no parties |
| `npm run server` | Party server only |
| `npm test` | Runs the test suites |

## Tech stack

- **Frontend:** React 18, Vite, HTML5 Canvas
- **Backend:** Node.js with a small hand-written WebSocket server (no dependencies)
- **Pose tracking:** MediaPipe BlazePose, running in the browser
- **Audio:** Web Audio API (built-in tracks), file upload, YouTube IFrame API
- **Hosting:** Docker on Render
- **Analytics:** GoatCounter

## How it works

**Rigging** (`src/lib/rig.js`): finds the head (a closed loop, an open circle or a filled blob), thins the body down to a skeleton, ignores small extras like hair and hats, and works out which line ends are arms and which are legs. If it isn't confident, it falls back to a template and tells you.

**Animation** (`src/lib/pose.js`, `retarget.js`): BlazePose gives body landmarks, which are smoothed and turned into bone angles. Each bone of your drawing rotates by the difference between the tracked angle and its rest angle, so your proportions are kept.

**Multiplayer** (`server/`): only ten bone angles and a position are sent per update, never video. The server keeps rooms in memory, rate-limits updates and drops them for slow connections.

**Synced music** (`src/lib/music.js`): the server stores what is playing and from where. Every client works out the same position using a measured clock offset, so everyone hears the same moment and late joiners start mid-song. Volume is per listener. Only the host can play or pause.

## Architecture

```
        Browser (each player)                          Server (one Node process)
 ┌───────────────────────────────┐              ┌───────────────────────────────┐
 │ Drawing canvas  →  auto-rig   │              │ Party rooms (in memory)       │
 │ Webcam → BlazePose (WASM)     │   WebSocket  │  - join / rejoin / host       │
 │ Bone angles → your character  │ ───────────▶ │  - rate limits, validation    │
 │ Party canvas (all characters) │ ◀─────────── │  - music state + clock sync   │
 │ Music player (synth/file/YT)  │              │                               │
 └───────────────────────────────┘     HTTP     │ Static site (the built app)   │
                                  ◀────────────▶ │ /api/health, /api/stats       │
                                                 │ /api/upload, /media/…         │
                                                 └───────────────────────────────┘
```

- **Everything heavy runs in the browser:** drawing, rigging and pose tracking. The server never sees video or your artwork pixels beyond the character image you choose to bring into a party.
- **The server is small and stateful:** it only relays compact pose numbers, settings and music state between people in the same room. Rooms live in memory and close 10 minutes after the last person leaves.
- **One process, one port:** the same Node server delivers the website and the WebSocket endpoint (`/ws`), which keeps hosting simple.
- **Messages** are JSON over `/ws`. Players send `pose`, `emote`, `join`, `rejoin`, `leave`. Only the host can send `admin`, `phase`, `music`, `move` and `kick`, and the server checks that.
- **Other endpoints:** `GET /api/health` (used by the host's health check), `GET /api/stats` (people online, parties open), `GET /api/party?code=` (does this party exist), `POST /api/upload` (host only, audio only) and `GET /media/CODE/ID` (uploaded track, with Range support).

## Project layout

```
src/        React app (components/ for screens, lib/ for rig, tracking, music)
server/     HTTP + WebSocket server
shared/     Constants used by both
tests/      Rig, party and server tests
public/     Favicon
```

## Known limits

- Tracking is 2D, so a limb pointing at the camera looks shorter on screen.
- Characters are rigid pieces. Very thick lines can show a small notch at a sharply bent joint.
- Auto-rig works best with a closed head circle and limbs that don't touch each other. Bags or capes drawn on the body can confuse it, so use the rig check step.
- Parties live in server memory, so a restart ends them. Characters are saved in your own browser (localStorage), so they stay put but don't sync between devices.
- Some YouTube videos block embedding. Uploaded audio is limited to 15 MB.
- The pose model and fonts are loaded from Google/jsDelivr, so the camera step needs internet.

## Deployment

The live site runs on **Render's free plan** from this repo, using the included `Dockerfile`.

To deploy your own copy:

1. Fork or push the repo to GitHub.
2. On [render.com](https://render.com) choose **New → Web Service** and connect the repo. It detects the `Dockerfile`.
3. Pick the **Free** instance, set the health check path to `/api/health`, and leave everything else as it is. No environment variables or secrets are needed (Render sets `PORT` itself).
4. Deploy. Every push to `main` redeploys automatically.

Things to know on the free plan:

- The service sleeps after about 15 minutes without traffic, and the next visit takes ~30 seconds to wake it. A free uptime monitor pinging `/api/health` every 10 minutes keeps it awake.
- Parties live in memory, so a sleep or restart ends running parties. Saved characters are unaffected because they live in each person's browser.

Any host that runs Node 20+ or Docker, supports WebSockets and serves HTTPS will work (Fly.io, Railway, a VPS behind Caddy or nginx). Static-only hosts like Netlify or Vercel won't, because of the realtime server. More hosting notes are in [DEPLOY.md](DEPLOY.md).

## Credits

Built by [Sahithi Kanjarla](https://github.com/sahithi-kanjarla).
