# Node-RED Bridge for the CloudTAK Caltopo Sync Plugin

This directory ships the importable Node-RED flow and one-shot SQL migration
that expose the HTTP contract the CloudTAK plugin calls (see `endpoints.md`).

The bridge is **mostly additive** — see "What this import modifies" below for
the two legacy nodes whose wire-lists are touched. The legacy
`GET /api/CalTAKsync` endpoint continues to work unchanged after import.

## Files

- `flow-export.json` — single Node-RED flow-export. Drops a new tab labeled
  "Caltopo Sync Plugin Bridge" with 5 endpoints, CORS preflight handlers,
  and a real per-feature completion-signal aggregator for `POST /sync/run`.
- `caltopo-proxy-flow.json` — standalone importable tab ("Caltopo Proxy")
  exposing `POST /sync/caltopo`, a generic server-side CalTopo proxy. See below.
- `migration.sql` — creates the `sync_pairs` table.
- `migration-sync-mode.sql` — adds `sync_mode` column for one-way sync (existing installs).
- `endpoints.md` — full HTTP contract reference.

## Caltopo Proxy (`POST /sync/caltopo`)

The browser cannot call `caltopo.com` directly — CalTopo returns no CORS
headers, so the cross-origin fetch is blocked (confirmed: `OPTIONS` → 403,
`GET` → 401, neither with `Access-Control-Allow-Origin`). The plugin's
"Create Caltopo Map" (and any other CalTopo call) therefore POST to this
proxy, which signs (HMAC-SHA256) and forwards the request server-to-server,
then returns the response with permissive CORS headers.

The endpoint lives under the **`/sync/` prefix** so it reuses the same
reverse-proxy route your existing bridge endpoints (`/sync/run`,
`/sync/health`, …) already travel — no Caddy/nginx change needed.

> **Required: enable `httpNodeCors` in Node-RED `settings.js`.** The plugin
> posts JSON from the browser, which triggers a CORS preflight (`OPTIONS`).
> Per-route `OPTIONS` `http in` nodes do **not** reliably answer it — Node-RED/
> Express auto-handles `OPTIONS` and returns no `Access-Control-Allow-Origin`,
> so the browser blocks the real `POST` (`Origin … is not allowed …`, even with
> a `200`). Add this to `settings.js` (dockerized stacks mount it at
> `/data/settings.js`) and **restart Node-RED**:
>
> ```js
> httpNodeCors: {
>     origin: "*",
>     methods: "GET,POST,PUT,DELETE,OPTIONS",
>     allowedHeaders: "Content-Type",
> },
> ```
>
> This handles preflights globally (before routing), so it also fixes the
> browser `POST`s to `/sync/pairs` and `/sync/run`. The per-function
> `Access-Control-Allow-Origin: '*'` headers remain harmless — Node-RED
> overwrites rather than duplicates the header. Verify:
>
> ```bash
> curl -s -i -X OPTIONS 'https://<nodered-host>/sync/caltopo' \
>   -H 'Origin: https://<cloudtak-host>' \
>   -H 'Access-Control-Request-Method: POST' \
>   -H 'Access-Control-Request-Headers: content-type' | sed -n '1,12p'
> # expect: 204 with access-control-allow-origin: *
> ```

Import `caltopo-proxy-flow.json` as its own tab (no overlap with the bridge),
then Deploy. It is **generic** — one endpoint serves every request type:

```http
POST /sync/caltopo
Content-Type: application/json

{
  "method": "POST",                 // or "GET"; default POST
  "endpoint": "/api/v1/acct/",      // or "/api/v1/map/..." for map endpoints
  "accountId": "<team/account id>", // required for /acct/ endpoints
  "mapID": "<map id>",              // for map endpoints
  "uuid": "<feature id>",           // optional (feature update)
  "since": 0,                        // optional, GET since/<n>
  "payload": { /* CalTopo body */ }, // for POST
  "credentialId": "...",             // optional; env fallback
  "credentialKey": "..."             // optional; env fallback
}
```

Credentials resolve from the request body first, then env vars
(`credentialId`/`credentialKey`/`accountId`, or `CALTOPO_CREDENTIAL_ID` /
`CALTOPO_CREDENTIAL_KEY` / `CALTOPO_ACCOUNT_ID`). The CloudTAK plugin forwards
the credentials saved in its Settings panel, so no extra env vars are required
for the proxy.

## What this import modifies

The bridge no longer polls Postgres. Instead, two existing legacy debug
nodes get a wire appended so the bridge can observe per-feature completion
signals coming out of each sync direction. The flow-export.json contains
"patch" entries for these two existing nodes:

| Existing node id | Existing `name` | Before (wires) | After (wires) |
|---|---|---|---|
| `sync04caltopoDebug` | TAK->Caltopo push result | `[]` (no outputs) | `[["cab1700800000020"]]` |
| `sync09takDebug` | Caltopo->TAK push result | `[]` (no outputs) | `[["cab1700800000021"]]` |

`cab1700800000020` and `cab1700800000021` are new change nodes (defined in
`flow-export.json`, sitting on the legacy tab `8d455e872c814fd3`) that stamp
`msg._completionDirection = "caltopo"` / `"tak"` respectively and pass the
message into a `link out` (`cab1700800000001` / `cab1700800000002`). Those
link-outs target a `link in` (`cab1700800000003`) on the bridge tab.

**Import behavior**: Node-RED will detect that `sync04caltopoDebug` and
`sync09takDebug` already exist and offer to **replace** them. Choose
**replace** for those two — the only material change is the `wires` array
(previously `[]`, now `[["cab17008…"]]`). All other fields (name, group,
position, debug filter settings) are preserved bit-for-bit.

Since both nodes had **zero existing wire targets**, no downstream behavior
is removed. The new wires are strictly additive to the legacy flow's
behavior — the debug-to-sidebar output of each terminal node is unchanged.

## Required environment variables

The bridge reads these from the Node-RED process environment (no new
variables are introduced — these are the same ones the existing flow uses):

| Var | Purpose |
|---|---|
| `CALTOPO_CREDENTIAL_ID` | Caltopo public credential id, surfaced via `/sync/health` |
| `CALTOPO_CREDENTIAL_KEY` | Caltopo base64 HMAC secret, surfaced via `/sync/health` |
| `TAK_SERVER_URL` | Hostname (or full URL) of the TAK server, used by `/sync/health` reachability probe |

## Required Postgres migration

Apply once against the same database that the existing `caltopo_maps` table
lives in (the database referenced by the existing `postgresdb` config node
`0401336095afd0b1`):

```bash
psql "$DATABASE_URL" -f migration.sql
# If sync_pairs already exists from an earlier install:
psql "$DATABASE_URL" -f migration-sync-mode.sql
```

## Import steps

1. Open Node-RED in your browser.
2. Hamburger menu → **Import**.
3. Paste the contents of `flow-export.json` into the dialog. Choose
   **import to** → **new flow** for the bridge tab; for the two legacy
   nodes (`sync04caltopoDebug`, `sync09takDebug`) the dialog will warn
   "node already exists" — pick **replace** for both. See
   "What this import modifies" above for why this is safe.
4. Node-RED will detect that the imported postgres nodes reference config
   node id `0401336095afd0b1`. If that config node is already present in
   your project (it is, in the upstream node-red-sarops-docker setup),
   Node-RED will reuse it. Otherwise, the import dialog will prompt you to
   map the postgres-config; pick your existing postgres config from the
   dropdown.
5. Click **Deploy**.
6. **Apply post-import wire patches** — Node-RED's import dialog won't
   modify the `wires` array of existing nodes even when you pick
   "replace". Three wires need to be appended manually. Run the patch
   script that ships in this repo:

   ```bash
   python3 nodered/scripts/post-import-patch.py /path/to/your/flows.json
   docker restart <your-nodered-container>
   ```

   Idempotent — re-running it after the patches are in is a no-op. See
   the script header for what it does and why each patch is needed.

## Verification

After deploy:

```bash
curl -s http://localhost:1880/sync/health | jq .
```

Expected (with a healthy environment):

```json
{
  "caltopo_creds_ok": true,
  "postgis_ok": true,
  "icon_configs_ok": true,
  "tak_reachable": true
}
```

Then create a pair and run a sync:

```bash
curl -s -X POST http://localhost:1880/sync/pairs \
  -H 'Content-Type: application/json' \
  -d '{"caltopo_map_id":"8LH920C","tak_mission_id":"tak_locate","label":"Test"}'

curl -s -X POST http://localhost:1880/sync/run \
  -H 'Content-Type: application/json' \
  -d '{"caltopo_map_id":"8LH920C","tak_mission_id":"tak_locate"}'
```

## Pointing the CloudTAK plugin at this Node-RED

In CloudTAK, open the menu and choose **Caltopo Sync** → **Settings**. Paste
the base URL of your Node-RED instance (e.g. `http://nodered.local:1880`)
into the **Node-RED base URL** field and save. The plugin will persist the
value in `localStorage` and start calling the endpoints documented in
`endpoints.md`.

## How `POST /sync/run` completes (no polling)

When `POST /sync/run` fires:

1. The validate+trigger function checks for an in-flight run for the same
   `caltopo_map_id`; if one exists, the request is rejected with **409**.
2. A fresh `correlationId` is generated and the trigger message is sent
   into the existing fan-out change node `a075cdac694b8631`. The
   correlationId is stamped onto the trigger; it propagates through the
   existing flow because every legacy node on the path either mutates
   `msg` in place or uses `Object.assign({}, msg)` / `{...msg, ...}`
   spread (audited as of phase-2-design.md §6).
3. As each per-feature HTTP push terminates in `sync04caltopoDebug`
   (TAK→Caltopo direction) or `sync09takDebug` (Caltopo→TAK direction),
   the appended wire fires a stamp-change node + link-out into the
   bridge's `link in`.
4. The bridge's per-direction idle-debounce trigger node closes a
   direction after **3 seconds** of no new feature signals on that
   `(correlationId, direction)` topic.
5. A `join` node combines both directions on `correlationId`. Once both
   directions have closed (or the 30-second safety timeout synthesizes
   missing direction signals — see edge case below), the bridge runs the
   final stale-delete SQL and responds.

**Empty-side edge case**: if a direction has zero features to push, no
terminal signal will ever arrive on that direction's link. To prevent the
join from hanging, a parallel 30-second `delay` fires
`Synthesize missing-direction signals` which emits synthetic done-signals
for both directions if the flow context is still alive. The response body
will reflect this in `_signal.caltopo_synthetic` / `_signal.tak_synthetic`.

## Notes on additive correctness fixes

Per `docs/phase-2-design.md` §6, the bridge applies two corrections inside
its own nodes (the legacy flow's logic is untouched):

1. **Per-map stale delete.** After completion, the bridge runs
   `DELETE FROM caltopo_maps WHERE map_id=$1 AND … < runStart`, which
   fixes the unscoped `WHERE feature_id=$1` legacy delete that risked
   cross-pair collisions on multi-pair installs.
2. **Symmetric LWW awareness.** The bridge's response includes a
   `conflicts` count derived from rows where both `seen_on_caltopo_at`
   and `seen_on_tak_at` advanced during the run, surfacing the
   bidirectional touches that the legacy flow logs but never reports.

## Reused config node

- `postgresdb` id `0401336095afd0b1` — defined at
  `node-red-sarops-docker/data/projects/test_nr_project/flows.json:2767`.

## Known issues (v1.0)

### Bridge / plugin scope

- **TAK reachability probe uses 3s timeout.** If your TAK responds to
  HEAD slower than 3s, the Health tab shows red even though sync would
  work. Adjust the timeout in the `Sync health check` function if needed.
- **TAK_MISSIONS cache must be populated** before pair creation. The
  bridge translates the plugin's GUID to a TAK-server-side name via
  `global.TAK_MISSIONS`. If the lookup is empty/stale, sync returns 400
  with a clear "refresh via the Get Mission List inject node" error.
  Operators need to remember to re-fire that inject when missions are
  added to TAK.

### Legacy `node-red-sarops-docker` engine bugs (out of scope)

These reproduce identically when calling `GET /api/CalTAKsync` directly,
zero bridge involvement. The plugin can't fix them; they need a separate
pass on the legacy flow code:

- **CoT parse failures on features missing `_attributes`.** TAK→Caltopo
  direction drops features whose `/event/detail/usericon` element lacks
  the `_attributes` property. Observable in `docker logs my-nodered` as
  `[warn] [function:CoT batch → GeoJSON features] CoT parse failed: must
  have required property '_attributes'`. Operator-observed: some TAK
  polygons don't make it to Caltopo.
- **Caltopo→TAK polygon push gaps.** Operator-observed during smoke
  testing; needs a separate pass on the Caltopo→TAK direction nodes in
  the legacy flow.
- **CloudTAK vs TAK Server mission name divergence.** CloudTAK surfaces
  missions with a display name that doesn't match what TAK Server's
  mission-list API returns. The bridge handles this via reverse-lookup
  in `global.TAK_MISSIONS`; no fix needed unless a mission's name
  contains characters that defeat the lookup.
