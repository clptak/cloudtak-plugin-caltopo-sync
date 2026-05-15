CREATE TABLE IF NOT EXISTS sync_pairs (
  id BIGSERIAL PRIMARY KEY,
  caltopo_map_id TEXT NOT NULL,
  tak_mission_id TEXT NOT NULL,
  label TEXT,
  last_sync_at TIMESTAMPTZ,
  last_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (caltopo_map_id, tak_mission_id)
);
