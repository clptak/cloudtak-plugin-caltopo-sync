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
            <TablerRefreshButton
                :loading='loading'
                @click='fetchEtlPairs'
            />
        </template>

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
                    </tr>
                </thead>
                <tbody>
                    <template
                        v-for='pair in pairs'
                        :key='`${pair.layerId}:${pair.mapId}:${pair.missionGuid}`'
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
                        </tr>
                        <tr v-if='pair.status && pair.status.errors.length'>
                            <td
                                colspan='7'
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
import { ref, onMounted, onUnmounted } from 'vue';
import {
    TablerBorder,
    TablerRefreshButton,
    TablerLoading,
    TablerInlineAlert,
    TablerNone,
} from '@tak-ps/vue-tabler';
import { listEtlPairs } from '../api/cloudtak-etl-client.ts';
import { etlPairHealth, etlChangeSummary } from '../lib/etl-pairs.ts';
import type { EtlPair, EtlPairHealth } from '../lib/etl-pairs.ts';

const props = defineProps<{
    /** Mission name for a GUID, from the missions the user can see */
    missionName: (guid: string) => string;
}>();

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
