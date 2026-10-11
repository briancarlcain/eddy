# Before publishing (open items)

Nothing here blocks building or TestFlight. All of it must be done before the app is public.

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
- Confirm the first-launch risk acknowledgement wording (RiskGate in src/App.jsx; bump RISK_VERSION to re-prompt everyone).
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
