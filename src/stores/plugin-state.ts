import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { HealthCheck, SyncResult, Pair } from '../types.ts';
import { runSync } from '../api/nodered-client.ts';

const STORAGE_KEY = 'caltopo-sync-nodered-url';
const AUTO_SYNC_MIN_SECONDS = 30;

function readStoredUrl(): string {
    try {
        return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
        return '';
    }
}

export const useCaltopoSyncStore = defineStore('caltopo-sync', () => {
    const noderedUrl = ref<string>(readStoredUrl());
    const lastHealth = ref<HealthCheck | null>(null);
    const lastSyncByPair = ref<Record<number, SyncResult>>({});
    const enabled = ref<boolean>(false);

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
        autoSyncIntervalByPair,
        autoSyncInFlight,
        autoSyncLastTickAt,
        setNoderedUrl,
        setLastHealth,
        setLastSync,
        clearLastSync,
        setEnabled,
        isAutoSyncing,
        startAutoSync,
        stopAutoSync,
    };
});
