# Operator Smoke Test (Phase 4b)

End-to-end verification you drive yourself. The plugin and bridge subflow are statically verified by Phase 4a, so this runbook only covers what requires live credentials and a real TAK Mission.

## Prerequisites

- Local CloudTAK checkout at `/Users/paulclifton/CloudTAK` (or wherever — `dev-link.sh` takes the path)
- Running Node-RED instance from `/Users/paulclifton/node-red-sarops-docker` (`docker compose up -d`)
- A test Caltopo map with **at least one feature** (avoid the 30s synthetic-signal codepath on the first run)
- A test TAK Mission (empty is fine for run #1; we'll add features for run #2)
- Caltopo credentials available as env vars: `CALTOPO_CREDENTIAL_ID`, `CALTOPO_CREDENTIAL_KEY`

## Run order

### 1. Apply the PostGIS migration

First confirm the postgres service name in your compose file (`docker-compose config --services` lists them). In `node-red-sarops-docker`, the service is `db` (container `postgis-db`):

```bash
docker-compose -f /Users/paulclifton/node-red-sarops-docker/docker-compose.yml exec -T db \
  psql -U nodered -d spatial_data < /Users/paulclifton/dev/cloudtak-plugin-caltopo-sync/nodered/migration.sql
```

`-T` disables TTY allocation so the stdin redirect works.

**Expected:** `CREATE TABLE` on first run, `NOTICE: relation "sync_pairs" already exists, skipping` on re-run. No error.

### 2. Import the bridge subflow into Node-RED

1. Open Node-RED UI (typically http://localhost:1880)
2. Hamburger menu → Import → paste contents of `nodered/flow-export.json` → Import
3. Node-RED will prompt to map missing Postgres config — pick the config you already use (id `0401336095afd0b1` if it's still that)
4. Deploy

**Expected:** new tab "Caltopo Sync Plugin Bridge" appears with 47 nodes; existing tabs untouched. Sidebar debug should remain quiet (no errors).

### 3. Verify the bridge is alive

```bash
curl http://localhost:1880/sync/health
```

**Expected:**
```json
{"caltopo_creds_ok": true, "postgis_ok": true, "icon_configs_ok": true, "tak_reachable": true}
```

If anything returns `false`, fix the corresponding env var / file / network issue before continuing — the plugin's Health tab will show the same.

### 4. Build CloudTAK with the plugin symlinked in

```bash
bash /Users/paulclifton/dev/cloudtak-plugin-caltopo-sync/scripts/dev-link.sh /Users/paulclifton/CloudTAK
cd /Users/paulclifton/CloudTAK/api/web
npm run serve   # Vite dev server with HMR
```

**Expected:** Vite starts, no compile errors, "Caltopo Sync" appears in the main menu after login.

> If Vite warns about a new file in `plugins/`, restart `npm run serve` once — `import.meta.glob` indexes at startup.

### 5. UI walk-through

1. Log into CloudTAK in browser
2. Click "Caltopo Sync" in the main menu
3. **Settings tab**: paste `http://localhost:1880` → Save & Test → all four Health checks green
4. **Pairs tab**: enter a test Caltopo MapID + pick the test mission from the dropdown → Add
5. Click "Sync Now" on the new pair
6. **Expected response (Sync Result Dialog):**
   - `added`: matches feature count of the Caltopo map (first sync into empty mission)
   - `updated`: 0
   - `deleted`: 0
   - `conflicts`: 0
   - `duration_ms`: typically <5000 for small maps
   - `errors`: empty
   - `_signal.caltopo_synthetic`: `false` (real terminal signal)
   - `_signal.tak_synthetic`: probably `true` on first run if mission was empty (no TAK→Caltopo features to push)

7. Open the test mission in ATAK / iTAK (or in CloudTAK's Mission view) — confirm:
   - Caltopo features visible
   - A new MissionLayer named `"Caltopo: <MapID>"` of type UID exists, containing the Caltopo features

### 6. Idempotency check (re-run sync)

Click "Sync Now" again on the same pair without changing anything.

**Expected:**
- `added`: 0
- `updated`: 0
- `deleted`: 0
- `conflicts`: 0
- All hashes match → no-op writes confirmed

If you see non-zero counts, the canonical 28-property hash is drifting between runs — most likely cause is `/data/icon-configs.json` missing or differing between Caltopo and TAK normalizers. Check `GET /sync/health`.

### 7. Bidirectional check

1. In ATAK / iTAK / CloudTAK, add a new feature to the mission (point or polygon)
2. Click "Sync Now" again
3. **Expected:** that feature appears in the Caltopo map within seconds

### 8. Conflict surfacing check

1. In Caltopo, edit a feature that exists on both sides
2. In TAK, edit the same feature with a *later* timestamp
3. Sync. Per LWW the TAK version wins, and `conflicts` count is `1`.
4. Reverse the order (Caltopo edit later than TAK) — Caltopo wins.

### 9. Concurrent-run guard check

Open two browser tabs, click "Sync Now" on the same pair within 1 second. The second should return **HTTP 409** and the UI should show the error toast cleanly.

### 10. Pair deletion check

Delete the pair in the Pair Manager. Confirm the `"Caltopo: <MapID>"` MissionLayer is removed from the test mission.

## What to capture and send back

If anything in steps 1–10 doesn't match expected:
- The exact step number
- The HTTP request you sent (or UI action)
- The actual response (headers + body) or screenshot
- The Node-RED debug sidebar output for the same window

I'll triage from there.

## Known v1 caveats (not bugs to report)

- 3-second per-direction idle debounce — pathologically slow syncs (>3s between feature writes) may close a direction prematurely; backstopped by the 30s overall timeout
- Empty Caltopo map or empty mission → that direction returns synthetic-signal flag `true` in the response
- No retry on transient Caltopo API errors — surfaced as `errors[]`; user re-clicks Sync Now
