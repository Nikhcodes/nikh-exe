-- Run once in the Neon SQL editor.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS guestbook_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  message    text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  approved   boolean NOT NULL DEFAULT false,
  ip_hash    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guestbook_approved_idx ON guestbook_entries (approved, created_at DESC);
CREATE INDEX IF NOT EXISTS guestbook_ip_idx ON guestbook_entries (ip_hash, created_at DESC);
