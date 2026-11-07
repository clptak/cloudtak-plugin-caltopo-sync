// Map/Mission pairs run by the CloudTAK CalTopo ETL (etl-caltopo, Sync mode)
// rather than the Node-RED engine. A pair lives in a Layer's incoming
// environment (Source.Pairs) and the ETL saves the outcome of each pair's last
// run in the Layer's incoming ephemeral store under `sync:status` - see
// etl-caltopo docs/MISSION_SYNC.md.
//
// The Layer environment also holds the CalTopo credentials and the mission
// token, so only the pair fields are copied out of it here.

export const ETL_STATUS_KEY = 'sync:status';

/** A run older than this on an enabled Layer means the Layer is not running */
export const ETL_STALE_MS = 5 * 60 * 1000;

export interface EtlPairStatus {
    at: string;
    ok: boolean;
    dryRun: boolean;
    mission?: number;
    caltopo?: number;
    linked?: number;
    plan?: Record<string, number>;
    applied?: number;
    failed?: number;
    toTak?: number;
    appTracks?: number;
    /** CalTopo objects the ETL kept back because CloudTAK would reject them */
    notSent: Array<{ id: string; title: string; reason: string }>;
    errors: string[];
}

export interface EtlPair {
    connectionId: number;
    connectionName: string;
    layerId: number;
    layerName: string;
    enabled: boolean;
    /** ETL version, ie: 5.18.0 */
    version: string;
    /** Connection Data Sync the Layer writes CalTopo objects into */
    dataSyncId: number | null;
    mapId: string;
    missionGuid: string;
    dryRun: boolean;
    /** Outcome of the last run - undefined until a 5.18.0+ Layer has run */
    status?: EtlPairStatus;
}

export type EtlPairHealth = 'ok' | 'error' | 'partial' | 'dry-run' | 'disabled' | 'stale' | 'never';

/** The subset of a CloudTAK Layer response read here */
export interface EtlLayer {
    id: number;
    name: string;
    enabled: boolean;
    task: string;
    incoming?: {
        environment?: unknown;
        ephemeral?: Record<string, unknown>;
        data?: number | null;
    };
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** True for a Layer running the CalTopo ETL task, ie: etl-caltopo-v5.18.0 */
export function isCaltopoTask(task: string): boolean {
    return /^etl-caltopo-v/i.test(task);
}

/** The pairs of one CalTopo Layer in Sync mode - empty for any other Layer */
export function etlPairsFromLayer(connection: { id: number; name: string }, layer: EtlLayer): EtlPair[] {
    if (!isCaltopoTask(layer.task)) return [];

    const source = record(record(layer.incoming?.environment)?.Source);
    if (!source || source.Mode !== 'Sync' || !Array.isArray(source.Pairs)) return [];

    const status = record(layer.incoming?.ephemeral?.[ETL_STATUS_KEY]);
    const statuses = Array.isArray(status?.pairs) ? status.pairs.map(record).filter((s) => s !== undefined) : [];

    const pairs: EtlPair[] = [];
    for (const raw of source.Pairs) {
        const pair = record(raw);
        const mapId = typeof pair?.MapId === 'string' ? pair.MapId : '';
        const missionGuid = typeof pair?.MissionGuid === 'string' ? pair.MissionGuid : '';
        if (!mapId || !missionGuid) continue;

        const found = statuses.find((s) => s.MapId === mapId && s.MissionGuid === missionGuid);

        pairs.push({
            connectionId: connection.id,
            connectionName: connection.name,
            layerId: layer.id,
            layerName: layer.name,
            enabled: layer.enabled,
            version: layer.task.replace(/^.*-v/, ''),
            dataSyncId: layer.incoming?.data ?? null,
            mapId,
            missionGuid,
            dryRun: source.DryRun !== false,
            status: found && typeof found.at === 'string' ? {
                at: found.at,
                ok: found.ok === true,
                dryRun: found.dryRun === true,
                mission: found.mission as number | undefined,
                caltopo: found.caltopo as number | undefined,
                linked: found.linked as number | undefined,
                plan: record(found.plan) as Record<string, number> | undefined,
                applied: found.applied as number | undefined,
                failed: found.failed as number | undefined,
                toTak: found.toTak as number | undefined,
                appTracks: found.appTracks as number | undefined,
                notSent: Array.isArray(found.notSent) ? found.notSent.map(record).filter((n) => n !== undefined).map((n) => ({
                    id: String(n.id ?? ''),
                    title: String(n.title ?? n.id ?? ''),
                    reason: String(n.reason ?? ''),
                })) : [],
                errors: Array.isArray(found.errors) ? found.errors.map(String) : [],
            } : undefined,
        });
    }

    return pairs;
}

/** One word for how a pair is doing, worst first */
export function etlPairHealth(pair: EtlPair, now = Date.now()): EtlPairHealth {
    if (!pair.enabled) return 'disabled';
    if (!pair.status) return 'never';
    if (!pair.status.ok) return 'error';
    if (now - Date.parse(pair.status.at) > ETL_STALE_MS) return 'stale';
    if (pair.status.dryRun) return 'dry-run';
    if (pair.status.notSent.length) return 'partial';
    return 'ok';
}

/**
 * True when nothing can go from CalTopo to TAK: the Layer has no Data Destination (a Layer set
 * up by hand), so the ETL only copies TAK items to CalTopo
 */
export function etlPairNeedsDataSync(pair: EtlPair): boolean {
    return pair.dataSyncId === null;
}

/** The last run's changes in a few words, ie: "2 created, 1 updated" */
export function etlChangeSummary(status: EtlPairStatus): string {
    const plan = status.plan ?? {};
    const words: Record<string, string> = {
        create: 'created',
        update: 'updated',
        delete: 'deleted',
        adopt: 'adopted',
        folder: 'folders',
    };

    const parts = Object.entries(words)
        .filter(([op]) => plan[op])
        .map(([op, word]) => `${plan[op]} ${status.dryRun ? `to be ${word}` : word}`);

    if (status.failed) parts.push(`${status.failed} failed`);
    return parts.length ? parts.join(', ') : 'No changes';
}
