import type {
    CreatePairBody,
    HealthCheck,
    Pair,
    SyncResult,
} from '../types.ts';
import { useCaltopoSyncStore } from '../stores/plugin-state.ts';

function joinUrl(base: string, path: string): string {
    if (!base) throw new Error('Node-RED base URL is not configured');
    const b = base.replace(/\/+$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${b}${p}`;
}

async function request<T>(
    method: string,
    path: string,
    body?: unknown,
): Promise<T> {
    const store = useCaltopoSyncStore();
    const url = joinUrl(store.noderedUrl, path);

    const init: RequestInit = {
        method,
        headers: { 'Accept': 'application/json' },
    };

    if (body !== undefined) {
        init.body = JSON.stringify(body);
        (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, init);

    if (!res.ok) {
        let detail = '';
        try {
            const txt = await res.text();
            detail = txt ? `: ${txt}` : '';
        } catch {
            // ignore
        }
        throw new Error(`Node-RED ${method} ${path} failed (${res.status})${detail}`);
    }

    if (res.status === 204) {
        return undefined as T;
    }

    const ct = res.headers.get('Content-Type') ?? '';
    if (ct.includes('application/json')) {
        return await res.json() as T;
    }
    return undefined as T;
}

export function health(): Promise<HealthCheck> {
    return request<HealthCheck>('GET', '/sync/health');
}

export function listPairs(): Promise<Pair[]> {
    return request<Pair[]>('GET', '/sync/pairs');
}

export function createPair(body: CreatePairBody): Promise<Pair> {
    return request<Pair>('POST', '/sync/pairs', body);
}

export function deletePair(id: number): Promise<void> {
    return request<void>('DELETE', `/sync/pairs/${encodeURIComponent(String(id))}`);
}

export function runSync(pair: Pair): Promise<SyncResult> {
    return request<SyncResult>('POST', '/sync/run', {
        caltopo_map_id: pair.caltopo_map_id,
        tak_mission_id: pair.tak_mission_id,
    });
}

// Generic CalTopo proxy. The browser cannot call caltopo.com directly (no CORS
// headers), so Node-RED signs and forwards the request server-to-server. See
// nodered/caltopo-proxy-flow.json. Path lives under /sync/ so it rides the same
// reverse-proxy route as the rest of the bridge. `body` carries { method,
// endpoint, accountId, mapID?, uuid?, since?, payload?, credentialId?, credentialKey? }.
export function caltopoProxy<T = unknown>(body: Record<string, unknown>): Promise<T> {
    return request<T>('POST', '/sync/caltopo', body);
}
