# Companion medication care

Use Node 24.22.0 or a newer patched Node 24 LTS release (`.nvmrc` is included). Startup/build scripts reject unsupported runtimes, or on this Windows machine select the app-local Node 24.22.0 runtime after verifying its executable SHA-256 against Node’s published checksum. The global Node installation is unchanged. Other machines can install the `.nvmrc` version with their Node version manager.

Run `npm install`, then `npm run dev` for development. For the complete production server and reminder worker, run `npm run build` then `npm start`. `npm run start:server` starts only Next.js, without the worker. Production startup refuses missing/stale builds so old compiled API code cannot bypass the security update. Deploy one instance with persistent storage; this JSON-backed MVP is not a multi-user medical-record system.

## Accessibility and daily use

Settings contains a persistent 100–225% text-size slider. Changes apply across pages immediately and persist locally; the profile syncs when online. Theme and language preferences also persist. Critical medication badges combine high-contrast text with a distinct warning triangle, with no flashing. Dark secondary text colors use contrasting light tones. Existing hover/scroll effects respect reduced motion.

Taken/Skip immediately show a saving state, then update the schedule and progress after the server confirms. Taken doses stay locked on the server and never deduct supply twice. Voice activation, microphone controls and spoken readouts have been removed. Feedback uses readable status messages, centered toast popups and short non-verbal chimes.

Overdue doses appear prominently after 10 minutes for critical medications or 30 minutes for normal medications. The elder can review missed doses or explicitly request caregiver help. Help requests are durable caregiver-dashboard alerts. External delivery is separate and its acceptance/failure is reported honestly.

Tap a medicine name, photo or identity area to open its details. Food/water, side-effect and missed-dose instructions are caregiver-entered notes from a named pharmacy label, leaflet or clinician. Empty fields direct users to that source; the app does not invent clinical guidance. Enter these notes and their source when adding/editing medication. Dialogs trap keyboard focus, support Escape and restore focus on close.

## Device enrollment and caregiver access

On first use, open Companion locally on the computer running the server and choose a non-repeating 6–12 digit caregiver PIN. There is no accepted default PIN. Existing stores using `1234` require this local setup; other existing custom PINs continue to work and should be upgraded in Settings. Plaintext legacy PINs migrate to salted scrypt hashes automatically, without changing their value. PINs/hashes never leave the server.

Every browser must be authorized with that PIN before it can read medication data or confirm doses. Device enrollment uses a random HTTP-only cookie backed by a hashed token in the store, valid for up to 30 days. The caregiver session is a separate, 30-minute HTTP-only cookie. Locking caregiver views preserves the elder’s daily schedule. Settings → Forget this device revokes the device, its push subscription and its saved offline data. Changing the PIN revokes other devices and push subscriptions. HTTPS deployments use Secure `__Host-` cookies; loopback development remains HTTP-capable.

Caregiver, Settings, activity, medication editing and prescription routes are gated even when opened directly. All API routes enforce authorization independently of the UI. Five failed PIN attempts impose a persistent account-wide five-minute lockout as well as a per-connection limit. Other routes have bounded rate limits. The authorization layer also rejects cross-site requests, unexpected Host headers, repeated query parameters and non-JSON mutation bodies.

The server binds to `127.0.0.1` by default. For a remote HTTPS deployment set `COMPANION_ORIGIN=https://your-real-host.example` and preserve the original Host header and set `X-Forwarded-Proto: https` at the reverse proxy. Only loopback proxies are trusted by default; list any other proxy addresses explicitly in `COMPANION_TRUSTED_PROXY_IPS`. Plain HTTP requests for a remote configured origin are rejected/redirected before sensitive API access. Set `HOSTNAME_BIND` only if the production server must listen on another interface. A public origin does not enable remote first-time PIN setup. If the computer is already running an older app process, restart it after installing this update so the patched framework and security headers are loaded.

This is single-elder device/PIN protection, not biometric authentication or multi-tenant identity management. Do not run multiple writers against the JSON store. Restrict access to the server’s data directory with operating-system permissions and encrypt the device/disk. See [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for findings, test evidence and remaining deployment limitations.

## Offline and installation

In Settings, explicitly enable offline access only on a personal, screen-locked device. This stores public app assets, Today, Week, Pill Box, medication lists/photos/instructions and schedules in browser Cache Storage. PIN sessions, caregiver contacts, settings, caregiver alerts and activity are excluded. Browser storage is not app-level encrypted; someone with access to that browser/device may read it. The removal button wipes Companion offline caches. Offline opt-in requires an authorized device. Authorization failures and device removal clear saved health data; this security update also purges caches created before device enrollment was enforced.

The service worker uses network-first requests, stamps saved responses and rejects snapshots older than 24 hours. Today also rejects snapshots from an earlier calendar day. Cached schedules show their saved time and disable dose confirmation until reconnected. Successful online dose/medication changes invalidate old health snapshots before refreshing. A cold offline launch works only after opting in and successfully saving the app and schedules while online. Offline access is not an offline dose queue.

Supported browsers show an Install Companion banner when their `beforeinstallprompt` event is available; iOS uses the browser Share → Add to Home Screen flow. The manifest includes PNG icons, and mobile zoom remains enabled. Verify installation on actual target devices.

## Background reminders

`npm start` runs a non-overlapping reminder job every 30 seconds alongside Next.js. First use generates VAPID keys and an internal scheduler secret in ignored `data/push-keys.json`; preserve this file so subscriptions remain valid. For deployment, set `VAPID_SUBJECT` to your real HTTPS service URL or a monitored `mailto:` contact. The localhost default is for development and may be rejected by some push services.

Enable background reminders in Settings or Today → Reminders & support. This requests notification permission, subscribes the device and enables an on-device fallback. The fallback checks every 30 seconds only while the app is running and online, deduplicates local notifications, and uses persistent service-worker notifications where supported. It cannot wake a closed browser. Push delivery while closed requires a reachable running server, a valid subscription, connectivity and platform permission; OS power-saving policies may delay it. This app must not be the only medication alarm.

Optional existing deployments can set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `REMINDER_SECRET` instead. If using an external scheduler, POST `/api/reminders` with `Authorization: Bearer <REMINDER_SECRET>` and use `npm run start:server` to avoid duplicate workers. Do not overlap scheduler invocations. Successful reminder deliveries are recorded per dose/device/channel; failed attempts retry within the one-hour reminder window.

WhatsApp text reminders require `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TO`, `WHATSAPP_API_VERSION`, `WHATSAPP_TEMPLATE` and optionally `WHATSAPP_LANGUAGE` (default `en_US`). Use a consenting recipient and an approved template with one body text parameter. For the explicit caregiver-help action, additionally set `CAREGIVER_WHATSAPP_TO` and `CAREGIVER_WHATSAPP_TEMPLATE`; these are separate from elder reminders. Provider acceptance is not proof of delivery. WhatsApp audio notes and external refill-message dispatch remain separate future work.

## Pill box and supply

The helper uses the same schedule anchors and quantities as Today. Evening and night share a physical row; keep distinct times separate if both are prescribed. Filling the box does not mark doses taken. Supply decrements by the prescribed tablet/capsule quantity, initializes from an explicit count or a duration such as `30 days`, and raises dashboard refill alerts at five estimated days remaining. Unsupported liquid/unit quantities stay untracked rather than assuming a pill.

## Validation and storage

`npm test` checks duplicate-dose locking, quantity/depletion rules, five-day thresholds, bedtime, device/caregiver authorization, CSRF/Host checks, mass assignment, upload validation, push SSRF defenses, PIN retry limiting, reminder concurrency/merge, secret redaction and atomic storage failures. `npm run build` validates production compilation. Browser checks exercise direct-route PIN gates, medication details/focus, 225% mobile text, install prompting, actual server authorization and a cold offline reload/cache removal in an isolated test store.

Image extraction requires a configured provider. Missing keys or provider failures never fabricate medication lists. Text fallback leaves unknown dose, duration and frequency fields blank for explicit review.

The main store is `data/store.json`; photos must be JPG/PNG/WebP under 600 KB; server validation checks raster content and limits dimensions to 25 megapixels / 8192 pixels per side. `COMPANION_DATA_DIR` can select a separate persistent data directory (also used by push keys), especially for isolated tests. Back up the store and push keys. No credentials should be committed.

Implementation references: [browser install prompts](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event), [persistent notifications](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification), [WCAG text resizing](https://www.w3.org/WAI/WCAG21/Understanding/resize-text). Automated checks do not establish full WCAG or medical-device compliance.
