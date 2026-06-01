// Direct browser → CalTopo client for creating a CollaborativeMap.
//
// This is a port of the Node-RED HMAC-signing function used by the existing
// CalTAKsync engine. The signing logic is isolated in this module so that, if
// the browser-direct call is blocked by CalTopo's CORS policy, a thin Node-RED
// proxy (POST /caltopo/maps) can reuse `buildCreateMapBody` / `signCalTopo`
// without touching the UI.

import type { CaltopoCreateMapPayload, CaltopoCreateMapResult } from '../types.ts';

const CALTOPO_BASE_URL = 'https://caltopo.com';

// CalTopo signs requests with HMAC-SHA256 over `${METHOD} ${PATH}\n${EXPIRES}\n${JSON}`,
// keyed by the base64-decoded credential secret, with the digest base64-encoded.
export async function signCalTopo(secretB64: string, message: string): Promise<string> {
    const secretBytes = base64ToBytes(secretB64);
    const key = await crypto.subtle.importKey(
        'raw',
        // Copy into a fresh ArrayBuffer so the typed-array view length matches exactly.
        secretBytes.buffer.slice(secretBytes.byteOffset, secretBytes.byteOffset + secretBytes.byteLength) as ArrayBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    return bytesToBase64(new Uint8Array(signature));
}

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
    const endpoint = '/api/v1/acct/';
    const path = `${endpoint}${input.accountId}/CollaborativeMap`;
    const expires = Date.now() + 2 * 60 * 1000;
    const json = JSON.stringify(input.payload);

    const message = `POST ${path}\n${expires}\n${json}`;
    const signature = await signCalTopo(input.credentialKey, message);

    const params = new URLSearchParams({
        id: input.credentialId,
        expires: expires.toString(),
        signature,
        json,
    });

    const res = await fetch(`${CALTOPO_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    const text = await res.text();
    let parsed: unknown = undefined;
    try {
        parsed = text ? JSON.parse(text) : undefined;
    } catch {
        // Non-JSON body (e.g. an HTML error page); fall through to error handling.
    }

    if (!res.ok) {
        const detail = text ? `: ${text.slice(0, 500)}` : '';
        throw new Error(`CalTopo create map failed (${res.status})${detail}`);
    }

    const id = extractMapId(parsed);
    if (!id) {
        throw new Error('CalTopo create map succeeded but no map id was returned');
    }

    return { id, raw: parsed };
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

// Decode base64 the way the Node-RED reference does via `Buffer.from(key, 'base64')`,
// which is lenient where the browser's `atob` is strict. CalTopo credential keys
// seen in the wild carry trailing junk after a mid-string '=' (e.g.
// "…WjI=/ll89EcDYaM="); Node decodes only up to that first '=' and ignores the
// rest. We reproduce that exactly so the HMAC secret matches the working flow:
//   1. normalize URL-safe alphabet (- _ -> + /)
//   2. truncate at the first '=' padding (Node treats it as end-of-data)
//   3. drop any remaining non-alphabet chars (whitespace, stray symbols)
//   4. re-pad to a multiple of 4 so atob() accepts it
function base64ToBytes(b64: string): Uint8Array {
    let s = b64.trim().replace(/-/g, '+').replace(/_/g, '/');

    const eq = s.indexOf('=');
    if (eq !== -1) s = s.slice(0, eq);

    s = s.replace(/[^A-Za-z0-9+/]/g, '');

    const remainder = s.length % 4;
    if (remainder === 2) s += '==';
    else if (remainder === 3) s += '=';
    else if (remainder === 1) s = s.slice(0, -1);

    const binary = atob(s);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
