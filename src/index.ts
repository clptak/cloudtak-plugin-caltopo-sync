import type { App } from 'vue';
import { defineAsyncComponent, markRaw } from 'vue';
import type { PluginAPI, PluginInstance, PluginStatic } from '@tak-ps/cloudtak';
import { IconRouteAltRight } from '@tabler/icons-vue';
import { useCaltopoSyncStore } from './stores/plugin-state.ts';

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

        this.api.menu.add({
            key: MENU_KEY,
            label: 'Caltopo Sync',
            route: ROUTE_NAME,
            tooltip: 'Caltopo ↔ TAK Mission Sync',
            description: 'Pair Caltopo maps with TAK missions and sync features',
            icon: markRaw(IconRouteAltRight) as unknown as MenuItemIconType,
        } as MenuItemConfig);
    }

    async disable(): Promise<void> {
        const store = useCaltopoSyncStore(this.api.pinia);
        store.setEnabled(false);
        this.api.menu.remove(MENU_KEY);
    }
}

type MenuItemIconType = NonNullable<Parameters<PluginAPI['menu']['add']>[0]['icon']>;
type MenuItemConfig = Parameters<PluginAPI['menu']['add']>[0];

export const _typecheck: PluginStatic = CaltopoSyncPlugin;
