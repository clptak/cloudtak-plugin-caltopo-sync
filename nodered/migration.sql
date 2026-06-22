CREATE TABLE IF NOT EXISTS sync_pairs (
  id BIGSERIAL PRIMARY KEY,
  caltopo_map_id TEXT NOT NULL,
  tak_mission_id TEXT NOT NULL,
  label TEXT,
  sync_mode TEXT NOT NULL DEFAULT 'bidirectional'
    CHECK (sync_mode IN ('bidirectional', 'tak_to_caltopo', 'caltopo_to_tak')),
  last_sync_at TIMESTAMPTZ,
  last_result JSONB,
  share_pli BOOLEAN NOT NULL DEFAULT false,
  pli_interval_sec INTEGER NOT NULL DEFAULT 10
    CHECK (pli_interval_sec >= 1 AND pli_interval_sec <= 3600),
  pli_connect_key_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (caltopo_map_id, tak_mission_id)
);
