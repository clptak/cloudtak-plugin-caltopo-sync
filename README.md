# cloudtak-plugin-caltopo-sync

A [CloudTAK](https://github.com/dfpc-coe/CloudTAK) frontend plugin that pairs a Caltopo Map with a TAK Mission and lets the user trigger bidirectional delta sync on demand.

> Status: **Phase 2 scaffold — UI surface complete; Node-RED subflow lives in [`nodered/`](./nodered) (separate ship).**

## Architecture (v1)

```
┌──────────────────────────┐         ┌────────────────────────┐         ┌──────────┐
│ CloudTAK browser plugin  │ ──HTTP─▶│ Node-RED sync engine   │ ──API──▶│ Caltopo  │
│ (this repo)              │         │ (separate Docker host) │ ──API──▶│ TAK Srv  │
│                          │ ◀───────│  + PostGIS state cache │ ◀───────│          │
└──────────────────────────┘         └────────────────────────┘         └──────────┘
       │ Settings panel                       │ Existing flow lives in
       │ Pair manager                         │ node-red-sarops-docker
       │ "Sync Now" button                    │ This repo ships only the
       │ Sync result viewer                   │ thin HTTP-In subflow in nodered/
       └──────────────────                    └──────────────────
```

**Sync model:** delta sync (diff against PostGIS state cache), **last-write-wins** per feature, conflict counts surfaced in the response. Manual trigger only — no background job.

## Layout

```
src/                  Vue/TypeScript plugin source
  index.ts            Plugin entry; registers menu + route
  types.ts            Shared types (Pair, SyncResult, HealthCheck…)
  api/                Typed HTTP client for the Node-RED contract
  components/         Settings panel, pair manager, sync trigger, result viewer
  stores/             Pinia store for plugin-local state
nodered/              Importable HTTP-In subflow + contract docs
docs/                 Architecture, auth, conflict policy, discovery reports
scripts/dev-link.sh   Symlink helper for local development against a CloudTAK checkout
test/                 Reserved for Phase 4
```

## Install (operator)

CloudTAK plugins are **compile-time vendored** — there is no runtime upload UI. To ship this plugin to a CloudTAK deployment:

1. Clone this repo somewhere reachable by the operator's build host.
2. Symlink (or copy) `src/` into `CloudTAK/api/web/plugins/caltopo-sync` **before** running `npm run build` in the host.
3. Operate the Node-RED side per [`nodered/README.md`](./nodered). The plugin's "Settings" panel configures the Node-RED base URL **and** the CalTopo account credentials used for map creation (see [Creating Caltopo Maps](#creating-caltopo-maps)).

## Develop

Prerequisites: a local CloudTAK checkout and a running Node-RED instance with the CalTAKsync subflow imported.

```bash
git clone <this-repo>
cd cloudtak-plugin-caltopo-sync
npm install
bash scripts/dev-link.sh /path/to/CloudTAK
cd /path/to/CloudTAK/api/web
npm run serve   # Vite HMR; restart once after first symlink so the glob picks us up
```

`scripts/dev-link.sh` creates `<CloudTAK>/api/web/plugins/caltopo-sync` as a symlink to this repo's **root**. Idempotent — safe to re-run. (It links the root, not `src/`, so the dev layout matches how the production Docker build clones the repo into `plugins/caltopo-sync/` via `WEB_PLUGINS`. That clone places the plugin at `plugins/caltopo-sync/src/...`, which is why cross-host imports use `../../../../src/...`.)

To lint in this repo (full coverage, runs standalone):

```bash
npm run lint      # eslint src
```

For full type verification, the plugin must be symlinked into the host first — its components import host internals via `../../../../src/...` paths that only resolve when the repo root lives at `host/api/web/plugins/caltopo-sync/` (so the components sit at `plugins/caltopo-sync/src/components/...`). The production typecheck path is:

```bash
bash scripts/dev-link.sh /path/to/CloudTAK
cd /path/to/CloudTAK/api/web
npm run check     # host's vue-tsc, sees the symlinked plugin
```

`npm run check` in this repo (standalone) catches in-source bugs but reports cross-host imports as missing modules — that's expected and not a defect. The Vite dev server (`npm run serve` in the host) is the canonical compile-time check.

`@tak-ps/cloudtak` is a peer dep (types only). The `devDependency` `file:../../CloudTAK/api/web` is for IDE convenience; if your checkout lives elsewhere, edit the path in `package.json`.

## Node-RED side — environment variables

The Caltopo credentials and TAK destination live entirely in the Node-RED instance; the browser plugin never sees them. See [`nodered/README.md`](./nodered) for the full list — at minimum:

- `CALTOPO_CREDENTIAL_ID`
- `CALTOPO_CREDENTIAL_KEY`
- PostGIS connection details for the state cache
- TAK server URL / cert paths used by the existing flow

The plugin's "Health" tab calls `GET /sync/health` on the configured Node-RED base URL — green checks here mean the engine is wired up; red means fix Node-RED first.

## Creating Caltopo Maps

The "Add Pair" tab has a **Create Caltopo Map** card that creates a new SAR-mode
CalTopo map (shared by URL) with a marker at a parsed call location, titled after
the Active DataSync (or the DR/Activity number when no DataSync is active).

### Why this needs a Node-RED proxy

The browser **cannot** call `caltopo.com` directly. CalTopo's API returns no CORS
headers, so a cross-origin `fetch` from the CloudTAK origin is blocked by the
browser before any response is read (verified: `OPTIONS` → `403`, `GET` → `401`,
neither with `Access-Control-Allow-Origin`). In Safari this surfaces as an instant
**"Load failed"**. Note `api.caltopo.com` does not exist — the real API host is
`caltopo.com`.

The fix is a small **server-side proxy in Node-RED**: the plugin POSTs to Node-RED
(same-origin-friendly, already CORS-enabled), and Node-RED signs the request
(HMAC-SHA256) and forwards it to CalTopo server-to-server, where CORS does not
apply. This is the same path your `/sync` engine already uses successfully.

### One-time setup

1. **Import the proxy flow.** In Node-RED: *Menu → Import* → import
   [`nodered/caltopo-proxy-flow.json`](./nodered/caltopo-proxy-flow.json) →
   **Deploy**. It lands on its own "Caltopo Proxy" tab and exposes
   `POST /sync/caltopo` (plus an `OPTIONS` preflight handler). The `/sync/`
   prefix means it reuses the same reverse-proxy route as your existing bridge
   endpoints, so no Caddy/nginx change is needed. It does not touch the sync
   bridge, so no re-import of `flow-export.json` or the sync scripts is needed.
   Full request contract: [`nodered/README.md`](./nodered#caltopo-proxy-post-synccaltopo).
2. **Set the Node-RED base URL** in the plugin's *Settings* tab (the same URL the
   Health/Sync features use).
3. **Enter CalTopo credentials** in *Settings → Caltopo Settings*: Credential ID,
   Credential Key, and **Team (Folder) ID**. These are stored per CloudTAK user in
   `localStorage` and forwarded to the proxy on each create-map request.

   > **Which value is the "Team (Folder) ID"?** This is the single most common
   > setup mistake. Maps are created at `/api/v1/acct/{team_id}/CollaborativeMap`,
   > so this field must be the 6-character ID of the **team/sub-team (folder) where
   > your service-account credential has write rights** — *not* your top-level
   > parent account ID. A parent account ID will often let you *read* (e.g. listing
   > maps) but return `403 "You don't have write rights for this account."` on
   > create. Find the correct ID in the team admin URL:
   > `https://caltopo.com/group/{team_id}/admin/details`. If you have several teams
   > or sub-teams, use the one you actually want new maps to land in (the same value
   > your Node-RED flow passes as `caltopoTeamId` / `mapMissionTeamFolder`).
4. **Remove any `api.caltopo.com` / `caltopo.com` entry** you may have added to
   the CloudTAK CSP `connect-src` allowlist — it is unnecessary. The browser only
   talks to Node-RED, whose host is already allowed.

### Credentials: plugin vs. env vars

By default the plugin forwards the credentials from its Settings panel to the
proxy (over HTTPS). If you prefer the secrets never leave Node-RED, set them as
env vars on the Node-RED host instead and the proxy will fall back to them:

- `CALTOPO_CREDENTIAL_ID`
- `CALTOPO_CREDENTIAL_KEY`
- `CALTOPO_ACCOUNT_ID` (the writable Team/Folder ID described above)

(The proxy reads body-provided credentials first, then these env vars.) If you go
env-only, ask to have the plugin stop forwarding credentials in the request body.

## Screenshots

_TODO: add screenshots of Settings, Pairs, and Health tabs once the host build is verified._

## License

[AGPL-3.0](./LICENSE) — matching CloudTAK.
