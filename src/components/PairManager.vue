<template>
    <div class='col-12 py-3'>
        <div class='card'>
            <div class='card-header'>
                <div class='card-title'>
                    Add Pair
                </div>
            </div>
            <div class='card-body'>
                <div class='row g-2'>
                    <div class='col-12 col-md-5'>
                        <TablerInput
                            v-model='form.caltopo_map_id'
                            label='Caltopo Map ID'
                            placeholder='e.g. ABCD1'
                        />
                    </div>
                    <div class='col-12 col-md-5'>
                        <label class='form-label'>TAK Mission</label>
                        <select
                            v-model='form.tak_mission_id'
                            class='form-select'
                            :disabled='missionsLoading'
                        >
                            <option value=''>
                                {{ missionsLoading ? 'Loading missions…' : 'Select a mission…' }}
                            </option>
                            <option
                                v-for='m in missions'
                                :key='m.guid'
                                :value='m.guid'
                            >
                                {{ m.name }}
                            </option>
                        </select>
                    </div>
                    <div class='col-12 col-md-2 d-flex align-items-end'>
                        <button
                            type='button'
                            class='btn btn-primary w-100'
                            :disabled='!canSubmit || saving'
                            @click='submit'
                        >
                            <IconPlus
                                :size='18'
                                stroke='1'
                            />
                            <span class='ms-1'>Add</span>
                        </button>
                    </div>
                </div>
                <div class='mt-2'>
                    <TablerInput
                        v-model='form.label'
                        label='Label (optional)'
                        placeholder='Friendly name'
                    />
                </div>
                <TablerAlert
                    v-if='formError'
                    class='mt-3'
                    :err='formError'
                />
            </div>
        </div>

        <div class='card mt-3'>
            <div class='card-header d-flex align-items-center'>
                <div class='card-title'>
                    Pairs
                </div>
                <div class='ms-auto'>
                    <TablerRefreshButton
                        :loading='pairsLoading'
                        @click='fetchPairs'
                    />
                </div>
            </div>
            <TablerLoading
                v-if='pairsLoading'
                :compact='true'
            />
            <TablerAlert
                v-else-if='listError'
                :err='listError'
            />
            <TablerNone
                v-else-if='!pairs.length'
                label='No Pairs'
                :create='false'
            />
            <div
                v-else
                class='table-responsive'
            >
                <table class='table card-table table-vcenter'>
                    <thead>
                        <tr>
                            <th>Label</th>
                            <th>Caltopo Map</th>
                            <th>TAK Mission</th>
                            <th>Last Sync</th>
                            <th class='text-end'>
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for='pair in pairs'
                            :key='pair.id'
                        >
                            <td v-text='pair.label || "—"' />
                            <td>
                                <code v-text='pair.caltopo_map_id' />
                            </td>
                            <td>
                                <span v-text='missionName(pair.tak_mission_id)' />
                            </td>
                            <td>
                                <span
                                    v-if='pair.last_sync_at'
                                    v-text='formatTime(pair.last_sync_at)'
                                />
                                <span
                                    v-else
                                    class='text-muted'
                                >Never</span>
                            </td>
                            <td class='text-end'>
                                <div class='btn-list justify-content-end'>
                                    <button
                                        type='button'
                                        class='btn btn-sm btn-primary'
                                        :disabled='syncingId === pair.id'
                                        @click='syncNow(pair)'
                                    >
                                        <IconRefresh
                                            :size='16'
                                            stroke='1'
                                        />
                                        <span class='ms-1'>Sync Now</span>
                                    </button>
                                    <button
                                        type='button'
                                        class='btn btn-sm btn-outline-danger'
                                        :disabled='deletingId === pair.id'
                                        @click='remove(pair)'
                                    >
                                        <IconTrash
                                            :size='16'
                                            stroke='1'
                                        />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <SyncResultDialog
            v-if='dialogResult'
            :result='dialogResult'
            @close='dialogResult = null'
        />
    </div>
</template>

<script setup lang='ts'>
import { ref, computed, onMounted } from 'vue';
import {
    TablerInput,
    TablerAlert,
    TablerLoading,
    TablerNone,
    TablerRefreshButton,
} from '@tak-ps/vue-tabler';
import {
    IconPlus,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-vue';
import Subscription from '../../../src/base/subscription.ts';
import type { Mission, MissionLayerList } from '../../../src/types.ts';
import { useCaltopoSyncStore } from '../stores/plugin-state.ts';
import {
    listPairs,
    createPair,
    deletePair,
    runSync,
} from '../api/nodered-client.ts';
import type { Pair, SyncResult } from '../types.ts';
import SyncResultDialog from './SyncResultDialog.vue';

const store = useCaltopoSyncStore();

const pairs = ref<Pair[]>([]);
const pairsLoading = ref(false);
const listError = ref<Error | undefined>();

const missions = ref<Mission[]>([]);
const missionsLoading = ref(false);

const form = ref<{ caltopo_map_id: string; tak_mission_id: string; label: string }>({
    caltopo_map_id: '',
    tak_mission_id: '',
    label: '',
});
const saving = ref(false);
const formError = ref<Error | undefined>();

const syncingId = ref<number | null>(null);
const deletingId = ref<number | null>(null);
const dialogResult = ref<SyncResult | null>(null);

const canSubmit = computed(() => {
    return form.value.caltopo_map_id.trim() !== '' && form.value.tak_mission_id !== '';
});

onMounted(async () => {
    await Promise.all([fetchPairs(), fetchMissions()]);
});

function missionName(guid: string): string {
    const m = missions.value.find((mm) => mm.guid === guid);
    return m ? m.name : guid;
}

function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

async function fetchPairs() {
    pairsLoading.value = true;
    listError.value = undefined;
    try {
        pairs.value = await listPairs();
    } catch (err) {
        listError.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        pairsLoading.value = false;
    }
}

async function fetchMissions() {
    missionsLoading.value = true;
    try {
        const list = await Subscription.list();
        missions.value = list.items;
    } catch (err) {
        console.warn('Failed to load mission list', err);
    } finally {
        missionsLoading.value = false;
    }
}

async function submit() {
    if (!canSubmit.value) return;
    saving.value = true;
    formError.value = undefined;
    try {
        const created = await createPair({
            caltopo_map_id: form.value.caltopo_map_id.trim(),
            tak_mission_id: form.value.tak_mission_id,
            label: form.value.label.trim() || undefined,
        });
        pairs.value = [...pairs.value, created];
        form.value = { caltopo_map_id: '', tak_mission_id: '', label: '' };
    } catch (err) {
        formError.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        saving.value = false;
    }
}

async function syncNow(pair: Pair) {
    syncingId.value = pair.id;
    try {
        const result = await runSync(pair);
        store.setLastSync(pair.id, result);
        dialogResult.value = result;

        const isFirstSync = !pair.last_sync_at;
        if (isFirstSync && result.errors.length === 0) {
            await ensureMissionLayer(pair);
        }

        await fetchPairs();
    } catch (err) {
        dialogResult.value = null;
        listError.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        syncingId.value = null;
    }
}

async function remove(pair: Pair) {
    if (!confirm(`Delete pair ${pair.label || pair.caltopo_map_id}?`)) return;
    deletingId.value = pair.id;
    try {
        await removeMissionLayer(pair);
        await deletePair(pair.id);
        store.clearLastSync(pair.id);
        pairs.value = pairs.value.filter((p) => p.id !== pair.id);
    } catch (err) {
        listError.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        deletingId.value = null;
    }
}

async function loadSubscription(guid: string): Promise<Subscription | undefined> {
    const token = localStorage.token;
    if (!token) return undefined;
    try {
        return await Subscription.load(guid, { token, reload: false });
    } catch (err) {
        console.warn('Failed to load subscription for layer management', err);
        return undefined;
    }
}

async function ensureMissionLayer(pair: Pair): Promise<void> {
    const sub = await loadSubscription(pair.tak_mission_id);
    if (!sub) return;
    const name = `Caltopo: ${pair.caltopo_map_id}`;
    try {
        const list = await sub.layerList() as MissionLayerList;
        const existing = list.data.find((l) => l.name === name);
        if (existing) return;
        await sub.layerCreate({ name, type: 'UID' });
    } catch (err) {
        console.warn('Failed to ensure MissionLayer', err);
    }
}

async function removeMissionLayer(pair: Pair): Promise<void> {
    const sub = await loadSubscription(pair.tak_mission_id);
    if (!sub) return;
    const name = `Caltopo: ${pair.caltopo_map_id}`;
    try {
        const list = await sub.layerList() as MissionLayerList;
        const existing = list.data.find((l) => l.name === name);
        if (!existing) return;
        await sub.layerDelete(existing.uid);
    } catch (err) {
        console.warn('Failed to remove MissionLayer', err);
    }
}

</script>
