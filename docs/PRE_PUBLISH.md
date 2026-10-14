# Before publishing (open items)

Nothing here blocks building or TestFlight. All of it must be done before the app is public.

## 0. Verify all the content by hand (you; do this before anything else)
Eddy's river data was compiled and edited with AI assistance from public sources and has not been field-checked or
checked line by line by a person. Rivers are dangerous, so every number or instruction a boater could act on needs a
human pass before the app is public. Tick these off as you go:
- [ ] **River Overview stats, all 22 rivers** (`stats` in `data/rivers/*.json`, shown in River > Overview): class, season,
  recommended flow (min, typical, max) and the note under it, flow bands, gauges. Sources disagree on several rivers, and
  many figures came from search summaries, not the agency or American Whitewater page itself. Check each against the
  agency page, American Whitewater and USGS.
- [ ] **USGS station numbers written from memory, not checked against USGS:** Rogue near Agness 14372300, Salt near
  Chrysotile 09497500, Colorado near the Colorado-Utah state line 09163500 (Ruby-Horsethief and Westwater), Green near
  Greendale 09234500, Salmon at White Bird 13317000, Middle Fork Salmon at the Lodge 13309220, Selway near Lowell 13336500.
  Open each link in River > Overview and confirm it is the right gauge.
- [ ] **Elevation and gradient** (`stats.elev`, `gradient`, `steep`): measured from terrain tiles, rounded to 50 ft, good
  to a few tens of feet. Black Canyon was set by hand (650 ft, no gradient). Take-outs on Lake Powell, Lake Mead and
  other reservoirs depend on the lake level.
- [ ] **Cataract Canyon additions from River Brain:** the camps Confluence, Lake Cataract, Big Drop Beach, Upper and Lower
  Ten Cent, Imperial and Indian Creek have approximate river miles; Upper and Middle Spanish Bottom were matched to River
  Brain's Spanish Bottom 1 and 2 by inference; check all of them against the current NPS designated-campsite list. Also
  the Big Drop 2 and 3 scouting lines, Hite Marina, the Kolb inscription, Little Niagara, and the four flow bands. River
  Brain's "16 ft/mi" gradient was not used: it looks like the whole 248 ft drop divided by the 15 miles of rapids. The
  app shows 2.6 ft/mi averaged over the run and 18 ft/mi for the steepest 5 miles (the Big Drops).
- [ ] **Rapids, camps, hikes, landmarks and access points** on every river, and each river's **permit and rules** text
  (agencies change these without notice).
- [ ] **Species guides and almanac entries**, especially the Indigenous homeland entries (docs/CONTENT_REVIEW.md).
- [ ] **Medical, signals, rescue and swim content** (cite sources; Apple 1.4.1).
- [ ] **The disclaimer wording**: first-launch gate (RiskGate), Profile > About > Safety & sources, the "Reference only,
  not for decisions" notice on every river tab, and Terms sections 4 and 5.
- [ ] Work down the "Source / permission" column in docs/CONTENT_REVIEW.md and record sources in data/sources.json.
Edit the JSON in `data/rivers/*.json` (it is the source of truth), then `npm run build` and commit `index.html`.

## 1. Legal review of terms.html (do first)
Fill every [BRACKETED] item, get a lawyer's review, then delete the red "Draft for legal review" box.
- Publisher identity: individual or LLC (affects personal liability more than any clause).
- **Section 4 (danger, assumption of risk, release):** enforceability of a pre-injury release varies by state; wrongful-death and minors' claims; whether a click-through is enough; carve-outs for gross negligence.
- **Section 16 (limitation of liability):** cap amount; personal-injury and consumer-law limits.
- **Section 17 (indemnity):** keep or drop for consumers.
- **Section 18 (governing law, venue):** add arbitration and a class-action waiver if wanted (Strava and AllTrails both have them).
- Age floor (13) and whether to require 18+ for creating or owning shared trips.
- Contact address and a monitored support email (also replace the GitHub issues link in the app: SUPPORT_URL).

## 2. Product and platform
- Confirm the first-launch risk acknowledgement wording (RiskGate in src/App.jsx; bump RISK_VERSION to re-prompt everyone; it is at version 2 since the "do not rely on Eddy to make decisions" wording was added).
- Upgrade Supabase to Pro (free projects pause after inactivity), and add a custom SMTP sender on a domain you own so anyone can sign up (docs/ACCOUNTS_SETUP.md).
- Apple Developer Program, bundle id, App Store Connect record, GitHub secrets, TestFlight run (docs/APP_STORE.md).
- Content clearance for camp, rapid and hike data and the background art (docs/CONTENT_REVIEW.md, data/sources.json).
- Universal links need your own domain; until then invites open the web app.
- Fill the Unrated rapids and camp quality ratings from a licensed guidebook if you want them.

## 3. Reviewer notes
- Accounts are optional. Shared trips are invite-only (guideline 1.2 notes in docs/APP_STORE.md).

## Feedback
- Review feedback in Supabase: Table editor > feedback, or SQL editor on the views feedback_inbox, feedback_weekly, feedback_by_river. Triage by setting status, priority, tags and notes.
- Confirm the privacy policy Feedback section and the App Store privacy answers (Device ID, optional contact email) with counsel.
