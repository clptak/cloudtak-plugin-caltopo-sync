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
        <div v-else-if='!pairs.length'>
            <TablerNone
                label='No ETL Pairs'
                :create='false'
            />
            <p class='text-white-50 small text-center mb-0'>
                New pairs copy their CalTopo credentials from a CalTopo Sync Layer on the Connection -
                an admin sets up a Connection's first one in Connections (etl-caltopo docs/ADMIN_PAIRING.md).
            </p>
        </div>
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
            <TablerInlineAlert
                v-if='pauseError'
                class='mb-2'
                severity='danger'
                title='Pause failed - the Layer is still writing'
                :description='`${pauseError}. To stop it now, turn the Layer off in CloudTAK: Connections → the Connection → the Layer → Edit → Enabled.`'
            />
            <div
                v-if='paused'
                class='border border-warning rounded p-2 mb-2 small'
                role='alert'
            >
                <div class='d-flex align-items-start gap-2'>
                    <div class='text-warning'>
                        <strong v-text='`${paused.layerName} is paused.`' />
                        From its next run (within a minute) nothing is written to CalTopo or to the TAK
                        Mission. It keeps reading both and logging what it would have done. The row shows
                        Waiting until that run, then Dry Run. Go Live resumes it.
                    </div>
                    <button
                        type='button'
                        class='btn-close btn-close-white ms-auto'
                        aria-label='Dismiss'
                        @click='paused = undefined'
                    />
                </div>
                <div class='mt-2'>
                    <strong>Pause does not stop:</strong>
                </div>
                <ul class='mb-1 ps-3'>
                    <li>
                        <strong>TAK positions going to CalTopo.</strong> To stop everything, turn the Layer
                        off in CloudTAK:
                        <a
                            :href='etlLayerEditUrl(paused)'
                            target='_blank'
                            rel='noopener'
                            class='text-white'
                        >open {{ paused.layerName }}'s settings</a>
                        and switch <strong>Enabled</strong> off. That redeploys the Layer and takes a few
                        minutes.
                    </li>
                    <li v-if='pausedSiblings.length'>
                        <strong>These other pairs on the same Layer are paused too</strong> - Pause is a
                        Layer setting:
                        <ul class='ps-3 mb-0'>
                            <li
                                v-for='other in pausedSiblings'
                                :key='pairKey(other)'
                                v-text='`CalTopo map ${other.mapId} ↔ ${missionLabel(other.missionGuid)}`'
                            />
                        </ul>
                    </li>
                    <li v-else>
                        <strong>Every pair on this Layer.</strong> Pause is a Layer setting - this Layer
                        carries only this pair.
                    </li>
                </ul>
            </div>
            <TablerInlineAlert
                v-if='fixError'
                class='mb-2'
                severity='danger'
                title='Fix failed'
                :description='fixError'
            />
            <TablerInlineAlert
                v-if='fixedNote'
                class='mb-2'
                severity='success'
                title='CalTopo → TAK connected'
                :description='fixedNote'
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
                            <td v-text='missionLabel(pair.missionGuid)' />
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
                                <button
                                    v-if='!pair.dryRun && pair.enabled'
                                    v-tooltip='"Stop writing to CalTopo and the TAK Mission from the next run - Go Live resumes"'
                                    type='button'
                                    class='btn btn-sm btn-warning'
                                    :disabled='pausing === pairKey(pair)'
                                    @click='pause(pair)'
                                    v-text='pausing === pairKey(pair) ? "Pausing…" : "Pause"'
                                />
                            </td>
                        </tr>
                        <tr v-if='etlPairNeedsDataSync(pair)'>
                            <td
                                colspan='8'
                                class='pt-0'
                            >
                                <div class='d-flex align-items-center gap-2 text-warning small'>
                                    <span>
                                        <strong>CalTopo → TAK not connected.</strong>
                                        TAK items reach CalTopo, but nothing drawn in CalTopo reaches this
                                        Mission: the Layer has no Data Sync to write into.
                                    </span>
                                    <button
                                        type='button'
                                        class='btn btn-sm btn-warning ms-auto'
                                        :disabled='fixing === pairKey(pair)'
                                        @click='fixDataSync(pair)'
                                        v-text='fixing === pairKey(pair) ? "Fixing…" : "Fix"'
                                    />
                                </div>
                                <div
                                    v-if='fixing === pairKey(pair) && fixStep'
                                    class='text-white-50 small'
                                    v-text='fixStep'
                                />
                            </td>
                        </tr>
                        <tr v-if='pair.status && pair.status.notSent.length'>
                            <td
                                colspan='8'
                                class='pt-0'
                            >
                                <div class='text-warning small'>
                                    <strong v-text='`Not in the TAK Mission (${pair.status.notSent.length}):`' />
                                    Fix these in CalTopo map {{ pair.mapId }} - they come over on the next run.
                                </div>
                                <ul class='text-warning small mb-0 ps-3'>
                                    <li
                                        v-for='item in pair.status.notSent'
                                        :key='item.id'
                                    >
                                        <strong v-text='item.title' /> - <span v-text='notSentReason(item.reason)' />
                                    </li>
                                </ul>
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
                Each pair runs every minute in CloudTAK. Pause stops a Layer writing to CalTopo and the
                Mission; turning the Layer off in CloudTAK stops everything.
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
import { listEtlPairs, createEtlPair, goLiveEtlPair, pauseEtlPair, etlLayerEditUrl, connectEtlPairDataSync, lookupMissionName } from '../api/cloudtak-etl-client.ts';
import { etlPairHealth, etlChangeSummary, etlPairNeedsDataSync, etlLayerSiblings } from '../lib/etl-pairs.ts';
import type { EtlPair, EtlPairHealth } from '../lib/etl-pairs.ts';
import { caltopoMapId } from '../lib/etl-pair-plan.ts';

const props = defineProps<{
    /** The TAK Missions the user is subscribed to */
    missions: Array<{ guid: string; name: string }>;
}>();

// Names of paired Missions the user is not subscribed to, looked up once by GUID
const lookedUp = ref<Map<string, string | undefined>>(new Map());

function missionNameOf(guid: string): string | undefined {
    return props.missions.find((m) => m.guid === guid)?.name ?? lookedUp.value.get(guid);
}

function missionLabel(guid: string): string {
    return missionNameOf(guid) ?? guid;
}

async function lookUpMissionNames() {
    const unknown = [...new Set(pairs.value.map((p) => p.missionGuid))]
        .filter((guid) => !props.missions.some((m) => m.guid === guid) && !lookedUp.value.has(guid));

    for (const guid of unknown) {
        const name = await lookupMissionName(guid);
        lookedUp.value = new Map(lookedUp.value).set(guid, name);
    }
}

const CONNECTION_PLACEHOLDER = 'Select a Connection…';
const MISSION_PLACEHOLDER = 'Select a mission…';

const HEALTH: Record<EtlPairHealth, { label: string; badge: string; tooltip: string }> = {
    'ok': { label: 'OK', badge: 'bg-green', tooltip: 'The last run worked' },
    'error': { label: 'Error', badge: 'bg-red', tooltip: 'The last run had errors - see below the pair' },
    'partial': { label: 'Items Missing', badge: 'bg-orange', tooltip: 'Some CalTopo objects could not be put in the Mission - listed below the pair' },
    'dry-run': { label: 'Dry Run', badge: 'bg-azure', tooltip: 'Paused or not live yet - planning only, nothing is written to CalTopo or the TAK Mission. Go Live to start writing' },
    'stale': { label: 'Not Running', badge: 'bg-orange', tooltip: 'No run for over 5 minutes - check the Layer is deployed' },
    'disabled': { label: 'Layer Off', badge: 'bg-secondary', tooltip: 'The Layer is turned off in CloudTAK - nothing runs. Turn it back on in the Layer settings' },
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

/** CloudTAK's reasons in words a CalTopo user can act on */
function notSentReason(reason: string): string {
    if (/first and last coordinates/i.test(reason)) return 'its outline does not close - redraw it, ending on the first point';
    if (/at least four|4 or more positions/i.test(reason)) return 'a shape needs at least 3 points';
    return reason;
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

const pausing = ref('');
const pauseError = ref('');
// The pair last paused, for the notice of what Pause does not stop
const paused = ref<EtlPair | undefined>();
const pausedSiblings = computed(() => paused.value ? etlLayerSiblings(paused.value, pairs.value) : []);

async function pause(pair: EtlPair) {
    const siblings = etlLayerSiblings(pair, pairs.value);
    const others = siblings.length
        ? `• Other pairs on this Layer. Pause is a Layer setting, so these pause too:\n${siblings.map((p) => `    – CalTopo map ${p.mapId} ↔ ${missionLabel(p.missionGuid)}`).join('\n')}`
        : '• Other pairs on this Layer. Pause is a Layer setting - this Layer carries only this pair.';

    if (!window.confirm(`Pause ${pair.layerName}?\n\n`
        + 'From its next run (within a minute) nothing is written to CalTopo or to the TAK Mission. '
        + 'It keeps reading both and logging what it would have done. Go Live resumes it.\n\n'
        + 'PAUSE DOES NOT STOP:\n'
        + '• TAK positions going to CalTopo. To stop everything, turn the Layer off in CloudTAK: '
        + `Connections → ${pair.connectionName} → ${pair.layerName} → Edit → Enabled.\n`
        + others)) return;

    pausing.value = pairKey(pair);
    pauseError.value = '';
    paused.value = undefined;
    try {
        await pauseEtlPair(pair);
        paused.value = pair;
        await fetchEtlPairs();
    } catch (err) {
        pauseError.value = err instanceof Error ? err.message : String(err);
    } finally {
        pausing.value = '';
    }
}

const fixing = ref('');
const fixStep = ref('');
const fixError = ref('');
const fixedNote = ref('');

async function fixDataSync(pair: EtlPair) {
    const name = missionNameOf(pair.missionGuid);
    if (!window.confirm(`Connect ${pair.layerName} to ${name ?? pair.missionGuid}?\n\n`
        + `It uses the Connection's Data Sync for this Mission, or creates one attached to the same Mission - no new Mission is made. `
        + `From the next run, things drawn in CalTopo map ${pair.mapId} appear in the Mission.`)) return;

    fixing.value = pairKey(pair);
    fixError.value = '';
    fixedNote.value = '';
    try {
        const dataSyncId = await connectEtlPairDataSync(pair, name, (step) => { fixStep.value = step; });
        fixedNote.value = `${pair.layerName} now writes into Data Sync ${dataSyncId}. Within a minute or two the CalTopo objects of map ${pair.mapId} appear in ${name ?? 'the Mission'}.`;
        await fetchEtlPairs();
    } catch (err) {
        fixError.value = err instanceof Error ? err.message : String(err);
    } finally {
        fixStep.value = '';
        fixing.value = '';
    }
}

async function fetchEtlPairs() {
    loading.value = true;
    error.value = undefined;
    try {
        pairs.value = await listEtlPairs();
        void lookUpMissionNames();
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
/** Open the pair form with a map - ie: one just created - and its Mission when it can be paired */
function prefill(map: string, missionName?: string) {
    const only = connections.value.length === 1 ? connections.value[0].label : undefined;
    form.value = {
        connection: only ?? form.value.connection,
        mission: missionName && missionOptions.value.includes(missionName) ? missionName : form.value.mission,
        map,
    };
    createError.value = '';
    createdNote.value = '';
    formOpen.value = true;
}

defineExpose({ prefill });

onMounted(() => {
    void fetchEtlPairs();
    timer = setInterval(() => void fetchEtlPairs(), 60 * 1000);
});
onUnmounted(() => {
    if (timer) clearInterval(timer);
});
</script>
