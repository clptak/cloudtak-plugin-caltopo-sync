<template>
    <div class='col-12 py-3'>
        <div class='card'>
            <div class='card-header'>
                <div class='card-title'>
                    Add Pair
                </div>
            </div>
            <div class='card-body'>
                <TablerInlineAlert
                    class='mb-3'
                    severity='warning'
                    title='Warning'
                    description='Caltopo Map Share Setting MUST be set to "URL"'
                />
                <div class='row g-2'>
                    <div class='col-12 col-md-5'>
                        <TablerInput
                            v-model='form.caltopo_map_id'
                            label='Caltopo Map ID'
                            placeholder='e.g. ABCD1'
                        />
                        <div class='text-center text-muted fw-bold my-2'>
                            OR
                        </div>
                        <div class='d-flex align-items-center justify-content-between'>
                            <label class='form-label mb-0'>Caltopo Map (from account)</label>
                            <button
                                type='button'
                                class='btn btn-sm btn-link p-0'
                                :disabled='caltopoMapsLoading'
                                title='Reload maps from the Caltopo account'
                                @click='loadCaltopoMaps'
                            >
                                <IconRefresh
                                    :size='16'
                                    stroke='1'
                                    :class='caltopoMapsLoading ? "spin-animation" : ""'
                                />
                            </button>
                        </div>
                        <select
                            v-model='selectedCaltopoMap'
                            class='form-select'
                            :disabled='caltopoMapsLoading || !caltopoMaps.length'
                            @change='onCaltopoMapSelected'
                        >
                            <option value=''>
                                {{ caltopoMapsLoading
                                    ? 'Loading maps…'
                                    : (caltopoMaps.length ? 'Select a map…' : 'No maps available') }}
                            </option>
                            <option
                                v-for='m in caltopoMaps'
                                :key='m.id'
                                :value='m.id'
                            >
                                {{ m.name }} ({{ m.id }})
                            </option>
                        </select>
                        <TablerAlert
                            v-if='caltopoMapsError'
                            class='mt-2'
                            :err='caltopoMapsError'
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
            <div
                class='card-header cursor-pointer'
                role='button'
                @click='createMapOpen = !createMapOpen'
            >
                <div class='card-title'>
                    Create Caltopo Map
                </div>
                <div class='ms-auto'>
                    <IconChevronDown
                        :size='20'
                        stroke='1'
                        class='create-map-chevron'
                        :class='{ "create-map-chevron-open": createMapOpen }'
                    />
                </div>
            </div>
            <div
                v-show='createMapOpen'
                class='card-body'
            >
                <p>
                    Create a
                    <IconAmbulance
                        :size='18'
                        stroke='1'
                        class='mx-1'
                    />
                    TAK DataSync first and set it as the Active DataSync. This will create a
                    Caltopo Map with the same mission name as your Active DataSync.
                </p>
                <div class='mb-3'>
                    <TablerInput
                        v-model='createMapForm.call_location'
                        label='Call Location:'
                        placeholder='Coordinates for call'
                    />
                </div>
                <div class='mb-3'>
                    <TablerInput
                        v-model='createMapForm.dr_or_activity'
                        label='DR or Activity #:'
                    />
                </div>
                <button
                    type='button'
                    class='btn btn-primary'
                    :disabled='creatingMap || !canCreateMap'
                    @click='createCaltopoMapHandler'
                >
                    <IconMap
                        :size='18'
                        stroke='1'
                    />
                    <span class='ms-2'>{{ creatingMap ? 'Creating…' : 'Create Caltopo Map' }}</span>
                </button>
                <div
                    v-if='!activeMissionName'
                    class='text-muted small mt-2'
                >
                    No Active DataSync — the map will be titled with the DR/Activity number.
                    Set a DataSync as active to title it after the mission instead.
                </div>
                <TablerAlert
                    v-if='createMapError'
                    class='mt-3'
                    :err='createMapError'
                />
                <div
                    v-if='createdMapId'
                    class='alert alert-success mt-3 mb-0'
                >
                    Created Caltopo map
                    <code v-text='createdMapId' />
                    — map ID copied into the Add Pair form above.
                </div>
                <p class='text-muted small mt-3 mb-0'>
                    This creates a map with Map Share settings at URL. Please remember to change it
                    to a higher level of security when the mission is no longer active.
                </p>
            </div>
        </div>

        <div class='card mt-3'>
            <div
                class='card-header cursor-pointer'
                role='button'
                @click='downloadGeojsonOpen = !downloadGeojsonOpen'
            >
                <div class='card-title'>
                    Download Caltopo-friendly GeoJSON File
                </div>
                <div class='ms-auto'>
                    <IconChevronDown
                        :size='20'
                        stroke='1'
                        class='create-map-chevron'
                        :class='{ "create-map-chevron-open": downloadGeojsonOpen }'
                    />
                </div>
            </div>
            <div
                v-show='downloadGeojsonOpen'
                class='card-body'
            >
                <p class='text-muted'>
                    Download a TAK Mission's features as GeoJSON, rewritten for Caltopo:
                    every <code>callsign</code> key becomes <code>title</code>, every
                    <code>remarks</code> key becomes <code>description</code>, and each
                    point's TAK icon is translated to a Caltopo <code>marker-symbol</code>.
                    The file is saved with a <code>.json</code> extension.
                </p>
                <div class='mb-3'>
                    <label class='form-label'>TAK Mission</label>
                    <select
                        v-model='downloadMissionId'
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
                <button
                    type='button'
                    class='btn btn-primary'
                    :disabled='downloadingGeojson || !downloadMissionId'
                    @click='downloadCaltopoGeojson'
                >
                    <IconDownload
                        :size='18'
                        stroke='1'
                    />
                    <span class='ms-2'>{{ downloadingGeojson ? 'Preparing…' : 'Download GeoJSON' }}</span>
                </button>
                <TablerAlert
                    v-if='downloadGeojsonError'
                    class='mt-3'
                    :err='downloadGeojsonError'
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
                                <div class='btn-list justify-content-end align-items-center flex-wrap'>
                                    <button
                                        type='button'
                                        class='btn btn-sm btn-primary'
                                        :disabled='syncingId === pair.id'
                                        @click='syncNow(pair)'
                                    >
                                        <IconRefresh
                                            :size='16'
                                            stroke='1'
                                            :class='syncingId === pair.id ? "spin-animation" : ""'
                                        />
                                        <span
                                            class='ms-1'
                                            v-text='syncingId === pair.id ? "Syncing… (up to 30s)" : "Sync Now"'
                                        />
                                    </button>
                                    <div
                                        v-tooltip='`Auto-sync every N seconds (min ${AUTO_SYNC_MIN_SECONDS}s). Skips ticks while a previous run is still in flight.`'
                                        class='input-group input-group-sm'
                                        style='width: 180px'
                                    >
                                        <span class='input-group-text'>Every</span>
                                        <input
                                            type='number'
                                            class='form-control'
                                            :min='AUTO_SYNC_MIN_SECONDS'
                                            step='5'
                                            :value='intervalDraft[pair.id] ?? store.autoSyncIntervalByPair[pair.id] ?? AUTO_SYNC_MIN_SECONDS'
                                            :disabled='store.isAutoSyncing(pair.id)'
                                            @input='onIntervalInput(pair.id, ($event.target as HTMLInputElement).value)'
                                        >
                                        <span class='input-group-text'>s</span>
                                        <button
                                            v-if='!store.isAutoSyncing(pair.id)'
                                            type='button'
                                            class='btn btn-success'
                                            @click='startAuto(pair)'
                                        >
                                            <IconPlayerPlay
                                                :size='14'
                                                stroke='1'
                                            />
                                            <span class='ms-1'>Start</span>
                                        </button>
                                        <button
                                            v-else
                                            type='button'
                                            class='btn btn-warning'
                                            @click='store.stopAutoSync(pair.id)'
                                        >
                                            <IconPlayerStop
                                                :size='14'
                                                stroke='1'
                                            />
                                            <span class='ms-1'>Stop</span>
                                        </button>
                                    </div>
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
                                <div
                                    v-if='store.isAutoSyncing(pair.id)'
                                    class='text-muted small mt-1'
                                >
                                    <IconRefresh
                                        :size='12'
                                        stroke='1'
                                        :class='store.autoSyncInFlight[pair.id] ? "spin-animation" : ""'
                                    />
                                    <span
                                        class='ms-1'
                                        v-text='store.autoSyncInFlight[pair.id] ? "syncing now…" : "auto-sync running"'
                                    />
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
    TablerInlineAlert,
} from '@tak-ps/vue-tabler';
import {
    IconPlus,
    IconRefresh,
    IconTrash,
    IconPlayerPlay,
    IconPlayerStop,
    IconChevronDown,
    IconAmbulance,
    IconMap,
    IconDownload,
} from '@tabler/icons-vue';
import Subscription from '../../../../src/base/subscription.ts';
import type { Mission, MissionLayerList } from '../../../../src/types.ts';
import { std, stdurl } from '../../../../src/std.ts';
import { useMapStore } from '../../../../src/stores/map.ts';
import ProfileConfig from '../../../../src/base/profile.ts';
import { renameKeysDeep } from '../lib/geojson.ts';
import { applyCaltopoMarkerSymbols } from '../lib/icons.ts';
import { useCaltopoSyncStore } from '../stores/plugin-state.ts';
import {
    listPairs,
    createPair,
    deletePair,
    runSync,
} from '../api/nodered-client.ts';
import { buildCreateMapBody, createCaltopoMap, listCaltopoMaps } from '../api/caltopo-client.ts';
import { parseCoordinates } from '../lib/coordinates.ts';
import type { Pair, SyncResult, CaltopoMapOption } from '../types.ts';
import SyncResultDialog from './SyncResultDialog.vue';

const store = useCaltopoSyncStore();
const mapStore = useMapStore();

const pairs = ref<Pair[]>([]);
const pairsLoading = ref(false);
const listError = ref<Error | undefined>();

const missions = ref<Mission[]>([]);
const missionsLoading = ref(false);

// Populated from the Caltopo account (Settings → Caltopo Settings) via the
// account-data endpoint (GET /api/v1/acct/{teamId}/since/0) through the proxy.
const caltopoMaps = ref<CaltopoMapOption[]>([]);
const caltopoMapsLoading = ref(false);
const caltopoMapsError = ref<Error | undefined>();
const selectedCaltopoMap = ref<string>('');

function onCaltopoMapSelected() {
    if (selectedCaltopoMap.value) {
        form.value.caltopo_map_id = selectedCaltopoMap.value;
    }
}

// Loads the CollaborativeMaps in the configured team/account so the user can
// pick one instead of pasting a map id. Silently no-ops when credentials are
// not yet filled in (a fresh visit before Settings are saved).
async function loadCaltopoMaps() {
    caltopoMapsError.value = undefined;
    const username = await resolveUsername();
    const creds = store.loadCaltopoSettings(username);
    if (!creds.credentialId.trim() || !creds.credentialKey.trim() || !creds.accountId.trim()) {
        caltopoMaps.value = [];
        return;
    }

    caltopoMapsLoading.value = true;
    try {
        caltopoMaps.value = await listCaltopoMaps({
            accountId: creds.accountId.trim(),
            credentialId: creds.credentialId.trim(),
            credentialKey: creds.credentialKey.trim(),
        });
    } catch (err) {
        caltopoMapsError.value = err instanceof Error ? err : new Error(String(err));
        caltopoMaps.value = [];
    } finally {
        caltopoMapsLoading.value = false;
    }
}

// "Create Caltopo Map" accordion — collapsed by default. Builds the map-create
// body from the entered coordinates + DR/Activity number, signs it, and POSTs
// directly to CalTopo using the credentials saved in Settings.
const createMapOpen = ref(false);
const creatingMap = ref(false);
const createMapForm = ref<{ call_location: string; dr_or_activity: string }>({
    call_location: '',
    dr_or_activity: '',
});
const createMapError = ref<Error | undefined>();
const createdMapId = ref<string>('');

// The map is titled after the Active DataSync; require one to be active.
const activeMissionName = computed<string>(() => mapStore.mission?.meta.name ?? '');

const canCreateMap = computed<boolean>(() => {
    return createMapForm.value.call_location.trim() !== ''
        && createMapForm.value.dr_or_activity.trim() !== '';
});

async function resolveUsername(): Promise<string> {
    try {
        const cfg = await ProfileConfig.get('username');
        if (cfg && cfg.value) return String(cfg.value);
    } catch {
        // ignore; fall through to network fetch
    }
    try {
        const profile = await ProfileConfig.fetch();
        if (profile && profile.username) return String(profile.username);
    } catch {
        // ignore; no username available
    }
    return '';
}

async function createCaltopoMapHandler() {
    createMapError.value = undefined;
    createdMapId.value = '';

    // Prefer the Active DataSync name for the map title; fall back to the
    // DR/Activity number so creation still works when none is active.
    const missionName = activeMissionName.value || createMapForm.value.dr_or_activity.trim();

    // PairManager doesn't load credentials on mount — pull the per-user
    // settings now so a fresh visit to this tab still has them.
    const username = await resolveUsername();
    const creds = store.loadCaltopoSettings(username);
    if (!creds.credentialId.trim() || !creds.credentialKey.trim() || !creds.accountId.trim()) {
        createMapError.value = new Error('Caltopo credentials are incomplete. Fill them in the Settings tab.');
        return;
    }

    let lat: number;
    let lon: number;
    try {
        const parsed = parseCoordinates({ coordinates: createMapForm.value.call_location.trim() });
        lat = parsed.lat;
        lon = parsed.lon;
    } catch (err) {
        createMapError.value = err instanceof Error ? err : new Error(String(err));
        return;
    }

    creatingMap.value = true;
    try {
        const payload = buildCreateMapBody({
            missionName,
            drOrActivity: createMapForm.value.dr_or_activity.trim(),
            lat,
            lon,
        });
        const result = await createCaltopoMap({
            accountId: creds.accountId.trim(),
            credentialId: creds.credentialId.trim(),
            credentialKey: creds.credentialKey.trim(),
            payload,
        });
        createdMapId.value = result.id;
        // Pre-fill the Add Pair form with the freshly created map id.
        form.value.caltopo_map_id = result.id;
        // Surface the new map in the account picker too.
        void loadCaltopoMaps();
    } catch (err) {
        createMapError.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        creatingMap.value = false;
    }
}

// "Download Caltopo-friendly GeoJSON File" accordion — collapsed by default.
// Pulls a TAK mission's features and rewrites property keys so Caltopo accepts
// them (callsign -> title, remarks -> description), then saves a .json file.
const downloadGeojsonOpen = ref(false);
const downloadMissionId = ref<string>('');
const downloadingGeojson = ref(false);
const downloadGeojsonError = ref<Error | undefined>();

async function downloadCaltopoGeojson() {
    downloadGeojsonError.value = undefined;
    if (!downloadMissionId.value) return;

    downloadingGeojson.value = true;
    try {
        // Raw mission GeoJSON; the bearer token is attached by std() automatically.
        const url = stdurl(`/api/marti/missions/${encodeURIComponent(downloadMissionId.value)}/cot`);
        const collection = await std(url) as Record<string, unknown>;

        const transformed = renameKeysDeep(collection, {
            callsign: 'title',
            remarks: 'description',
        });

        // Look up each TAK icon and stamp the Caltopo marker-symbol before download.
        applyCaltopoMarkerSymbols(transformed);

        const mission = missions.value.find((m: Mission) => m.guid === downloadMissionId.value);
        const baseName = (mission?.name || 'mission').replace(/[^\w.-]+/g, '_');
        triggerJsonDownload(transformed, `${baseName}.json`);
    } catch (err) {
        downloadGeojsonError.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        downloadingGeojson.value = false;
    }
}

function triggerJsonDownload(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const href = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(href);
}

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

const AUTO_SYNC_MIN_SECONDS = 30;
const intervalDraft = ref<Record<number, number>>({});

function onIntervalInput(pairId: number, raw: string) {
    const n = parseInt(raw, 10);
    intervalDraft.value = {
        ...intervalDraft.value,
        [pairId]: Number.isFinite(n) ? n : AUTO_SYNC_MIN_SECONDS,
    };
}

function startAuto(pair: Pair) {
    const candidate = intervalDraft.value[pair.id] ?? store.autoSyncIntervalByPair[pair.id] ?? AUTO_SYNC_MIN_SECONDS;
    const interval = Math.max(AUTO_SYNC_MIN_SECONDS, Math.floor(candidate));
    if (interval !== candidate) {
        intervalDraft.value = { ...intervalDraft.value, [pair.id]: interval };
    }
    store.startAutoSync(pair, interval);
}

const canSubmit = computed(() => {
    return form.value.caltopo_map_id.trim() !== '' && form.value.tak_mission_id !== '';
});

onMounted(async () => {
    await Promise.all([fetchPairs(), fetchMissions(), loadCaltopoMaps()]);
});

function missionName(guid: string): string {
    const m = missions.value.find((mm: Mission) => mm.guid === guid);
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
        const data = await listPairs();
        // Defensive: if the bridge returns a malformed body (e.g. a single
        // object instead of an array) don't propagate the bad shape into a
        // template render — surface as an error and keep pairs as []
        if (!Array.isArray(data)) {
            throw new Error(
                'Node-RED /sync/pairs returned a non-array body. ' +
                'Run nodered/scripts/sync-bridge-functions.py against your live ' +
                'flows.json and restart Node-RED.'
            );
        }
        pairs.value = data;
    } catch (err) {
        listError.value = err instanceof Error ? err : new Error(String(err));
        pairs.value = [];
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
        pairs.value = [...(Array.isArray(pairs.value) ? pairs.value : []), created];
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
        store.stopAutoSync(pair.id);
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
        const existing = list.data.find((l: { name: string; uid: string }) => l.name === name);
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
        const existing = list.data.find((l: { name: string; uid: string }) => l.name === name);
        if (!existing) return;
        await sub.layerDelete(existing.uid);
    } catch (err) {
        console.warn('Failed to remove MissionLayer', err);
    }
}

</script>

<style scoped>
.spin-animation {
    animation: caltopo-sync-spin 1s linear infinite;
}
@keyframes caltopo-sync-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
.create-map-chevron {
    transition: transform 0.2s ease-out;
}
.create-map-chevron-open {
    transform: rotate(180deg);
}
</style>
