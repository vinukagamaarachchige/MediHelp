import { secureApi, ApiError } from "../../lib/apiSecurity";
import {
  isCaregiver,
  isDevice,
  requireDevice,
  requireCaregiver,
  validPin,
  hashPin,
  startSession,
  endSession,
  forgetDevice,
  pinAttempt,
  publicPerson,
  needsPinSetup,
  canSetupLocally,
} from "../../lib/auth";
import { readDB, writeDB, logAgentActivity } from "../../lib/db";
import { anchorTimes, timesPerDay } from "../../lib/schedule";

const object = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);
function newPin(value) {
  if (
    typeof value !== "string" ||
    !/^\d{6,12}$/.test(value) ||
    /^(\d)\1+$/.test(value) ||
    [
      "123456",
      "1234567",
      "12345678",
      "123456789",
      "1234567890",
      "654321",
    ].includes(value)
  )
    throw new ApiError("Choose a non-repeating 6–12 digit PIN.");
  return value;
}
function appearance(value) {
  if (
    !object(value) ||
    Object.keys(value).some(
      (k) => !["theme", "language", "fontScale"].includes(k),
    )
  )
    throw new ApiError("Invalid appearance preferences.");
  if (
    (value.theme !== undefined && !["light", "dark"].includes(value.theme)) ||
    (value.language !== undefined && !["en", "si"].includes(value.language)) ||
    (value.fontScale !== undefined &&
      (!Number.isFinite(value.fontScale) ||
        value.fontScale < 100 ||
        value.fontScale > 225))
  )
    throw new ApiError("Invalid appearance preferences.");
  return value;
}
function handler(req, res) {
  const db = readDB();
  if (req.method === "GET") {
    const authorized = isDevice(req, db);
    const safe = publicPerson(db.person);
    return res.json({
      person: authorized
        ? safe
        : Object.fromEntries(
            ["theme", "language", "fontScale", "pinEnabled"].map((k) => [
              k,
              safe[k],
            ]),
          ),
      caregivers: isCaregiver(req, db) ? db.caregivers : [],
      authenticated: isCaregiver(req, db),
      deviceAuthorized: authorized,
      needsSetup: needsPinSetup(db),
      canSetupLocally: canSetupLocally(req),
    });
  }
  if (req.method === "DELETE") {
    if (req.query.forget === "true") {
      forgetDevice(req, res, db);
      writeDB(db);
    } else endSession(req, res);
    return res.json({
      locked: true,
      deviceForgotten: req.query.forget === "true",
    });
  }
  if (req.method !== "POST")
    return res.status(405).json({ error: "Use GET, POST or DELETE" });
  if (!object(req.body)) throw new ApiError("Expected a JSON object.");
  const { verifyPin, setupPin, preferences, person, caregivers } = req.body;
  if (setupPin !== undefined) {
    if (!needsPinSetup(db) || !canSetupLocally(req))
      throw new ApiError(
        "First-time PIN setup must be completed locally on the Companion server.",
        403,
      );
    db.person.pinHash = hashPin(newPin(setupPin));
    db.person.pinSetupRequired = false;
    db.person.pinEnabled = true;
    delete db.person.pin;
    db.devices = [];
    startSession(req, res, db);
    writeDB(db);
    return res.json({
      valid: true,
      deviceAuthorized: true,
      authenticated: true,
    });
  }
  if (verifyPin !== undefined) {
    if (needsPinSetup(db))
      throw new ApiError(
        "Set a caregiver PIN locally before authorizing a device.",
        403,
      );
    if (!pinAttempt(req))
      throw new ApiError("Too many attempts. Try again in five minutes.", 429);
    const now = Date.now();
    if (db.authFailures?.until > now && db.authFailures.count >= 5)
      throw new ApiError("Too many attempts. Try again in five minutes.", 429);
    const correct = validPin(verifyPin, db.person);
    pinAttempt(req, correct);
    if (!correct) {
      const old =
        db.authFailures?.until > now
          ? db.authFailures
          : { count: 0, until: now + 300000 };
      db.authFailures = { count: old.count + 1, until: old.until };
      writeDB(db);
      return res.status(401).json({ valid: false });
    }
    delete db.authFailures;
    startSession(req, res, db);
    writeDB(db);
    return res.json({
      valid: true,
      deviceAuthorized: true,
      authenticated: true,
    });
  }
  if (preferences !== undefined) {
    if (person !== undefined || caregivers !== undefined)
      throw new ApiError("Save appearance separately from caregiver settings.");
    if (!requireDevice(req, res, db)) return;
    Object.assign(db.person, appearance(preferences));
    writeDB(db);
    return res.json({ person: publicPerson(db.person) });
  }
  if (!requireCaregiver(req, res, db)) return;
  if (person !== undefined && !object(person))
    throw new ApiError("Invalid patient settings.");
  const allowed = [
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
    "pin",
  ];
  if (person && Object.keys(person).some((k) => !allowed.includes(k)))
    throw new ApiError("Unknown patient setting.");
  if (
    person?.name !== undefined &&
    (typeof person.name !== "string" ||
      !person.name.trim() ||
      person.name.length > 120)
  )
    throw new ApiError("Patient name must be 1–120 characters.");
  const anchors = ["wake", "breakfast", "lunch", "dinner", "sleep"];
  if (
    person &&
    anchors.some(
      (k) =>
        person[k] !== undefined &&
        (typeof person[k] !== "string" ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(person[k])),
    )
  )
    throw new ApiError("Routine times must use HH:MM.");
  if (
    person?.pinEnabled !== undefined &&
    typeof person.pinEnabled !== "boolean"
  )
    throw new ApiError("Invalid PIN setting.");
  if (person) {
    const style = Object.fromEntries(
      ["theme", "language", "fontScale"]
        .filter((k) => person[k] !== undefined)
        .map((k) => [k, person[k]]),
    );
    appearance(style);
    if (person.pin) newPin(person.pin);
  }
  let contacts;
  if (caregivers !== undefined) {
    if (!Array.isArray(caregivers) || caregivers.length > 10)
      throw new ApiError("At most ten caregiver contacts are supported.");
    contacts = caregivers.map((c, i) => {
      if (!object(c)) throw new ApiError("Invalid caregiver contact.");
      for (const [key, max] of [
        ["name", 120],
        ["relationship", 80],
        ["phone", 40],
        ["id", 100],
      ])
        if (
          c[key] !== undefined &&
          (typeof c[key] !== "string" || c[key].length > max)
        )
          throw new ApiError("Invalid caregiver contact.");
      if (c.phone && !/^[+()\d .-]*$/.test(c.phone))
        throw new ApiError("Invalid caregiver phone number.");
      return {
        id: c.id || `caregiver_${i}`,
        name: c.name || "",
        relationship: c.relationship || "",
        phone: c.phone || "",
        priority: i + 1,
      };
    });
  }
  const credentialsChanged =
    !!person?.pin ||
    (person?.pinEnabled !== undefined &&
      person.pinEnabled !== db.person.pinEnabled);
  if (person) {
    for (const key of allowed.filter((k) => k !== "pin"))
      if (person[key] !== undefined) db.person[key] = person[key];
    if (person.pin) {
      db.person.pinHash = hashPin(person.pin);
      db.person.pinSetupRequired = false;
    }
    delete db.person.pin;
  }
  if (contacts) db.caregivers = contacts;
  if (credentialsChanged) {
    db.devices = [];
    db.pushSubscriptions = [];
    startSession(req, res, db);
  }
  if (person && anchors.some((k) => person[k] !== undefined)) {
    const groups = new Map();
    const today = new Date().toDateString();
    for (const dose of db.doses) {
      if (new Date(dose.scheduledTime).toDateString() !== today) continue;
      const key = dose.medicationId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(dose);
    }
    for (const [id, group] of groups) {
      const med = db.medications.find((m) => m.id === id && !m.retired);
      if (!med) continue;
      group.sort(
        (a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime),
      );
      const times = anchorTimes(
        db.person,
        med.timing,
        timesPerDay(med.frequency),
      );
      group.forEach((dose, index) => {
        if (dose.status !== "pending" || !times[index]) return;
        const [h, m] = times[index].split(":").map(Number);
        const date = new Date(dose.scheduledTime);
        date.setHours(h, m, 0, 0);
        dose.scheduledTime = date.toISOString();
      });
    }
  }
  logAgentActivity(db, "replan", "Caregiver settings updated", {
    fields: Object.keys(person || {}).filter((k) => k !== "pin"),
    caregiversCount: db.caregivers.length,
  });
  writeDB(db);
  return res.json({
    message: "Settings saved",
    person: publicPerson(db.person),
    caregivers: db.caregivers,
    authenticated: true,
    deviceAuthorized: true,
  });
}
export default secureApi(handler, { role: "bootstrap", key: "settings" });
export const config = { api: { bodyParser: { sizeLimit: "32kb" } } };
