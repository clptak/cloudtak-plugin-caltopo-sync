// Reads and creates the Map/Mission pairs run by the CloudTAK CalTopo ETL
// through CloudTAK's own API. Connection Layers and Data Syncs need access to
// the Connection - a CloudTAK System Administrator on a self-hosted CloudTAK.

import { std, stdurl } from '../../../../src/std.ts';
import { etlPairsFromLayer } from '../lib/etl-pairs.ts';
import type { EtlLayer, EtlPair } from '../lib/etl-pairs.ts';
import { planEtlPair, planDataDestination, templateCandidates, dryRunEnvironment } from '../lib/etl-pair-plan.ts';
import type { PairRequest, DataSyncSummary, TemplateLayer } from '../lib/etl-pair-plan.ts';

interface ConnectionList {
    items: Array<{ id: number; name: string }>;
}

interface LayerList {
    items: EtlLayer[];
}

export async function listEtlPairs(): Promise<EtlPair[]> {
    const url = stdurl('/api/connection');
    url.searchParams.set('limit', '100');
    const connections = await std(url) as ConnectionList;

    const pairs: EtlPair[] = [];
    for (const connection of connections.items ?? []) {
        const layerUrl = stdurl(`/api/connection/${connection.id}/layer`);
        // CloudTAK's filter matches Layer names, which admins choose freely - the task is checked instead
        layerUrl.searchParams.set('limit', '100');

        const layers = await std(layerUrl) as LayerList;
        for (const layer of layers.items ?? []) pairs.push(...etlPairsFromLayer(connection, layer));
    }

    return pairs;
}

async function fetchLayer(connectionId: number, layerId: number): Promise<TemplateLayer & { incoming?: { environment?: unknown } }> {
    const layer = await std(`/api/connection/${connectionId}/layer/${layerId}`) as {
        id: number;
        task: string;
        memory: number;
        timeout: number;
        permissions?: string[];
        incoming?: { environment?: unknown };
    };

    return {
        id: layer.id,
        task: layer.task,
        memory: layer.memory,
        timeout: layer.timeout,
        permissions: layer.permissions ?? [],
        environment: layer.incoming?.environment,
        incoming: layer.incoming,
    };
}

/** True when a Layer environment holds the pair */
function hasPair(environment: unknown, mapId: string, missionGuid: string): boolean {
    const pairs = (environment as { Source?: { Pairs?: Array<{ MapId?: string; MissionGuid?: string }> } } | undefined)?.Source?.Pairs;
    return Array.isArray(pairs) && pairs.some((p) => p.MapId === mapId && p.MissionGuid === missionGuid);
}

export interface CreatedEtlPair {
    mapId: string;
    layerId: number;
    dataSyncId: number;
    reusedDataSync: boolean;
}

/**
 * Create a pair as a dry run: the Mission's Data Sync (reused when it has one), a Layer,
 * its Incoming config (schedule + Data Sync, which deploys the Lambda and adds the Mission
 * folder) and the Layer settings copied from the Connection's newest CalTopo Layer.
 *
 * Nothing is removed when a step fails - least of all a Data Sync, as removing one deletes
 * its Mission. The error says what was created so far
 */
export async function createEtlPair(request: PairRequest, onStep: (step: string) => void = () => {}): Promise<CreatedEtlPair> {
    onStep('Checking existing pairs');
    const existing = await listEtlPairs();

    const candidate = templateCandidates(existing, request.connectionId)[0];
    const template = candidate ? await fetchLayer(request.connectionId, candidate.layerId) : undefined;

    const dataSyncs = await listDataSyncs(request.connectionId);

    const plan = planEtlPair(request, existing, dataSyncs, template);
    if ('error' in plan) throw new Error(plan.error);

    const created: string[] = [];
    const fail = (step: string, err: unknown): never => {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`${step} failed: ${reason}${created.length ? ` - already created: ${created.join(', ')}. Finish or remove the Layer in Connections; never delete the Data Sync, as that deletes the Mission` : ''}`);
    };

    let dataSyncId: number;
    if ('reuse' in plan.dataSync) {
        dataSyncId = plan.dataSync.reuse;
    } else {
        onStep(`Creating the Data Sync for ${request.missionName}`);
        try {
            dataSyncId = await createDataSync(request.connectionId, plan.dataSync.create, request.missionGuid);
            created.push(`Data Sync ${dataSyncId}`);
        } catch (err) {
            return fail('Creating the Data Sync', err);
        }
    }

    let layerId: number;
    onStep(`Creating the Layer ${String(plan.layer.name)}`);
    try {
        const layer = await std(`/api/connection/${request.connectionId}/layer`, {
            method: 'POST',
            body: plan.layer,
        }) as { id: number };
        layerId = layer.id;
        created.push(`Layer ${layer.id}`);
    } catch (err) {
        return fail('Creating the Layer', err);
    }

    onStep('Scheduling the Layer and linking the Data Sync');
    try {
        await std(`/api/connection/${request.connectionId}/layer/${layerId}/incoming`, {
            method: 'POST',
            body: { ...plan.incoming, data: dataSyncId },
        });
    } catch (err) {
        return fail('Scheduling the Layer', err);
    }

    onStep('Saving the pair settings (dry run)');
    try {
        await std(`/api/connection/${request.connectionId}/layer/${layerId}/incoming`, {
            method: 'PATCH',
            body: { environment: plan.environment },
        });
    } catch (err) {
        // CloudTAK saves the settings and then calls the Layer's Lambda, which a new Layer is
        // still deploying - so the save reports an error although it worked. Check what was saved
        const saved = await fetchLayer(request.connectionId, layerId).catch(() => undefined);
        if (!saved || !hasPair(saved.environment, plan.mapId, request.missionGuid)) {
            return fail('Saving the pair settings', err);
        }
    }

    return { mapId: plan.mapId, layerId, dataSyncId, reusedDataSync: 'reuse' in plan.dataSync };
}

async function listDataSyncs(connectionId: number): Promise<DataSyncSummary[]> {
    const dataUrl = stdurl(`/api/connection/${connectionId}/data`);
    dataUrl.searchParams.set('limit', '100');
    return (await std(dataUrl) as { items: DataSyncSummary[] }).items ?? [];
}

/** Create a Data Sync and check it attached the expected Mission rather than a new one */
async function createDataSync(connectionId: number, body: Record<string, unknown>, missionGuid: string): Promise<number> {
    const data = await std(`/api/connection/${connectionId}/data`, {
        method: 'POST',
        body,
    }) as { id: number; mission_exists?: boolean; mission_error?: string; mission_guid?: string | null };

    if (data.mission_exists === false) throw new Error(`Data Sync ${data.id}: ${data.mission_error || 'the Mission could not be attached'}`);
    if (data.mission_guid && data.mission_guid !== missionGuid) {
        throw new Error(`Data Sync ${data.id} attached Mission ${data.mission_guid}, not ${missionGuid}`);
    }
    return data.id;
}

/**
 * The name of a Mission by GUID, for pairs on Missions the user is not subscribed to -
 * undefined when the TAK Server does not return it
 */
export async function lookupMissionName(guid: string): Promise<string | undefined> {
    try {
        const mission = await std(`/api/marti/missions/${encodeURIComponent(guid)}`) as { name?: string };
        return mission.name || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Connect a pair's Layer to its Mission's Data Sync on the Layer's Connection - reusing the
 * Connection's Data Sync of the Mission, else creating one attached by name. Only the Data
 * Destination is changed, so the pair keeps its settings and links
 */
export async function connectEtlPairDataSync(pair: EtlPair, missionName: string | undefined, onStep: (step: string) => void = () => {}): Promise<number> {
    onStep('Checking the Layer and Data Syncs');
    const layer = await fetchLayer(pair.connectionId, pair.layerId);
    const current = (layer.incoming as { data?: number | null } | undefined)?.data ?? null;
    const layerPairs = (layer.environment as { Source?: { Pairs?: unknown[] } } | undefined)?.Source?.Pairs?.length ?? 0;

    const plan = planDataDestination({ ...pair, dataSyncId: current }, layerPairs, await listDataSyncs(pair.connectionId), missionName);
    if ('error' in plan) throw new Error(plan.error);

    let dataSyncId: number;
    if ('reuse' in plan) {
        dataSyncId = plan.reuse;
    } else {
        onStep(`Creating the Data Sync for ${missionName}`);
        dataSyncId = await createDataSync(pair.connectionId, plan.create, pair.missionGuid);
    }

    onStep(`Linking Data Sync ${dataSyncId} to the Layer`);
    try {
        await std(`/api/connection/${pair.connectionId}/layer/${pair.layerId}/incoming`, {
            method: 'PATCH',
            body: { data: dataSyncId },
        });
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`Linking Data Sync ${dataSyncId} to Layer ${pair.layerId} failed: ${reason}. The Data Sync stays - never delete it, as that deletes the Mission`, { cause: err });
    }

    return dataSyncId;
}

/**
 * Set DryRun on a pair's Layer: false (Go Live) and its next run writes to CalTopo and the
 * Mission; true (Pause) and its next run writes to neither. Only the Layer's settings change, so
 * there is no redeploy - it takes effect on the next run, within a minute.
 */
async function setEtlPairDryRun(pair: EtlPair, dryRun: boolean): Promise<void> {
    const layer = await fetchLayer(pair.connectionId, pair.layerId);
    const next = dryRunEnvironment(layer.environment, dryRun);
    if ('error' in next) throw new Error(next.error);

    await std(`/api/connection/${pair.connectionId}/layer/${pair.layerId}/incoming`, {
        method: 'PATCH',
        body: { environment: next.environment },
    });
}

export function goLiveEtlPair(pair: EtlPair): Promise<void> {
    return setEtlPairDryRun(pair, false);
}

export function pauseEtlPair(pair: EtlPair): Promise<void> {
    return setEtlPairDryRun(pair, true);
}

/** CloudTAK's Layer settings page, where the Layer's Enabled switch stops everything */
export function etlLayerEditUrl(pair: EtlPair): string {
    return `/connection/${pair.connectionId}/layer/${pair.layerId}/edit`;
}
