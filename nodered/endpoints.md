# Caltopo Sync Plugin Bridge — HTTP Contract

All endpoints are served by the imported `flow-export.json` Node-RED tab
("Caltopo Sync Plugin Bridge"). All responses include CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET,POST,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type
```

An `OPTIONS` preflight handler is registered for every path and returns `204`.

Base URL example: `http://nodered.host:1880`

---

## 1. `POST /sync/run`

Trigger a synchronous bidirectional sync for one `(caltopo_map_id, tak_mission_id)` pair.

Internally this fires into the existing fan-out change node
`a075cdac694b8631`, which drives the legacy Caltopo↔TAK directions. The bridge
then waits for **real per-feature completion signals** emitted by the two
terminal debug nodes (`sync04caltopoDebug`, `sync09takDebug`) via a
link-in / link-out pair the import adds to the legacy tab — see README →
"What this import modifies". No polling is performed against
`caltopo_maps`.

A 3-second per-direction idle-debounce closes each direction once it stops
emitting new feature signals. Both directions are then joined on
`correlationId`, after which the bridge runs corrected stale-delete SQL
(`DELETE … WHERE map_id=$1 AND … < runStart`), records `last_sync_at` into
`sync_pairs`, and returns.

### Concurrency

The bridge enforces **one active run per `caltopo_map_id`**. If a second
request arrives while a run is still in flight for the same map, the
bridge returns **409 Conflict** without touching the legacy flow. The
active run holds the lock for at most the overall safety timeout (30s).

### Request

```http
POST /sync/run
Content-Type: application/json

{
  "caltopo_map_id": "8LH920C",
  "tak_mission_id": "tak_locate"
}
```

### Response 200

```json
{
  "added": 12,
  "updated": 0,
  "deleted": 1,
  "conflicts": 0,
  "duration_ms": 5183,
  "errors": [],
  "_signal": {
    "caltopo_features": 7,
    "tak_features": 5,
    "caltopo_synthetic": false,
    "tak_synthetic": false
  }
}
```

`_signal.caltopo_features` / `_signal.tak_features` are the per-feature
completion-signal counts the bridge observed for each direction.
`_signal.caltopo_synthetic` / `_signal.tak_synthetic` are `true` only if
the safety timeout had to synthesize that direction's done-signal because
the direction emitted zero feature signals — the empty-side case (a
direction with nothing to push will never produce a terminal signal). In
that case `errors[]` will include `"overall safety timeout (30s) elapsed
…"`.

### Response 400

```json
{
  "added": 0,
  "updated": 0,
  "deleted": 0,
  "conflicts": 0,
  "duration_ms": 0,
  "errors": ["caltopo_map_id required"]
}
```

### Response 409

```json
{
  "added": 0,
  "updated": 0,
  "deleted": 0,
  "conflicts": 0,
  "duration_ms": 0,
  "errors": ["a sync run for this caltopo_map_id is already in progress"],
  "active_correlation_id": "run_1747337511234_a1b2c3d4"
}
```

---

## 2. `GET /sync/pairs`

List all configured sync pairs, newest first.

### Request

```http
GET /sync/pairs
```

### Response 200

```json
[
  {
    "id": 3,
    "caltopo_map_id": "8LH920C",
    "tak_mission_id": "tak_locate",
    "label": "Field team Alpha",
    "last_sync_at": "2026-05-15T18:42:11.000Z",
    "last_result": { "added": 2, "deleted": 0, "conflicts": 0 },
    "created_at": "2026-05-12T09:00:00.000Z"
  }
]
```

---

## 3. `POST /sync/pairs`

Create (or update label of) a sync pair. Idempotent on
`(caltopo_map_id, tak_mission_id)`.

### Request

```http
POST /sync/pairs
Content-Type: application/json

{
  "caltopo_map_id": "8LH920C",
  "tak_mission_id": "tak_locate",
  "label": "Field team Alpha"
}
```

### Response 200

```json
{
  "id": 3,
  "caltopo_map_id": "8LH920C",
  "tak_mission_id": "tak_locate",
  "label": "Field team Alpha",
  "last_sync_at": null,
  "last_result": null,
  "created_at": "2026-05-15T18:30:00.000Z"
}
```

### Response 400

```json
{ "error": "caltopo_map_id and tak_mission_id required" }
```

---

## 4. `DELETE /sync/pairs/:id`

Remove a sync pair by primary key.

### Request

```http
DELETE /sync/pairs/3
```

### Response 200

```json
{ "deleted_id": 3 }
```

### Response 404

```json
{ "error": "pair not found" }
```

---

## 5. `GET /sync/health`

Runs four sub-checks in parallel and returns booleans.

| Field | Meaning |
|---|---|
| `caltopo_creds_ok` | Both `CALTOPO_CREDENTIAL_ID` and `CALTOPO_CREDENTIAL_KEY` env vars are set |
| `postgis_ok` | `SELECT PostGIS_Full_Version()` returned a row |
| `icon_configs_ok` | `/data/icon-configs.json` exists and parses |
| `tak_reachable` | An HTTP GET against `TAK_SERVER_URL` returned any HTTP status (≥1) |

### Request

```http
GET /sync/health
```

### Response 200

```json
{
  "caltopo_creds_ok": true,
  "postgis_ok": true,
  "icon_configs_ok": true,
  "tak_reachable": true
}
```

### Response 200 (degraded)

```json
{
  "caltopo_creds_ok": true,
  "postgis_ok": true,
  "icon_configs_ok": false,
  "tak_reachable": false
}
```
