import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";

const state = (globalThis.__companionAuthV2 ||= {
  sessions: new Map(),
  attempts: new Map(),
});
const CARE_COOKIE = "companion_caregiver";
const DEVICE_COOKIE = "companion_device";
const SESSION_MS = 30 * 60 * 1000;
const DEVICE_MS = 30 * 86400000;
const digest = (token) => createHash("sha256").update(token).digest("hex");
const fingerprint = (db) =>
  digest(
    `${db.person.pinEnabled}:${db.person.pinHash || db.person.pin || "unset"}`,
  );
export function constantEqual(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    timingSafeEqual(
      Buffer.from(digest(a), "hex"),
      Buffer.from(digest(b), "hex"),
    )
  );
}
export function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(String(pin), salt, 32).toString("hex")}`;
}
export function validPin(pin, person) {
  if (typeof pin !== "string" || !/^\d{4,12}$/.test(pin)) return false;
  if (!person.pinHash)
    return typeof person.pin === "string" && constantEqual(pin, person.pin);
  if (!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(person.pinHash)) return false;
  const [salt, hash] = person.pinHash.split(":");
  return timingSafeEqual(Buffer.from(hash, "hex"), scryptSync(pin, salt, 32));
}
export function needsPinSetup(db) {
  return (
    db.person.pinSetupRequired === true ||
    (!db.person.pinHash && (!db.person.pin || db.person.pin === "1234"))
  );
}
export function canSetupLocally(req) {
  const loopback = (address) =>
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
  let localHost = false;
  try {
    localHost = ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(`http://${req.headers?.host}`).hostname,
    );
  } catch {}
  const forwarded = req.headers?.["x-forwarded-for"];
  const localForwarded =
    !forwarded ||
    (typeof forwarded === "string" &&
      forwarded.split(",").every((address) => loopback(address.trim())));
  return (
    localHost &&
    loopback(req.socket?.remoteAddress) &&
    localForwarded &&
    !req.headers?.forwarded
  );
}
function secureCookie(req) {
  return (
    !!req.socket?.encrypted ||
    (!!process.env.COMPANION_ORIGIN?.startsWith("https://") &&
      req.headers?.host === new URL(process.env.COMPANION_ORIGIN).host)
  );
}
function cookieName(req, name) {
  return secureCookie(req) ? `__Host-${name}` : name;
}
function tokenFrom(req, name) {
  name = cookieName(req, name);
  const token =
    req.cookies?.[name] ||
    (req.headers?.cookie || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token)
    ? token
    : null;
}
export function deviceId(req, db) {
  if (needsPinSetup(db)) return null;
  const token = tokenFrom(req, DEVICE_COOKIE);
  if (!token) return null;
  const id = digest(token);
  return (db.devices || []).some(
    (d) =>
      d.id === id &&
      d.expiresAt > Date.now() &&
      d.fingerprint === fingerprint(db),
  )
    ? id
    : null;
}
export function isDevice(req, db) {
  return !!deviceId(req, db);
}
export function activeDeviceIds(db) {
  return new Set(
    (db.devices || [])
      .filter(
        (d) => d.expiresAt > Date.now() && d.fingerprint === fingerprint(db),
      )
      .map((d) => d.id),
  );
}
export function isCaregiver(req, db) {
  if (!isDevice(req, db)) return false;
  if (db.person.pinEnabled === false) return true;
  const token = tokenFrom(req, CARE_COOKIE);
  const session = token && state.sessions.get(digest(token));
  return (
    !!session &&
    session.expires > Date.now() &&
    session.fingerprint === fingerprint(db)
  );
}
export function requireDevice(req, res, db) {
  if (isDevice(req, db)) return true;
  res.status(401).json({
    error: "Authorize this device with the caregiver PIN.",
    code: "DEVICE_REQUIRED",
  });
  return false;
}
export function requireCaregiver(req, res, db) {
  if (isCaregiver(req, db)) return true;
  res.status(401).json({
    error: "Unlock with the caregiver PIN to continue.",
    code: isDevice(req, db) ? "CAREGIVER_REQUIRED" : "DEVICE_REQUIRED",
  });
  return false;
}
function setCookie(req, res, name, value, maxAge) {
  const secure = secureCookie(req);
  name = cookieName(req, name);
  const cookie = `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  const existing = res.getHeader?.("Set-Cookie");
  res.setHeader("Set-Cookie", [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    cookie,
  ]);
}
export function startSession(req, res, db) {
  const old = tokenFrom(req, CARE_COOKIE);
  if (old) state.sessions.delete(digest(old));
  for (const [id, session] of state.sessions)
    if (session.expires <= Date.now()) state.sessions.delete(id);
  while (state.sessions.size >= 100)
    state.sessions.delete(state.sessions.keys().next().value);
  const token = randomBytes(32).toString("hex");
  state.sessions.set(digest(token), {
    expires: Date.now() + SESSION_MS,
    fingerprint: fingerprint(db),
  });
  setCookie(req, res, CARE_COOKIE, token, 1800);
  const existing = deviceId(req, db);
  db.devices = (db.devices || []).filter(
    (d) => d.expiresAt > Date.now() && d.fingerprint === fingerprint(db),
  );
  if (!existing) {
    const deviceToken = randomBytes(32).toString("hex");
    db.devices = [
      ...db.devices.slice(-19),
      {
        id: digest(deviceToken),
        expiresAt: Date.now() + DEVICE_MS,
        fingerprint: fingerprint(db),
      },
    ];
    setCookie(req, res, DEVICE_COOKIE, deviceToken, 30 * 86400);
  }
}
export function endSession(req, res) {
  const token = tokenFrom(req, CARE_COOKIE);
  if (token) state.sessions.delete(digest(token));
  setCookie(req, res, CARE_COOKIE, "", 0);
}
export function forgetDevice(req, res, db) {
  const id = deviceId(req, db);
  db.devices = (db.devices || []).filter((d) => d.id !== id);
  db.pushSubscriptions = (db.pushSubscriptions || []).filter(
    (s) => s.deviceId !== id,
  );
  endSession(req, res);
  setCookie(req, res, DEVICE_COOKIE, "", 0);
}
export function pinAttempt(req, successful = null) {
  const now = Date.now();
  const key = req.socket?.remoteAddress || "local";
  for (const [id, item] of state.attempts)
    if (item.until < now) state.attempts.delete(id);
  if (state.attempts.size >= 1000 && !state.attempts.has(key)) return false;
  let item = state.attempts.get(key) || { count: 0, until: now + 5 * 60000 };
  if (successful === true) {
    state.attempts.delete(key);
    return true;
  }
  if (successful === false) {
    item.count++;
    state.attempts.set(key, item);
  }
  return item.count < 5;
}
export function publicPerson(person) {
  const fields = [
    "name",
    "wake",
    "breakfast",
    "lunch",
    "dinner",
    "sleep",
    "pinEnabled",
    "theme",
    "language",
    "fontScale",
  ];
  return Object.fromEntries(
    fields.filter((k) => person[k] !== undefined).map((k) => [k, person[k]]),
  );
}
