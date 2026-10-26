# Before publishing (open items)

Nothing here blocks building or TestFlight. All of it must be done before the app is public.

## 0. Verify all the content by hand (you; do this before anything else)
Eddy's river data was compiled and edited with AI assistance from public sources and has not been field-checked or
checked line by line by a person. Rivers are dangerous, so every number or instruction a boater could act on needs a
human pass before the app is public. Tick these off as you go:
- [ ] **Launch pages** (`LNT_ITEMS`, `GIVE_ORGS` in `src/App.jsx`): check the Leave No Trace wording and that each donate link opens the right page (American Whitewater, American Rivers, Leave No Trace, Grand Canyon River Guides). URLs written from memory.
- [ ] **Preliminary river entries** (Alsek, Tatshenshini, Bruneau-Jarbidge, Deschutes, John Day, Owyhee, Green River
  Labyrinth/Stillwater, Dolores): the river miles, access-point miles and map coordinates were written from memory and are
  approximate. Permit text is from American Whitewater's permit list. Verify each against the managing agency, or fill them
  out with full data (and map data) before publishing.
- [ ] **River Overview stats, 19 filled-out rivers** (`stats` in `data/rivers/*.json`, shown in River > Overview): class, season,
  recommended flow (min, typical, max) and the note under it, flow bands, gauges. Sources disagree on several rivers, and
  many figures came from search summaries, not the agency or American Whitewater page itself. Check each against the
  agency page, American Whitewater and USGS.
- [ ] **USGS station numbers written from memory, not checked against USGS:** Rogue near Agness 14372300, Salt near
  Chrysotile 09497500, Colorado near the Colorado-Utah state line 09163500 (Ruby-Horsethief and Westwater), Green near
  Greendale 09234500, Salmon at White Bird 13317000, Middle Fork Salmon at the Lodge 13309220, Selway near Lowell 13336500.
  Open each link in River > Overview and confirm it is the right gauge.
- [ ] **Typical flow by time of year** (`flowDoy` in `data/rivers/*.json`, Notes > Typical flow). Not shown in the app, so check here: gauge ids, years of
  record, whether gauges are summed, the `where` sentence (several gauges sit above or below the run) and the source are in each river's `flowDoy`
  and listed per river in `data/sources.json` ("Typical flow: <river>"). Check each gauge choice and the **`from` year** used below dams (after the
  dam or the current operating rules began). Dam-controlled rivers show "A dam sets this river's flow. Check the release schedule before you go."
  Weather for 18 rivers is from NASA POWER, not Open-Meteo (see docs/RIVER_GAPS.md). Check Tatshenshini, John Day and Owyhee, whose coords are not on the river.
  Gauges added for Hells Canyon (13290450) and Illinois (14377100): confirm they match the guide.
  Left blank on purpose: Alsek, Tatshenshini (Canadian gauges) and Tuolumne (scheduled release, no gauge on that water).
- [ ] **Typical weather by time of year** (`climateDoy`, Notes > Typical weather). Not shown in the app, so check here: modelled values (Open-Meteo
  historical archive, ERA5-Land, grid about 9 km, 1991 to 2020), not a weather station; rain and cloud are the weakest numbers. Temperature is adjusted
  to the average of the river's put-in and take-out (`elevFrom: 'river'`); rivers with no `stats.elev` use the height at `coords` (`elevFrom: 'point'`),
  which can be a ridge, not the river, so fix those coords or add `elev`. Latitude, longitude and height used are in each river's `climateDoy` and in
  `data/sources.json` ("Typical weather: <river>"). Compare a few rivers with a station you trust. The rain figure is hidden until every river is rerun at the 0.04 in threshold (see docs/RIVER_GAPS.md). Open-Meteo is CC BY 4.0: credit it in Profile >
  About > Safety & sources.
- [ ] **Basin map gauge pins** (`gauges` in `data/basin/*.json`, from the USGS site service by `scripts/basin/gauges.py`): spot-check a few
  pins per river (right place, right name, the USGS link opens that gauge). Small creeks are left off (under 0.2% of the basin, between 10 and 250 sq mi), plus the
  ones the guide names; USGS has no gauges in Canada, so the Alsek and Tatshenshini basins show none north of the border.
- [ ] **Explanatory captions taken out of the app** (kept here in case any should come back): the Notes tab notes on the Shopping list ("Draft list from the
  sheet. The day names (Friday, Saturday...) predate the current menu dates, so match items to meals by name.") and Crew Council ("Notes are kept as
  recorded; plans changed over time, so check the Itinerary and Shuttle tabs for the current plan."); the cost-summary footer ("The Ledger tab recomputes
  these from the gear list; the by-user shuttle shares differ (the sheet charges some shuttle lines to only part of the group)."); "(from the sheet)" in
  that section's title; "(calculated)" on Group needs; and "(the larger of the flat fee or per-day x days)" on the gear price line.
- [ ] **Elevation and gradient** (`stats.elev`, `gradient`, `steep`): measured from terrain tiles, rounded to 50 ft, good
  to a few tens of feet. Take-outs on Lake Powell, Lake Mead and
  other reservoirs depend on the lake level.
- [ ] **Cataract Canyon additions from River Brain:** the camps Confluence, Lake Cataract, Big Drop Beach, Upper and Lower
  Ten Cent, Imperial and Indian Creek have approximate river miles; Upper and Middle Spanish Bottom were matched to River
  Brain's Spanish Bottom 1 and 2 by inference; check all of them against the current NPS designated-campsite list. Also
  the Big Drop 2 and 3 scouting lines, Hite Marina, the Kolb inscription, Little Niagara, and the four flow bands. River
  Brain's "16 ft/mi" gradient was not used: it looks like the whole 248 ft drop divided by the 15 miles of rapids. The
  app shows 2.6 ft/mi averaged over the run and 18 ft/mi for the steepest 5 miles (the Big Drops).
- [ ] **Grand Canyon camp GPS** (`data/geo/coords/grand-canyon.json`): USGS positions, not field-checked. 13 in the Lake Mead reach
  are approximate, 9 camps are on the opposite bank from their `bank` field, and Pearce Ferry (mile 280.5) is 4.4 km from
  the sheet's mile 280.
- [ ] **Rapids, camps, hikes, landmarks and access points** on every river, and each river's **permit and rules** text
  (agencies change these without notice).
- [ ] **Species guides and almanac entries**, especially the Indigenous homeland entries (docs/CONTENT_REVIEW.md).
- [ ] **Medical, signals, rescue and swim content** (cite sources; Apple 1.4.1).
- [ ] **The disclaimer wording**: first-launch gate (RiskGate), Profile > About > Safety & sources, and Terms sections 4 and 5.
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
