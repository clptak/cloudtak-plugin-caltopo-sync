# Phase 2 — Design Decisions

Reconciled output of the three Phase 1 discovery reports:
- [nodered-spec.md](./nodered-spec.md) — engine + landmines
- [cloudtak-plugin-host.md](./cloudtak-plugin-host.md) — loading model + dev workflow
- [cloudtak-mission-api.md](./cloudtak-mission-api.md) — browser API surface

## 1. Plugin architecture (decided)

| Decision | Choice | Source |
|---|---|---|
| Loading model | Compile-time vendored via Vite `import.meta.glob` | host:main.ts:69 |
| Plugin path in host | `api/web/plugins/caltopo-sync/index.ts` | host glob matches `*/index.ts` |
| Plugin source ships as | TypeScript (host compiles it) | no separate bundle |
| Peer deps (NOT bundled) | `vue`, `pinia`, `vue-router`, `maplibre-gl` | host provides |
| Types import path | `import type { PluginAPI } from '@tak-ps/cloudtak'` | aliased in host vite.config |
| Dev workflow | Symlink our `src/` → host's `api/web/plugins/caltopo-sync` + `npm run serve` from `api/web/` | HMR works after first add |
| HTTP client for CloudTAK API | `std()` / `server` from `api/web/src/std.ts` | auto-injects bearer token |
| Mission helper | `Subscription` class from `api/web/src/base/subscription.ts` | `.list()`, `.load(guid)`, `.feature.*()` |
| Mission write transport | WebSocket via `atlas.conn.sendCOT(feat)` with `feat.properties.dest=[{'mission-guid':guid}]` | subscription-feature.ts:249 |
| Mission contents format | GeoJSON `FeatureCollection` with flattened CoT props | marti-mission.ts:75 |

## 2. Sync targeting model (decided)

Per Agent C's recommendation: Caltopo features are written into the TAK Mission as **plain mission features**, and the plugin additionally creates **one `MissionLayer` of `type: 'UID'`** per Caltopo MapID, named `"Caltopo: <mapID>"`, referencing those feature UIDs.

Why:
- Features remain visible to all subscribers in ATAK/iTAK without needing client-side plugin support
- The MissionLayer gives users a clear "external source" folder in the TAK clients
- Unsync = a single MissionLayer delete (and the features under it can be batch-removed by UID)
- Mirrors `connection-layer-cot.ts:170` (CloudTAK's own external-data ingestion pattern)

## 3. UX placement (decided)

- **Primary entry**: top-level menu item "Caltopo Sync" → opens a settings/pair-manager route at `/menu/caltopo-sync`. Matches the pattern of `MenuConnections`, `MenuPackages`.
- **In-context surface (v1.1, not v1)**: when a mission is open (`watch(() => useMapStore().mission?.guid)`), if the mission is paired, surface a small "Sync Now" floating pane via `PluginAPI.float.add(...)`. Defer to keep v1 scope tight.

## 4. HTTP contract — Node-RED additions (decided)

The existing `GET /api/CalTAKsync` endpoint (flows.json:16012) returns `202 Accepted` immediately and fans out async. It is **not reusable** for the plugin's UX because we need the sync result back synchronously.

New endpoints to add via the importable subflow in `nodered/flow-export.json`:

```
POST   /sync/run              body: { caltopo_map_id, tak_mission_id }
                              returns SYNCHRONOUSLY (joins both directions) with:
                              { added, updated, deleted, conflicts, duration_ms, errors[] }

GET    /sync/pairs            returns [{ id, caltopo_map_id, tak_mission_id, label?, last_sync_at, last_result }]
POST   /sync/pairs            body: { caltopo_map_id, tak_mission_id, label? } → returns Pair
DELETE /sync/pairs/:id

GET    /sync/health           returns { caltopo_creds_ok, postgis_ok, icon_configs_ok, tak_reachable }
```

Wire-in point: the `change` node `a075cdac694b8631` ([flows.json:17053](../../node-red-sarops-docker/data/projects/test_nr_project/flows.json:17053)) is the single fan-out before `phase1extractParams`. New HTTP-In nodes feed into a join/aggregate, then back to an HTTP-Response.

**Caltopo credentials** live in Node-RED env vars (`CALTOPO_CREDENTIAL_ID`, `CALTOPO_CREDENTIAL_KEY`). The plugin never receives them. The plugin's "settings" panel only configures the **Node-RED base URL** (stored in `localStorage`).

## 5. New PostGIS objects to ship in the subflow

- `sync_pairs` table:
  ```sql
  CREATE TABLE IF NOT EXISTS sync_pairs (
    id              BIGSERIAL PRIMARY KEY,
    caltopo_map_id  TEXT NOT NULL,
    tak_mission_id  TEXT NOT NULL,
    label           TEXT,
    last_sync_at    TIMESTAMPTZ,
    last_result     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (caltopo_map_id, tak_mission_id)
  );
  ```

## 6. Correctness fixes the subflow must apply

Three issues Agent A found in the existing flow. We ship **additive corrected paths in the new subflow**, leaving the user's existing flow untouched. The subflow's sync endpoint uses the corrected paths; the legacy `GET /api/CalTAKsync` path still has the original behavior.

1. **Symmetric LWW** — the Caltopo→TAK UPSERT currently checks ownership flag without timestamp. Patch SQL to also compare `EXCLUDED.properties->>'-updated-on' >= properties->>'-updated-on'`.
2. **DELETE `map_id` predicate** — current `DELETE FROM caltopo_maps WHERE feature_id=$1` ([flows.json:16932](../../node-red-sarops-docker/data/projects/test_nr_project/flows.json:16932)) risks cross-pair collisions. Patch to `WHERE map_id=$1 AND feature_id=$2`.
3. **Icon-configs health check** — `/sync/health` checks `/data/icon-configs.json` presence; sync result surfaces a warning if missing.

## 7. Repo build tooling — finalized

- `package.json`: TypeScript + ESLint (matching CloudTAK's `eslint.config.js`), Vue / Pinia / etc. as `peerDependencies`, `@tak-ps/cloudtak` as `peerDependency` (types only).
- `tsconfig.json`: targets ESNext, `composite`, references nothing — host compiles us.
- No bundler. No build step needed for distribution — operators symlink or copy our `src/` directory into `api/web/plugins/caltopo-sync/`.
- A `scripts/dev-link.sh` helper sets up the symlink for local development.

## 8. User-locked decisions

| Decision | Choice |
|---|---|
| Bug fixes for asymmetric LWW + DELETE map_id predicate | Subflow only — legacy `GET /api/CalTAKsync` path untouched. Plugin endpoints use corrected SQL. |
| Auto-create `"Caltopo: <mapID>"` MissionLayer of type UID per pair | Yes — created on first successful sync per pair, deleted when pair is removed. |
| In-context floating pane on mission open | Deferred to v1.1 — v1 ships menu entry only. |
