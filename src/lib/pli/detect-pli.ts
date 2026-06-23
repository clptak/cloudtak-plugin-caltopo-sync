import type { Feature } from '../../../../../src/types.ts';

const PLI_TYPE_PREFIX = 'a-f-G-U-C';

export function isPliFeature(feature: Pick<Feature, 'properties'>): boolean {
    const type = String(feature.properties?.type ?? '');
    if (!type.startsWith(PLI_TYPE_PREFIX)) return false;
    const status = feature.properties?.status as Record<string, unknown> | undefined;
    const battery = status?.battery;
    return battery !== undefined && battery !== null && String(battery) !== '';
}

export function pliCallsign(feature: Pick<Feature, 'properties'>): string {
    return String(feature.properties?.callsign ?? feature.properties?.id ?? '').trim();
}

export function pliCoordinates(feature: Pick<Feature, 'geometry'>): { lat: number; lon: number } | null {
    const geom = feature.geometry;
    if (!geom || geom.type !== 'Point') return null;
    const coords = geom.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
}

export function featurePositionKey(feature: Pick<Feature, 'id' | 'properties' | 'geometry'>): string {
    const coords = pliCoordinates(feature);
    const callsign = pliCallsign(feature);
    if (!coords) return `${callsign}:no-coords`;
    return `${callsign}:${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}`;
}
