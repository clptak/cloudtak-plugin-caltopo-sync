// Reads and creates the Map/Mission pairs run by the CloudTAK CalTopo ETL
// through CloudTAK's own API. Connection Layers and Data Syncs need access to
// the Connection - a CloudTAK System Administrator on a self-hosted CloudTAK.

import { std, stdurl } from '../../../../src/std.ts';
import { etlPairsFromLayer } from '../lib/etl-pairs.ts';
import type { EtlLayer, EtlPair } from '../lib/etl-pairs.ts';
import { planEtlPair, templateCandidates, goLiveEnvironment } from '../lib/etl-pair-plan.ts';
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

    const dataUrl = stdurl(`/api/connection/${request.connectionId}/data`);
    dataUrl.searchParams.set('limit', '100');
    const dataSyncs = (await std(dataUrl) as { items: DataSyncSummary[] }).items ?? [];

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
            const data = await std(`/api/connection/${request.connectionId}/data`, {
                method: 'POST',
                body: plan.dataSync.create,
            }) as { id: number; mission_exists?: boolean; mission_error?: string; mission_guid?: string | null };

            dataSyncId = data.id;
            created.push(`Data Sync ${data.id}`);

            if (data.mission_exists === false) throw new Error(data.mission_error || 'the Mission could not be attached');
            if (data.mission_guid && data.mission_guid !== request.missionGuid) {
                throw new Error(`it attached Mission ${data.mission_guid}, not ${request.missionGuid}`);
            }
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
        return fail('Saving the pair settings', err);
    }

    return { mapId: plan.mapId, layerId, dataSyncId, reusedDataSync: 'reuse' in plan.dataSync };
}

/** Turn DryRun off on a pair's Layer, so its next run writes to CalTopo */
export async function goLiveEtlPair(pair: EtlPair): Promise<void> {
    const layer = await fetchLayer(pair.connectionId, pair.layerId);
    const live = goLiveEnvironment(layer.environment);
    if ('error' in live) throw new Error(live.error);

    await std(`/api/connection/${pair.connectionId}/layer/${pair.layerId}/incoming`, {
        method: 'PATCH',
        body: { environment: live.environment },
    });
}
