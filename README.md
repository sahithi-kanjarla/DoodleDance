# DoodleDance

Draw your own stick figure → we rig your exact drawing → your webcam moves it.

Phases 1–6: drawing canvas, automatic rig, rig correction, BlazePose tracking, bone-based retargeting, saved characters.
**Phases 7–11 (new): party links, realtime multiplayer sync, party floor, 10 themes + lighting + particles, admin-controlled synced music.**

## What's new in this version
- **Smarter body analysis** (`lib/rig.js`): gaps in strokes are closed, the head is found by several detectors
  (closed loops, open/scribbled circles via circle-fit, filled discs) and each top head candidate is *tried*;
  the one that yields the most human-looking body wins. Hats, hair curls, bags and hands no longer get mistaken
  for heads, limbs drawn without touching the body are bridged back on, hair/hats are kept out of the limbs, and
  missing limbs get sensible defaults instead of a template fallback.
- **Stress-test corpus** (`tests/corpus.mjs`, `tests/eval.mjs`, `tests/viz.mjs`): procedurally generated messy
  figures (wobbly lines, gaps, open heads, hats, hair, bags, capes, tails, raised/bent limbs) with known joints.
  On that deliberately hard set the old analyzer got 22% of figures fully right, this one gets ~45%
  (`node tests/eval.mjs 300`). Bags/capes drawn on the body are the main remaining weak spot — use Rig Check.
- **8 funny ready-made characters** (`lib/examples.js`) with exact rigs: **Use me** or **Remix** in the editor.
- **Flat, chunky UI**: no gradients, hard shadows, playful copy.

## Run

```bash
npm install
npm run dev        # party server (:8787) + app (:5173) together. Open http://localhost:5173
                   # custom port: npm run dev -- --port 5000
npm run dev:app    # app only (no parties)
npm run server     # server only
npm run build && npm start   # serve EVERYTHING from :8787 (what you deploy, see DEPLOY.md)
npm test           # core + party libs + real-socket server integration tests
```

Host a party → copy the invite link (`/party/ABC123`) → friends open it, pick a character, walk in.
To play across the internet, deploy `npm start` anywhere that runs Node ≥ 20 and supports WebSockets
(Render, Fly.io, Railway, a VPS). Use HTTPS — browsers only allow the camera on https or localhost.
The server has **zero dependencies** and keeps rooms in memory (a room closes 10 min after the last person leaves).

## Deploying
See **DEPLOY.md** (Render blueprint + Dockerfile included). Needs WebSockets + HTTPS.

## Drawing tips (also shown in the editor)
Keep hands and feet away from other parts, leave a small gap between limbs and the body, close the head circle, and use simple lines.
The **🪣 Fill** tool colours any *closed* shape with one click; the rig is found from the line art only, so colour never confuses it.

## Party features
| | |
|---|---|
| Links & codes | 6-char codes, `/party/CODE` deep links, up to 12 people, rejoin on reconnect (45 s grace), host auto-promotion if the host leaves |
| Sync | Only compact bone angles (10 numbers, ~20 Hz) + position go over the WebSocket. No video, no landmarks. Server rate-limits poses and drops them for slow clients |
| Room layout | Google-Meet style: the stage fills the window, controls live in a bottom bar, Theme/Music/People open in a right-hand side panel (stage resizes beside it) so you see changes live. Step toward/away from the camera and your character comes forward/goes back on the floor (limited range, never into a neighbour). Resizable camera tile (− / ＋), full-screen (F) |
| Floor | Everyone has their own spot (auto-spread), 2.5D depth scaling, host can drag anybody, away players fade |
| No camera? | Your character idles, and bops to the music |
| Themes | Neon Club, Disco Ball, Fairy Garden, Spooky Night, Beach Party, Space Rave, Cyber City, Cozy Room, Concert Stage, Forest Camp (all flat, no gradients) |
| Lighting / effects | Off, Purple, Blue, Warm, Rainbow beams that pulse with the music; confetti, disco spots, smoke, sparkles |
| Emotes | Wave, Jump, Clap, Dance, Heart, Confetti, Laugh, Surprise (keys 1–8). They override a few bones of *your own drawing* for a moment, never swap the character |
| Host panel | Name, theme, lighting, effects, start party (3-2-1 countdown), music, kick, move people |

## Music: how it works and how to add songs
The server stores `{source, playing, pos, ts}`. Every client computes `pos + (serverNow − ts)` using a ping-measured clock offset and
nudges its own player to that spot, so everybody hears the same moment, and late joiners start mid-song. Volume is local to each listener.

1. **Built-in tracks** (default): 6 tracks synthesised live with WebAudio. No files, no licensing. Real audio analysis drives the visualizer and stage pulse.
2. **Upload a file** (mp3/wav/ogg/m4a, ≤ 15 MB): sent to the server, which streams it (HTTP Range) to everyone in the room. Only upload music you have the rights to play.
3. **YouTube link**: paste any watch/youtu.be/shorts link. Each guest's browser loads the official YouTube embedded player and the host's play/pause/seek is mirrored.
   Limits: YouTube's terms require the player to stay visible (it is shown in the music card); you cannot extract the audio, so the visualizer is a simulated beat;
   some videos block embedding; browsers need one click before sound is allowed (a "Tap to hear the music" button appears).
4. Not built: Spotify (needs Premium on every listener's account) and SoundCloud (its widget API would slot into `music.js` the same way as YouTube).

### Protocol (JSON over `/ws`)
client → server: `ping`, `create`, `join`, `rejoin`, `pose{a[10],s,dx,dy}`, `emote`, `leave`; host only: `admin{patch}`, `phase`, `music{action,...}`, `move`, `kick`.
server → client: `welcome`, `joined`, `left`, `presence`, `host`, `pose`, `emote`, `settings`, `phase`, `music`, `move`, `kicked`, `pong`, `error`.
HTTP: `GET /api/party?code=`, `POST /api/upload` (host token), `GET /media/CODE/ID`.

The BlazePose model (`pose_landmarker_full`) and MediaPipe WASM are fetched from
Google Cloud Storage / jsDelivr the first time you press **Start camera**.

## How it works

| Step | File | What happens |
|---|---|---|
| Draw | `components/DrawingCanvas.jsx` | Free drawing: pen, eraser, size, colour, undo/redo, clear. Transparent canvas = your artwork. |
| Auto rig | `lib/rig.js` | Finds the head (closed loop, else thick blob), cuts it off, thins the body to a skeleton, builds a shortest-path tree from the neck, prunes spurs (hair/accessories), pairs the four limb ends into arms vs legs by where their branches merge, puts elbows/knees at the bends. Any pose works; the drawn pose is the **rest pose**. Falls back to a template + warnings if unsure. |
| Rig check | `components/RigEditor.jsx` | Drag any joint, resize the head, and toggle **Show which bone each line belongs to** to see exactly what is bound to what. |
| Binding | `lib/binding.js` | Every artwork pixel is bound to exactly one bone of the *character's own* skeleton (never to webcam landmarks). Hair/eyes/hats prefer the head. Each child gets a small overlap of its parent's pixels to hide cracks at bent joints. |
| Tracking | `lib/pose.js` | MediaPipe Pose Landmarker (BlazePose full) → One-Euro smoothing → **bone angles**. Each limb bone uses only its own two landmarks. |
| Retarget | `lib/retarget.js` | Forward kinematics on the character's skeleton: each bone rotates by `(target angle − rest angle)` about its own joint, so your proportions and line art are preserved. Occluded limbs hold their last angle. |
| Render | `lib/character.js` | Draws the per-bone artwork pieces back-to-front with the name tag following the head. |

### Left / right convention
The webcam is treated as a **mirror**. Your left side drives the character's **screen-left**
limbs (`LEFT_*` = smaller x in the drawing). Raise your left hand → the hand on the left of the
screen goes up, exactly like looking in a mirror.

### Pose data (ready for Phase 8)
The tracker output is character-agnostic and tiny — this is what will go over the websocket:

```js
{ torso, head, uaL, laL, uaR, laR, ulL, llL, ulR, llR,  // absolute bone angles (rad)
  scale, dx, dy }                                       // distance + position, in torso-lengths
```
No video or landmarks leave the browser.

## Known limits
- Tracking is 2D (image plane). A limb pointing at the camera foreshortens; the angle is still
  right but the drawn limb keeps its length.
- Bones are rigid pieces (no mesh bending), so very thick strokes may show a small notch at a sharply
  bent joint.
- Characters are stored in `localStorage` (`lib/storage.js` is the seam for Supabase).
- Auto-rig works best with a closed head loop and connected limbs; otherwise use Rig Check.

## Tested vs not tested
- Tested here: rig/retarget core (35 tests), party libs (10), server over real sockets (20: auth, sync, rate limits, uploads + Range, reconnect, kick, host promotion, full room),
  and a two-browser run (host + guest) against the real server showing theme/lighting/music/countdown/emote sync.
- **Not tested** in the build sandbox (no internet/camera): live webcam tracking inside a party, YouTube playback, speaker audio, `npm install` + `vite build`.
  Try those first on your machine.
- Rooms are in memory and single-process. For several server instances, move rooms to Redis/Supabase Realtime.
