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
3. Node-RED's import dialog will note that two nodes (`sync04caltopoDebug`, `sync09takDebug`) already exist. Pick **replace** for both — the only material change is the `wires` arrays.
4. Node-RED may prompt to map the postgres config. Pick your existing postgres config (id `0401336095afd0b1` if it's still that). If you don't see the prompt, the existing config is reused automatically.
5. **Watch for "Flow 1" appearing as a new tab** — that means Node-RED quarantined our additive nodes because it saw a conflict and refused to merge. If you see Flow 1 with just a handful of nodes, the wire patches DID NOT land cleanly.
6. Deploy.

**Expected:** a new tab labeled "Caltopo Sync Plugin Bridge" with ~47 nodes; existing tabs untouched; **no "Flow 1" tab**.

### 2a. Apply post-import wire patches (REQUIRED)

Even with a clean import, Node-RED will not modify the `wires` array of three existing nodes that the bridge needs to extend. Run the patch script once after deploy:

```bash
python3 /Users/paulclifton/dev/cloudtak-plugin-caltopo-sync/nodered/scripts/post-import-patch.py \
  /Users/paulclifton/node-red-sarops-docker/data/projects/test_nr_project/flows.json

docker restart my-nodered    # use your actual container name
```

The script is idempotent — running it a second time reports "No changes". See the script header for what it does and why.

### 3. Verify the bridge is alive

```bash
curl http://localhost:1880/sync/health
```

**Expected:**
```json
{"caltopo_creds_ok": true, "postgis_ok": true, "icon_configs_ok": true, "tak_reachable": true}
```

If anything returns `false`, fix the corresponding env var / file / network issue before continuing — the plugin's Health tab will show the same.

> **`tak_reachable: false` while you ARE on-network?** The TAK probe times out after 3s. If your TAK responds slower than 3s on a HEAD probe, the probe will read `false` even though sync may still succeed. The bridge sync itself uses a 30s safety timeout, so this is purely a Health-tab cosmetic concern. Adjust the timeout in the `Sync health check` function if your network is consistently slow.

### 3a. Refresh the TAK mission cache (REQUIRED before first pair creation)

Node-RED keeps `global.TAK_MISSIONS` as the name→GUID lookup the legacy engine needs. The plugin sends the mission GUID; the bridge translates it to the TAK-server-side name via this lookup. If the lookup is stale or empty, sync runs will return `400` with a clear "refresh via the Get Mission List inject node" error.

Fire the refresh once:

```bash
curl -X POST http://localhost:1880/inject/8ffde182234b8829
```

(`8ffde182234b8829` is the "Get Mission List" inject node id in the existing `node-red-sarops-docker` flow. Verify it exists in your tab list under "Initialization".)

Re-fire whenever you add a mission to TAK that the plugin should be able to target.

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

- **Synthetic-signal default.** The terminal-node → bridge link-in delivery is not always firing reliably, so most syncs hit the 30s safety timeout and the modal reports `_signal.{caltopo,tak}_synthetic: true` with `added: 0`. The legacy engine IS doing real work (verify by `SELECT max(updated_at) FROM caltopo_maps WHERE map_id=…` before/after — the timestamp advances). This is cosmetic for v1; the modal counts are best-effort, not transactional. Tracked for v1.1.
- 3-second per-direction idle debounce — pathologically slow syncs (>3s between feature writes) may close a direction prematurely; backstopped by the 30s overall timeout.
- Empty Caltopo map or empty mission → that direction returns synthetic-signal flag `true` in the response.
- No retry on transient Caltopo API errors — surfaced as `errors[]`; user re-clicks Sync Now.
- The bridge's stale-delete is **gated** when both directions return synthetic signals (the safety added after a smoke-test data-loss incident). You'll see `"stale-delete skipped: both directions synthetic; cannot determine staleness"` in the response's `errors` array — this is **not** a bug, it's the safety guard preventing data wipes when the bridge can't confirm real work happened.

## Known legacy-engine bugs (out of plugin scope — file separately)

These reproduce identically when calling `GET /api/CalTAKsync?mapID=…&takMission=…` directly, with the bridge entirely out of the path. The plugin can't fix them.

- **CoT parse failures on features missing `_attributes`**: TAK→Caltopo direction drops features whose `/event/detail/usericon` element lacks the `_attributes` property. Look for `[warn] [function:CoT batch → GeoJSON features] CoT parse failed: must have required property '_attributes'` in `docker logs my-nodered`. Operator-observed: some TAK polygons don't make it to Caltopo.
- **Caltopo→TAK polygon push gaps**: operator-observed; needs separate triage in the legacy flow's Caltopo→TAK direction nodes.
- **CloudTAK mission "name" vs TAK server mission name divergence**: CloudTAK surfaces missions with a display name (e.g. "Test TAK Locate") that does not match TAK Server's `name` field (e.g. `tak_locate`). The bridge handles this by reverse-looking-up the GUID in `global.TAK_MISSIONS` before triggering the legacy engine. If your mission name shows differently in CloudTAK vs the plugin's modal/status, this is why.
