# Content review before App Store submission

App Review (guideline 5.2) and the copyright of the people whose work the data came from both matter here.
I can describe what is in the app; **only you know where each piece came from.** Fill in the "Source / permission"
column, then either keep the item, add attribution in `data/sources.json` (shown in Profile → About → Sources &
credits), or remove it.

| Dataset (Grand Canyon unless noted) | Size | What it is | Risk | Source / permission (you fill in) |
|---|---|---|---|---|
| River miles, camp / rapid / hike **names** and mileposts | 272 camps, 120 rapids, 64 hikes | Facts; names are geographic | Low (facts are not copyrightable) | |
| **Camp size and quality ratings** (0–9) | 254 rated camps | Someone's judgement, compiled in a list | **Medium/High** if from a commercial guide or a private survey | |
| **Rapid difficulty ratings** (1–9) and the "tier" label | 120 rapids | Conventional Grand Canyon scale; per-rapid numbers are someone's compilation | Medium if from a commercial guide | |
| Rapid descriptions | 25 distinct sentences reused across 120 rapids | Generic, written per tier (not copied text) | Low | |
| **Hike notes and ratings** | 59 hikes with notes | Short descriptive notes + time/difficulty/quality | **Medium/High** if paraphrased from a guidebook or forum | |
| Geology (formations, ages, descriptions) | 26 formations | Standard stratigraphy; prose is original | Low | |
| Species guide | 320 entries | Common/scientific names + short original descriptions | Low | |
| Almanac (Indigenous history, exploration, dams, lore) | 39 entries | Original summaries of public history | Low; review the Indigenous-history entries with care and add sources | |
| Permit / park rules | 61 rules | Paraphrase of the NPS Noncommercial River Trip Regulations | Low (U.S. government work) but **go stale**; cite the version/date | |
| Medical conditions | 31 conditions | First-aid guidance | **Apple 1.4.1: cite your sources** | |
| Signals, rescue, swim | 17 items | General river-safety practice | Low; cite a source (e.g. a rescue course) | |
| Gear catalog | 214 items (store build drops outfitter lines) | Generic list with example prices | Low in store build | |
| Other 21 built-in rivers: reach, access, rapids, camps, hikes, landmarks, rules | see `data/rivers/*.json` | Mileages and descriptions compiled from the sources listed in `data/sources.json` | **Medium** (several come from commercial guides and user-contributed sites); verify and cite | |
| Added species guides (all 21 rivers) | about 40 to 60 entries each | Regional species lists with short original descriptions; `*` marks non-native species | Low-Medium: written from general knowledge, not surveys; check before publishing | |
| Added almanac entries: history, geology, flows (all 21 rivers) | 3 to 6 entries each | Original summaries of public history and geology | Low; verify dates and names | |
| **Indigenous homeland entries (all 21 rivers)** | about 1 entry each | Names the peoples whose homelands the river crosses | **Review with care**: written from general sources, not tribal ones; get tribal review or attribution | |
| **River Overview stats (all rivers)** | class, season, flow range and note, gauges for 22 rivers | Ratings and flow ranges compiled from American Whitewater, agency pages and outfitter guides, partly via search summaries; gauge station numbers from memory for some rivers; elevation and gradient measured from terrain data | **Medium**: flow ranges are safety-relevant and sources disagree; verify each against the agency or American Whitewater page and USGS | |
| Smith River camp list | 22 camps | Miles from the Montana FWP mileage table, banks from River Brain | Partial list (about 27 named camps exist); confirm against the current FWP sheet | |
| Background art (rock-art style motifs) | 6 images in the stylesheet | Decorative | **Check licence** | |

## What the store build already does
- Removes the real trip (crew names, payments) and the outfitter's product / price lines from the gear catalog.
- Adds a "Reference only" disclaimer on the Medical tab and a "Safety & sources" note in About.

## What I need from you
1. Where did the **camp ratings, rapid ratings and hike notes** come from? If a commercial guide or a private spreadsheet, either get permission, rewrite them in your own words, or tell me to strip those fields from the store build (the app still works without them: the map and lists just lose the colour/quality cues).
2. Sources for the **medical** and **rescue** content (courses, textbooks, agency guidance) so they can be cited in the app.
3. Where the **background motifs** came from.
4. Anything in the Indigenous-history almanac entries that should be attributed to, or reviewed by, a tribal source.

When you have answers, edit `data/sources.json`: each entry with `"confirmed": true` appears in the app.
