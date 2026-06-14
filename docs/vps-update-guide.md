# VPS update guide — Caltopo Sync plugin + Node-RED bridge

Operator checklist for **ccsosar.net / tak-stack** production. Run everything
**on the VPS over SSH** unless noted.

This covers both halves of the system:

| Half | What it is | Where it lives |
|---|---|---|
| **Plugin (UI)** | Vue/TS in CloudTAK — pair manager, sync modes, settings | Built into the `cloudtak-api` Docker image |
| **Bridge + engine hooks** | Node-RED flows — `/sync/*` API, one-way routing, sync logic | `flows.json` in the Node-RED container |

The browser calls `https://cloudtak.ccsosar.net/sync/*` (Caddy proxies to Node-RED).
You do **not** restart Caddy for plugin or flow updates unless you changed routing.

---

## Paths (this VPS)

| Item | Path |
|---|---|
| Compose project | `~/tak-stack` |
| Plugin source (git clone) | `~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync` |
| Node-RED `/data` mount (host) | `~/tak-stack/ccsosarops-nodered` |
| Live flows file (host) | `~/tak-stack/ccsosarops-nodered/flows.json` |
| Node-RED scripts | `~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync/nodered/scripts/` |
| Postgres service | `nr-postgis-db` (db `spatial_data`, user `nodered`) |
| Node-RED service | `nodered` (container name may show as `node_red`) |
| CloudTAK service | `cloudtak-api` (confirm with `docker compose config --services`) |

**Not** `~/tak-stack/nr_data` — that directory has `settings.js` only; `flows.json`
is under `ccsosarops-nodered`.

There is **no `npm` on the VPS host**. CloudTAK builds run inside Docker
(`docker compose build cloudtak-api`).

---

## 0. Pull latest plugin repo

Always start here:

```bash
cd ~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync
git pull
```

If you changed the plugin on a dev machine, push to git first, then pull on the VPS.

---

## 1. What changed? (pick your path)

```
Did the release change…
│
├─ Plugin UI only (Vue/TS under src/)
│     → Section 2 — rebuild cloudtak-api
│
├─ Node-RED function code only (bridge or engine function bodies)
│     → Section 3 — sync-bridge-functions.py
│
├─ New SQL (sync_pairs columns, etc.)
│     → Section 4 — migration SQL
│
├─ New HTTP nodes (new /sync/* routes, e.g. PATCH /sync/pairs/:id)
│     → Section 5 — selective Node-RED UI import (once)
│
└─ Wire / link fixes after a UI re-import
      → Section 6 — post-import-patch.py
```

Most releases are **Section 2 + Section 3**. Section 4 only when a new
`migration-*.sql` file ships. Section 5 is rare.

---

## 2. Plugin UI update (CloudTAK)

When anything under `src/` or `index.ts` changed (labels, sync modes, API client, etc.):

```bash
cd ~/tak-stack

docker compose build cloudtak-api
docker compose up -d cloudtak-api
```

Confirm the service name if needed:

```bash
docker compose config --services | grep -i cloud
```

Hard-refresh the browser. Plugin **Settings → Node-RED base URL** should remain
**`https://cloudtak.ccsosar.net`** (same origin as CloudTAK — not `nodered:1880`).

**Do not** restart Caddy for plugin-only changes.

---

## 3. Node-RED function code update (no UI import)

When `nodered/flow-export.json` changed but **no new http-in nodes** were added
(typical bridge/engine logic fixes: sync modes, validate, finalize, Extract Sync
Params, Set Delete Query, etc.):

```bash
cd ~/tak-stack

# Backup
cp ~/tak-stack/ccsosarops-nodered/flows.json \
   ~/tak-stack/ccsosarops-nodered/flows.json.bak-$(date +%Y%m%d)

# Patch function bodies in place (bridge tab + named engine functions)
python3 ~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync/nodered/scripts/sync-bridge-functions.py \
  ~/tak-stack/ccsosarops-nodered/flows.json

docker compose restart nodered
```

### If `flows.json` is not on the host

If `~/tak-stack/ccsosarops-nodered/flows.json` is missing, use the container copy:

```bash
docker compose exec -T nodered cat /data/flows.json > /tmp/flows.json
cp /tmp/flows.json /tmp/flows.json.bak-$(date +%Y%m%d)

python3 ~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync/nodered/scripts/sync-bridge-functions.py \
  /tmp/flows.json

docker compose cp /tmp/flows.json nodered:/data/flows.json
docker compose restart nodered
```

### Read the script output

| Output | Meaning |
|---|---|
| `Updated N function body/bodies…` | Success — restart Node-RED |
| `No changes — all … already match` | Already on this version — skip restart unless you also rebuilt the plugin |
| `Format JSON` / `Sync health check` **ambiguous, skipped** | Safe to ignore unless pair create/list or health breaks |
| `Build PATCH pair` **not found** | PATCH route not deployed yet — see Section 5 if you need it |
| `Live flows.json missing tab … Bridge` | Bridge tab never imported — initial install, not an update |

---

## 4. Postgres migration

When a new file appears under `nodered/migration-*.sql`:

```bash
cd ~/tak-stack

docker compose exec -T nr-postgis-db psql -U nodered -d spatial_data \
  < ~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync/nodered/migration-sync-mode.sql
```

Replace the filename with whatever shipped. Migrations are idempotent
(`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`). Running twice is fine.

Fresh install still needs `nodered/migration.sql` once.

---

## 5. New Node-RED HTTP routes (UI import — rare)

`sync-bridge-functions.py` updates **JavaScript inside existing function nodes**.
It does **not** create new `http in` nodes (e.g. `PATCH /sync/pairs/:id`).

When a release adds a **new endpoint**, import **only** the bridge tab once:

1. Open Node-RED on the VPS in a browser.
2. **Import** → paste contents of  
   `~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync/nodered/flow-export.json`
3. In the import dialog, select **only** **“Caltopo Sync Plugin Bridge”**.
   **Uncheck** “Start Up” and “Caltopo <-> TAK”.
4. **Deploy**.
5. Run Section 6 (`post-import-patch.py`), then restart Node-RED.

**Do not delete** existing tabs unless you accidentally created **duplicates**
from a full import — then delete the **new** duplicate, not the working original.

---

## 6. Post-import wire patch (after UI re-import only)

Node-RED’s import dialog does not reliably patch wires on existing engine nodes.
Run this **only after** Section 5 (or any bridge UI re-import):

```bash
python3 ~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync/nodered/scripts/post-import-patch.py \
  ~/tak-stack/ccsosarops-nodered/flows.json

docker compose restart nodered
```

Idempotent — “No changes” means wires are already correct.

If `/sync/run` hangs 30s with `last_sync_at: null` and synthetic signals, run
the link-node migration once (usually already done on this VPS):

```bash
python3 ~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync/nodered/scripts/migrate-to-link-nodes.py \
  ~/tak-stack/ccsosarops-nodered/flows.json

docker compose restart nodered
```

---

## 7. Full update checklist (typical release)

Use this when a release touches **both** plugin UI and Node-RED logic:

```bash
# 1. Pull
cd ~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync && git pull

# 2. Postgres (if migration-*.sql is new — skip if none)
cd ~/tak-stack
docker compose exec -T nr-postgis-db psql -U nodered -d spatial_data \
  < ~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync/nodered/migration-XXXX.sql

# 3. Node-RED function code
cp ~/tak-stack/ccsosarops-nodered/flows.json \
   ~/tak-stack/ccsosarops-nodered/flows.json.bak-$(date +%Y%m%d)
python3 ~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync/nodered/scripts/sync-bridge-functions.py \
  ~/tak-stack/ccsosarops-nodered/flows.json
docker compose restart nodered

# 4. CloudTAK plugin UI
docker compose build cloudtak-api
docker compose up -d cloudtak-api
```

Then verify (Section 8).

Skip step 2 if no new migration file. Skip Section 5/6 unless the release notes
say new HTTP nodes were added.

---

## 8. Verify

```bash
curl -s https://cloudtak.ccsosar.net/sync/health | jq .
curl -s https://cloudtak.ccsosar.net/sync/pairs | jq .
```

In CloudTAK → **Caltopo Sync**:

1. Settings → health all green, base URL `https://cloudtak.ccsosar.net`
2. Add a pair (pick sync mode if the UI shows it)
3. Run sync — modal should return counts within ~30s

Optional PATCH test (only if Section 5 was done):

```bash
curl -s -X PATCH https://cloudtak.ccsosar.net/sync/pairs/<ID> \
  -H 'Content-Type: application/json' \
  -d '{"sync_mode":"tak_to_caltopo"}' | jq .
```

---

## 9. What not to do

| Don't | Why |
|---|---|
| Delete **Caltopo <-> TAK** or **Bridge** tabs | That’s the engine and API |
| Import the **whole** `flow-export.json` unchecked | Creates duplicate Start Up / engine tabs |
| Run `post-import-patch.py` on every update | Only needed after UI re-import |
| Restart **Caddy** for plugin/flow updates | Caddy only changes when routing config changes |
| Patch `~/tak-stack/nr_data/flows.json` | Wrong path — use `ccsosarops-nodered/flows.json` |
| Run `npm run build` on the VPS host | No npm — use `docker compose build cloudtak-api` |

---

## 10. Rollback

**Node-RED flows:**

```bash
cp ~/tak-stack/ccsosarops-nodered/flows.json.bak-YYYYMMDD \
   ~/tak-stack/ccsosarops-nodered/flows.json
docker compose restart nodered
```

**CloudTAK plugin:** check out the previous git tag in the plugin clone, rebuild
the image, redeploy:

```bash
cd ~/tak-stack/CloudTAK/api/web/plugins/caltopo-sync
git checkout vX.Y.Z
cd ~/tak-stack
docker compose build cloudtak-api
docker compose up -d cloudtak-api
```

Postgres migrations are additive; rollback usually means leaving new columns in place.

---

## Script reference

| Script | Purpose |
|---|---|
| `nodered/scripts/sync-bridge-functions.py` | Copy function-node code from repo → live `flows.json` |
| `nodered/scripts/post-import-patch.py` | Fix completion-signal wires after UI re-import |
| `nodered/scripts/migrate-to-link-nodes.py` | One-time link out/in for `/sync/run` trigger |
| `nodered/migration.sql` | Create `sync_pairs` table |
| `nodered/migration-*.sql` | Incremental schema (e.g. `sync_mode`) |

HTTP contract details: [`nodered/endpoints.md`](../nodered/endpoints.md).

General CloudTAK + Caddy wiring: [`DEPLOYMENT.md`](../DEPLOYMENT.md) in the repo root.
