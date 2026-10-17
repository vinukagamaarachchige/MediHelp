# Medication Companion — MVP

An elder medication companion: paste a prescription, confirm the extracted
medications, get a daily schedule, mark doses taken/skipped, and have missed
doses escalate to a caregiver dashboard with an activity log.

## What's in this MVP

- Paste prescription text → LLM extraction (Claude) with an **offline
  fallback parser** if no API key is set, so the app runs out of the box.
- Editable, human-in-the-loop confirmation screen. Low-confidence fields
  must be explicitly reviewed before saving (not just warned about).
- Daily schedule built from medication frequency + your meal/sleep times
  (edit these in `data/store.json` → `person`, or wire up a settings page
  later).
- Elder view: large Taken / Skip buttons.
- Missed-dose detection: critical meds get a shorter grace window (10 min)
  than normal meds (30 min). A "Check for missed doses now" button
  simulates the clock — in production this would run on a timer/cron.
- Caregiver dashboard: alerts with an agent activity log, acknowledge
  button, simple today's-adherence percentage.
- A safety layer (`lib/safety.js`) that blocks directive medical language
  (e.g. "stop taking", "increase the dose") before it reaches the UI — this
  is a backstop, use it for any new LLM-generated text (interaction notes,
  re-plan explanations, caregiver messages).

## What's deliberately NOT in this MVP yet (next layers)

- Interaction checking against a curated dataset.
- Appointments and refill tracking.
- Automatic re-planning after a missed dose.
- Pharmacist summary export.
- Real notifications (SMS/WhatsApp/push) — currently all in-app only.
- Multiple elders per caregiver, Sinhala UI, voice reminders.
- Photo/image prescription upload (text paste only for now — more
  reliable, and avoids OCR as a point of failure).

## Running it

```bash
npm install
cp .env.example .env.local   # optionally add ANTHROPIC_API_KEY
npm run dev
```

Then open http://localhost:3000.

- `/` — elder's today view
- `/prescription/new` — add a prescription
- `/caregiver` — caregiver dashboard

## Data

Everything is stored in `data/store.json`, a single JSON file created
automatically on first run (see `lib/db.js`). This is intentionally the
simplest possible persistence — swap it for SQLite/Postgres later without
touching any other file, since every other file only calls `readDB()` /
`writeDB()`.

## Suggested next steps (in order)

1. Try the hero flow end to end: paste the example text in
   `pages/prescription/new.js`'s placeholder, confirm, mark a dose taken,
   then add another medication with an earlier time and use "Check for
   missed doses now" to see the escalation + log.
2. Add a settings page to edit `person` (wake/meal/sleep times) and
   caregivers instead of hand-editing the JSON file.
3. Add the interaction dataset (20-30 well-known pairs, JSON file) and a
   check that runs on every medication save, output always phrased as a
   pharmacist question (never "stop/start/change").
4. Replace the "Check for missed doses now" button with a real interval
   (`setInterval` client-side for a demo, or a cron job / scheduled
   function for real deployment).
5. Add a first real notification channel (e.g. a Telegram bot) instead of
   the in-app-only caregiver dashboard.
