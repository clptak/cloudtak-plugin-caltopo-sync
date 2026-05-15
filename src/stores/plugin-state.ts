import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { HealthCheck, SyncResult } from '../types.ts';

const STORAGE_KEY = 'caltopo-sync-nodered-url';

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

    return {
        noderedUrl,
        lastHealth,
        lastSyncByPair,
        enabled,
        setNoderedUrl,
        setLastHealth,
        setLastSync,
        clearLastSync,
        setEnabled,
    };
});
