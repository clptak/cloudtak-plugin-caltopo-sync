# CloudTAK Mission API — Client-side Reference

Reference for fetching and manipulating TAK Missions from inside a CloudTAK
frontend plugin. All citations refer to the CloudTAK monorepo (worktree path:
`/Users/paulclifton/CloudTAK/.claude/worktrees/naughty-dubinsky-cb3167`).

Throughout this doc, paths beginning with `api/...` are server-side and
`api/web/src/...` are browser-side.

---

## 1. Auth (how the plugin authenticates)

CloudTAK's browser code does **not** talk to Marti directly — it talks to its
own CloudTAK REST API at `self.location.origin`, and the server proxies to Marti
with the user's cert/key. From a plugin, you only need the **CloudTAK bearer
token**.

- The token lives in `localStorage.token`. See
  `api/web/src/std.ts:14` (`AuthMiddleware`) and `api/web/src/std.ts:64-68`
  (the `std()` helper auto-injects `Authorization: Bearer <localStorage.token>`).
- There are two helpers for fetching:
  - `std(url, opts)` — generic wrapper, returns parsed JSON when
    `Content-Type: application/json`. `api/web/src/std.ts:44`.
  - `server` — a typed `openapi-fetch` client built from
    `@cloudtak/api-types`. `api/web/src/std.ts:8`. Use this when you want path
    parameter validation; e.g. `MenuMissions.vue:440` uses
    `server.GET('/api/marti/missions/{:name}', ...)`.
- Plugins should reuse `std`/`server` rather than re-implementing auth — the
  middleware also handles 401 → token-clear (`std.ts:85-90`).
- For mission-token-protected missions, set an extra
  `MissionAuthorization` header. Helper: `Subscription.headers(token)` at
  `api/web/src/base/subscription.ts:465`.

---

## 2. List Missions

**Server route:** `GET /api/marti/mission`
(`api/routes/marti-mission.ts:303-367`). Response is
`{ items: Mission[]; invites: MissionInvite[]; total: number }` —
`marti-mission.ts:320-324`.

**Browser helper:** `Subscription.list()` at
`api/web/src/base/subscription.ts:450-463`. Defaults to
`passwordProtected=true`, `defaultRole=true`, sort `createTime` desc.

```ts
import Subscription from '<cloudtak>/api/web/src/base/subscription.ts';
const { items, invites, total } = await Subscription.list();
```

This is what `MenuMissions.vue:473` calls. Each `items[i]` is the full
`Mission` shape (guid, name, description, keywords, groups, contents, etc.).

---

## 3. Read mission contents (features)

CloudTAK exposes mission features as **GeoJSON**, not raw CoT XML. The server
calls `api.Mission.latestFeats(...)` and wraps it as a FeatureCollection.

**Server route:** `GET /api/marti/missions/:guid/cot`
(`api/routes/marti-mission.ts:75-102`). Response:
`{ type: 'FeatureCollection', features: Feature[] }` where `Feature` is
`node-cot`'s GeoJSON-with-CoT-properties type
(`marti-mission.ts:82-85`).

**Browser helper:** `SubscriptionFeature.refresh()` at
`api/web/src/base/subscription-feature.ts:40-117` fetches the FeatureCollection
and writes it into Dexie (`db.subscription_feature`). After refresh, call:

- `await sub.feature.list()` → `Feature[]` (`subscription-feature.ts:119-140`)
- `await sub.feature.collection(raw=true)` → `FeatureCollection`
  (`subscription-feature.ts:142-173`)
- `await sub.feature.from(uid)` → single `Feature`
  (`subscription-feature.ts:179-196`)

Get a `Subscription` from a guid via `Subscription.load(guid, { token })`
(`subscription.ts:173-253`). This is the canonical entry point: it hits
`GET /api/marti/missions/:guid` and `…/role`, stores in Dexie, and refreshes
features.

> **Diff implication:** because contents arrive as GeoJSON with CoT properties
> baked into `feature.properties` (`type`, `callsign`, `remarks`, etc.), the
> plugin can diff directly against Caltopo GeoJSON without parsing XML.

Additional read endpoints:
- `GET /api/marti/missions/:name/changes` — `MissionChange[]`
  (`marti-mission.ts:176-205`). Wrapped by
  `SubscriptionChanges` (`api/web/src/base/subscription-changes.ts`).
- `GET /api/marti/missions/:name/log` — mission logs
  (`api/routes/marti-mission-logs.ts:15-95`). Wrapped by `SubscriptionLog`.
- `GET /api/marti/missions/:name/archive?format=geojson|kml|zip` — full export
  (`marti-mission.ts:369-448`).

---

## 4. Write to a mission

There are two write paths, and they are NOT symmetric with reads:

### 4a. Add / update a feature

Features are written **as CoT over the WebSocket connection**, not via REST.
The convention: set `feat.properties.dest = [{ 'mission-guid': <guid> }]` and
the TAK server fans it into the mission.

- `SubscriptionFeature.update(atlas, cot, opts)` at
  `api/web/src/base/subscription-feature.ts:208-266`.
  - Writes the feature into the local Dexie cache.
  - Marks the subscription `dirty: true`.
  - Calls `atlas.conn.sendCOT(feat)` (websocket, JSON payload — see
    `api/web/src/workers/atlas-connection.ts:296-299`).
  - For chat-type features (`b-t-f`), `dest` uses `mission` (name) instead of
    `mission-guid` (`subscription-feature.ts:254-262`).

Payload is **GeoJSON-with-CoT-properties** (CloudTAK's `Feature` type, not raw
XML). The Node-CoT layer on the server converts to XML.

### 4b. Delete a feature

`DELETE /api/marti/missions/:guid/cot/:uid` (`marti-mission.ts:104-137`).
Browser helper: `SubscriptionFeature.delete(atlas, uid, opts)` at
`subscription-feature.ts:276-300`.

### 4c. Mission CRUD

- `POST /api/marti/mission` — create (`marti-mission.ts:238-259`). Body is
  `Mission_Create` minus `creatorUid` (server fills it as
  `ANDROID-CloudTAK-<email>`).
- `PATCH /api/marti/missions/:name` — update description/keywords/groups
  (`marti-mission.ts:261-301`). Browser: `Subscription.update({ description,
  keywords, groups })` at `subscription.ts:255-314`.
- `DELETE /api/marti/missions/:name` — delete (`marti-mission.ts:207-236`).
  Browser: `Subscription.delete()` (`subscription.ts:316-336`).

**Headers:** all write endpoints accept an optional `MissionAuthorization`
header for password/token-gated missions. The helpers handle this via
`Subscription.headers(missiontoken)`.

---

## 5. Mission Layers vs. Mission Features

These are **distinct concepts** in TAK:

- **Mission Features** — every CoT in a mission's content stream. Returned by
  `GET …/cot`. Flat list.
- **Mission Layers** — a hierarchical folder grouping inside a mission. Each
  layer has a `type` (`GROUP`, `UID`, `CONTENTS`, `ITEMS`) and may contain
  child layers and references (`layer.uids[]`) to features by UID. See the
  enum import at `api/routes/marti-mission-layers.ts:9` (from
  `@tak-ps/node-tak/lib/api/mission-layer`) and the create body shape at
  `marti-mission-layers.ts:85-91`.

Layer endpoints (`api/routes/marti-mission-layers.ts`):
- `GET /api/marti/missions/:name/layer` → `TAKList(MissionLayer)`
- `GET /api/marti/missions/:name/layer/:layerid`
- `POST /api/marti/missions/:name/layer` — body `{ name, type, uid?, parentUid?,
  afterUid? }`
- `PATCH /api/marti/missions/:name/layer/:uid` — rename only
- `DELETE /api/marti/missions/:name/layer/:uid`

Browser helpers on `Subscription`:
- `layerList()` (`subscription.ts:533-548`)
- `layerCreate(layer)` (`subscription.ts:565-576`)
- `layerUpdate(guid, layerid, layer)` (`subscription.ts:550-563`)
- `layerDelete(uid)` (`subscription.ts:578-587`)

UI defaults to `type: 'GROUP'` for user-created folders
(`MissionLayerCreate.vue:59-62`). For an automated UID-based grouping (the
typical pattern when ingesting from an external system),
`MissionLayerType.UID` is used — see how the COT-layer ingestion does it at
`api/routes/connection-layer-cot.ts:170`.

**Recommendation for Caltopo sync:** write Caltopo objects as regular mission
**features** (so they show on the mission map for every subscriber without
extra client logic), AND create one dedicated `MissionLayer` of type `UID` per
sync (e.g. `name: "Caltopo: <mapID>"`) referencing the synced feature UIDs.
This mirrors `connection-layer-cot.ts` ingestion, gives the user a clear
"these came from Caltopo" folder in ATAK/iTAK clients, and makes detach/unsync
trivial (delete the layer; features can be deleted via the feature-delete
endpoint).

---

## 6. TypeScript types the plugin can import

All mission-related types live in `api/web/src/types.ts` and are auto-derived
from `@cloudtak/api-types` (which is generated into
`/api/derived-types.d.ts`). Stable, exported names:

| Type | Definition | Source |
| --- | --- | --- |
| `Mission` | `types.ts:56` | `GET /api/marti/missions/{:name}` 200 |
| `Mission_Create` | `types.ts:57` | `POST /api/marti/mission` body |
| `MissionList` | `types.ts:58` | List response with `items`, `invites`, `total` |
| `MissionInvite` | `types.ts:59` | |
| `MissionRole` | `types.ts:61` | |
| `MissionLog` / `MissionLogList` | `types.ts:63-64` | |
| `MissionLayer` | `types.ts:66` | |
| `MissionLayer_Create` / `_Update` | `types.ts:67-68` | |
| `MissionLayerList` | `types.ts:69` | |
| `MissionChanges` / `MissionChange` | `types.ts:71-72` | |
| `MissionSubscriptions` | `types.ts:74` | |
| `Feature` | `types.ts:150-160` | GeoJSON + CoT props |
| `FeatureCollection` | `types.ts:176-179` | |

The auto-generated source is `api/derived-types.d.ts` (not for direct import —
go through `types.ts`).

---

## 7. Lifecycle hooks (subscribing to mission state)

CloudTAK has two parallel pub/sub channels relevant to a plugin:

### 7a. Pinia map store

`useMapStore` at `api/web/src/stores/map.ts:41`. Key state:

- `mapStore.mission: Subscription | undefined` — the "active" mission
  (`map.ts:86`).
- `mapStore.makeActiveMission(sub?)` toggles it (`map.ts:291-317`).
- `mapStore.loadMission(guid, opts?)` loads/refreshes a mission overlay
  (`map.ts:522-555`).

From a Vue plugin component:

```ts
import { useMapStore } from '<cloudtak>/api/web/src/stores/map.ts';
import { watch } from 'vue';

const mapStore = useMapStore();
watch(() => mapStore.mission?.guid, (guid) => {
  // mission selection changed — refresh "paired with Caltopo Map XYZ" UI
});
```

This is the cleanest hook for "show pairing context when a mission is opened."

### 7b. BroadcastChannels (works across tabs / web workers)

- `new BroadcastChannel('subscription')` — fired by `Subscription` on
  create/update/delete with `{ guid, type, state }`. Defined at
  `subscription.ts:21-34, 80-86, 306-313, 328-335`.
- `new BroadcastChannel('cloudtak')` — broader app channel. Mission-relevant
  message types in `api/web/src/base/events.ts:25-26`:
  - `WorkerMessageType.Mission_Change_Feature` (`'mission:change:feature'`) —
    fired by `SubscriptionFeature.refresh()` (`subscription-feature.ts:108-113`).
  - `WorkerMessageType.Mission_Invite` (`'mission:invite'`).

Subscribe in a plugin (works even outside Vue):

```ts
const ch = new BroadcastChannel('cloudtak');
ch.onmessage = (ev) => {
  if (ev.data.type === 'mission:change:feature') {
    // ev.data.body.guid changed — re-run diff
  }
};
```

There is **no dedicated `mission:selected` event** — for "user opened mission
X" use the Pinia watcher (7a). For "mission contents changed" use the
broadcast channel.
