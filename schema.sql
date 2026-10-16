-- NIKH.EXE database schema.
-- Safe to run more than once: it only creates what is missing and never drops data.
-- Run it in the Neon SQL editor (paste everything, press Run).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- guestbook
CREATE TABLE IF NOT EXISTS guestbook_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  message    text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  approved   boolean NOT NULL DEFAULT false,
  ip_hash    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- v2: bulletin board moderation (added, existing rows keep their state)
ALTER TABLE guestbook_entries ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false;
ALTER TABLE guestbook_entries ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS guestbook_approved_idx ON guestbook_entries (approved, created_at DESC);
CREATE INDEX IF NOT EXISTS guestbook_ip_idx ON guestbook_entries (ip_hash, created_at DESC);

-- ---------------------------------------------------------------- admin auth
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  id         bigserial PRIMARY KEY,
  ip_hash    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip_hash, created_at DESC);

-- ---------------------------------------------------------------- media library
-- One row per image. The bytes live in media_blobs so listing the library stays fast.
CREATE TABLE IF NOT EXISTS media (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  caption    text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 500),
  alt        text NOT NULL DEFAULT '' CHECK (char_length(alt) <= 300),
  tags       text[] NOT NULL DEFAULT '{}',
  mime       text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp','image/gif')),
  width      int NOT NULL CHECK (width > 0),
  height     int NOT NULL CHECK (height > 0),
  bytes      int NOT NULL CHECK (bytes > 0),
  sha256     text NOT NULL,
  version    int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_sha_idx ON media (sha256);
CREATE TABLE IF NOT EXISTS media_blobs (
  media_id uuid PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
  data     bytea NOT NULL
);

-- ---------------------------------------------------------------- easter eggs
CREATE TABLE IF NOT EXISTS eggs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 60),
  trigger_type  text NOT NULL CHECK (trigger_type IN ('keyword','click','sequence')),
  phrases       text[] NOT NULL DEFAULT '{}',          -- keyword: normalized phrases
  target        text,                                  -- click: element name
  click_count   int NOT NULL DEFAULT 1 CHECK (click_count BETWEEN 1 AND 20),
  sequence      text[] NOT NULL DEFAULT '{}',          -- sequence: ordered element names
  title         text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  message       text NOT NULL DEFAULT '' CHECK (char_length(message) <= 600),
  style         text NOT NULL DEFAULT 'card' CHECK (style IN ('card','toast')),
  step_ms       int NOT NULL DEFAULT 1600 CHECK (step_ms BETWEEN 500 AND 10000),
  enabled       boolean NOT NULL DEFAULT false,
  priority      int NOT NULL DEFAULT 0,
  repeat_mode   text NOT NULL DEFAULT 'always' CHECK (repeat_mode IN ('always','once_per_session')),
  cooldown_s    int NOT NULL DEFAULT 0 CHECK (cooldown_s BETWEEN 0 AND 86400),
  starts_at     timestamptz,
  ends_at       timestamptz,
  hint          text NOT NULL DEFAULT '' CHECK (char_length(hint) <= 200),
  hint_public   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- The reveal sequence. A step with media_id NULL is an empty slot: visitors skip it.
-- Deleting an image turns its steps back into empty slots instead of breaking the egg.
CREATE TABLE IF NOT EXISTS egg_steps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  egg_id     uuid NOT NULL REFERENCES eggs(id) ON DELETE CASCADE,
  position   int NOT NULL,
  label      text NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  caption    text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 300),
  media_id   uuid REFERENCES media(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS egg_steps_egg_idx ON egg_steps (egg_id, position);
CREATE INDEX IF NOT EXISTS egg_steps_media_idx ON egg_steps (media_id);

-- ---------------------------------------------------------------- scrapbook
CREATE TABLE IF NOT EXISTS scrapbook_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  body        text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  entry_date  date,
  published   boolean NOT NULL DEFAULT false,
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS scrapbook_media (
  entry_id uuid NOT NULL REFERENCES scrapbook_entries(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, media_id)
);
CREATE INDEX IF NOT EXISTS scrapbook_media_media_idx ON scrapbook_media (media_id);

-- ---------------------------------------------------------------- surprise drawer
CREATE TABLE IF NOT EXISTS surprise_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('image','text')),
  media_id   uuid REFERENCES media(id) ON DELETE CASCADE,
  body       text NOT NULL DEFAULT '' CHECK (char_length(body) <= 500),
  caption    text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 300),
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'image' AND media_id IS NOT NULL) OR (kind = 'text' AND char_length(body) > 0))
);
CREATE INDEX IF NOT EXISTS surprise_media_idx ON surprise_items (media_id);

-- ---------------------------------------------------------------- small site texts
CREATE TABLE IF NOT EXISTS site_settings (
  key        text PRIMARY KEY CHECK (key IN ('status','now_listening')),
  value      text NOT NULL CHECK (char_length(value) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ================================================================ v3 (pages, sounds, counter)
-- Audio files in the media library (width/height are 0 for audio).
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_mime_check;
ALTER TABLE media ADD CONSTRAINT media_mime_check CHECK (mime IN
  ('image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/ogg','audio/wav','audio/mp4'));
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_width_check;
ALTER TABLE media ADD CONSTRAINT media_width_check CHECK (width >= 0);
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_height_check;
ALTER TABLE media ADD CONSTRAINT media_height_check CHECK (height >= 0);

-- Optional sound for an egg (plays only if the visitor switched sound on).
ALTER TABLE eggs ADD COLUMN IF NOT EXISTS sound_id uuid REFERENCES media(id) ON DELETE SET NULL;

-- Page content edited in the admin. One JSON document per page; missing = use the defaults in assets/content.js.
CREATE TABLE IF NOT EXISTS site_content (
  key        text PRIMARY KEY CHECK (key IN ('home','music','links','projects','journal','about','contact','footer')),
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Which library images/sounds each page uses (keeps "where is this used" and image privacy correct).
CREATE TABLE IF NOT EXISTS content_media (
  key      text NOT NULL REFERENCES site_content(key) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  PRIMARY KEY (key, media_id)
);
CREATE INDEX IF NOT EXISTS content_media_media_idx ON content_media (media_id);

-- Retro visitor counter (a number, nothing else is stored).
CREATE TABLE IF NOT EXISTS site_counters (
  key text PRIMARY KEY,
  n   bigint NOT NULL DEFAULT 0
);
