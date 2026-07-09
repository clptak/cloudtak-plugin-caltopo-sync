import type { App } from 'vue';
import { defineAsyncComponent, markRaw } from 'vue';
import type { PluginAPI, PluginInstance, PluginStatic } from '../../../plugin.ts';
import SartopoCloudtakIcon from './components/SartopoCloudtakIcon.vue';
import { useCaltopoSyncStore } from './stores/plugin-state.ts';
import { configurePliRuntime, stopAllPliShare } from './lib/pli/pli-share-service.ts';
import { useMapStore } from '../../../src/stores/map.ts';

const MenuCaltopoSync = defineAsyncComponent(
    () => import('./components/MenuCaltopoSync.vue'),
);

const MENU_KEY = 'caltopo-sync';
const ROUTE_NAME = 'home-menu-caltopo-sync';
const ROUTE_PATH = 'caltopo-sync';

export default class CaltopoSyncPlugin implements PluginInstance {
    api: PluginAPI;

    constructor(api: PluginAPI) {
        this.api = api;
    }

    static async install(_app: App, api: PluginAPI): Promise<PluginInstance> {
        api.routes.add({
            path: ROUTE_PATH,
            name: ROUTE_NAME,
            component: MenuCaltopoSync,
        }, 'home-menu');

        return new CaltopoSyncPlugin(api);
    }

    async enable(): Promise<void> {
        const store = useCaltopoSyncStore(this.api.pinia);
        store.setEnabled(true);

        const mapStore = useMapStore(this.api.pinia);
        configurePliRuntime({
            getAtlasWorker: async () => mapStore.worker,
        });

        this.api.menu.add({
            key: MENU_KEY,
            label: 'Caltopo Sync',
            route: ROUTE_NAME,
            tooltip: 'Caltopo ↔ TAK Mission Sync',
            description: 'Pair Caltopo maps with TAK missions and sync features',
            icon: markRaw(SartopoCloudtakIcon) as unknown as MenuItemIconType,
        } as MenuItemConfig);
    }

    async disable(): Promise<void> {
        const store = useCaltopoSyncStore(this.api.pinia);
        store.setEnabled(false);
        stopAllPliShare();
        this.api.menu.remove(MENU_KEY);
    }
}

type MenuItemIconType = NonNullable<Parameters<PluginAPI['menu']['add']>[0]['icon']>;
type MenuItemConfig = Parameters<PluginAPI['menu']['add']>[0];

export const _typecheck = CaltopoSyncPlugin as unknown as PluginStatic;
