# Caltopo Sync Plugin — Deployment Guide

Covers building/loading the plugin in a dockerized CloudTAK and wiring the
Node-RED backend. Verified against CloudTAK 13.4.0, May 2026 (host `ccsosar.net`).

The plugin was first built on a dev laptop hitting `http://localhost:1880`
directly. Production differs: the browser can't reach Node-RED's internal name,
and DB/certs/ports/sandbox rules all change. This guide captures every fix.

## 1. Build fixes (in plugin source)

- **Relative imports to core, not `@/`.** `web/tsconfig.json` has no `@/*` alias
  (only Vite does), so `vue-tsc` fails on `@/...`. From
  `web/plugins/caltopo-sync/src/components/` use `../../../../src/base/...`
  (no `.ts` extension).
- **Entry shim** at `plugins/caltopo-sync/index.ts`:
  `export { default } from './src/index.ts';`
  `web/src/main.ts` discovers plugins via glob `../plugins/*/index.ts`; without
  the shim the plugin compiles but never loads.
- **Tabler icon `stroke` is a string:** `stroke: '1'` not `1`. Type find()
  callbacks for strict mode.

Build: `cd web && npm install && npm run lint && npm run check && npm run build`
(all four must pass). Then `docker compose build && docker compose up -d`,
hard-refresh browser.

## 2. Browser ⟷ Node-RED (same-origin via Caddy)

Plugin is browser-side JS; it calls `/sync/health|pairs|run`. Base URL must be
browser-reachable — never `nodered:1880`. Route `/sync/*` through CloudTAK's own
Caddy host. In the `cloudtak.{$PRIMARY_DOMAIN}` block:

    handle /sync/* { reverse_proxy {$NODERED2_UPSTREAM:nodered}:1880 }
    handle { reverse_proxy cloudtak-api:5000 }

Apply: `docker compose up -d --force-recreate caddy`
(plain `caddy reload` may hang). Verify:
`curl -s https://cloudtak.ccsosar.net/sync/health` → JSON, not HTML.

**Plugin Settings → Base URL: `https://cloudtak.ccsosar.net`** (CloudTAK's own host).

Node-RED hosts a **bridge** flow serving `/sync/*`; the engine endpoint is
`GET /api/CalTAKsync?mapID=&takMission=`.

## 3. Node-RED env (per-service in compose, NOT shared .env)

`.env` keeps `TAK_SERVER_URL=https://...` for other services; the flow needs the
bare host. Override only in the `nodered` service block:

    - TAK_SERVER_URL=tak.ccsosar.net        # bare host (flow builds https://host:port)
    - MISSION_API_PORT=8443                 # mTLS mission API (sync; needs client cert)
    - TAK_HTTPS_API_PORT=8446               # anonymous HTTPS (health probe; certless HEAD)
    - TAK_TLS_PORT=8089                     # CoT streaming
    - CERT_CERT_PATH=/data/certs/nodered.pem
    - CERT_KEY_PATH=/data/certs/nodered.open.key
    - CERT_CA_PATH=/data/certs/ca.pem

Port note: 8443 requires a client cert (sync uses it). The health probe does a
certless HEAD — point it at 8446; 8443 fails with SSL alert 42.

## 4. Certs

PEM cert/key/CA on host at `ccsosarops-nodered/certs/` (mounted to /data):
`ca.pem`, `nodered.pem` (client cert), `nodered.open.key` (unencrypted key).

## 5. Database (Node-RED's own Postgres, NOT cloudtak-postgis)

Service `nr-postgis-db`, DB `spatial_data`, user `nodered` (pw `NR_DB_PASSWORD`).
PostGIS baked in. Schema (idempotent):

    docker compose exec -T nr-postgis-db psql -U nodered -d spatial_data <<'SQL'
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE TABLE IF NOT EXISTS public.caltopo_maps (
      map_id TEXT NOT NULL, feature_id TEXT NOT NULL,
      geom GEOMETRY(Geometry,4326), properties JSONB,
      last_hash TEXT, last_sync_source TEXT,
      seen_on_caltopo_at TIMESTAMPTZ, seen_on_tak_at TIMESTAMPTZ,
      caltopo_id TEXT, updated_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (map_id, feature_id));
    CREATE INDEX IF NOT EXISTS idx_caltopo_geom ON public.caltopo_maps USING GIST (geom);
    CREATE TABLE IF NOT EXISTS public.caltopo_map_metadata (
      map_id TEXT PRIMARY KEY, all_ids JSONB, last_poll TIMESTAMPTZ DEFAULT now());
    SQL

(The flow's "Start Up" tab automates this too.)

## 6. Node-RED flow assets

- `icon-configs.json` at host `ccsosarops-nodered/icon-configs.json` → container
  `/data/icon-configs.json` (NOT nested under data/).
- **Function-node modules:** function nodes are sandboxed; `require` is
  unavailable and `https`/`fs` aren't in functionGlobalContext. For the
  `/sync/health` builder and "Ensure TAK Mission Subscription" nodes: open node →
  **Setup** tab → Modules → add `https` (var `https`) and `fs` (var `fs`).

## 7. connectKeys (IMPORTANT for fresh deploys)

The committed flow export has CalTopo `connectKey` values **blanked** (they're
secrets). A fresh deploy MUST set them — via the `CALTOPO_*` env vars the flow
reads, or the subflow instance env. Empty keys = sync silently posts nothing.

## 8. Updating the committed flow export

Pull live runtime + filter to Caltopo tabs/subflows + blank secrets:

    docker compose exec -T nodered cat /data/flows.json > /tmp/all-flows.json
    # filter to tabs: Start Up, Caltopo <-> TAK, Caltopo Sync Plugin Bridge
    # + 5 subflows; blank connectKey/credential values; write nodered/flow-export.json
    # (see repo history / scripts for the filter)

## 9. Verify

    curl -s https://cloudtak.ccsosar.net/sync/health
    # all four flags true = success

