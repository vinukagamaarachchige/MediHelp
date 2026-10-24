// Supabase-backed store. Same exported interface as the old file-based
// version (readDB, writeDB, nextId, redact, logAgentActivity) so every
// consumer only needed `await` added at call sites — the data model
// itself (one JSON document holding person/medications/doses/etc.) is
// unchanged. This trades "every API route queries its own table" for
// "one JSONB document, swapped out for a real relational schema later if
// the app outgrows it" — the right call given how many files read/write
// overlapping parts of this object today.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { hashPin, validPin } from "./auth";

const STORE_ID = "main";
const MAX_BYTES = 8 * 1024 * 1024; // Postgres jsonb can hold far more, but this keeps the same sane ceiling the file-based version had.

let cachedClient = null;
function supabase() {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

const DEFAULT_DATA = {
  person: {
    name: "Elder",
    wake: "07:00",
    breakfast: "08:00",
    lunch: "13:00",
    dinner: "19:00",
    sleep: "22:00",
    pinEnabled: true,
    pinSetupRequired: true,
    theme: "light",
    language: "en",
    fontScale: 100,
  },
  caregivers: [],
  medications: [],
  doses: [],
  alerts: [],
  activityLogs: [],
  devices: [],
};

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/(?:^pin$|pinHash|secret|token|authorization|cookie|pillPhoto|imageBase64|reminderDeliveries)/i.test(
              key,
            ),
        )
        .map(([key, item]) => [key, redact(item)]),
    );
  return value;
}

async function ensureRow() {
  const client = supabase();
  const { data, error } = await client
    .from("companion_store")
    .select("data")
    .eq("id", STORE_ID)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.data;
  const { error: insertError } = await client
    .from("companion_store")
    .insert({ id: STORE_ID, data: DEFAULT_DATA });
  // 23505 = unique_violation — another request created the row first, which is fine.
  if (insertError && insertError.code !== "23505") throw insertError;
  return DEFAULT_DATA;
}

export async function readDB() {
  const data = await ensureRow();
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Invalid data store");
  let migrated = false;
  data.person ||= { ...DEFAULT_DATA.person };
  for (const field of [
    "caregivers",
    "medications",
    "doses",
    "alerts",
    "activityLogs",
    "devices",
  ])
    if (!Array.isArray(data[field])) data[field] = [];
  if (data.person.pinSetupRequired === undefined) {
    data.person.pinSetupRequired = data.person.pinHash
      ? validPin("1234", data.person)
      : !data.person.pin || data.person.pin === "1234";
    migrated = true;
  }
  if (data.person.pin) {
    data.person.pinHash = hashPin(String(data.person.pin));
    delete data.person.pin;
    migrated = true;
  }
  for (const key of ["theme", "language", "pinEnabled", "fontScale"])
    if (data.person[key] === undefined)
      data.person[key] = DEFAULT_DATA.person[key];
  if (migrated) {
    data.activityLogs = data.activityLogs.map(redact);
    await writeDB(data);
  }
  return data;
}

export async function writeDB(data) {
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized, "utf8") > MAX_BYTES)
    throw new Error("Data store size limit reached");
  const client = supabase();
  const { error } = await client
    .from("companion_store")
    .upsert({ id: STORE_ID, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export function nextId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function logAgentActivity(db, type, message, details = {}) {
  const entry = {
    id: nextId("act"),
    timestamp: new Date().toISOString(),
    type,
    message,
    details: redact(details),
  };
  db.activityLogs ||= [];
  db.activityLogs.unshift(entry);
  db.activityLogs = db.activityLogs.slice(0, 200);
  return entry;
}
