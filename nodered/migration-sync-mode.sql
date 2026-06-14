-- Add sync_mode to existing installs. Safe to run multiple times.
ALTER TABLE public.sync_pairs
  ADD COLUMN IF NOT EXISTS sync_mode TEXT NOT NULL DEFAULT 'bidirectional';

ALTER TABLE public.sync_pairs
  DROP CONSTRAINT IF EXISTS sync_pairs_sync_mode_check;

ALTER TABLE public.sync_pairs
  ADD CONSTRAINT sync_pairs_sync_mode_check
  CHECK (sync_mode IN ('bidirectional', 'tak_to_caltopo', 'caltopo_to_tak'));
