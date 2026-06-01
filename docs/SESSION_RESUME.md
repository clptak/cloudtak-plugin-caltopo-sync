# Session Resume Guide

A "you're picking this back up cold" snapshot. Read this before doing anything in a future session.

## Where things stand

| Part | Version | Status |
|---|---|---|
| `cloudtak-plugin-caltopo-sync` | **v1.0.6** | Working. Plugin UI in CloudTAK + bridge subflow in Node-RED. |
| `node-red-caltopo-tak-sync` | **v1.0.1** | Working. The Caltopo↔TAK sync engine extracted from `node-red-sarops-docker`. |
| `node-red-sarops-docker` | (your existing) | Hosts the live engine + bridge. The flow files there are what actually runs. |
| Live dev runtime | matches above | All three sync scripts say "no changes — already in sync". |

**The sync works.** End-to-end verified: 34 features moved in ~7 seconds (Caltopo ↔ TAK Mission), real counts on both directions, no synthetic flags. ATAK and TAK Aware render features with correct icons via the WildFire iconset.

**The dev CloudTAK** shows white dots for some markers because the WildFire iconset isn't uploaded into that CloudTAK instance. Prod CloudTAK needs the iconset uploaded for icons to render — but the sync logic itself is correct.

## The three repos in one paragraph

The **plugin repo** ([clptak/cloudtak-plugin-caltopo-sync](https://github.com/clptak/cloudtak-plugin-caltopo-sync)) has the Vue/TS CloudTAK plugin (UI shell) plus the Node-RED **bridge subflow** that exposes `POST /sync/run`, `GET/POST/DELETE /sync/pairs`, `GET /sync/health`. The **engine repo** ([clptak/node-red-caltopo-tak-sync](https://github.com/clptak/node-red-caltopo-tak-sync)) has the extracted Caltopo↔TAK sync engine that does the actual feature movement, with PostGIS (`caltopo_maps`) as the canonical state cache. The bridge calls the engine through a shared Node-RED change node (`a075cdac694b8631`); the engine talks directly to Caltopo HMAC + TAK Marti + TAK port 8089 CoT broadcast.

## The three scripts and when to run each

Always idempotent. Always safe to re-run.

| Script | Purpose | When |
|---|---|---|
| `nodered/scripts/migrate-to-link-nodes.py` | One-time migration that replaces the deploy-fragile cross-tab trigger wire with a proper `link out` / `link in` pair. Idempotent. | Once per deployment (and any time you wipe + re-import the bridge from scratch). |
| `nodered/scripts/post-import-patch.py` | Restores the 2 stamp wires the Node-RED UI re-import won't apply (`sync03caltopoHttp` → caltopo stamp; `sync08takHttp` → tak stamp). The historical trigger-wire patch has been retired in favor of link nodes. | After ANY UI re-import of the bridge. |
| `nodered/scripts/sync-bridge-functions.py` | Copies function-node bodies from this repo's `flow-export.json` into the live `flows.json` in place, no UI re-import needed. Skips ambiguous names (e.g. `Format JSON` ×3) safely. | After every new bridge release (v1.0.x → v1.0.y) |
| `nodered/scripts/sync-from-runtime.py` | The reverse: if you've edited the bridge in the Node-RED UI and want those changes captured back into the plugin repo for the next release | When you've made local engine-side improvements you want to ship |

Engine repo has its own equivalent: `node-red-caltopo-tak-sync/scripts/extract-from-source.py` re-extracts the engine flow from `node-red-sarops-docker`'s flows.json.

## What the error messages actually mean

The plugin's Sync Result modal shows a few error patterns you'll keep seeing. Decoding them:

### `"overall safety timeout (30s) elapsed; one or both directions may not have completed"`
The bridge's join couldn't confirm both sync directions finished within 30s. **Look at `_signal.{caltopo,tak}_synthetic`** — if both are `false`, real work happened and the message is misleading (UI doesn't suppress it cleanly yet — known cosmetic). If either is `true`, that direction genuinely never completed within 30s and the bridge fell back to synthetic.

### `"stale-delete skipped: both directions synthetic; cannot determine staleness"`
Safety guard: when BOTH directions came back synthetic, the bridge refuses to run the stale-delete SQL because it can't tell which rows are genuinely stale vs just-not-observed. **This protects against the data-loss bug that hit you mid-session** (where a misfiring run would nuke every row in `caltopo_maps` for the target map_id). Seeing this means the guard saved you from a wipe; not a failure.

### Symptom: every `/sync/run` returns 30s timeout + BOTH directions synthetic, and `/sync/pairs` shows `last_sync_at: null` even after retries
**The bridge trigger → legacy fan-out wire has been lost.** Historically this was a *cross-tab direct wire* (Bridge tab → Caltopo<->TAK tab) and Node-RED's editor silently stripped it on every Deploy touching the Bridge tab — happened twice in one session on 2026-05-20.

**Durable fix (one-time migration):**
```bash
python3 cloudtak-plugin-caltopo-sync/nodered/scripts/migrate-to-link-nodes.py \
  /Users/paulclifton/node-red-sarops-docker/data/projects/test_nr_project/flows.json
docker restart my-nodered
```

That script replaces the fragile cross-tab wire with a `link out` (bridge tab) + `link in` (engine tab) pair using stable IDs `f1eda100b1d6e001` / `f1eda100b1d6e002`. Link nodes are Node-RED's proper cross-tab connector and survive Deploys. Idempotent — safe to re-run.

If the symptom reappears after the migration, that's a *different* break (more likely the stamp wires patched by `post-import-patch.py` — see below).

### `"N caltopo-direction HTTP errors"` or `"N tak-direction HTTP errors"`
N per-feature POST/PUT requests returned 4xx/5xx. **Look at `error_details[]` in the response body** — each entry has `{direction, uid, status, body}`. Common causes:
- **Caltopo 401**: HMAC signature expired (the legacy flow uses a 2-minute window). Transient under bursty load. Retry.
- **TAK 403**: cert isn't subscribed to that mission. The bridge auto-subscribes on first sync per mission, but if you change cert or recreate the mission, you'll see this until the auto-subscribe runs once.
- **TAK 400**: malformed CoT (often the `<usericon/>` empty-element parse bug, which is fixed in engine v1.0.1).

### "Generic Error: Spread syntax requires ...iterable[Symbol.iterator] to be a function"
This was a v1.0.3 bug (caused by my unsafe early sync-bridge-functions.py run that scrambled the `Format JSON` nodes). v1.0.3+ plugin defends against non-array `/sync/pairs` responses with a clear actionable message. If you see this exact text again, it means `/sync/pairs` is returning a non-array (run `sync-bridge-functions.py` and restart).

## "Did anything actually happen" — quick verification

Don't trust the modal's count alone. Two CLI commands tell you the truth:

```bash
# Were features touched in PostGIS during the last few minutes?
docker exec postgis-db psql -U nodered -d spatial_data -c "
SELECT count(*) AS total,
       count(*) FILTER (WHERE last_sync_source='CALTOPO') AS from_caltopo,
       count(*) FILTER (WHERE last_sync_source='TAK')     AS from_tak,
       to_char(max(updated_at), 'HH24:MI:SS') AS last_touched
FROM caltopo_maps
WHERE map_id='<YOUR_MAP_ID>';"

# Is the feature actually in the TAK mission?
docker exec my-nodered sh -c 'curl -sS -k \
  --cert "$CERT_CERT_PATH" --key "$CERT_KEY_PATH" --cacert "$CERT_CA_PATH" \
  --max-time 10 \
  "https://tak.ccsosar.net:8443/Marti/api/missions/guid/<MISSION_GUID>" \
  | grep -o "<FEATURE_UID>"'
```

If `caltopo_maps` shows recent `updated_at` and `count(*)` matches roughly your expected feature count, the engine ran. If a UID greps out of the Marti response, TAK Server has it.

## What's intentionally NOT done — open polish tickets

These are quality-of-life improvements you can pick up in a v1.1, not bugs:

1. **UI synthetic-signal suppression.** When `_signal.{caltopo,tak}_synthetic` is false, the modal should hide the "overall safety timeout" error message instead of showing it as a scary error. Right now real-but-fast syncs sometimes still display that message if the timeout fires concurrently with completion. Fix is one conditional in `SyncResultDialog.vue`.

2. **Per-direction sync trigger.** Right now Sync Now triggers both directions. Adding "Pull from Caltopo only" / "Push to TAK only" buttons would help during data debugging.

3. **Engine: postgres deadlock retry.** Two concurrent sync directions can race on the `(map_id, feature_id)` UPSERT and one aborts with `error: deadlock detected`. Rare in practice. Solving requires a retry-on-deadlock loop in the UPSERT path (engine-level).

4. **Engine: CoT batch parser hardening.** Already hardened against empty `<usericon/>` (engine v1.0.1). Other CoT shapes from TAK Server may exist that the node-cot library rejects with an empty-message error. The current parse-with-fallback only handles the usericon case. If you see new CoT parse failures, the engine repo's CoT batch function has the fallback pattern to extend.

5. **Caltopo HMAC retry on 401.** Transient HMAC-expiry 401s are normal under burst load. Retrying once with a fresh signature would eliminate most of them. Currently no retry — counts go into `error_details[]` and surface as "N caltopo-direction HTTP errors" in the result.

6. **CloudTAK iconset deployment automation.** Operator currently has to upload each iconset zip (e.g. WildFire) manually into CloudTAK's iconset library. A small CLI helper that reads `icon-configs.json`, identifies the iconset UUIDs referenced, and pushes them via CloudTAK's admin API would close the dev-vs-prod rendering gap.

## Important workflow hygiene I learned the hard way

Don't:
- Ad-hoc patch the live `flows.json` with one-off `python3 -c '...'` snippets. Each one I did during this session caused at least one downstream confusion. Use the three scripts above instead.
- Run `sync-bridge-functions.py` versions older than commit `6f53aad` against a live runtime — the original had a duplicate-name bug that scrambled `Format JSON` nodes. v1.0.3+ is safe.
- Trust the bridge response's `errors[]` array as a primary diagnostic. It only gives counts. Look at `error_details[]` for the per-feature breakdown.

Do:
- After any change to the engine via the Node-RED UI, restart `my-nodered` AND verify with `curl http://localhost:1880/sync/health`.
- After any change to the bridge code in this repo, run `sync-bridge-functions.py` and restart.
- After a fresh bridge import via the Node-RED UI, run `migrate-to-link-nodes.py` (once) and `post-import-patch.py` (for the stamp wires).
- Pin specific tags when deploying to prod (`v1.0.6` plugin, `v1.0.1` engine).

## Key file paths

| File | What |
|---|---|
| `/Users/paulclifton/dev/cloudtak-plugin-caltopo-sync/` | Plugin repo + bridge subflow + scripts |
| `/Users/paulclifton/dev/node-red-caltopo-tak-sync/` | Extracted engine repo |
| `/Users/paulclifton/node-red-sarops-docker/data/projects/test_nr_project/flows.json` | Live Node-RED flow (the canonical runtime state) |
| `/Users/paulclifton/CloudTAK/api/web/plugins/` | Where CloudTAK loads frontend plugins (Vite glob) |
| `/Users/paulclifton/CloudTAK/api/web/plugins/caltopo-sync/` | Dev symlink → plugin repo **root** (created by `scripts/dev-link.sh`); matches the prod Docker clone layout, so components live at `.../caltopo-sync/src/components/` and cross-host imports use `../../../../src/...` |

## Env vars currently in the live Node-RED container

```
CALTOPO_CREDENTIAL_ID=FSC7PK1H0K43
CALTOPO_CREDENTIAL_KEY=56EeKRxgACuNDsYo52FPM57IkiqrkJn7FakH1AM6WjI=/ll89EcDYaM=
TAK_SERVER_URL=tak.ccsosar.net
TAK_HTTPS_API_PORT=8446       # ← NOT the Marti port; Marti is on 8443
MISSION_API_PORT=8443         # ← This is the Marti port (the bridge uses this)
TAK_TLS_PORT=8089             # ← CoT broadcast port
CERT_CERT_PATH=/data/.../client.pem  # CN=nodered
CERT_KEY_PATH=/data/.../client.key
CERT_CA_PATH=/data/.../ca.pem
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=spatial_data
POSTGRES_USER=nodered
```

The `MISSION_API_PORT=8443` (not 8446) was a non-obvious gotcha — port 8446 is your federation port and returns 403 for all Marti requests. The engine + bridge both correctly read from the env var, but if you ever hand-write a curl test against TAK, use 8443.

## A scenario that bit me — log it for next time

You added a new polygon in Caltopo and clicked Sync Now. The modal showed "32 caltopo-direction HTTP errors." Next sync 30 seconds later showed only 1. Then 0.

That pattern = transient burst of Caltopo HMAC 401s when a batch of POSTs all carry signatures near the 2-minute expiry. Not a bug, not a permanent state. **Click Sync Now a second time and watch the count drop.** If it stays high across multiple retries, look at `error_details[].body` for what Caltopo is actually saying — could be a credential rotation, an account-id mismatch, or an API change.

## If a future session starts fresh, paste this in:

> I'm picking up work on `cloudtak-plugin-caltopo-sync` (a CloudTAK frontend plugin for bidirectional Caltopo ↔ TAK Mission sync). The repo is at `/Users/paulclifton/dev/cloudtak-plugin-caltopo-sync` and the engine is at `/Users/paulclifton/dev/node-red-caltopo-tak-sync`. Read `docs/SESSION_RESUME.md` in the plugin repo for full context before making any changes.

That gets new-Claude into the same headspace without re-deriving the architecture from scratch.
