export type SyncMode = 'bidirectional' | 'tak_to_caltopo' | 'caltopo_to_tak';

export interface Pair {
    id: number;
    caltopo_map_id: string;
    tak_mission_id: string;
    label?: string;
    sync_mode?: SyncMode;
    share_pli?: boolean;
    pli_interval_sec?: number;
    pli_connect_key_id?: string | null;
    last_sync_at?: string | null;
    last_result?: SyncResult | null;
}

export interface SyncRequest {
    caltopo_map_id: string;
    tak_mission_id: string;
    sync_mode?: SyncMode;
    force?: boolean;
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
        mode?: SyncMode;
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

export interface UpdatePairBody {
    sync_mode?: SyncMode;
    label?: string;
    share_pli?: boolean;
    pli_interval_sec?: number;
    pli_connect_key_id?: string | null;
}

export interface CreatePairBody {
    caltopo_map_id: string;
    tak_mission_id: string;
    label?: string;
    sync_mode?: SyncMode;
    share_pli?: boolean;
    pli_interval_sec?: number;
    pli_connect_key_id?: string | null;
}

export interface ConnectKeyEntry {
    id: string;
    label: string;
    connectKey: string;
}

export interface PliRegexRule {
    regexKey: string;
    connectKeyId: string;
}

export interface CallsignLookupEntry {
    groupName: string;
    uidPrefix: string;
    uidnumber: string;
    role: string;
    text: string;
}

export interface PliSettings {
    connectKeys: ConnectKeyEntry[];
    regexLookUp: Record<string, string>;
    regexRules: PliRegexRule[];
    callsignLookup: CallsignLookupEntry[];
    takGroupName: string;
    addFilter: boolean;
    addFilterList: string[];
    baseCaltopoUrl: string;
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
