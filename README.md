# Blindfold

Blindfold is a free, open-source tool that walks through websites using only a
keyboard and a screen reader, and reports where blind users would get stuck.

It opens a page in a headless browser and does two passes:

- a **mouse pass** that lists everything a mouse user can interact with, and
- a **keyboard pass** that presses Tab repeatedly, recording where focus lands
  and what a screen reader would announce.

Comparing the two reveals barriers such as unreachable controls, unnamed
buttons, focus traps and silent updates.

## Status: Phase 0

The tool itself isn't built yet. Phase 0 contains:

- **Two demo shops** for a fictional shop called Pebble & Pine, used as a
  permanent benchmark:
  - `demo-sites/buggy-shop`: exactly 8 planted accessibility bugs (see
    `PLANTED-BUGS.md`).
  - `demo-sites/accessible-shop`: the same pages, built correctly (see
    `FIXES.md`).
- **The announcer spike** (`spikes/`): compares two ways of finding out what a
  screen reader would say for the focused element. The recommendation is in
  `spikes/ANNOUNCER-SPIKE-RESULTS.md`.

## Running it

You need Node 22 or newer.

```sh
npm install
npx playwright install chromium

npm run demo:buggy        # buggy shop on http://localhost:4000
npm run demo:accessible   # accessible shop on http://localhost:4001
npm run demo:both         # both at once

npm run spike:announcer   # Tab through the buggy shop home page and print a transcript
npm run typecheck         # TypeScript check
npm test                  # all tests (they start and stop their own servers)
```

On the home page, add `?no-cookie-banner=1` to the URL to skip the cookie
banner.

## Licence

MIT. See `LICENSE`.
