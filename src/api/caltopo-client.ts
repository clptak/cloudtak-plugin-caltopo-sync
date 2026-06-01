// CalTopo create-map client.
//
// The browser CANNOT call caltopo.com directly: CalTopo returns no CORS headers,
// so a cross-origin fetch is blocked before our code can read the response
// (confirmed: OPTIONS -> 403 / GET -> 401, neither with Access-Control-Allow-Origin).
// Instead we POST to the Node-RED proxy (nodered/caltopo-proxy-flow.json), which
// signs (HMAC-SHA256) and forwards the request server-to-server, then returns the
// CalTopo response with CORS headers. This module just builds the payload and the
// proxy request; all signing happens in Node-RED.

import type { CaltopoCreateMapPayload, CaltopoCreateMapResult, CaltopoMapOption } from '../types.ts';
import { caltopoProxy } from './nodered-client.ts';

export interface BuildCreateMapBodyInput {
    missionName: string;
    drOrActivity: string;
    lat: number;
    lon: number;
}

// Mirrors docs/caltopo_map_create_body.json: a SAR-mode map shared by URL,
// containing a single red point marker at the call location whose title is the
// DR/Activity number.
export function buildCreateMapBody(input: BuildCreateMapBodyInput): CaltopoCreateMapPayload {
    return {
        properties: {
            title: `ACTIVE DATASYNC '${input.missionName}'`,
            mode: 'sar',
            mapConfig: JSON.stringify({ activeLayers: [['mbh', 1]] }),
            sharing: 'URL',
        },
        state: {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: {
                        // GeoJSON / CalTopo coordinate order is [lon, lat].
                        type: 'Point',
                        coordinates: [input.lon, input.lat],
                    },
                    properties: {
                        title: input.drOrActivity,
                        description: `ACTIVE DATASYNC '${input.missionName}'`,
                        'marker-symbol': 'point',
                        'marker-color': 'FF0000',
                        'marker-size': 1,
                    },
                },
            ],
        },
    };
}

export interface CreateCaltopoMapInput {
    accountId: string;
    credentialId: string;
    credentialKey: string;
    payload: CaltopoCreateMapPayload;
}

export async function createCaltopoMap(input: CreateCaltopoMapInput): Promise<CaltopoCreateMapResult> {
    // Credentials are forwarded to the proxy; if your Node-RED has them in env
    // vars instead, they can be omitted and the proxy will fall back to env.
    const parsed = await caltopoProxy<unknown>({
        method: 'POST',
        endpoint: '/api/v1/acct/',
        accountId: input.accountId,
        credentialId: input.credentialId,
        credentialKey: input.credentialKey,
        payload: input.payload,
    });

    const id = extractMapId(parsed);
    if (!id) {
        throw new Error('CalTopo create map call returned no map id. Raw response: ' + safeStringify(parsed));
    }

    return { id, raw: parsed };
}

export interface ListCaltopoMapsInput {
    accountId: string;
    credentialId: string;
    credentialKey: string;
}

// Lists the CollaborativeMaps the credential can see in the given team/account.
// Uses the account-data endpoint GET /api/v1/acct/{accountId}/since/0 (proxied),
// then extracts every feature with class === 'CollaborativeMap'. The result is
// the {id, name} pairs used to populate the "Caltopo Map (from account)" picker.
export async function listCaltopoMaps(input: ListCaltopoMapsInput): Promise<CaltopoMapOption[]> {
    const parsed = await caltopoProxy<unknown>({
        method: 'GET',
        endpoint: '/api/v1/acct/',
        accountId: input.accountId,
        since: 0,
        credentialId: input.credentialId,
        credentialKey: input.credentialKey,
    });

    return extractCollaborativeMaps(parsed);
}

// The account-data response is a wrapped GeoJSON FeatureCollection. CalTopo nests
// the real body under `result` (matching their docs' `.get("result")`), but be
// defensive in case the proxy hands back the unwrapped object.
function extractCollaborativeMaps(parsed: unknown): CaltopoMapOption[] {
    if (!parsed || typeof parsed !== 'object') return [];
    const obj = parsed as Record<string, unknown>;
    const result = (obj.result ?? obj) as Record<string, unknown>;
    const features = result.features;
    if (!Array.isArray(features)) return [];

    const maps: CaltopoMapOption[] = [];
    for (const feature of features) {
        if (!feature || typeof feature !== 'object') continue;
        const f = feature as Record<string, unknown>;
        const props = (f.properties ?? {}) as Record<string, unknown>;
        if (props.class !== 'CollaborativeMap') continue;
        const id = typeof f.id === 'string' ? f.id : '';
        if (!id) continue;
        const title = typeof props.title === 'string' && props.title ? props.title : id;
        maps.push({ id, name: title });
    }

    maps.sort((a, b) => a.name.localeCompare(b.name));
    return maps;
}

// CalTopo returns the created map under `result` (with `id`); be defensive
// about a few shapes seen in practice.
function extractMapId(parsed: unknown): string | undefined {
    if (!parsed || typeof parsed !== 'object') return undefined;
    const obj = parsed as Record<string, unknown>;
    const result = (obj.result ?? obj) as Record<string, unknown>;
    const id = result.id;
    return typeof id === 'string' && id ? id : undefined;
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}
