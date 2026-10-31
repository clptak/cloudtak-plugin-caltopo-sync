import type { App } from 'vue';
import { defineAsyncComponent, defineComponent, h, markRaw, onMounted } from 'vue';
import type { PluginAPI, PluginInstance, PluginStatic } from '../../../plugin.ts';
import { useAppStore } from '../../../src/stores/app.ts';
import SartopoCloudtakIcon from './components/SartopoCloudtakIcon.vue';
import { bindFloatPane, cleanupFloatPane, openDesktopPane } from './lib/floatPane.ts';
import { bindPopout, closePopout } from './lib/popout.ts';
import { registerIncidentProvider, unregisterIncidentProvider } from './lib/incidentProvider.ts';

const CaltopoSyncFloatShell = defineAsyncComponent(
    () => import('./components/CaltopoSyncFloatShell.vue'),
);
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
        return new CaltopoSyncPlugin(api);
    }

    async enable(): Promise<void> {
        const api = this.api;
        registerIncidentProvider(api.pinia);
        bindPopout(api);
        bindFloatPane({
            api,
            shell: CaltopoSyncFloatShell as unknown as HostFloatComponent,
        });

        api.routes.add({
            path: ROUTE_PATH,
            name: ROUTE_NAME,
            component: defineComponent({
                name: 'CaltopoSyncEntry',
                setup() {
                    const appStore = useAppStore(api.pinia);
                    onMounted(() => {
                        if (!appStore.isMobileDetected) {
                            openDesktopPane();
                            void api.router.replace({ name: 'home' });
                        }
                    });
                    return () => {
                        if (appStore.isMobileDetected) {
                            return h(MenuCaltopoSync);
                        }
                        return null;
                    };
                },
            }),
        }, 'home-menu');

        api.menu.add({
            key: MENU_KEY,
            label: 'Caltopo Sync',
            route: ROUTE_NAME,
            tooltip: 'Caltopo ↔ TAK Mission Sync',
            description: 'Pair Caltopo maps with TAK missions and sync features',
            icon: markRaw(SartopoCloudtakIcon) as unknown as MenuItemIconType,
        } as MenuItemConfig);
    }

    async disable(): Promise<void> {
        unregisterIncidentProvider();
        closePopout();
        cleanupFloatPane();
        this.api.menu.remove(MENU_KEY);
        if (this.api.router.hasRoute(ROUTE_NAME)) {
            this.api.router.removeRoute(ROUTE_NAME);
        }
    }
}

type MenuItemIconType = NonNullable<Parameters<PluginAPI['menu']['add']>[0]['icon']>;
type MenuItemConfig = Parameters<PluginAPI['menu']['add']>[0];
type HostFloatComponent = Parameters<PluginAPI['float']['add']>[0]['component'];

export const _typecheck = CaltopoSyncPlugin as unknown as PluginStatic;
