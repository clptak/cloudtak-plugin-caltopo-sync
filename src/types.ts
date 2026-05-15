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
