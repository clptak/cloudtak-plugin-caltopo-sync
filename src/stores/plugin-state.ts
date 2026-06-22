import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { HealthCheck, SyncResult, Pair, CaltopoSettings, PliSettings } from '../types.ts';
import { runSync } from '../api/nodered-client.ts';
import { emptyPliSettings } from '../lib/pli/constants.ts';
import {
    isPliSharing,
    startPliShare,
    stopAllPliShare,
    stopPliShare,
    updatePliShareSettings,
} from '../lib/pli/pli-share-service.ts';

const STORAGE_KEY = 'caltopo-sync-nodered-url';
const CALTOPO_SETTINGS_PREFIX = 'caltopo-sync-caltopo-settings';
const PLI_SETTINGS_PREFIX = 'caltopo-sync-pli-settings';
const PLI_RUNNING_PREFIX = 'caltopo-sync-pli-running';
const AUTO_SYNC_MIN_SECONDS = 30;

function readStoredUrl(): string {
    try {
        return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
        return '';
    }
}

function emptyCaltopoSettings(): CaltopoSettings {
    return { credentialKey: '', credentialId: '', accountId: '' };
}

// Caltopo credentials are scoped per CloudTAK user so that one operator's
// keys never leak to another account sharing the same browser.
function caltopoSettingsKey(username: string): string {
    return `${CALTOPO_SETTINGS_PREFIX}::${username}`;
}

function pliSettingsKey(username: string): string {
    return `${PLI_SETTINGS_PREFIX}::${username}`;
}

function pliRunningKey(username: string): string {
    return `${PLI_RUNNING_PREFIX}::${username}`;
}

export const useCaltopoSyncStore = defineStore('caltopo-sync', () => {
    const noderedUrl = ref<string>(readStoredUrl());
    const lastHealth = ref<HealthCheck | null>(null);
    const lastSyncByPair = ref<Record<number, SyncResult>>({});
    const enabled = ref<boolean>(false);

    // Per-user Caltopo credentials. `caltopoSettingsUser` tracks which CloudTAK
    // username the in-memory `caltopoSettings` belongs to.
    const caltopoSettings = ref<CaltopoSettings>(emptyCaltopoSettings());
    const caltopoSettingsUser = ref<string>('');
    const pliSettings = ref<PliSettings>(emptyPliSettings());
    const pliRunningPairIds = ref<number[]>([]);

    // Per-pair auto-sync: timer + reactive snapshot for the UI.
    // Timer handles live OUTSIDE the reactive ref (Pinia would try to track
    // every interval tick otherwise). Snapshot mirrors enough state for the
    // template: which pairs are running, their interval, in-flight status.
    const autoSyncTimers = new Map<number, ReturnType<typeof setInterval>>();
    const autoSyncIntervalByPair = ref<Record<number, number>>({});
    const autoSyncInFlight = ref<Record<number, boolean>>({});
    const autoSyncLastTickAt = ref<Record<number, number>>({});

    function setNoderedUrl(url: string): void {
        const trimmed = url.trim().replace(/\/+$/, '');
        noderedUrl.value = trimmed;
        try {
            if (trimmed) {
                localStorage.setItem(STORAGE_KEY, trimmed);
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch {
            // localStorage may be unavailable (private mode); state is still in memory
        }
    }

    function setLastHealth(h: HealthCheck | null): void {
        lastHealth.value = h;
    }

    function loadCaltopoSettings(username: string): CaltopoSettings {
        caltopoSettingsUser.value = username;
        try {
            const raw = localStorage.getItem(caltopoSettingsKey(username));
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<CaltopoSettings>;
                caltopoSettings.value = {
                    credentialKey: parsed.credentialKey ?? '',
                    credentialId: parsed.credentialId ?? '',
                    accountId: parsed.accountId ?? '',
                };
            } else {
                caltopoSettings.value = emptyCaltopoSettings();
            }
        } catch {
            caltopoSettings.value = emptyCaltopoSettings();
        }
        return caltopoSettings.value;
    }

    function saveCaltopoSettings(username: string, settings: CaltopoSettings): void {
        caltopoSettingsUser.value = username;
        caltopoSettings.value = { ...settings };
        try {
            localStorage.setItem(caltopoSettingsKey(username), JSON.stringify(caltopoSettings.value));
        } catch {
            // localStorage may be unavailable (private mode); state is still in memory
        }
    }

    function loadPliSettings(username: string): PliSettings {
        try {
            const raw = localStorage.getItem(pliSettingsKey(username));
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<PliSettings>;
                pliSettings.value = {
                    ...emptyPliSettings(),
                    ...parsed,
                    connectKeys: parsed.connectKeys?.length ? parsed.connectKeys : emptyPliSettings().connectKeys,
                    regexLookUp: parsed.regexLookUp ?? emptyPliSettings().regexLookUp,
                    regexRules: parsed.regexRules?.length ? parsed.regexRules : emptyPliSettings().regexRules,
                    callsignLookup: parsed.callsignLookup?.length ? parsed.callsignLookup : emptyPliSettings().callsignLookup,
                    addFilterList: parsed.addFilterList ?? [],
                };
            } else {
                pliSettings.value = emptyPliSettings();
            }
        } catch {
            pliSettings.value = emptyPliSettings();
        }
        updatePliShareSettings(pliSettings.value);
        return pliSettings.value;
    }

    function savePliSettings(username: string, settings: PliSettings): void {
        pliSettings.value = { ...settings };
        updatePliShareSettings(pliSettings.value);
        try {
            localStorage.setItem(pliSettingsKey(username), JSON.stringify(pliSettings.value));
        } catch {
            // ignore
        }
    }

    function loadPliRunningPairIds(username: string): number[] {
        try {
            const raw = localStorage.getItem(pliRunningKey(username));
            if (!raw) return [];
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((n) => typeof n === 'number');
        } catch {
            return [];
        }
    }

    function persistPliRunningPairIds(username: string, ids: number[]): void {
        pliRunningPairIds.value = [...ids];
        try {
            localStorage.setItem(pliRunningKey(username), JSON.stringify(ids));
        } catch {
            // ignore
        }
    }

    function startPliForPair(pair: Pair, username: string): void {
        startPliShare(pair, pliSettings.value);
        if (!pliRunningPairIds.value.includes(pair.id)) {
            persistPliRunningPairIds(username, [...pliRunningPairIds.value, pair.id]);
        }
    }

    function stopPliForPair(pairId: number, username: string): void {
        stopPliShare(pairId);
        persistPliRunningPairIds(
            username,
            pliRunningPairIds.value.filter((id) => id !== pairId),
        );
    }

    function stopAllPli(username: string): void {
        stopAllPliShare();
        persistPliRunningPairIds(username, []);
    }

    function setLastSync(pairId: number, result: SyncResult): void {
        lastSyncByPair.value = { ...lastSyncByPair.value, [pairId]: result };
    }

    function clearLastSync(pairId: number): void {
        const next = { ...lastSyncByPair.value };
        delete next[pairId];
        lastSyncByPair.value = next;
    }

    function setEnabled(value: boolean): void {
        enabled.value = value;
    }

    function isAutoSyncing(pairId: number): boolean {
        return autoSyncTimers.has(pairId);
    }

    function startAutoSync(pair: Pair, intervalSec: number): void {
        if (autoSyncTimers.has(pair.id)) return;
        const interval = Math.max(AUTO_SYNC_MIN_SECONDS, Math.floor(intervalSec) || AUTO_SYNC_MIN_SECONDS);

        autoSyncIntervalByPair.value = { ...autoSyncIntervalByPair.value, [pair.id]: interval };

        const tick = async () => {
            if (autoSyncInFlight.value[pair.id]) return; // skip if previous run still in flight
            autoSyncInFlight.value = { ...autoSyncInFlight.value, [pair.id]: true };
            try {
                const result = await runSync(pair);
                setLastSync(pair.id, result);
                autoSyncLastTickAt.value = { ...autoSyncLastTickAt.value, [pair.id]: Date.now() };
            } catch (err) {
                console.warn(`auto-sync tick failed for pair ${pair.id}`, err);
            } finally {
                autoSyncInFlight.value = { ...autoSyncInFlight.value, [pair.id]: false };
            }
        };

        const timerId = setInterval(tick, interval * 1000);
        autoSyncTimers.set(pair.id, timerId);
    }

    function stopAutoSync(pairId: number): void {
        const t = autoSyncTimers.get(pairId);
        if (t) clearInterval(t);
        autoSyncTimers.delete(pairId);
        const ni = { ...autoSyncIntervalByPair.value }; delete ni[pairId]; autoSyncIntervalByPair.value = ni;
        const nf = { ...autoSyncInFlight.value };       delete nf[pairId]; autoSyncInFlight.value = nf;
        const nl = { ...autoSyncLastTickAt.value };     delete nl[pairId]; autoSyncLastTickAt.value = nl;
    }

    return {
        noderedUrl,
        lastHealth,
        lastSyncByPair,
        enabled,
        caltopoSettings,
        caltopoSettingsUser,
        pliSettings,
        pliRunningPairIds,
        autoSyncIntervalByPair,
        autoSyncInFlight,
        autoSyncLastTickAt,
        setNoderedUrl,
        setLastHealth,
        loadCaltopoSettings,
        saveCaltopoSettings,
        loadPliSettings,
        savePliSettings,
        loadPliRunningPairIds,
        persistPliRunningPairIds,
        startPliForPair,
        stopPliForPair,
        stopAllPli,
        setLastSync,
        clearLastSync,
        setEnabled,
        isAutoSyncing,
        isPliSharing,
        startAutoSync,
        stopAutoSync,
    };
});
