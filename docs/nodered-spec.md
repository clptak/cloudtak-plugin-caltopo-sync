# Node-RED Sync Engine — Specification

Reverse-engineered from `data/projects/test_nr_project/flows.json` (22,628 lines).
Source files mirrored at repo root: `sync01_func.txt`, `sync05_func.txt`,
`normalizer_func.txt`, and the `fix_*.js` patch scripts.

## 1. Tab identification

- **Tab name:** `Caltopo <-> TAK`
- **Tab id:** `8d455e872c814fd3` (`flows.json:19-25`)
- **Node count on tab:** 94 nodes
- **Type breakdown:** 23 `function`, 19 `debug`, 8 `switch`, 8 `change`,
  5 `link in`, 5 `http request`, 4 `postgres`, 4 `inject`, 3 `tcp in`, 3 `group`,
  2 `link out`, 1 each of `http in`, `http response`, `file in`, `delay`,
  `comment`, plus 5 subflow instances (`TAK DataSync Look Up`, two `NodeCoT`
  conversion subflows, MapMediaObject helper).

The tab is partitioned into two groups: `TAK -> Caltopo` (`75624be401fafc51`,
`flows.json:2568`) and `TAK <- Caltopo` (`d9d5689d929f06e3`, `flows.json:2603`),
plus a `Caltopo Classes` group (`af2ffc650ce2bf5b`) for AppTrack / Clue /
Assignment "splinter" features. A secondary tab `TAK Caltopo Integration`
(`71145808df0ddce1`) exists but is empty/legacy.

## 2. Data flow

```
                  HTTP /api/CalTAKsync?mapID=&takMission=
                              │
                  http-in 54269e3384458d6b ─► change a075cdac ─► phase1extractParams
                                                                     │
                       ┌────────── out 0 (Caltopo→TAK) ───────────┐  │
                       │                                          │  │
                       ▼                                          ▼  │  out 1
        change "Msg to Flows" 2b802cf3                  link out phase1linkOutTAK
                       ▼                                          │
        change 7293910e (sets endpoint /api/v1/map/,              ▼
                        method GET, HMAC creds from env)  link in phase1linkInTAK
                       ▼                                          ▼
        function cf71fbe80e7304aa "Caltopo Request"      subflow TAK DataSync Look Up
        (builds HMAC-signed GET URL)                              ▼
                       ▼                                  switch missionGuid
        http request 4e2e5eb GET caltopo /map/{id}/since/0        ▼
                       ▼                                  function 3c7a80e
        switch on statusCode==200                         GET /Marti/api/missions/guid/{guid}/cot
                       ▼                                          ▼
        function 563ec211 "Create Caltopo Hash"           xml2json + function 83d78b92
        (MD5 28-prop hash, UPSERT, splits AppTrack /      "CoT batch → GeoJSON features"
         Assignment / Clue out output 2)                          ▼
                       ▼                                  function eedb295f "Normalize CoT
        postgres a5ebe00966ed34d1 UPSERT caltopo_maps      → Caltopo-shape" (normalizer_func.txt)
                       ▼                                          ▼
                       ├─► sync05buildCotFromRows         function b6541b9f "Create TAK Hash"
                       │     (filters out last_sync_source='TAK') (MD5 same 28-prop order,
                       │     ▼                            stamps last_sync_source='TAK')
                       │   sync06tlsSender (TLS 8089)              ▼
                       │     ▼                            postgres e93c1fcabbf93c67 UPSERT
                       │   sync07putMission                        ▼
                       │   PUT /Marti/api/missions/guid/   sync01splitRetToCalto
                       │   {guid}/contents (uids:[uid])     (sync01_func.txt — HMAC POST
                       │                                    /api/v1/map/{id}/{Marker|Shape}/{fid})
                       └─► syncDel00..07 (stale-delete             ▼
                            path: SELECT seen_on_caltopo_at,  http request sync03caltopoHttp
                            send stale CoT, DELETE mission
                            content, DELETE from DB)
```

Key facts:

- The flow has **no recurring timer**. All sync runs are triggered manually
  via the HTTP-In endpoint (`flows.json:16008-16025`) or one debug inject node
  `4e11e921e47e53ed` at `flows.json:17088`.
- `tcp in` nodes (lines 17372, 17480, 17529) for direct CoT ingest from TAK
  TLS port are all disabled (`"d": true`). The Caltopo→TAK direction is
  triggered only by the manual sync, not by passive TAK streaming on this tab.
- TAK→Caltopo direction pulls a full `mission/guid/{guid}/cot` snapshot and
  upserts; there is no streaming/push subscription.

## 3. PostGIS schema (`initdb/init.sql`)

```sql
CREATE TABLE public.caltopo_maps (
    id                  SERIAL PRIMARY KEY,
    map_id              TEXT NOT NULL,
    feature_id          TEXT NOT NULL,
    geom                GEOMETRY(Geometry, 4326),
    properties          JSONB,
    last_hash           TEXT,
    last_sync_source    TEXT,       -- 'CALTOPO' | 'TAK'
    seen_on_caltopo_at  TIMESTAMPTZ,
    seen_on_tak_at      TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE (map_id, feature_id)
);
CREATE INDEX caltopo_maps_geom_idx ON public.caltopo_maps USING GIST (geom);

CREATE TABLE public.caltopo_map_metadata (
    map_id TEXT PRIMARY KEY, all_ids JSONB, last_poll TIMESTAMPTZ);
CREATE TABLE public.tak_mission_metadata (
    mission_guid TEXT PRIMARY KEY, all_ids JSONB, last_poll TIMESTAMPTZ);
```

- **State cache:** one row per `(map_id, feature_id)`. `last_hash` is an MD5
  over a 28-element canonical-order JSON array (geometry coords + 27 props,
  see `flows.json:15831` and `16517`).
- **Source attribution:** `last_sync_source` is `'TAK'` or `'CALTOPO'`,
  used as the tiebreaker (see §9).
- **"Seen at" columns:** updated only on the corresponding side; this is how
  deletes are detected (§ Deletes below). `updated_at` advances on every UPSERT.
- **No pairs table.** The `(mapID, takMission)` pairing is **not persisted** —
  it is passed in on each call (env defaults + query params) and is kept only
  in `flow` context for the duration of a request. The new plugin needs to
  add a `sync_pairs` table.
- **Deletes:** `syncDel00setQuery` (`flows.json:16789`) selects all rows for
  the map where `seen_on_caltopo_at IS NOT NULL`; `syncDel02buildStale`
  diff's against `msg.currentCaltopoIds` (the IDs just upserted) and emits a
  stale-time CoT + Marti DELETE + `DELETE FROM caltopo_maps WHERE
  feature_id=$1`. Note this delete query is **not scoped by `map_id`** — a
  potential cross-map bug for multi-pair installs.

## 4. Caltopo auth

Two env vars (consumed by `cf71fbe80e7304aa` and `sync01splitRetToCalto`):

- `CALTOPO_CREDENTIAL_ID` — public credential id (string `id=...`).
- `CALTOPO_CREDENTIAL_KEY` — base64-encoded HMAC secret.
- Plus: `CALTOPO_ACCOUNT_ID`, `CALTOPO_TEAM_ID`, `BASE_CALTOPO_URL`
  (default `https://caltopo.com`).

**HMAC signature** (sync01_func.txt:84-92, `Caltopo Request` at
`flows.json:16547`):

```
message  = `${METHOD} ${endpointPath}\n${expiresMs}\n${jsonBody}`
secret   = Buffer.from(CALTOPO_CREDENTIAL_KEY, 'base64')
signature = hmac-sha256(secret, message) → base64
params   = { id, expires, signature, json }    // form-urlencoded
```

- For GETs, `jsonBody` is the empty string and `json` is omitted from params;
  params go into the query string.
- `expires` = `Date.now() + 120_000` (2 min).
- POSTs send `application/x-www-form-urlencoded` with `json` containing the
  GeoJSON Feature.

## 5. Caltopo API endpoints used

| Verb | Path | Purpose |
|------|------|---------|
| GET  | `/api/v1/map/{mapID}/since/0` | Full map state snapshot (no delta cursor used) |
| POST | `/api/v1/map/{mapID}/Marker/{featureId}` | Upsert a point feature |
| POST | `/api/v1/map/{mapID}/Shape/{featureId}` | Upsert a line/polygon feature |
| GET  | `/api/v1/acct/{teamId}/since/0` | Account-level (referenced in `Caltopo Request` but not currently invoked) |
| POST | `/api/v1/acct/{teamId}/CollaborativeMap` | Create map (referenced, not used) |

## 6. TAK Mission write paths

All hit `https://${TAK_SERVER_URL}:${MISSION_API_PORT}` using client-cert TLS
(`tls-config a2ba4950568ac184`, `flows.json:2753`):

| Verb | Path | Where | Payload |
|------|------|-------|---------|
| GET    | `/Marti/api/missions/guid/{guid}/cot` | `3c7a80e53582fb66` (15568) | none — returns raw `<events>` XML batch |
| PUT    | `/Marti/api/missions/guid/{guid}/contents?creatorUid=...` | `sync07putMission` (16725) | `{ "uids": ["<cotUid>"] }` |
| DELETE | `/Marti/api/missions/guid/{guid}/contents?uid={cotUid}&creatorUid=...` | `syncDel04deleteMission` (16886) | none |

The mission **GUID** is looked up from the mission **name** via
`global.get('TAK_MISSIONS')[takMission]`, populated by the
`TAK DataSync Look Up` subflow (`flows.json:921`). The Caltopo→TAK CoT push
also writes the raw event to TAK's TLS port 8089 first (`sync06tlsSender`),
then PUTs the UID into mission contents.

## 7. Existing HTTP-In endpoints

Exactly one:

- **GET `/api/CalTAKsync`** — `http in` node `54269e3384458d6b`
  (`flows.json:16008-16025`). Query params: `mapID`, `takMission`.
  Returns 202 Accepted immediately (`phase1extractParams`, `flows.json:17013`,
  calls `res.status(202).send({status:'accepted', mapID, takMission})`) and
  forks the sync run async to both directions. The terminal `http response`
  node `56a38966ac2dc5e8` exists but is a no-op since the function already
  responded.

## 8. Recommended injection points for new HTTP contract

The cleanest seams to add the plugin's new endpoints (`POST /sync/run`,
GET/POST/DELETE `/sync/pairs`):

1. **`POST /sync/run`** — drop in alongside `54269e3384458d6b` and wire to
   `a075cdac694b8631` (the change node that maps `msg.payload.mapID` and
   `msg.payload.takMission` into `msg.*`, `flows.json:17053`). This is the
   single fan-out point that triggers both directions via
   `phase1extractParams` and `phase1linkOutTAK`. Accept JSON body
   `{ pairId, mapID, takMission }` and emit on `msg.payload`. To return a
   real result instead of 202, modify `phase1extractParams` to collect
   completion signals from both directions before calling `res.send`, or wire
   a join node into the terminal debug nodes `sync04caltopoDebug` and
   `sync09takDebug`.

2. **`GET /sync/pairs`, `POST /sync/pairs`, `DELETE /sync/pairs/:id`** —
   need a new `sync_pairs(id, map_id, tak_mission, ...)` table (no existing
   table covers this). The endpoints are pure CRUD against PostGIS; add them
   as new http-in nodes on this tab and wire to a single postgres node.
   Keep `(mapID, takMission)` as the natural cross-system key.

3. **Link-in seams already exposed:**
   - `phase1linkInTAK` (`flows.json:15991`) — link-in for the TAK→Caltopo
     direction; sends a msg with `{mapID, takMission}` directly into
     `TAK DataSync Look Up`.
   - `phase1linkOutTAK` (`flows.json:17039`) — paired link-out from
     `phase1extractParams` output 2.

4. **Status surface:** there is no current way to query sync progress. The
   plugin should add a `sync_runs(id, pair_id, started_at, finished_at,
   caltopo_to_tak_count, tak_to_caltopo_count, deleted_count, conflicts,
   error)` table and have the function nodes emit row inserts at start and
   at the end of each direction.

## 9. Delta / conflict behaviour

- **Delta detection:** purely hash-based. The `WHERE last_hash IS DISTINCT
  FROM EXCLUDED.last_hash` clause in both UPSERTs means an unchanged feature
  is a cheap no-op. The 28-property canonical hash is computed identically
  on both sides (see normalizer `marker-symbol` rule in `normalizer_func.txt`
  and the same property list in `Create Caltopo Hash` and `Create TAK Hash`).
- **Caltopo→TAK gate:** `sync05buildCotFromRows` (`flows.json:16674`) skips
  any row where `last_sync_source === 'TAK'` — TAK is authoritative for
  TAK-origin features.
- **TAK→Caltopo gate:** the TAK-side UPSERT clause
  (`flows.json:15831`) only overwrites a `'CALTOPO'`-owned row when
  `EXCLUDED.properties->'_tak'->>'time'` ≥ existing
  `properties->>'-updated-on'`. This is the **last-write-wins by timestamp**
  the plugin needs, but it's only one-sided (TAK side only); the Caltopo
  UPSERT (`flows.json:16517`) does **not** compare timestamps — it lets TAK
  ownership stick (`CASE WHEN last_sync_source='TAK' THEN 'TAK' ELSE
  'CALTOPO' END`) but does not push back to TAK on a Caltopo edit if TAK is
  still owner. The plugin will likely need to add a symmetric timestamp
  check on the Caltopo path.
- **Conflict counting:** none. No surface for "rows where both sides
  changed since last sync". To deliver this, add a count of rows where
  `seen_on_caltopo_at > last_run.started_at AND seen_on_tak_at >
  last_run.started_at`.

## 10. Landmines

- **`fix_*.js`** are one-shot Node scripts that mutate `flows.json` directly
  to patch deployed flow logic. They are not idempotent guards; they encode
  evidence of prior bug classes:
  - `fix_caltopo_hash.js` — fixed the canonical 28-property hash order
  - `fix_iconpath.js`, `fix_icons.js`, `fix_icons2.js`, `fix_globalize.js` —
    icon-translation table (custom iconset path `uid/folder/name.png` vs
    `uid:folder/name` from node-cot — lowercased to handle TAK's casing
    drift)
  - `fix_case_and_refresh.js`, `fix_arch.js` — earlier UPSERT/SQL repairs
  - `fix_revert_issue2.js` — reverted broken `UNION ALL` SQL and a 24h-stale
    experiment; **the file warns the current SQL is the "clean" version**
  - `fix_splinter_reentry.js` — wires `caltopoSplinterHash` (AppTrack /
    Assignment / Clue) back into the main UPSERT path
- **Delete is global, not per-map:** `syncDel06deleteDb`
  (`flows.json:16932`) runs `DELETE FROM caltopo_maps WHERE feature_id=$1`
  with no `map_id` predicate.
- **TAK is always "fresh now":** `Create TAK Hash` stamps
  `seen_on_tak_at=now()` and `updated_at=now()` on every UPSERT regardless
  of whether the row changed (the `WHERE last_hash IS DISTINCT` clause
  prevents that, actually — but the `_tak.time` comparison relies on
  CoT-supplied `time`, which is `now()` from `sync05`, so Caltopo edits
  pushed to TAK then re-ingested will always look fresher than the Caltopo
  `-updated-on`).
- **Icon-translation files are loaded lazily:** the `Start for Icon
  Translation Config` inject (`flows.json:15669`, `once: true`) reads
  `/data/icon-configs.json` into `global.takToCaltopo` /
  `global.caltopoToTak`. If Node-RED restarts without the file, marker
  symbols won't round-trip and the hashes will drift, retriggering UPSERTs
  every poll.
- **No persistence of `(mapID, takMission)` pairs** — the plugin must
  introduce its own table; the existing `caltopo_map_metadata` and
  `tak_mission_metadata` tables are unused empty stubs.
- **`takMission` is a name, not a GUID** in the public contract; the GUID
  lookup happens via `global.TAK_MISSIONS` populated by the
  `TAK DataSync Look Up` subflow. The plugin should accept names for UX
  but cache GUIDs server-side.
- **HTTP response races:** `phase1extractParams` sends `202` *before* doing
  any work. A `POST /sync/run` that wants to return a real result must
  defer the response until both legs finish.
