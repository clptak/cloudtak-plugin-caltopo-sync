import { markRaw } from 'vue';
import type { PluginAPI } from '../../../../plugin.ts';
import { useFloatStore } from '../../../../src/stores/float.ts';
import { isPopoutOpen, focusPopout } from './popout.ts';

export const PANE_UID = 'caltopo-sync';

type HostFloatComponent = Parameters<ReturnType<typeof useFloatStore>['add']>[0]['component'];

export type PaneGeometry = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export const DEFAULT_GEOMETRY: PaneGeometry = {
    width: 980,
    height: 640,
    x: 80,
    y: 60,
};

let api: PluginAPI | null = null;
let shellComponent: HostFloatComponent | null = null;
let savedGeometry: PaneGeometry | null = null;
let minimized = false;

export function bindFloatPane(opts: {
    api: PluginAPI;
    shell: HostFloatComponent;
}): void {
    api = opts.api;
    shellComponent = opts.shell;
}

export function isMinimized(): boolean {
    return minimized;
}

function requireApi(): PluginAPI {
    if (!api) throw new Error('floatPane not bound');
    return api;
}

function readGeometry(): PaneGeometry {
    const pluginApi = requireApi();
    const pane = useFloatStore(pluginApi.pinia).panes.get(PANE_UID);
    if (!pane) return { ...(savedGeometry ?? DEFAULT_GEOMETRY) };
    return {
        x: pane.x,
        y: pane.y,
        width: pane.width,
        height: pane.height,
    };
}

function showFloat(geometry: PaneGeometry): void {
    const pluginApi = requireApi();
    if (!shellComponent) {
        throw new Error('floatPane shell not configured');
    }
    // Use the float store directly (not api.float.add) so we can supply a custom
    // FloatingPane shell — api.float always wraps FloatingGeneric.
    useFloatStore(pluginApi.pinia).add({
        uid: PANE_UID,
        name: 'Caltopo Sync',
        component: markRaw(shellComponent),
        width: geometry.width,
        height: geometry.height,
        x: geometry.x,
        y: geometry.y,
    });
}

/**
 * Open the desktop float, or restore it if currently minimized.
 * No-op if the float is already visible.
 * When the popout window is open, focus it instead.
 */
export function openDesktopPane(): void {
    const pluginApi = requireApi();
    if (isPopoutOpen()) {
        focusPopout();
        return;
    }
    if (minimized) {
        minimized = false;
        if (!pluginApi.float.has(PANE_UID)) {
            showFloat(savedGeometry ?? DEFAULT_GEOMETRY);
        }
        return;
    }
    if (pluginApi.float.has(PANE_UID)) return;
    showFloat(savedGeometry ?? DEFAULT_GEOMETRY);
}

export function minimizeDesktopPane(): void {
    const pluginApi = requireApi();
    // Prefer the float store directly (same path as showFloat) so remove is
    // consistent even if the PluginAPI float proxy was created against a
    // different store timing.
    const floatStore = useFloatStore(pluginApi.pinia);
    if (!floatStore.panes.has(PANE_UID) || minimized) {
        minimized = true;
        return;
    }

    savedGeometry = readGeometry();
    floatStore.delete(PANE_UID);
    minimized = true;
}

export function cleanupFloatPane(): void {
    minimized = false;
    if (api?.float.has(PANE_UID)) {
        api.float.remove(PANE_UID);
    }
}
