import type { Feature } from '../../../../src/types.ts';
import type { BuiltPliPayload } from './kml-app-tracks.ts';

export function buildPliFeature(payload: BuiltPliPayload, missionGuid: string): Feature {
    const now = new Date().toISOString();
    return {
        type: 'Feature',
        id: payload.uid,
        path: '/',
        geometry: {
            type: 'Point',
            coordinates: [payload.lon, payload.lat, payload.altitude],
        },
        properties: {
            type: 'a-f-G-U-C',
            how: 'm-g',
            time: now,
            start: now,
            stale: payload.stale,
            callsign: payload.uid,
            group: {
                name: payload.groupName,
                role: payload.role,
            },
            status: {},
            dest: [{ 'mission-guid': missionGuid }],
            ...(payload.phone ? { phone: payload.phone } : {}),
        },
    } as Feature;
}
