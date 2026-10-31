<template>
    <div class='caltopo-sync-panel px-3 py-3'>
        <EtlPairList
            ref='pairList'
            :mission-name='missionName'
            :missions='missions'
        />

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
                <p class='text-white-50 small'>
                    Creates a map in the team's CalTopo account through the CloudTAK ETL, titled after
                    the Active
                    <IconAmbulance
                        :size='16'
                        stroke='1'
                        class='mx-1'
                    />
                    Data Sync (or the DR/Activity number when none is active). It also adds a CloudTAK
                    Event at the call location. Once the map exists it is filled into the pair form above.
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
                        <label class='form-label'>Share with Channels</label>
                        <GroupSelect
                            v-model='createMapForm.channels'
                            :active='true'
                        />
                        <small class='text-white-50 d-block mt-1'>
                            Include the channel of the CloudTAK Connection that runs the CalTopo Layer.
                        </small>
                    </div>
                    <div class='col-12'>
                        <button
                            type='button'
                            class='btn btn-primary w-100'
                            :disabled='creatingMap || !canCreateMap'
                            @click='createMap'
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
                    v-if='creatingMap && createMapStep'
                    class='text-white-50 small mt-2'
                >
                    {{ createMapStep }}…
                </div>
                <TablerAlert
                    v-if='createMapError'
                    class='mt-3'
                    :err='createMapError'
                />
                <TablerInlineAlert
                    v-if='createdMap'
                    class='mt-3'
                    severity='success'
                    title='Map Created'
                    :description='`CalTopo map ${createdMap.mapId} (${createdMap.url}) - filled into the CloudTAK ETL Pairs form above.`'
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
    </div>
</template>

<script setup lang='ts'>
import { ref, computed, onMounted } from 'vue';
import {
    TablerInput,
    TablerAlert,
    TablerInlineAlert,
    TablerBorder,
    TablerEnum,
} from '@tak-ps/vue-tabler';
import {
    IconChevronDown,
    IconAmbulance,
    IconMap,
    IconDownload,
} from '@tabler/icons-vue';
import Subscription from '../../../../src/base/subscription.ts';
import type { Mission } from '../../../../src/types.ts';
import { std, stdurl } from '../../../../src/std.ts';
import { useMapStore } from '../../../../src/stores/map.ts';
import GroupSelect from '../../../../src/components/util/GroupSelect.vue';
import { renameKeysDeep } from '../lib/geojson.ts';
import { applyCaltopoMarkerSymbols } from '../lib/icons.ts';
import { parseCoordinates } from '../lib/coordinates.ts';
import { channelBitpos, createCaltopoMap } from '../api/caltopo-map-client.ts';
import type { CreatedCaltopoMap } from '../api/caltopo-map-client.ts';
import EtlPairList from './EtlPairList.vue';

const mapStore = useMapStore();

const pairList = ref<InstanceType<typeof EtlPairList> | null>(null);

const missions = ref<Mission[]>([]);
const missionsLoading = ref(false);

const MISSION_PLACEHOLDER = 'Select a mission…';
const MISSION_LOADING = 'Loading missions…';

function missionName(guid: string): string {
    const m = missions.value.find((mm: Mission) => mm.guid === guid);
    return m ? m.name : guid;
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

onMounted(fetchMissions);

// "Create Caltopo Map" accordion - collapsed by default. The CloudTAK CalTopo ETL creates the
// map from a flagged Event (lib/caltopo-map-event.ts), so no CalTopo credentials are needed here
const createMapOpen = ref(false);
const creatingMap = ref(false);
const createMapStep = ref('');
const createMapForm = ref<{ call_location: string; dr_or_activity: string; channels: string[] }>({
    call_location: '',
    dr_or_activity: '',
    channels: [],
});
const createMapError = ref<Error | undefined>();
const createdMap = ref<CreatedCaltopoMap | undefined>();

const activeMission = computed(() => mapStore.mission?.meta);

const canCreateMap = computed<boolean>(() => {
    return createMapForm.value.call_location.trim() !== ''
        && createMapForm.value.channels.length > 0
        && (Boolean(activeMission.value?.name) || createMapForm.value.dr_or_activity.trim() !== '');
});

async function createMap() {
    createMapError.value = undefined;
    createdMap.value = undefined;

    let lat: number;
    let lon: number;
    try {
        ({ lat, lon } = parseCoordinates({ coordinates: createMapForm.value.call_location.trim() }));
    } catch (err) {
        createMapError.value = err instanceof Error ? err : new Error(String(err));
        return;
    }

    const mission = activeMission.value?.name && activeMission.value?.guid
        ? { name: activeMission.value.name, guid: activeMission.value.guid }
        : undefined;

    creatingMap.value = true;
    try {
        createdMap.value = await createCaltopoMap({
            name: mission?.name || createMapForm.value.dr_or_activity.trim(),
            remarks: createMapForm.value.dr_or_activity.trim(),
            lat,
            lon,
            channels: await channelBitpos(createMapForm.value.channels),
            mission,
        }, (step) => { createMapStep.value = step; });

        pairList.value?.prefill(createdMap.value.mapId, mission?.name);
    } catch (err) {
        createMapError.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        creatingMap.value = false;
        createMapStep.value = '';
    }
}

// "Download Caltopo-friendly GeoJSON File" accordion — collapsed by default.
// Pulls a TAK mission's features and rewrites property keys so Caltopo accepts
// them (callsign -> title, remarks -> description), then saves a .json file.
const downloadGeojsonOpen = ref(false);
const downloadMissionId = ref<string>('');
const downloadingGeojson = ref(false);
const downloadGeojsonError = ref<Error | undefined>();

const missionEnumOptions = computed(() => {
    if (missionsLoading.value) return [MISSION_LOADING];
    return [MISSION_PLACEHOLDER, ...missions.value.map((m) => m.name)];
});

const downloadMissionLabel = computed({
    get: () => {
        if (missionsLoading.value) return MISSION_LOADING;
        return missions.value.find((m) => m.guid === downloadMissionId.value)?.name ?? MISSION_PLACEHOLDER;
    },
    set: (label: string) => {
        downloadMissionId.value = missions.value.find((m) => m.name === label)?.guid ?? '';
    },
});

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

.create-map-chevron {
    transition: transform 0.2s ease-out;
}
.create-map-chevron-open {
    transform: rotate(180deg);
}
</style>
