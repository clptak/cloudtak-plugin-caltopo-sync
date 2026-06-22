-- PLI sharing columns for sync_pairs (Share PLI toggle + interval + fallback connect key).
-- Run once against the same Postgres database as migration.sql.

ALTER TABLE sync_pairs
  ADD COLUMN IF NOT EXISTS share_pli BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sync_pairs
  ADD COLUMN IF NOT EXISTS pli_interval_sec INTEGER NOT NULL DEFAULT 10
    CHECK (pli_interval_sec >= 1 AND pli_interval_sec <= 3600);

ALTER TABLE sync_pairs
  ADD COLUMN IF NOT EXISTS pli_connect_key_id TEXT;
