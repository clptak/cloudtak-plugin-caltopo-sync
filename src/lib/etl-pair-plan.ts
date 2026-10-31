// Plans a new Map/Mission pair for the CloudTAK CalTopo ETL - what to create in
// CloudTAK and with which settings - without calling anything, so the safety
// rules can be tested. cloudtak-etl-client.ts carries the plan out.
//
// Phase A: one Layer per pair. A new pair's Layer copies its CalTopo
// credentials, mission token and App Tracks settings from an existing CalTopo
// Sync Layer (the "template") on the same Connection, so nobody types or sees
// a secret. The first pair of a Connection is set up by an admin (etl-caltopo
// docs/ADMIN_PAIRING.md).

import type { EtlPair } from './etl-pairs.ts';

export const ETL_PAIR_CRON = 'rate(1 minute)';
export const ETL_PAIR_MIN_MEMORY = 256;

/** TAK Server's role for a Data Sync with Mission Diff - CloudTAK rejects any other */
export const MISSION_DIFF_ROLE = 'MISSION_READONLY_SUBSCRIBER';

export interface PairRequest {
    connectionId: number;
    missionGuid: string;
    /** Exact TAK Mission name - a Data Sync attaches the Mission of the same name */
    missionName: string;
    /** CalTopo map id or URL, ie: APJ7U0R or https://caltopo.com/m/APJ7U0R */
    map: string;
}

export interface TemplateLayer {
    id: number;
    task: string;
    memory: number;
    timeout: number;
    permissions: string[];
    environment: unknown;
}

export interface DataSyncSummary {
    id: number;
    name: string;
    mission_guid?: string | null;
}

export interface PairPlan {
    mapId: string;
    /** An existing Data Sync of the Mission, or the body of a new one */
    dataSync: { reuse: number } | { create: Record<string, unknown> };
    layer: Record<string, unknown>;
    incoming: { cron: string };
    /** The pair Layer's environment - holds the copied credentials, never shown */
    environment: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** The CalTopo map id in an id or a map URL, or '' when there is none */
export function caltopoMapId(input: string): string {
    const value = input.trim();
    const fromUrl = value.match(/\/m\/([A-Za-z0-9]+)/);
    const id = fromUrl ? fromUrl[1] : value;
    return /^[A-Za-z0-9]{4,12}$/.test(id) ? id.toUpperCase() : '';
}

function semver(task: string): number[] {
    return (task.match(/(\d+)\.(\d+)\.(\d+)$/)?.slice(1) ?? ['0', '0', '0']).map(Number);
}

/** The pair Layers of a Connection a new pair can copy settings from - newest version first */
export function templateCandidates(pairs: EtlPair[], connectionId: number): EtlPair[] {
    const layers = new Map<number, EtlPair>();
    for (const pair of pairs) if (pair.connectionId === connectionId) layers.set(pair.layerId, pair);

    return [...layers.values()].sort((a, b) => {
        const [x, y] = [semver(a.version), semver(b.version)];
        return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
    });
}

export function planEtlPair(
    request: PairRequest,
    existing: EtlPair[],
    dataSyncs: DataSyncSummary[],
    template: TemplateLayer | undefined,
): PairPlan | { error: string } {
    const mapId = caltopoMapId(request.map);
    if (!mapId) return { error: 'Enter a CalTopo map ID (ie: APJ7U0R) or the map\'s URL' };
    if (!request.missionGuid || !request.missionName) return { error: 'Select a TAK Mission' };

    // Two Layers on one Mission empty each other's Mission folder (etl-caltopo decisions log)
    const missionPaired = existing.find((p) => p.missionGuid === request.missionGuid);
    if (missionPaired) return { error: `${request.missionName} is already paired with CalTopo map ${missionPaired.mapId}` };

    const mapPaired = existing.find((p) => p.mapId === mapId);
    if (mapPaired) return { error: `CalTopo map ${mapId} is already paired with another TAK Mission` };

    const source = record(record(template?.environment)?.Source);
    if (!template || !source || source.Mode !== 'Sync') {
        return { error: 'This Connection has no CalTopo Sync Layer to copy credentials from - an admin sets up its first pair (ADMIN_PAIRING.md)' };
    }
    for (const key of ['CredentialId', 'CredentialSecret', 'MissionToken']) {
        if (typeof source[key] !== 'string' || !source[key]) {
            return { error: `The CalTopo Layer ${template.id} on this Connection has no ${key} to copy` };
        }
    }

    // A Mission's own Data Sync is reused - a second one would attach the same Mission twice
    const sync = dataSyncs.find((d) => d.mission_guid === request.missionGuid)
        ?? dataSyncs.find((d) => d.name === request.missionName);

    return {
        mapId,
        dataSync: sync ? { reuse: sync.id } : {
            create: {
                name: request.missionName,
                description: `CalTopo map ${mapId}`,
                mission_sync: true,
                mission_diff: true,
                mission_role: MISSION_DIFF_ROLE,
            },
        },
        layer: {
            // Also the name of the Mission folder CalTopo objects go in - not renamed later
            name: `CalTopo ${mapId}`,
            description: `CalTopo map ${mapId} - ${request.missionName}`.slice(0, 255),
            task: template.task,
            enabled: true,
            logging: true,
            memory: Math.max(template.memory, ETL_PAIR_MIN_MEMORY),
            timeout: template.timeout,
            permissions: template.permissions,
        },
        incoming: { cron: ETL_PAIR_CRON },
        environment: {
            ...record(template.environment),
            Source: {
                ...source,
                Pairs: [{ MapId: mapId, MissionGuid: request.missionGuid }],
                // A new pair always starts as a dry run - Go Live once its plan looks right
                DryRun: true,
            },
        },
    };
}

/** A pair Layer's environment with DryRun turned off */
export function goLiveEnvironment(environment: unknown): { environment: Record<string, unknown> } | { error: string } {
    const env = record(environment);
    const source = record(env?.Source);
    if (!env || !source || source.Mode !== 'Sync') return { error: 'Not a CalTopo Sync Layer' };
    return { environment: { ...env, Source: { ...source, DryRun: false } } };
}
