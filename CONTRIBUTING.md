# Contributing to Neon Void Breaker

Thanks for wanting to help! This is a small vanilla-JS arcade game — no
build step, no dependencies, no framework. That is deliberate: anyone
should be able to clone it and play within a minute.

## Quick start

```bash
git clone https://github.com/namdev-muse/neon-void-breaker.git
cd neon-void-breaker
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `index.html` in a browser. The whole game is `index.html` +
`style.css` + `game.js`.

## Ground rules

- **Keep it dependency-free.** Vanilla HTML/CSS/JS, Canvas 2D, Web Audio API.
- **Keep the game playable at all times.** Every change must leave a
  working game — no half-wired features on `main`.
- **No credentials, keys, or tokens in files.** Ever.
- **No placeholder markers.** CI fails on `TODO` / `FIXME` in the shipped
  game files (`game.js`, `index.html`, `style.css`).
- **Match the neon style.** Dark void background, glowing cyan / pink /
  amber palette, particles and screen shake for feedback, not decoration.

## Before you push

Run the checks CI runs, plus the bot:

```bash
node --check game.js
node tests/bot-harness.js            # 2 full headless runs (default)
node tests/bot-harness.js 3 200000   # 3 attempts, 200k frames each
```

The bot plays real runs in a stubbed DOM, tracks the ball, drafts
upgrades, and reports coverage plus bug detectors (ball tunneling, stuck
balls, NaN velocities). It exits non-zero if a detector fires or no level
is cleared — fix what it finds before pushing. See
`docs/devlog.md` for the bugs it has already caught.

## How to contribute

1. **Bug reports / feature ideas:** open an issue using the templates.
   Include browser + version, device, level, and the game version from
   the page footer. A screenshot helps a lot.
2. **Code:** fork, branch off `main`, make a focused change (one
   feature or fix per pull request), run the checks above, and open a PR
   describing what changed and how you tested it.
3. **Balance changes:** say how you tested them — the bot harness is the
   reference playtester (it clears all 6 levels in a good run), so quote
   its output when you tune speeds, HP, or drop rates.
4. **Docs / README:** edits are welcome; keep the feature list honest —
   only list what is actually live, and update the version footer in
   `index.html` when a release-worthy change lands.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Page shell, HUD, overlays, canvas |
| `style.css` | All styling, responsive + landscape rules |
| `game.js` | The entire game: engine, levels, powerups, audio, UI |
| `tests/bot-harness.js` | Headless auto-play bot + bug detectors |
| `docs/devlog.md` | Block-by-block development log |
| `docs/screenshot-gameplay.png` | Gameplay screenshot for the README |
| `docs/gameplay.gif` | Animated gameplay clip for the README |
| `.github/workflows/ci-pages.yml` | CI (syntax + file checks) + GitHub Pages deploy |

## Releases

Pushes to `main` deploy to GitHub Pages automatically via GitHub
Actions. Versioned releases (v1.0, …) are tagged from `main` once the
sprint's release checklist is done.
