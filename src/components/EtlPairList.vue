<template>
    <TablerBorder
        class='cloudtak-accent text-white mt-3'
        :fill-height='false'
        :shadow='false'
        gap='sm'
    >
        <template #label>
            <p class='text-uppercase text-white-50 small mb-0'>
                CloudTAK ETL Pairs
            </p>
        </template>
        <template #header>
            <div class='d-flex align-items-center gap-1'>
                <TablerIconButton
                    v-if='connections.length'
                    title='Pair a TAK Mission with a CalTopo map'
                    @click='formOpen = !formOpen'
                >
                    <IconPlus
                        :size='20'
                        stroke='1.5'
                    />
                </TablerIconButton>
                <TablerRefreshButton
                    :loading='loading'
                    @click='fetchEtlPairs'
                />
            </div>
        </template>

        <div
            v-if='formOpen && !error'
            class='border rounded p-2 mb-3'
        >
            <p class='small text-white-50 mb-2'>
                Creates the Mission's Data Sync (or reuses it) and a Layer that copies its CalTopo
                credentials from this Connection's CalTopo Layer. The pair starts as a dry run - check its
                plan below, then Go Live.
            </p>
            <div class='row g-2'>
                <div class='col-12 col-md-4'>
                    <TablerEnum
                        v-model='form.connection'
                        label='Connection'
                        :options='connectionOptions'
                        :disabled='creating'
                    />
                </div>
                <div class='col-12 col-md-4'>
                    <TablerEnum
                        v-model='form.mission'
                        label='TAK Mission'
                        :options='missionOptions'
                        :disabled='creating'
                    />
                </div>
                <div class='col-12 col-md-4'>
                    <TablerInput
                        v-model='form.map'
                        label='CalTopo Map ID or URL'
                        placeholder='APJ7U0R'
                        :disabled='creating'
                    />
                </div>
            </div>
            <div class='d-flex align-items-center gap-2 mt-2'>
                <button
                    type='button'
                    class='btn btn-sm btn-primary'
                    :disabled='creating || !canCreate'
                    @click='createPair'
                >
                    <span v-text='creating ? "Creating…" : "Create Pair (Dry Run)"' />
                </button>
                <span
                    v-if='createStep'
                    class='small text-white-50'
                    v-text='createStep'
                />
            </div>
            <TablerInlineAlert
                v-if='createError'
                class='mt-2'
                severity='danger'
                title='The pair was not created'
                :description='createError'
            />
            <TablerInlineAlert
                v-if='createdNote'
                class='mt-2'
                severity='success'
                title='Pair created as a dry run'
                :description='createdNote'
            />
        </div>

        <TablerLoading
            v-if='loading && !pairs.length'
            :compact='true'
        />
        <TablerInlineAlert
            v-else-if='error'
            severity='warning'
            title='ETL pairs could not be loaded'
            :description='`${error.message} - only CloudTAK System Administrators can see the pairs run by the CalTopo ETL.`'
        />
        <TablerNone
            v-else-if='!pairs.length'
            label='No ETL Pairs'
            :create='false'
        />
        <div
            v-else
            class='table-responsive'
        >
            <TablerInlineAlert
                v-if='goLiveError'
                class='mb-2'
                severity='danger'
                title='Go Live failed'
                :description='goLiveError'
            />
            <table class='table card-table table-vcenter'>
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Caltopo Map</th>
                        <th>TAK Mission</th>
                        <th>Last Run</th>
                        <th>Items</th>
                        <th>Changes</th>
                        <th>Layer</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    <template
                        v-for='pair in pairs'
                        :key='pairKey(pair)'
                    >
                        <tr>
                            <td>
                                <span
                                    v-tooltip='HEALTH[etlPairHealth(pair, now)].tooltip'
                                    class='badge text-white'
                                    :class='HEALTH[etlPairHealth(pair, now)].badge'
                                    v-text='HEALTH[etlPairHealth(pair, now)].label'
                                />
                            </td>
                            <td>
                                <a
                                    :href='`https://caltopo.com/m/${encodeURIComponent(pair.mapId)}`'
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    class='text-white'
                                ><code v-text='pair.mapId' /></a>
                            </td>
                            <td v-text='props.missionName(pair.missionGuid)' />
                            <td>
                                <span
                                    v-if='pair.status'
                                    v-tooltip='new Date(pair.status.at).toLocaleString()'
                                    v-text='ago(pair.status.at)'
                                />
                                <span
                                    v-else
                                    class='text-muted'
                                >Never</span>
                            </td>
                            <td>
                                <span
                                    v-if='pair.status && pair.status.mission !== undefined'
                                    v-tooltip='itemsTooltip(pair)'
                                    v-text='`${pair.status.mission} TAK · ${pair.status.caltopo} Caltopo`'
                                />
                                <span
                                    v-else
                                    class='text-muted'
                                >—</span>
                            </td>
                            <td>
                                <span
                                    v-if='pair.status && pair.status.plan'
                                    v-text='etlChangeSummary(pair.status)'
                                />
                                <span
                                    v-else
                                    class='text-muted'
                                >—</span>
                            </td>
                            <td>
                                <span
                                    v-tooltip='`Connection ${pair.connectionName} · Layer ${pair.layerId} · v${pair.version}`'
                                    v-text='pair.layerName'
                                />
                            </td>
                            <td class='text-end'>
                                <button
                                    v-if='pair.dryRun && pair.enabled'
                                    v-tooltip='"Turn the dry run off - the next run writes to CalTopo. Check the planned changes first"'
                                    type='button'
                                    class='btn btn-sm btn-success'
                                    :disabled='goingLive === pairKey(pair) || !pair.status'
                                    @click='goLive(pair)'
                                    v-text='goingLive === pairKey(pair) ? "Going live…" : "Go Live"'
                                />
                            </td>
                        </tr>
                        <tr v-if='pair.status && pair.status.errors.length'>
                            <td
                                colspan='8'
                                class='pt-0'
                            >
                                <div
                                    v-for='(err, i) in pair.status.errors'
                                    :key='i'
                                    class='text-danger small'
                                    v-text='err'
                                />
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
            <div class='text-muted small px-2 pb-2'>
                Each pair runs every minute in CloudTAK - nothing to start or stop here.
            </div>
        </div>
    </TablerBorder>
</template>

<script setup lang='ts'>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
    TablerBorder,
    TablerRefreshButton,
    TablerLoading,
    TablerInlineAlert,
    TablerNone,
    TablerIconButton,
    TablerEnum,
    TablerInput,
} from '@tak-ps/vue-tabler';
import { IconPlus } from '@tabler/icons-vue';
import { listEtlPairs, createEtlPair, goLiveEtlPair } from '../api/cloudtak-etl-client.ts';
import { etlPairHealth, etlChangeSummary } from '../lib/etl-pairs.ts';
import type { EtlPair, EtlPairHealth } from '../lib/etl-pairs.ts';
import { caltopoMapId } from '../lib/etl-pair-plan.ts';

const props = defineProps<{
    /** Mission name for a GUID, from the missions the user can see */
    missionName: (guid: string) => string;
    /** The TAK Missions the user can see */
    missions: Array<{ guid: string; name: string }>;
}>();

const CONNECTION_PLACEHOLDER = 'Select a Connection…';
const MISSION_PLACEHOLDER = 'Select a mission…';

const HEALTH: Record<EtlPairHealth, { label: string; badge: string; tooltip: string }> = {
    'ok': { label: 'OK', badge: 'bg-green', tooltip: 'The last run worked' },
    'error': { label: 'Error', badge: 'bg-red', tooltip: 'The last run had errors - see below the pair' },
    'dry-run': { label: 'Dry Run', badge: 'bg-azure', tooltip: 'Planning only - DryRun is on in the Layer settings, nothing is written to Caltopo' },
    'stale': { label: 'Not Running', badge: 'bg-orange', tooltip: 'No run for over 5 minutes - check the Layer is deployed' },
    'disabled': { label: 'Paused', badge: 'bg-secondary', tooltip: 'The Layer is disabled' },
    'never': { label: 'Waiting', badge: 'bg-secondary', tooltip: 'No run recorded yet - the Layer needs etl-caltopo 5.18.0 or later' },
};

const pairs = ref<EtlPair[]>([]);
const loading = ref(false);
const error = ref<Error | undefined>();
const now = ref(Date.now());

function ago(iso: string): string {
    const seconds = Math.max(0, Math.round((now.value - Date.parse(iso)) / 1000));
    if (seconds < 90) return `${seconds}s ago`;
    if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min ago`;
    return new Date(iso).toLocaleString();
}

function itemsTooltip(pair: EtlPair): string {
    const s = pair.status!;
    const parts = [`${s.linked ?? 0} linked`];
    if (s.toTak) parts.push(`${s.toTak} Caltopo objects sent to TAK`);
    if (s.appTracks) parts.push(`${s.appTracks} App Tracks live`);
    return parts.join(' · ');
}

function pairKey(pair: EtlPair): string {
    return `${pair.layerId}:${pair.mapId}:${pair.missionGuid}`;
}

// New pairs copy their credentials from a CalTopo Layer already on the Connection, so only
// Connections that have one are offered
const connections = computed(() => {
    const seen = new Map<number, string>();
    for (const pair of pairs.value) seen.set(pair.connectionId, pair.connectionName);
    return [...seen.entries()].map(([id, name]) => ({ id, label: `${name} (${id})` }));
});
const connectionOptions = computed(() => [CONNECTION_PLACEHOLDER, ...connections.value.map((c) => c.label)]);

const missionOptions = computed(() => {
    const paired = new Set(pairs.value.map((p) => p.missionGuid));
    return [MISSION_PLACEHOLDER, ...props.missions.filter((m) => !paired.has(m.guid)).map((m) => m.name)];
});

const formOpen = ref(false);
const form = ref({ connection: CONNECTION_PLACEHOLDER, mission: MISSION_PLACEHOLDER, map: '' });
const creating = ref(false);
const createStep = ref('');
const createError = ref('');
const createdNote = ref('');

const canCreate = computed(() => {
    return connections.value.some((c) => c.label === form.value.connection)
        && props.missions.some((m) => m.name === form.value.mission)
        && caltopoMapId(form.value.map) !== '';
});

async function createPair() {
    const connection = connections.value.find((c) => c.label === form.value.connection);
    const mission = props.missions.find((m) => m.name === form.value.mission);
    if (!connection || !mission) return;

    creating.value = true;
    createError.value = '';
    createdNote.value = '';
    try {
        const created = await createEtlPair({
            connectionId: connection.id,
            missionGuid: mission.guid,
            missionName: mission.name,
            map: form.value.map,
        }, (step) => { createStep.value = step; });

        createdNote.value = `Layer ${created.layerId} pairs CalTopo map ${created.mapId} with ${mission.name}`
            + `${created.reusedDataSync ? ` through its existing Data Sync ${created.dataSyncId}` : ` through new Data Sync ${created.dataSyncId}`}.`
            + ' Its Lambda takes a few minutes to deploy, then the first dry run shows below.';
        form.value = { connection: form.value.connection, mission: MISSION_PLACEHOLDER, map: '' };
        await fetchEtlPairs();
    } catch (err) {
        createError.value = err instanceof Error ? err.message : String(err);
    } finally {
        createStep.value = '';
        creating.value = false;
    }
}

const goingLive = ref('');
const goLiveError = ref('');

async function goLive(pair: EtlPair) {
    const summary = pair.status ? etlChangeSummary(pair.status) : 'no dry run yet';
    if (!window.confirm(`Go live with CalTopo map ${pair.mapId}?\n\nLast dry run: ${summary}.\n\nThe next run writes these changes to CalTopo, which has no undo.`)) return;

    goingLive.value = pairKey(pair);
    goLiveError.value = '';
    try {
        await goLiveEtlPair(pair);
        await fetchEtlPairs();
    } catch (err) {
        goLiveError.value = err instanceof Error ? err.message : String(err);
    } finally {
        goingLive.value = '';
    }
}

async function fetchEtlPairs() {
    loading.value = true;
    error.value = undefined;
    try {
        pairs.value = await listEtlPairs();
    } catch (err) {
        error.value = err instanceof Error ? err : new Error(String(err));
        pairs.value = [];
    } finally {
        now.value = Date.now();
        loading.value = false;
    }
}

// The Layers run every minute - refresh on the same beat while the pane is open
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
    void fetchEtlPairs();
    timer = setInterval(() => void fetchEtlPairs(), 60 * 1000);
});
onUnmounted(() => {
    if (timer) clearInterval(timer);
});
</script>
