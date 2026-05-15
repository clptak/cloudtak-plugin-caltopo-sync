# CloudTAK Plugin Host — How Plugins Actually Load

Source: `/Users/paulclifton/CloudTAK/.claude/worktrees/naughty-dubinsky-cb3167` (CloudTAK `main` worktree, v12.138.2).

## 1. Loading model — answer: COMPILE-TIME VENDORED via Vite `import.meta.glob`

The CloudTAK browser app discovers plugins at **build time** by Vite-glob-importing every file under `api/web/plugins/`. There is no runtime URL loader, no admin upload, no manifest. Disprove all three:

```ts
// api/web/src/main.ts:69-81
const plugins: Record<string, {
    default: PluginStatic
}> = import.meta.glob(['../plugins/*.ts', '../plugins/*/index.ts'], {
    eager: true
});

const pluginAPI = new PluginAPI(app, router, pinia);
const pluginInstances: PluginInstance[] = [];

for (const path in plugins) {
    const instance = await plugins[path].default.install(app, pluginAPI);
    pluginInstances.push(instance);
}
```

Vite resolves `import.meta.glob` with `eager: true` at **build time** — every `.ts` file in `plugins/` (or `plugins/<name>/index.ts`) becomes a static `import` in the bundle. There is no other call to `new PluginAPI` and no other site that invokes a plugin `install()` (only result of `grep PluginAPI` across `api/web` returns these two lines plus the class definition in `api/web/plugin.ts:72`).

`install()` runs immediately after Vue/router/pinia are created. The instances are held in a closure; `enable()` is then called only when `mapStore.isLoaded` flips true (`api/web/src/main.ts:84-94`), and `disable()` when it flips false. There is no per-user opt-in gate yet (despite the comment in `plugin.ts:46-48`).

**Consequence for our project**: a plugin is not a published npm package the user installs at runtime. To ship the Caltopo-sync plugin to a CloudTAK deployment, the operator must drop the plugin source into `api/web/plugins/` (e.g. as `caltopo-sync/index.ts` plus supporting files/components) **before** running `npm run build`. There is no "install plugin via UI" path today.

## 2. Build output format — single `.ts` source, host compiles

Because of `import.meta.glob`, the plugin ships as **TypeScript source** that CloudTAK's own Vite build compiles alongside the app. The example confirms this:

```ts
// api/web/plugins/example.ts:1-2
import type { App } from 'vue';
import type { PluginAPI, PluginInstance } from '../plugin.ts';
```

The glob accepts either layout (`api/web/src/main.ts:71`):
- Single-file: `api/web/plugins/<name>.ts`
- Directory: `api/web/plugins/<name>/index.ts` (plus arbitrary sibling `.vue` / `.ts` files — they will only be pulled in via the index's `import`s; the glob itself only matches `index.ts`)

**Externals / peer deps provided by the host** (all available as bare imports because they are real dependencies of `api/web/package.json`): `vue`, `vue-router`, `pinia`, `maplibre-gl`, `dexie`, `rxjs`, `@tabler/icons-vue`, `@tak-ps/vue-tabler`, `@vueuse/core`, `comlink`, `uuid`, plus everything else in `api/web/package.json:31-95`. The plugin should treat all of these as host-provided (do not bundle them).

A useful convenience: `vite.config.ts:36` aliases `'@tak-ps/cloudtak'` to `./plugin.ts`. The package `api/web/package.json:2-15` is published with **types only** (`"types": "./dist/types/plugin.d.ts"`). So from a separate plugin repo you `import type { PluginAPI } from '@tak-ps/cloudtak'` for IDE/typecheck and the host alias resolves the real runtime at host build time.

## 3. Dev workflow — copy/symlink into `api/web/plugins/`

There is no hot-swap registry. Workflow for our separate-repo plugin:

1. Run CloudTAK frontend dev server: `cd api/web && npm run serve` (Vite on port 8080, proxies `/api` to `localhost:5001` — see `api/web/vite.config.ts:53-62`).
2. Symlink (or rsync on save) our plugin into the host's plugin dir:
   `ln -s /Users/paulclifton/dev/cloudtak-plugin-caltopo-sync/src /Users/paulclifton/CloudTAK/api/web/plugins/caltopo-sync`
   The directory's `index.ts` is what the glob picks up.
3. Vite **does** HMR Vue components reached through `import` chains, and it **does** pick up new files matching the glob on dev-server restart, but `import.meta.glob` is resolved once per module-graph build — adding a brand-new `index.ts` may require restarting `vite serve`. Edits inside an already-globbed plugin (changing components, adding new files imported by `index.ts`) hot-reload normally.
4. Devs add `"@tak-ps/cloudtak": "file:../CloudTAK/api/web"` (or git URL) to the plugin repo's `package.json` to satisfy `import type` resolution; the actual runtime always uses host-installed packages.

No service worker dance is needed in dev (`api/web/src/main.ts:34` short-circuits SW recovery when `import.meta.env.DEV`).

## 4. Pinia stores

Only three Pinia stores exist in the app (grep `defineStore` across `api/web/src/stores`):

| Store | File | Useful surface |
|---|---|---|
| `cloudtak` (`useMapStore`) | `api/web/src/stores/map.ts:41` | `.map` (raw MapLibre `mapgl.Map`), `.mission: Subscription \| undefined` (currently-active mission), `.makeActiveMission(sub?)` (`map.ts:291`), `.menu` (the `MenuManager` from `stores/modules/menu.ts`), `.bottomBar`, `.worker` (Comlink remote to the Atlas web worker — exposes `worker.db.breadcrumb.*`, `worker.profile.*`), `.isLoaded` (gates plugin enable), `.callsign`, `.coordFormat`, `.distanceUnit`, `.selected`. |
| `float` (`useFloatStore`) | `api/web/src/stores/float.ts:41` | `panes: Map<uid, Pane>`, `add(pane)`, `delete(uid)`. Already wrapped by `PluginAPI.float` — prefer the wrapper. |
| `permissions` (`usePermissionStore`) | `api/web/src/stores/modules/permissions.ts:22` | Browser permission state (location etc). |

**Missions** and **connections** are NOT Pinia. They are class-based services:
- `api/web/src/base/subscription.ts:48` — `Subscription` class. `Subscription.list({...})` at `subscription.ts:450` fetches `/api/marti/mission`; `Subscription.load(guid, {token})` at `subscription.ts:173` loads/refreshes one mission and caches it in Dexie; instance `.subscriptions()`, `.layerList()`, `.invite()`, `.update()`, `.delete()`. Active mission UID lives on `mapStore.mission.meta.guid`.
- Connections: there is no client class — `MenuConnections.vue:150` uses `server.GET('/api/connection', ...)` (the openapi-fetch client at `api/web/src/std.ts:8`). The plugin can do the same via `import { server, std, stdurl } from '@/std'` (when its file lives inside the host tree) or use `fetch` directly.

**Profile/auth**: `ProfileConfig` at `api/web/src/base/profile.ts:7`. The `Profile` type itself is the OpenAPI-derived shape at `api/web/src/types.ts:138`.

## 5. Plugin settings persistence — use `ProfileConfig`

There is no plugin-specific settings registry, but there is a **first-class per-user key/value store** that the menu manager itself uses:

```ts
// api/web/src/base/profile.ts:38-63
static async get<K extends keyof Profile>(key: K)
async commit(value: Profile[K])
```

`commit` writes both to local Dexie (`db.profile.put`) and `PATCH /api/profile` (`profile.ts:50-62`), so the value round-trips to the server and is per-user. The `Profile` shape is generated from the API spec (`types.ts:138`), so adding a custom key (`caltopo_sync_settings`) would require a server-side schema change — that is heavier than we want.

**Idiomatic alternatives** that match how other features behave:
1. **`localStorage`** — the menu layout pref does exactly this: `localStorage.setItem('cloudtak-menu-layout', mode)` at `api/web/src/stores/modules/menu.ts:321`. Good for non-secret, device-local settings (UI prefs, last-used UI tab).
2. **CloudTAK ETL "Connection" → "Data Sync"** — if we want server-side persistence of (CalTopo MapID ↔ TAK Mission ID) pairs across user devices, the architecturally honest move is to model the Caltopo bridge as an **ETL Connection** (`/api/connection`) and store pair-mappings as that connection's resources. That's exactly the abstraction `/menu/connections` exists for. The plugin then becomes a thin browser UI on top of the server-side connection.
3. **Dexie** — for purely local cached state, write to a new table on `api/web/src/base/database.ts`'s `db`.

For Caltopo credentials specifically: do NOT use `localStorage` (XSS exfiltration risk) — credentials must live server-side. Either an ETL Connection's secrets, or a profile config key added through a server PR. Until that exists, the plugin should ask the user to enter creds into the user's Node-RED instance and only store the Node-RED base URL locally.

## 6. Idiomatic UI placement — top-level menu entry + optional floating pane

Two options exist and both are wired in `PluginAPI`:

- **Menu entry** (`PluginAPI.menu.add` → `plugin.ts:111-122`): appears alongside built-ins listed in `menu.ts:97-250` (Overlays, Data Sync, Connections, etc). Requires a registered route (line 112 checks `this.router.hasRoute(item.route)`). Standard pattern: call `api.routes.add(...)` first (`plugin.ts:147-157`), then `api.menu.add(...)`.
- **Floating pane** (`PluginAPI.float.add` → `plugin.ts:248-286`): the same pane type used by `FloatingVideo.vue` and `FloatingAttachment.vue`. Good for transient panels tied to a mission selection.

**Recommendation for Caltopo-sync**: a **top-level menu entry "Caltopo Sync"** route at `/menu/caltopo-sync` is the right home. The feature manages persistent state (pair list, credentials, history of sync runs) — it is configuration, not a transient mission-attached panel. This matches the pattern of `MenuConnections.vue`, `MenuPackages.vue`, etc. Optionally add a floating pane that opens when an active mission is selected ("Sync this mission to Caltopo MapID …") for one-click triggering, but make that secondary.

## 7. Example — mount a menu entry that opens a settings/sync route

```ts
// plugins/caltopo-sync/index.ts
import type { App } from 'vue';
import { defineAsyncComponent, markRaw } from 'vue';
import type { PluginAPI, PluginInstance, PluginStatic } from '../../plugin.ts';
import { IconRouteAltRight } from '@tabler/icons-vue';

const CaltopoSyncPanel = defineAsyncComponent(
    () => import('./components/CaltopoSyncPanel.vue')
);

export default class CaltopoSyncPlugin implements PluginInstance {
    constructor(private api: PluginAPI) {}

    static async install(_app: App, api: PluginAPI): Promise<PluginInstance> {
        return new CaltopoSyncPlugin(api);
    }

    async enable(): Promise<void> {
        this.api.routes.add({
            path: '/menu/caltopo-sync',
            name: 'home-menu-caltopo-sync',
            component: CaltopoSyncPanel,
        }, 'home-menu'); // parent route name, see api/web/src/router.ts:22

        this.api.menu.add({
            key: 'caltopo-sync',
            label: 'Caltopo Sync',
            route: 'home-menu-caltopo-sync',
            tooltip: 'Caltopo ↔ TAK Mission Sync',
            description: 'Pair Caltopo maps with TAK missions and sync features',
            icon: markRaw(IconRouteAltRight),
        });
    }

    async disable(): Promise<void> {
        this.api.menu.remove('caltopo-sync');
        // routes added via router.addRoute cannot be cleanly removed here;
        // disable just hides the UI entry point.
    }
}

export const _typecheck: PluginStatic = CaltopoSyncPlugin;
```

Supporting types — all from `api/web/plugin.ts`:
- `PluginStatic.install(app, api)` — `plugin.ts:58-67`
- `PluginInstance.enable/disable` — `plugin.ts:44-56`
- `PluginAPI.menu.add(MenuItemConfig)` — `plugin.ts:111`; `MenuItemConfig` shape — `api/web/src/stores/modules/menu.ts:28-40`
- `PluginAPI.routes.add(route, parentName?)` — `plugin.ts:147`
- `PluginAPI.float.add(...)` if a pane is wanted — `plugin.ts:248-286`
