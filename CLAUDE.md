# Eddy (river-guide): notes for Claude

## How to ship (the owner's standing preference)
- **Merge to `main` by default.** Do the work on the session's branch, rebuild, test, commit, push, open a pull request
  into `main` and merge it. Only hold back if the owner says not to for that task. The owner will change this note if the
  preference changes.
- **Don't say something is done until it is on `main`.** The owner's biggest worry is work that was "done" but never
  merged or never visible in the app. After merging, `git fetch origin main` and confirm the change is really there
  (for example `git show origin/main:index.html | grep -c "<a string from the change>"`). If you cannot merge, say so
  plainly at the top of the reply.
- `index.html` is **generated** and is what GitHub Pages serves. After any change under `src/` or `data/`, run
  `npm run build` and commit `index.html`. `npm test` fails if `index.html` is stale (test/build.test.mjs).
- Run `npm test` before every push. Check UI changes in a real browser (headless Chromium is in /opt/pw-browsers).

## Data
- `data/rivers/*.json` are the source of truth. `scripts/rivers/*.js` are old generators that would overwrite hand
  edits (they blank `note` and `notes`): do not rerun them.
- After adding or renaming camps, run `npm run geo -- <river-id>` (horizons are keyed by name and mile). `npm test`
  checks it.
- Access points get ids by position in `access[]`: append, never reorder.
- The README documents the river record shape, including `stats` (River > Overview).

## Content is safety-relevant and unverified
- Rivers are dangerous. Never present a guess as a fact. Leave a field blank rather than invent it, say where each
  number came from, and record sources in `data/sources.json`.
- The owner is checking all content by hand before publishing: see section 0 of `docs/PRE_PUBLISH.md`. Add anything new
  that needs checking to that list.
- Keep the "do not rely on this app for decisions" disclaimer intact: RiskGate (bump `RISK_VERSION` if its meaning
  changes), About > Safety & sources, and Terms sections 4 and 5. (The per-tab river notice was removed on purpose; keep the app
  lean and don't add repeat disclaimers.)

## Brian's hard rule: no "how it was made" text
- Show results, not method: no captions, footnotes, "based on…", "calculated from…" or "approximated by…" lines in the app or in replies, unless leaving them out would lead to a worse or unsafe decision. Put checking detail in `docs/PRE_PUBLISH.md` or `data/sources.json`. If unsure, leave it out. Keep replies, code comments, commit messages and PR descriptions to what changed and why, as short as possible.
