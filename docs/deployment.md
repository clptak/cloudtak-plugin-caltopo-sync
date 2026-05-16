# Production Deployment

End-to-end checklist for moving the Caltopo↔TAK sync system into a production CloudTAK + Node-RED environment. Read top to bottom on first install; use the section anchors for reference once you're past v1.0.

## Architecture recap

This system has three deployable parts, in two repos:

| Component | Repo | What runs it |
|---|---|---|
| Plugin (UI) | [`cloudtak-plugin-caltopo-sync/src/`](https://github.com/clptak/cloudtak-plugin-caltopo-sync) | Vendored into CloudTAK at build time |
| Bridge (HTTP contract) | [`cloudtak-plugin-caltopo-sync/nodered/flow-export.json`](https://github.com/clptak/cloudtak-plugin-caltopo-sync/tree/main/nodered) | Imported into your Node-RED runtime |
| Engine (sync logic) | [`node-red-caltopo-tak-sync/flow/flow-export.json`](https://github.com/clptak/node-red-caltopo-tak-sync) | Imported into your Node-RED runtime |

The plugin calls the bridge over HTTP. The bridge calls into the engine through a shared Node-RED change node. The engine talks directly to Caltopo + TAK Server with PostGIS as the state cache.

## Prerequisites in your prod environment

- A built / buildable CloudTAK checkout (with write access to `api/web/plugins/`)
- A running Node-RED instance (typically the same one your `node-red-sarops-docker` stack already runs)
- A PostgreSQL database with PostGIS extension that Node-RED can connect to
- A TAK Server reachable from the Node-RED host on both the Marti API port (typically 8443) and the CoT TLS port (typically 8089)
- Client cert + key + CA chain for the cert identity Node-RED will use against TAK Server, mounted into the Node-RED container at the paths referenced by `CERT_CERT_PATH` / `CERT_KEY_PATH` / `CERT_CA_PATH`
- Caltopo HMAC credentials (Credential ID + base64 Credential Key)

## One-time setup before first deploy

### 1. Apply the PostGIS migrations

Each repo ships an idempotent migration. Apply both against your prod PostGIS database:

```bash
psql "$PROD_DATABASE_URL" -f /path/to/cloudtak-plugin-caltopo-sync/nodered/migration.sql
psql "$PROD_DATABASE_URL" -f /path/to/node-red-caltopo-tak-sync/migrations/001_caltopo_maps.sql
```

Expected: `CREATE TABLE` on first run, `NOTICE: relation "..." already exists, skipping` on repeated runs.

### 2. Install the engine flow into prod Node-RED (only if it's not already there)

Skip this if prod is already running your existing `node-red-sarops-docker` flow — the engine is already inside it. You only need this step when bootstrapping a fresh Node-RED that has never had the engine.

1. Open prod Node-RED UI
2. Hamburger menu → **Import** → paste the contents of `node-red-caltopo-tak-sync/flow/flow-export.json`
3. Map the postgres-config dialog to your prod PostgreSQL config
4. Deploy

### 3. Install the bridge subflow into prod Node-RED

```
Node-RED UI → Import → paste cloudtak-plugin-caltopo-sync/nodered/flow-export.json
   → for sync04caltopoDebug and sync09takDebug: pick "replace"
   → Deploy
```

### 4. Apply post-import wire patches (REQUIRED — Node-RED's import dialog does not modify existing nodes' wires, three of them need to be appended)

```bash
python3 /path/to/cloudtak-plugin-caltopo-sync/nodered/scripts/post-import-patch.py \
        /path/to/prod-nodered-data/projects/<project_name>/flows.json
docker restart <prod-nodered-container-name>
```

The script is idempotent — re-running after the patches are already applied prints "No changes" and exits 0. Run it after any Node-RED re-import or anything that touches `flows.json`.

### 5. Subscribe the Node-RED cert to each TAK mission you intend to sync

The engine has an "Ensure TAK Mission Subscription" function that auto-subscribes the cert per-mission on first sync, so this is normally automatic. But if you want to verify or pre-subscribe:

```bash
docker exec <prod-nodered-container> sh -c '
  curl -sS -k \
    --cert "$CERT_CERT_PATH" --key "$CERT_KEY_PATH" --cacert "$CERT_CA_PATH" \
    -X PUT -w "\nHTTP %{http_code}\n" \
    "https://<tak-server>:8443/Marti/api/missions/<MISSION_NAME>/subscription?uid=<cert-CN>"'
```

Expected: 201 first time, 200 or 409 thereafter.

### 6. Upload TAK iconsets into prod CloudTAK

The sync engine generates CoT events with `<usericon iconsetpath="<iconset-UUID>/<folder>/<icon>.png">`. **Each iconset UUID referenced by your `caltopoToTak` map in `/data/icon-configs.json` must be uploaded into the prod CloudTAK iconset library** for icons to render — otherwise CloudTAK draws features as colored dots using the `marker-color` (which is often white).

Upload via prod CloudTAK admin → **Iconsets** → upload the `.zip` for each iconset. ATAK and TAK Aware fetch iconsets directly from TAK Server and don't need this step, so they'll render correctly even when CloudTAK doesn't.

## Deploying the plugin into prod CloudTAK

CloudTAK plugins are **compile-time vendored** — they get baked into the build via Vite's `import.meta.glob(['../plugins/*.ts', '../plugins/*/index.ts'])` at host startup. There is no runtime upload UI.

### Plugin source placement (pick one)

Either a clone pinned to a release tag (preferred — reproducible):

```bash
git -C /path/to/prod/CloudTAK/api/web/plugins \
    clone -b v1.0.0 https://github.com/clptak/cloudtak-plugin-caltopo-sync \
    caltopo-sync
```

Or a plain file copy (no `.git` in the host tree):

```bash
cp -r /path/to/source/cloudtak-plugin-caltopo-sync/src \
      /path/to/prod/CloudTAK/api/web/plugins/caltopo-sync
```

**Do not use a symlink in production.** `scripts/dev-link.sh` is dev-only — Vite's symlink resolution is environment-sensitive enough that prod should use a real copy.

### Build CloudTAK

```bash
cd /path/to/prod/CloudTAK/api/web
npm install        # one-time, or after upgrading deps
npm run build      # NOT 'npm build' — that's a different thing
```

Watch the build output. The plugin should compile without errors. If you see `Cannot find module '@/components/CloudTAK/util/MenuTemplate.vue'` or similar, the Vite `@` alias isn't resolving — confirm `/path/to/prod/CloudTAK/api/web/vite.config.ts` line ~37 has `'@': path.resolve(__dirname, './src')`.

### Restart CloudTAK

Restart whatever process serves the built CloudTAK. Browser reload should now show **Caltopo Sync** in the main menu.

## Verification (run after every deploy)

```bash
# Bridge endpoints reachable from a host the plugin can reach
curl -sS http://<prod-nodered>:1880/sync/health | jq .
# expect: { caltopo_creds_ok: true, postgis_ok: true, icon_configs_ok: true, tak_reachable: true }

curl -sS http://<prod-nodered>:1880/sync/pairs
# expect: 200 + JSON array (probably [] on a fresh install)
```

Then in the prod CloudTAK UI:

1. Open **Caltopo Sync** from the main menu
2. **Settings** tab → paste `http://<prod-nodered>:1880` → Save & Test
   - Expect all four Health checks green
3. **Pairs** tab → pick a real TAK Mission from the dropdown + enter a real Caltopo MapID → Add
4. Click **Sync Now**, wait up to 30 s for the modal
5. Verify the modal opens and **then check the mission in ATAK / iTAK / CloudTAK** — features should appear within a few seconds (don't rely on the modal's count alone — see Known issues)

## Pinning versions

Both repos are tagged. For prod, **always pin** rather than tracking `main`:

```bash
# in prod CloudTAK's api/web/plugins/caltopo-sync/
git fetch --tags
git checkout v1.0.0    # or whatever release you want

# then rebuild prod CloudTAK:
cd /path/to/prod/CloudTAK/api/web
npm run build
```

For the Node-RED side, the bridge subflow and engine flow are JSON files committed in their repos — you can `git checkout v1.0.0` / `v1.0.1` to grab the matching versions before re-importing. The post-import patch script lives in the bridge repo and uses fixed node ids; it works against any version that names its nodes consistently.

## Rollback

The plugin is fully reversible:

```bash
# Remove from prod CloudTAK and rebuild
rm -rf /path/to/prod/CloudTAK/api/web/plugins/caltopo-sync
cd /path/to/prod/CloudTAK/api/web && npm run build
```

The bridge is fully reversible:

```bash
# In Node-RED UI: select the "Caltopo Sync Plugin Bridge" tab → ⋮ menu → Delete
# Re-apply only the wire un-patches by manually emptying wires[0] on
# sync04caltopoDebug and sync09takDebug, OR by restoring flows.json from
# the .bak-<timestamp> file the bridge install procedure may have left.
```

The engine is the *original* `node-red-sarops-docker` flow content — removing the engine means removing your existing Caltopo↔TAK functionality entirely. Don't do this lightly.

The PostGIS migrations are additive (CREATE TABLE IF NOT EXISTS); leaving the tables behind is harmless.

## Known issues to expect in v1.0

These are documented in [`nodered/README.md`](../nodered/README.md) under "Known issues" — see there for full detail. Brief recap so operators aren't surprised:

- **CloudTAK shows white dots** instead of the proper marker icons when an iconset referenced by `caltopoToTak` isn't uploaded into CloudTAK's iconset library. ATAK and TAK Aware render correctly because they fetch iconsets from TAK Server directly. Upload missing iconsets in step 6 above.
- **Occasional postgres deadlock** when the two sync directions race for the same `(map_id, feature_id)` row. Manifests as a missing sync run; next click recovers. Solved in v1.2 with retry-on-deadlock around the UPSERT.

## Common deployment issues and fixes

### "Caltopo Sync" doesn't appear in the CloudTAK main menu

- Confirm `api/web/plugins/caltopo-sync/index.ts` exists post-build
- Confirm the build succeeded with no warnings about the plugin
- Check browser DevTools console for `Failed to add menu item` — usually means the map wasn't loaded when `install()` ran (shouldn't happen in v1.0+ since menu add was moved to `enable()`)
- Restart prod CloudTAK once after plugin install — `import.meta.glob` indexes at startup

### `/sync/health` returns false for `caltopo_creds_ok`

`CALTOPO_CREDENTIAL_ID` or `CALTOPO_CREDENTIAL_KEY` env vars not set in the Node-RED container. Check `docker inspect <container>` or your Docker Compose file.

### `/sync/health` returns false for `postgis_ok`

Node-RED can't reach Postgres. Check the `postgresdb` config node maps to the right host/port/database/user/password.

### `/sync/health` returns false for `icon_configs_ok`

`/data/icon-configs.json` missing or unparseable inside the Node-RED container. Check the file mount and the file's JSON syntax.

### `/sync/health` returns false for `tak_reachable`

The probe is a HEAD request to `https://<TAK_SERVER_URL>:<TAK_HTTPS_API_PORT>/` with a 3-second timeout. False means DNS lookup failed, network unreachable, or TLS handshake took longer than 3 s. Get on the VPN if applicable, or relax the timeout in the `Sync health check` function for slow networks.

### Sync runs but no features in the TAK mission

Three likely causes:

1. The Node-RED cert isn't subscribed to that specific mission. The "Ensure TAK Mission Subscription" function should handle this automatically; if not, run the manual PUT in step 5 above.
2. The mission name passed differs from what TAK Server's mission list reports. The bridge does a GUID → name translation via `global.TAK_MISSIONS`; if that lookup is stale, re-fire the `Get Mission List` inject node.
3. Caltopo HMAC creds are wrong → the engine successfully PUTs the UID into the mission, but no actual CoT ever broadcasts, so the UID never gets associated with any feature data. Check `caltopo_maps` for rows with `last_sync_source='CALTOPO'` — if the table stays empty after sync runs, the Caltopo fetch is failing.

### Concurrent-run 409 errors in the UI

The bridge rejects a second sync run for the same MapID while a first is in flight. This is intentional — wait for the first to finish or pick a different MapID.

## Where to file issues

- Plugin / bridge: [github.com/clptak/cloudtak-plugin-caltopo-sync/issues](https://github.com/clptak/cloudtak-plugin-caltopo-sync/issues)
- Engine: [github.com/clptak/node-red-caltopo-tak-sync/issues](https://github.com/clptak/node-red-caltopo-tak-sync/issues)
