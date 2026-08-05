<template>
    <div class='caltopo-sync-panel px-3 py-3'>
        <div class='d-flex align-items-center gap-2 mb-3'>
            <TablerIconButton
                class='ms-auto'
                title='Settings'
                @click='settingsOpen = true'
            >
                <IconSettings
                    :size='22'
                    stroke='1.5'
                />
            </TablerIconButton>
        </div>

        <TablerBorder
            class='cloudtak-accent text-white'
            :fill-height='false'
            :shadow='false'
            gap='sm'
        >
            <template #label>
                <p class='text-uppercase text-white-50 small mb-0'>
                    Add Pair
                </p>
            </template>

            <TablerInlineAlert
                v-if='caltopoCredsIncomplete'
                class='mb-2'
                severity='info'
                title='Caltopo credentials missing'
                description='Add your Caltopo credentials under Settings (gear icon).'
            />
            <TablerInlineAlert
                class='mb-2'
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
                    <div class='d-flex align-items-center justify-content-between mb-1'>
                        <span class='small text-white-50'>Caltopo Map (from account)</span>
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
                    <TablerEnum
                        v-model='selectedCaltopoMapLabel'
                        label='Caltopo Map'
                        :options='caltopoMapEnumOptions'
                        :disabled='caltopoMapsLoading || !caltopoMaps.length'
                    />
                    <TablerAlert
                        v-if='caltopoMapsError'
                        class='mt-2'
                        :err='caltopoMapsError'
                    />
                </div>
                <div class='col-12 col-md-5'>
                    <TablerEnum
                        v-model='selectedMissionLabel'
                        label='TAK Mission'
                        :options='missionEnumOptions'
                        :disabled='missionsLoading'
                    />
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
                <TablerEnum
                    v-model='syncModeLabel'
                    label='Sync Mode'
                    :options='syncModeEnumOptions'
                    :description='syncModeHint(form.sync_mode)'
                />
            </div>
            <div class='mt-2'>
                <TablerInput
                    v-model='form.label'
                    label='Label (optional)'
                    placeholder='Friendly name'
                />
            </div>
            <div class='mt-3 cloudtak-accent border rounded-3 text-white px-2 py-2'>
                <TablerToggle
                    v-model='form.share_pli'
                    label='Share PLI'
                />
                <div
                    v-if='form.share_pli'
                    class='mt-2'
                >
                    <TablerEnum
                        v-model='pliConnectKeyLabel'
                        label='Fallback CalTopo Connect Key'
                        :options='pliConnectKeyEnumOptions'
                    />
                    <TablerInput
                        v-model='form.pli_interval_sec'
                        class='mt-2'
                        label='CalTopo→TAK Poll Interval (seconds)'
                        type='number'
                    />
                    <small class='text-muted d-block mt-1'>
                        TAK→CalTopo follows live map PLI. Configure connect keys and regex routing in Settings.
                    </small>
                </div>
            </div>
            <TablerAlert
                v-if='formError'
                class='mt-3'
                :err='formError'
            />
        </TablerBorder>

        <TablerBorder
            class='cloudtak-accent text-white mt-3'
            :fill-height='false'
            :shadow='false'
            gap='sm'
        >
            <template #label>
                <div
                    class='d-flex align-items-center w-100 cursor-pointer'
                    role='button'
                    @click='createMapOpen = !createMapOpen'
                >
                    <p class='text-uppercase text-white-50 small mb-0'>
                        Create Caltopo Map
                    </p>
                    <IconChevronDown
                        :size='20'
                        stroke='1'
                        class='ms-auto create-map-chevron'
                        :class='{ "create-map-chevron-open": createMapOpen }'
                    />
                </div>
            </template>

            <div v-show='createMapOpen'>
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
                <div class='row g-2'>
                    <div class='col-12'>
                        <TablerInput
                            v-model='createMapForm.call_location'
                            label='Call Location'
                            placeholder='Coordinates for call'
                        />
                    </div>
                    <div class='col-12'>
                        <TablerInput
                            v-model='createMapForm.dr_or_activity'
                            label='DR or Activity #'
                        />
                    </div>
                    <div class='col-12'>
                        <button
                            type='button'
                            class='btn btn-primary w-100'
                            :disabled='creatingMap || !canCreateMap'
                            @click='createCaltopoMapHandler'
                        >
                            <IconMap
                                :size='18'
                                stroke='1'
                            />
                            <span class='ms-2'>{{ creatingMap ? 'Creating…' : 'Create Caltopo Map' }}</span>
                        </button>
                    </div>
                </div>
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
                <TablerInlineAlert
                    v-if='createdMapId'
                    class='mt-3'
                    severity='success'
                    title='Map Created'
                    :description='`Created Caltopo map ${createdMapId} — map ID copied into the Add Pair form above.`'
                />
                <p class='text-muted small mt-3 mb-0'>
                    This creates a map with Map Share settings at URL. Please remember to change it
                    to a higher level of security when the mission is no longer active.
                </p>
            </div>
        </TablerBorder>

        <TablerBorder
            class='cloudtak-accent text-white mt-3'
            :fill-height='false'
            :shadow='false'
            gap='sm'
        >
            <template #label>
                <div
                    class='d-flex align-items-center w-100 cursor-pointer'
                    role='button'
                    @click='downloadGeojsonOpen = !downloadGeojsonOpen'
                >
                    <p class='text-uppercase text-white-50 small mb-0'>
                        Download Caltopo-Friendly GeoJSON File
                    </p>
                    <IconChevronDown
                        :size='20'
                        stroke='1'
                        class='ms-auto create-map-chevron'
                        :class='{ "create-map-chevron-open": downloadGeojsonOpen }'
                    />
                </div>
            </template>

            <div v-show='downloadGeojsonOpen'>
                <p class='text-muted'>
                    Download a TAK Mission's features as GeoJSON, rewritten for Caltopo:
                    every <code>callsign</code> key becomes <code>title</code>, every
                    <code>remarks</code> key becomes <code>description</code>, and each
                    point's TAK icon is translated to a Caltopo <code>marker-symbol</code>.
                    The file is saved with a <code>.json</code> extension.
                </p>
                <div class='row g-2'>
                    <div class='col-12'>
                        <TablerEnum
                            v-model='downloadMissionLabel'
                            label='TAK Mission'
                            :options='missionEnumOptions'
                            :disabled='missionsLoading'
                        />
                    </div>
                    <div class='col-12'>
                        <button
                            type='button'
                            class='btn btn-primary w-100'
                            :disabled='downloadingGeojson || !downloadMissionId'
                            @click='downloadCaltopoGeojson'
                        >
                            <IconDownload
                                :size='18'
                                stroke='1'
                            />
                            <span class='ms-2'>{{ downloadingGeojson ? 'Preparing…' : 'Download GeoJSON' }}</span>
                        </button>
                    </div>
                </div>
                <TablerAlert
                    v-if='downloadGeojsonError'
                    class='mt-3'
                    :err='downloadGeojsonError'
                />
            </div>
        </TablerBorder>

        <TablerBorder
            class='cloudtak-accent text-white mt-3'
            :fill-height='false'
            :shadow='false'
            gap='sm'
        >
            <template #label>
                <p class='text-uppercase text-white-50 small mb-0'>
                    Pairs
                </p>
            </template>
            <template #header>
                <TablerRefreshButton
                    :loading='pairsLoading'
                    @click='fetchPairs'
                />
            </template>

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
                            <th>Mode</th>
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
                                <TablerEnum
                                    :model-value='pairSyncModeShortLabel(pair)'
                                    :options='syncModeShortEnumOptions'
                                    :disabled='updatingPairId === pair.id || syncingId === pair.id'
                                    @update:model-value='onPairSyncModeLabelChange(pair, $event)'
                                />
                            </td>
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
                                            v-text='syncingId === pair.id ? "Syncing… (up to 30s)" : syncButtonLabel(pair.sync_mode)'
                                        />
                                    </button>
                                    <label
                                        v-tooltip='"Re-pushes every feature: clears the sync database for this map and re-subscribes to the mission. Use after a mission was recreated or emptied."'
                                        class='form-check form-check-inline mb-0'
                                    >
                                        <input
                                            type='checkbox'
                                            class='form-check-input'
                                            :disabled='syncingId === pair.id'
                                            :checked='forceResync[pair.id] === true'
                                            @change='forceResync = { ...forceResync, [pair.id]: ($event.target as HTMLInputElement).checked }'
                                        >
                                        <span class='form-check-label'>Force full resync</span>
                                    </label>
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
                                    <div
                                        v-if='pair.share_pli'
                                        v-tooltip='`Share PLI: live TAK→CalTopo + CalTopo App Tracks→TAK every N seconds (min ${PLI_MIN_INTERVAL_SEC}s).`'
                                        class='input-group input-group-sm'
                                        style='width: 220px'
                                    >
                                        <span class='input-group-text'>PLI</span>
                                        <input
                                            type='number'
                                            class='form-control'
                                            :min='PLI_MIN_INTERVAL_SEC'
                                            step='1'
                                            :value='pliIntervalDraft[pair.id] ?? pair.pli_interval_sec ?? PLI_DEFAULT_INTERVAL_SEC'
                                            :disabled='store.isPliSharing(pair.id)'
                                            @input='onPliIntervalInput(pair.id, ($event.target as HTMLInputElement).value)'
                                        >
                                        <span class='input-group-text'>s</span>
                                        <button
                                            v-if='!store.isPliSharing(pair.id)'
                                            type='button'
                                            class='btn btn-success'
                                            @click='startPli(pair)'
                                        >
                                            <IconPlayerPlay
                                                :size='14'
                                                stroke='1'
                                            />
                                        </button>
                                        <button
                                            v-else
                                            type='button'
                                            class='btn btn-warning'
                                            @click='stopPli(pair.id)'
                                        >
                                            <IconPlayerStop
                                                :size='14'
                                                stroke='1'
                                            />
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
                                <div
                                    v-if='store.isPliSharing(pair.id)'
                                    class='text-muted small mt-1'
                                >
                                    <IconRefresh
                                        :size='12'
                                        stroke='1'
                                    />
                                    <span class='ms-1'>PLI sharing active</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </TablerBorder>

        <!-- Settings modal (no Teleport — works inside popout window) -->
        <div
            v-if='settingsOpen'
            class='modal modal-blur show d-block'
            tabindex='-1'
            role='dialog'
            @click.self='settingsOpen = false'
        >
            <div
                class='modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable'
                role='document'
            >
                <div class='modal-content'>
                    <div class='modal-header'>
                        <h5 class='modal-title'>
                            Settings
                        </h5>
                        <button
                            type='button'
                            class='btn-close'
                            aria-label='Close'
                            @click='settingsOpen = false'
                        />
                    </div>
                    <div class='modal-body'>
                        <SettingsPanel
                            embedded
                            :username='currentUsername'
                        />
                    </div>
                </div>
            </div>
        </div>
        <div
            v-if='settingsOpen'
            class='modal-backdrop fade show'
        />

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
    TablerIconButton,
    TablerBorder,
    TablerEnum,
    TablerToggle,
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
    IconSettings,
} from '@tabler/icons-vue';
import Subscription from '../../../../src/base/subscription.ts';
import type { Mission } from '../../../../src/types.ts';
import { std, stdurl } from '../../../../src/std.ts';
import { useMapStore } from '../../../../src/stores/map.ts';
import ProfileConfig from '../../../../src/base/profile.ts';
import { renameKeysDeep } from '../lib/geojson.ts';
import { applyCaltopoMarkerSymbols } from '../lib/icons.ts';
import { useCaltopoSyncStore } from '../stores/plugin-state.ts';
import {
    listPairs,
    createPair,
    updatePair,
    deletePair,
    runSync,
} from '../api/nodered-client.ts';
import { buildCreateMapBody, createCaltopoMap, listCaltopoMaps } from '../api/caltopo-client.ts';
import { parseCoordinates } from '../lib/coordinates.ts';
import type { Pair, SyncMode, SyncResult, CaltopoMapOption, ConnectKeyEntry } from '../types.ts';
import { PLI_DEFAULT_INTERVAL_SEC, PLI_MIN_INTERVAL_SEC } from '../lib/pli/constants.ts';
import { connectKeyOptions as listConnectKeyOptions } from '../lib/pli/connect-key-routing.ts';
import SyncResultDialog from './SyncResultDialog.vue';
import SettingsPanel from './SettingsPanel.vue';

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

const CALTOPO_MAP_PLACEHOLDER = 'Select a map…';
const CALTOPO_MAP_LOADING = 'Loading maps…';
const CALTOPO_MAP_EMPTY = 'No maps available';
const MISSION_PLACEHOLDER = 'Select a mission…';
const MISSION_LOADING = 'Loading missions…';
const PLI_KEY_DEFAULT = 'Use first configured key';

function caltopoMapOptionLabel(m: CaltopoMapOption): string {
    return `${m.name} (${m.id})`;
}

function missionLabelToGuid(label: string): string {
    if (label === MISSION_PLACEHOLDER || label === MISSION_LOADING) return '';
    const match = missions.value.find((m) => m.name === label);
    return match?.guid ?? '';
}

function guidToMissionLabel(guid: string): string {
    if (missionsLoading.value) return MISSION_LOADING;
    const match = missions.value.find((m) => m.guid === guid);
    return match ? match.name : MISSION_PLACEHOLDER;
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
const settingsOpen = ref(false);
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
        createMapError.value = new Error('Caltopo credentials are incomplete. Fill them in Settings (gear icon).');
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

const SYNC_MODE_OPTIONS: { value: SyncMode; label: string; shortLabel: string }[] = [
    { value: 'bidirectional', label: 'Bidirectional (both ways)', shortLabel: 'Both ways' },
    { value: 'tak_to_caltopo', label: 'One-way: TAK → CalTopo', shortLabel: 'TAK → CalTopo' },
    { value: 'caltopo_to_tak', label: 'One-way: CalTopo → TAK', shortLabel: 'CalTopo → TAK' },
];

function syncModeHint(mode: SyncMode): string {
    if (mode === 'tak_to_caltopo') {
        return 'Pushes mission features onto the CalTopo map. CalTopo-only markers are never removed.';
    }
    if (mode === 'caltopo_to_tak') {
        return 'Pushes map features into the TAK mission. Mission-only items are never removed.';
    }
    return 'Syncs both directions. Items removed from CalTopo are removed from the mission.';
}

function syncButtonLabel(mode?: SyncMode): string {
    if (mode === 'tak_to_caltopo') return 'Push to CalTopo';
    if (mode === 'caltopo_to_tak') return 'Pull to TAK';
    return 'Sync Now';
}

const form = ref<{
    caltopo_map_id: string;
    tak_mission_id: string;
    label: string;
    sync_mode: SyncMode;
    share_pli: boolean;
    pli_interval_sec: number;
    pli_connect_key_id: string;
}>({
    caltopo_map_id: '',
    tak_mission_id: '',
    label: '',
    sync_mode: 'bidirectional',
    share_pli: false,
    pli_interval_sec: PLI_DEFAULT_INTERVAL_SEC,
    pli_connect_key_id: '',
});
const saving = ref(false);
const formError = ref<Error | undefined>();

const syncingId = ref<number | null>(null);
const updatingPairId = ref<number | null>(null);
const deletingId = ref<number | null>(null);
const dialogResult = ref<SyncResult | null>(null);

const AUTO_SYNC_MIN_SECONDS = 30;
const intervalDraft = ref<Record<number, number>>({});
const pliIntervalDraft = ref<Record<number, number>>({});
const currentUsername = ref('');
// Per-pair "Force full resync" toggle. Never sticky: reset to OFF after each run.
const forceResync = ref<Record<number, boolean>>({});

const connectKeyOptions = computed<ConnectKeyEntry[]>(() => {
    return listConnectKeyOptions(store.pliSettings);
});

const caltopoMapEnumOptions = computed(() => {
    if (caltopoMapsLoading.value) return [CALTOPO_MAP_LOADING];
    if (!caltopoMaps.value.length) return [CALTOPO_MAP_EMPTY];
    return [CALTOPO_MAP_PLACEHOLDER, ...caltopoMaps.value.map(caltopoMapOptionLabel)];
});

const selectedCaltopoMapLabel = computed({
    get(): string {
        if (caltopoMapsLoading.value) return CALTOPO_MAP_LOADING;
        if (!caltopoMaps.value.length) return CALTOPO_MAP_EMPTY;
        const id = form.value.caltopo_map_id.trim();
        const match = caltopoMaps.value.find((m) => m.id === id);
        return match ? caltopoMapOptionLabel(match) : CALTOPO_MAP_PLACEHOLDER;
    },
    set(label: string) {
        if (
            label === CALTOPO_MAP_PLACEHOLDER
            || label === CALTOPO_MAP_LOADING
            || label === CALTOPO_MAP_EMPTY
        ) {
            return;
        }
        const match = caltopoMaps.value.find((m) => caltopoMapOptionLabel(m) === label);
        if (match) {
            form.value.caltopo_map_id = match.id;
        }
    },
});

const missionEnumOptions = computed(() => {
    if (missionsLoading.value) return [MISSION_LOADING];
    return [MISSION_PLACEHOLDER, ...missions.value.map((m) => m.name)];
});

const selectedMissionLabel = computed({
    get(): string {
        return guidToMissionLabel(form.value.tak_mission_id);
    },
    set(label: string) {
        form.value.tak_mission_id = missionLabelToGuid(label);
    },
});

const downloadMissionLabel = computed({
    get(): string {
        return guidToMissionLabel(downloadMissionId.value);
    },
    set(label: string) {
        downloadMissionId.value = missionLabelToGuid(label);
    },
});

const syncModeEnumOptions = computed(() => SYNC_MODE_OPTIONS.map((o) => o.label));
const syncModeShortEnumOptions = computed(() => SYNC_MODE_OPTIONS.map((o) => o.shortLabel));

const syncModeLabel = computed({
    get(): string {
        const opt = SYNC_MODE_OPTIONS.find((o) => o.value === form.value.sync_mode);
        return opt?.label ?? SYNC_MODE_OPTIONS[0].label;
    },
    set(label: string) {
        const opt = SYNC_MODE_OPTIONS.find((o) => o.label === label);
        if (opt) form.value.sync_mode = opt.value;
    },
});

function connectKeyDisplay(key: ConnectKeyEntry): string {
    return key.label || key.connectKey || key.id;
}

const pliConnectKeyEnumOptions = computed(() => {
    return [PLI_KEY_DEFAULT, ...connectKeyOptions.value.map(connectKeyDisplay)];
});

const pliConnectKeyLabel = computed({
    get(): string {
        if (!form.value.pli_connect_key_id) return PLI_KEY_DEFAULT;
        const key = connectKeyOptions.value.find((k) => k.id === form.value.pli_connect_key_id);
        return key ? connectKeyDisplay(key) : PLI_KEY_DEFAULT;
    },
    set(label: string) {
        if (label === PLI_KEY_DEFAULT) {
            form.value.pli_connect_key_id = '';
            return;
        }
        const key = connectKeyOptions.value.find((k) => connectKeyDisplay(k) === label);
        form.value.pli_connect_key_id = key?.id ?? '';
    },
});

function pairSyncModeShortLabel(pair: Pair): string {
    const mode = pair.sync_mode ?? 'bidirectional';
    const opt = SYNC_MODE_OPTIONS.find((o) => o.value === mode);
    return opt?.shortLabel ?? SYNC_MODE_OPTIONS[0].shortLabel;
}

function onPairSyncModeLabelChange(pair: Pair, shortLabel: string) {
    const opt = SYNC_MODE_OPTIONS.find((o) => o.shortLabel === shortLabel);
    if (opt) void onSyncModeChange(pair, opt.value);
}

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

const caltopoCredsIncomplete = computed(() => {
    const creds = store.caltopoSettings;
    return !creds.credentialId.trim()
        || !creds.credentialKey.trim()
        || !creds.accountId.trim();
});

onMounted(async () => {
    currentUsername.value = await resolveUsername();
    store.loadCaltopoSettings(currentUsername.value);
    store.loadPliSettings(currentUsername.value);
    store.loadPliRunningPairIds(currentUsername.value);
    await Promise.all([fetchPairs(), fetchMissions(), loadCaltopoMaps()]);
    restorePliSessions();
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
            sync_mode: form.value.sync_mode,
            share_pli: form.value.share_pli,
            pli_interval_sec: form.value.share_pli
                ? Math.max(PLI_MIN_INTERVAL_SEC, form.value.pli_interval_sec || PLI_DEFAULT_INTERVAL_SEC)
                : undefined,
            pli_connect_key_id: form.value.share_pli && form.value.pli_connect_key_id
                ? form.value.pli_connect_key_id
                : undefined,
        });
        pairs.value = [...(Array.isArray(pairs.value) ? pairs.value : []), created];
        form.value = {
            caltopo_map_id: '',
            tak_mission_id: '',
            label: '',
            sync_mode: 'bidirectional',
            share_pli: false,
            pli_interval_sec: PLI_DEFAULT_INTERVAL_SEC,
            pli_connect_key_id: '',
        };
    } catch (err) {
        formError.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        saving.value = false;
    }
}

async function onSyncModeChange(pair: Pair, sync_mode: SyncMode) {
    const current = pair.sync_mode ?? 'bidirectional';
    if (current === sync_mode) return;

    updatingPairId.value = pair.id;
    listError.value = undefined;
    try {
        const updated = await updatePair(pair.id, { sync_mode });
        pairs.value = pairs.value.map((p) => (p.id === pair.id ? updated : p));
    } catch (err) {
        listError.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        updatingPairId.value = null;
    }
}

async function syncNow(pair: Pair) {
    syncingId.value = pair.id;
    const force = forceResync.value[pair.id] === true;
    try {
        const result = await runSync(pair, { force });
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
        // Force should never persist across runs.
        if (forceResync.value[pair.id]) {
            forceResync.value = { ...forceResync.value, [pair.id]: false };
        }
    }
}

function onPliIntervalInput(pairId: number, raw: string) {
    const n = parseInt(raw, 10);
    pliIntervalDraft.value = {
        ...pliIntervalDraft.value,
        [pairId]: Number.isFinite(n) ? n : PLI_DEFAULT_INTERVAL_SEC,
    };
}

function pairWithPliInterval(pair: Pair): Pair {
    const candidate = pliIntervalDraft.value[pair.id] ?? pair.pli_interval_sec ?? PLI_DEFAULT_INTERVAL_SEC;
    return {
        ...pair,
        pli_interval_sec: Math.max(PLI_MIN_INTERVAL_SEC, Math.floor(candidate) || PLI_DEFAULT_INTERVAL_SEC),
    };
}

function restorePliSessions() {
    const running = store.loadPliRunningPairIds(currentUsername.value);
    for (const pairId of running) {
        const pair = pairs.value.find((p) => p.id === pairId);
        if (pair?.share_pli) {
            store.startPliForPair(pairWithPliInterval(pair), currentUsername.value);
        }
    }
}

function startPli(pair: Pair) {
    store.startPliForPair(pairWithPliInterval(pair), currentUsername.value);
}

function stopPli(pairId: number) {
    store.stopPliForPair(pairId, currentUsername.value);
}

async function remove(pair: Pair) {
    if (!confirm(`Delete pair ${pair.label || pair.caltopo_map_id}?`)) return;
    deletingId.value = pair.id;
    try {
        store.stopAutoSync(pair.id);
        if (store.isPliSharing(pair.id)) {
            store.stopPliForPair(pair.id, currentUsername.value);
        }
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
    try {
        return await Subscription.load(guid, { reload: false });
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
        const layers = await sub.layer.list({ refresh: true });
        const existing = layers.find((l) => l.name === name);
        if (existing) return;
        await sub.layer.create({ name, type: 'UID' });
    } catch (err) {
        console.warn('Failed to ensure MissionLayer', err);
    }
}

async function removeMissionLayer(pair: Pair): Promise<void> {
    const sub = await loadSubscription(pair.tak_mission_id);
    if (!sub) return;
    const name = `Caltopo: ${pair.caltopo_map_id}`;
    try {
        const layers = await sub.layer.list({ refresh: true });
        const existing = layers.find((l) => l.name === name);
        if (!existing) return;
        await sub.layer.delete(existing.uid);
    } catch (err) {
        console.warn('Failed to remove MissionLayer', err);
    }
}

</script>

<style scoped>
.caltopo-sync-panel {
    --tabler-input-bg: var(--cloudtak-inset-bg);
    --tblr-bg-forms: var(--cloudtak-inset-bg);
}

.caltopo-sync-panel :deep(.cloudtak-bg),
.caltopo-sync-panel :deep(.card) {
    background-color: var(--cloudtak-inset-bg) !important;
    border-color: var(--cloudtak-inset-border);
}

.caltopo-sync-panel :deep(.card-header) {
    background-color: transparent !important;
}

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
