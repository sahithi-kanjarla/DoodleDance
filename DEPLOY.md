# Deploying DoodleDance

DoodleDance is ONE Node process: it serves the built website and the realtime party server on the same port
(`PORT`, default 8787). You need a host that supports **WebSockets** and gives you **HTTPS** (the webcam only works on https).

## Easiest: Render (free tier)
1. Put this folder on GitHub (new repo, upload/push everything except `node_modules`).
2. Go to render.com > **New > Blueprint** > pick the repo. It reads `render.yaml` and deploys.
   (Or **New > Web Service**: build `npm install --include=dev && npm run build`, start `node server/server.js`.)
3. Open the `https://doodledance-xxxx.onrender.com` URL. Host a party and share the invite link.

Free-tier note: the service sleeps after ~15 min idle (first visit wakes it in ~30 s) and **parties live in memory**, so a
sleep/restart ends any running party. Characters are saved in each person's own browser, so those survive.

## Other hosts
- **Fly.io / Railway / any Docker host:** `Dockerfile` is included (`docker build -t doodledance . && docker run -p 8787:8787 doodledance`).
- **A VPS:** `npm install && npm run build && PORT=8080 npm start`, then put Caddy or nginx in front for HTTPS
  (nginx needs `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` for `/ws`).
- Vercel/Netlify static hosting will NOT work on its own (no long-lived WebSocket server).

## Good to know
- Uploaded music is kept in memory per party (15 MB each, 40 MB per party), gone when the party closes.
- Scale: one server instance handles many small parties. For multiple instances you'd move rooms to Redis.
