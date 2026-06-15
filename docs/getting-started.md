# Getting Started

## Requirements

- **Node.js 22+** (enforced via `engines` in `package.json`).

## Install

```bash
npm install
# for the screenshot verification gate only:
npx playwright install chromium
```

## Run (local development)

Start the server and client together:

```bash
npm run dev
```

- Server (Colyseus) → `http://localhost:2567`
- Client (Vite) → `http://localhost:8080`

Open `http://localhost:8080`. A bot fills the opposing slot automatically when
you are alone, so a match is playable immediately. Open a second browser tab to
play 1v1 against another human.

Run the pieces separately if you prefer:

```bash
npm run dev:server   # tsx watch on :2567
npm run dev:client   # vite on :8080
```

## Production build

```bash
npm run build        # client → public/  (deployed to GitHub Pages)
npm run build:server # server → dist/server/index.js  (esbuild bundle)
npm start            # run the built server
```

- `npm run build` outputs the client bundle to `public/` — the GitHub Pages
  deploy uploads `./public`. This output path is fixed by the CI/CD assets; do
  not restructure around it.
- The repo is a **single `package.json`** at the root (no monorepo workspaces),
  matched by the `Dockerfile` and `.github/workflows/release.yml`.

### Pointing the client at a remote server

The client reads the server address from `SERVER_URL` **at build time**:

```bash
SERVER_URL="game.example.com:2567" npm run build
```

See [`.env.example`](../.env.example) for the canonical environment variables.

## Ports

| Port | Used by |
| --- | --- |
| `2567` | Colyseus server (matches `.env.example`) |
| `8080` | Vite client dev server |

## Controls

| Key | Action |
| --- | --- |
| `A` / `D` | move left / right |
| `Space` | jump |
| `Shift` | dash |
| Mouse | aim |
| Left mouse | hold to charge, release to fire |
| `1`–`9`, `0` | select weapon |
| `Tab` | scoreboard |
| `Enter` | skip to lobby (on the win screen) |
| `Esc` | pause menu (resume / quit to lobby) |

A **gamepad** also works (standard mapping): left stick / d-pad move, A jump,
B dash, right trigger charge/fire, right stick aim, LB/RB cycle weapons, Start
restart. Keyboard/mouse and pad are interchangeable.

The teal arc previews where your shot lands, accounting for the selected weapon,
charge, and wind.

## Rooms & modes

The first screen is a **room browser**. Create a **1v1** or **2v2** room — each
room gets a unique short **share code** shown on its browser row and at the top
of its lobby — or click an open room to join (a room already in battle is joined
as a spectator).
Inside the room's lobby you pick a team (click the blue / red box) or spectate,
ready up, and the **host** starts the match (3 s countdown if all ready, 10 s
otherwise). Bots fill empty slots and a joining human replaces a bot.

Leaving mid-match kills your tank and turns you into a spectator; `Esc` while
spectating opens a menu to leave the room. A solo/bot match can still be frozen
with `Esc` (pause).

`?autostart` (optionally `?mode=2v2`) skips the browser, creates a room, and
starts immediately — used by shareable links and the screenshot gate.

## Verifying a checkout

Four objective gates guard every change — see [Verification](verification.md):

```bash
npm run typecheck   # tsc, zero errors
npm test            # vitest unit + reconciliation tests
npm run match:sim   # headless bot-vs-bot match
npm run screenshot  # Playwright boots server + client, captures a live match
```
</content>
</invoke>
