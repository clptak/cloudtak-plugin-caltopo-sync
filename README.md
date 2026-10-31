# cloudtak-plugin-caltopo-sync

A [CloudTAK](https://github.com/dfpc-coe/CloudTAK) frontend plugin that pairs Caltopo maps with
TAK Missions. The syncing itself runs in CloudTAK, in the **CloudTAK CalTopo ETL**
([etl-caltopo](https://github.com/clptak/etl-caltopo)): one Connection Layer per pair, every minute.
The plugin is the admin's window onto it.

New to TAK or CloudTAK? Read [docs/cloudtak-etl-guide.md](./docs/cloudtak-etl-guide.md) first – it
explains Connections, Layers and Data Syncs and which buttons are safe.

## What the plugin does

| Section | What it does | Needs |
|---|---|---|
| **CloudTAK ETL Pairs** | Lists every pair with its last run, item counts and errors. **+** pairs a Mission with a Caltopo map as a dry run, **Go Live** starts writing. | CloudTAK System Administrator. A CalTopo Sync Layer with one pair on the Connection to copy credentials from. |
| **Create Caltopo Map** | Creates a map in the team's Caltopo account and fills it into the pair form. | A CalTopo Layer on the chosen channels with its Outgoing `AccountId`/`TeamId` set, etl-caltopo 5.19.0+. |
| **Download Caltopo-Friendly GeoJSON** | Saves a Mission's features as GeoJSON that Caltopo imports cleanly. | Nothing. |

It also lets the incident manager plugin create a map for a new Mission
(`window.__cloudtakCaltopo.createMap`, see `src/lib/incidentProvider.ts`).

No Caltopo credentials or other secrets live in the browser: pair Layers copy theirs from an
existing Layer on the server, and map creation goes through the ETL.

```
 Plugin (browser) ──CloudTAK API──▶ CloudTAK ──▶ Connection Layer (AWS Lambda, etl-caltopo)
   pair list / + / Go Live                         ├─ every minute: Caltopo map ◀──▶ TAK Mission
   Create Caltopo Map ──▶ CloudTAK Event ─────────▶ ├─ event:create: new Caltopo map
                          (metadata.caltopo_map)    └─ Outgoing: TAK positions ──▶ Caltopo
```

### How Create Caltopo Map works

The plugin creates a CloudTAK **Event** at the call location with `metadata.caltopo_map: true`,
shared on the channels you pick. The CalTopo Layer receives it (`event:create`), creates the map in
the team account and files the map ID under the Event's `caltopo` external ID, which the plugin
waits for (up to two minutes). Only flagged Events get a map, because other plugins create Events
too – see `MapEvents` in the etl-caltopo README.

## Install (operator)

CloudTAK plugins are compiled into the web app – there is no runtime upload.

```bash
cd ~/tak-stack/CloudTAK/app/plugins
git clone git@github.com:clptak/cloudtak-plugin-caltopo-sync.git caltopo-sync
```

Then rebuild the CloudTAK web app the way your deployment does. To update, `git pull` in that folder
and rebuild. Browsers can keep serving the previous build from CloudTAK's service worker – close every
CloudTAK tab and reopen it.

## Develop

```bash
git clone git@github.com:clptak/cloudtak-plugin-caltopo-sync.git
cd cloudtak-plugin-caltopo-sync
npm install
bash scripts/dev-link.sh /path/to/CloudTAK
```

`scripts/dev-link.sh` links the repo root to `<CloudTAK>/app/plugins/caltopo-sync`, which is why
components import CloudTAK internals as `../../../../src/...`. Checks run from the CloudTAK app:

```bash
cd /path/to/CloudTAK/app
npx eslint --config eslint.config.js plugins/caltopo-sync/src
npx vue-tsc --noEmit
```

Unit tests for the pair planning and map request logic run in this repo with `npm test`.

## Layout

```
src/
  index.ts                     Plugin entry: menu, route, float pane, incident manager hook
  api/cloudtak-etl-client.ts   Lists, creates and goes live with ETL pairs through CloudTAK's API
  api/caltopo-map-client.ts    Creates a map through a flagged Event and waits for the ETL
  lib/etl-pairs.ts             Pairs and their status from a Layer
  lib/etl-pair-plan.ts         What a new pair creates - the safety rules, tested
  lib/caltopo-map-event.ts     The flagged Event body, tested
  components/PairManager.vue   The panel
  components/EtlPairList.vue   CloudTAK ETL Pairs
docs/cloudtak-etl-guide.md     Guide for admins new to TAK
test/                          node --test unit tests
```

## License

[AGPL-3.0](./LICENSE) — matching CloudTAK.
