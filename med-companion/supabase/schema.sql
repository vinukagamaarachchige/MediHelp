-- Run this once in the Supabase SQL Editor (Database -> SQL Editor -> New query).
-- Creates the single JSONB document the app reads/writes as its whole
-- data store (person, medications, doses, alerts, etc.) — see lib/db.js.

create table if not exists companion_store (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- The app only ever talks to this table through the service_role key
-- (server-side, never exposed to the browser), so Row Level Security
-- can stay off — there's no anon/client-side access path to lock down.
alter table companion_store disable row level security;
