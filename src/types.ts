export interface Pair {
    id: number;
    caltopo_map_id: string;
    tak_mission_id: string;
    label?: string;
    last_sync_at?: string | null;
    last_result?: SyncResult | null;
}

export interface SyncRequest {
    caltopo_map_id: string;
    tak_mission_id: string;
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
    conflicts: number;
    duration_ms: number;
    errors: string[];
    _signal?: {
        caltopo_synthetic?: boolean;
        tak_synthetic?: boolean;
    };
}

export interface HealthCheck {
    caltopo_creds_ok: boolean;
    postgis_ok: boolean;
    icon_configs_ok: boolean;
    tak_reachable: boolean;
}

export interface NodeRedConfig {
    baseUrl: string;
}

export interface CreatePairBody {
    caltopo_map_id: string;
    tak_mission_id: string;
    label?: string;
}

export interface CaltopoSettings {
    credentialKey: string;
    credentialId: string;
    accountId: string;
}

export interface CaltopoMapOption {
    id: string;
    name: string;
    // CalTopo epoch-ms timestamps (when available) used to order the picker.
    created?: number;
    updated?: number;
}

// Minimal GeoJSON shapes used when constructing the CalTopo map-create body.
export interface CaltopoFeature {
    type: 'Feature';
    geometry: {
        type: 'Point';
        coordinates: [number, number];
    };
    properties: Record<string, unknown>;
}

export interface CaltopoCreateMapPayload {
    properties: {
        title: string;
        mode: string;
        mapConfig: string;
        sharing: string;
    };
    state: {
        type: 'FeatureCollection';
        features: CaltopoFeature[];
    };
}

// CalTopo's create-map response. The new map id lives under `result.id`
// (e.g. "ABCD1"); we keep the raw payload around for diagnostics.
export interface CaltopoCreateMapResult {
    id: string;
    raw: unknown;
}
