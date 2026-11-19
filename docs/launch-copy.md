# Neon Void Breaker — launch copy pack

> **DRAFTS ONLY — prepared in Sprint Block 20 (2026-11-19). Nothing here has
> been posted anywhere.** These are ready-to-use texts for when v1.0 ships
> (Block 23). Posting to social media, itch.io or forums is a human decision
> — the sprint does not auto-post. Before using any of these, re-check the
> live link, the version number and the feature list against the shipped
> build.

## 1. Devlog launch post (for docs/devlog.md or a blog)

**Title: Neon Void Breaker v1.0 is live — break bricks, dodge the void**

Twelve hours, twenty-four half-hour blocks, sixty-plus features — and our
first game is done. Neon Void Breaker is a neon brick-breaker roguelite you
can play free in the browser right now:

https://namdev-muse.github.io/neon-void-breaker/

You know the drill: bounce the ball, break the bricks, don't drop it. What
makes this one ours is the void. From Level 2, black holes sit in the wall
and bend the ball's path — time your shots around their wake cycle, or watch
your ball spiral past the event horizon and vanish. A well eats at most one
ball per level, so the risk is always a choice, not a coin flip.

Around that core we built ten hand-designed levels, three new brick types
(movers that slide, exploders that chain, regenerators that come back),
seven powerups, a roguelite upgrade draft after every level, two Void Core
mini-bosses, seeded daily layouts you can share with `?seed=`, fourteen
achievements, and save-and-continue so a run survives a closed tab.

It plays on desktop and phone, works offline after the first visit, and the
whole thing is vanilla HTML/CSS/JS with synthesized Web Audio — no
dependencies, no build step, no audio files. The code, the bot harness that
playtests it, and the full build story are all in the repo:

https://github.com/namdev-muse/neon-void-breaker

Play it, break it, tell us your best score. The void is waiting.

## 2. Short social posts (X / Mastodon / Bluesky — pick one, adapt length)

**Post A (launch):**
Neon Void Breaker v1.0 is LIVE 🧱✨
A neon brick-breaker roguelite where black holes bend your ball.
10 levels · 7 powerups · upgrade drafts · 2 Void Core bosses · seeded daily layouts.
Free in your browser, no install:
https://namdev-muse.github.io/neon-void-breaker/

**Post B (mechanic hook):**
The ball doesn't always go where you aim it.
In Neon Void Breaker, void wells bend your shots — time the wake cycle or lose your ball to the event horizon.
Play free: https://namdev-muse.github.io/neon-void-breaker/

**Post C (dev story):**
Built in a 12-hour sprint: 24 blocks, 60+ features, and a bot harness that playtests the game headlessly before every deploy — it caught a slow-mo bug, a laser gap bug, and a level-4 bleed-out before any player did.
The game: https://namdev-muse.github.io/neon-void-breaker/
The story: https://github.com/namdev-muse/neon-void-breaker/blob/main/docs/devlog.md

## 3. itch.io page description (draft)

**Neon Void Breaker** — a neon brick-breaker roguelite for the browser.

Break bricks. Build combos. Dodge the void.

From Level 2, black holes bend your ball's path and swallow anything that
crosses the event horizon. Time your shots around their wake cycle, draft
an upgrade after every level, and take down the Void Core Prime to win the
run.

- 10 hand-designed levels, plus seeded daily layouts (`?seed=` to share one)
- 7 powerups: multi-ball, wide paddle, laser, slow-mo, shield, fireball, void bomb
- 3 special brick types: movers, exploders, regenerators
- Roguelite upgrade draft after every level clear
- 2 Void Core mini-bosses, 14 achievements, local high scores
- Save / continue — your run survives a refresh
- Mouse, touch and full keyboard play; works offline after first visit

Free, no install, no account. Made with vanilla HTML/CSS/JS, Canvas 2D and
synthesized Web Audio. Source code:
https://github.com/namdev-muse/neon-void-breaker

## 4. GitHub release blurb (paste into the v1.0 release alongside docs/release-notes-v1.0.md)

Neon Void Breaker v1.0 — our first complete game. A neon brick-breaker
roguelite: 10 levels, void gravity wells, 7 powerups, upgrade drafts,
2 Void Core bosses, achievements, save/continue, PWA + offline play.
Play it: https://namdev-muse.github.io/neon-void-breaker/
Full notes: docs/release-notes-v1.0.md

## 5. README one-liner (for the repo tagline / social bio)

Neon Void Breaker — a neon brick-breaker roguelite where black holes bend
your ball. Free in the browser: 10 levels, 7 powerups, upgrade drafts,
Void Core bosses. No install, no account.

## Checklist before any of this goes live

- [ ] v1.0 tag created and release notes published (Block 23)
- [ ] Live link verified after the final deploy
- [ ] Feature list re-checked against the shipped build (levels, powerups, bosses)
- [ ] Screenshot/GIF in the repo is current (docs/screenshot-gameplay.png, docs/gameplay.gif)
- [ ] Human picks the channel(s) and posts — no auto-posting
