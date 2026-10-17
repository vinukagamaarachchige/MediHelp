# Medication Companion

Run `npm install`, `npm run dev`; production: `npm run build` then `npm start`.

## Feature audit and completion

Existing work included color/shape tags, TTS buttons, a visual taken-dose card, four routine buckets, a pill-box page and primitive stock tracking. These changes complete photo/imprint capture and editing, speech confirmation, a server-side duplicate-dose lock, routine context, duration-based stock calculation, quantity-aware depletion and five-day caregiver dashboard alerts. Today schedules now regenerate each day.

`/pillbox` follows the same frequency and anchor times as Today. Each highlighted slot receives the prescribed quantity per scheduled dose. Evening and night are combined in the physical box; keep distinct dose times separate when both occur. Loading a box does not count medication as taken. Unsupported quantity units remain untracked rather than assuming one pill.

## Reminders: deployment setup

The manifest and service worker support installation and persistent push notifications. This does not provide guaranteed local exact-time alarms. HTTPS (or localhost), permission and platform support are required. Use the Enable device reminders button on Today. On iOS install to Home Screen first. Test on the actual phone.

Set environment variables in `.env.local` (never commit credentials):

- `REMINDER_SECRET`: long random scheduler token.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@example.com`). Generate keys with `npx web-push generate-vapid-keys`.
- Optional WhatsApp: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TO` (consenting elder), `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE`, `WHATSAPP_LANGUAGE` (defaults to `en_US`). The approved template must have one body text parameter containing the reminder. WhatsApp audio notes are not implemented.

Have an external scheduler POST `/api/reminders` every minute with `Authorization: Bearer <REMINDER_SECRET>`. Keep the server running. The job generates missing daily schedules and sends pending reminders due within the last hour. Successful sends are recorded per dose/channel/device; failed sends retry on the next run. Avoid overlapping scheduler executions: the JSON store is for a single process and does not support concurrent writers. Do not run multiple application instances against it.

Refill alerts appear on the caregiver dashboard; external caregiver WhatsApp dispatch is not configured. Browser speech recognition needs microphone permission and browser support. Sinhala TTS needs an installed Sinhala voice; availability varies by device. English and Sinhala language hints are supplied to the speech engine.

## Checks and limitations

`node tests/safety.cjs` verifies duplicate confirmations, locked taken doses, exact confirmation preservation, quantity subtraction, five-day stock thresholds, duration initialization and bedtime scheduling. `npm run build` checks production compilation.

Photos are stored in the local JSON store; each photo must be JPG, PNG or WebP under 600 KB. This local MVP has no production authentication or multi-user isolation. Back up `data/store.json`. Do not use this app as the only medication alarm.
