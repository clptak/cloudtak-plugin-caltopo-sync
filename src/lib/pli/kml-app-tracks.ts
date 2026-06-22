import type { CallsignLookupEntry, PliSettings } from '../../types.ts';

export interface AppTrackPlacemark {
    name: string;
    lat: number;
    lon: number;
}

function splitLatestCoordinates(raw: string): { lat: number; lon: number } | null {
    const parts = raw.split(',');
    if (parts.length < 2) return null;
    const lonPart = parts[parts.length - 2];
    const latPart = parts[parts.length - 1];
    const lon = parseFloat(String(lonPart).split('\n').pop()?.trim() ?? lonPart);
    const lat = parseFloat(String(latPart).trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
}

function extractCoordinatesFromPlacemark(placemark: Element): { lat: number; lon: number } | null {
    const lineString = placemark.getElementsByTagName('LineString')[0];
    if (lineString) {
        const coords = lineString.getElementsByTagName('coordinates')[0]?.textContent;
        if (coords) return splitLatestCoordinates(coords);
    }
    const point = placemark.getElementsByTagName('Point')[0];
    if (point) {
        const coords = point.getElementsByTagName('coordinates')[0]?.textContent;
        if (coords) return splitLatestCoordinates(coords);
    }
    return null;
}

function isRangeRingName(name: string): boolean {
    return /\d+\.?[\d+]?mi?/i.test(name);
}

export function parseAppTrackPlacemarks(kmlText: string): AppTrackPlacemark[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(kmlText, 'text/xml');
    if (doc.querySelector('parsererror')) {
        throw new Error('Failed to parse CalTopo KML');
    }

    const folders = Array.from(doc.getElementsByTagName('Folder'));
    const lineStringFolders = folders.filter((f) => {
        const name = f.getElementsByTagName('name')[0]?.textContent?.trim();
        return name === 'LineStrings';
    });
    const appTrackFolder = lineStringFolders[lineStringFolders.length - 1];
    if (!appTrackFolder) return [];

    const placemarks = Array.from(appTrackFolder.getElementsByTagName('Placemark'));
    const results: AppTrackPlacemark[] = [];

    for (const placemark of placemarks) {
        const name = placemark.getElementsByTagName('name')[0]?.textContent?.trim() ?? '';
        if (!name || isRangeRingName(name)) continue;
        const description = placemark.getElementsByTagName('description')[0]?.textContent?.trim();
        if (description) continue;
        const coords = extractCoordinatesFromPlacemark(placemark);
        if (!coords) continue;
        results.push({ name, lat: coords.lat, lon: coords.lon });
    }

    return results;
}

export interface BuiltPliPayload {
    uid: string;
    lat: number;
    lon: number;
    altitude: number;
    groupName: string;
    role: string;
    phone: string;
    stale: string;
}

export function buildPliFromAppTrack(
    track: AppTrackPlacemark,
    settings: PliSettings,
): BuiltPliPayload {
    const stale = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    let groupName = settings.takGroupName || 'White';
    let role = 'Team Member';
    let uid = track.name.toLowerCase();
    let phone = '';

    const phoneMatch = uid.match(/\d{10}/g);
    if (phoneMatch) phone = phoneMatch[0];

    for (const entry of settings.callsignLookup) {
        if (!entry.text || !uid.toLowerCase().includes(entry.text.toLowerCase())) continue;
        groupName = entry.groupName || groupName;
        role = entry.role || role;
        uid = (entry.uidPrefix + uid.replace(entry.text, '')).trim();
        if (uid.match(/\d{10}/g)) {
            uid = uid.replace(/\d{10}/g, '').trim();
        }
        break;
    }

    return {
        uid: uid.toUpperCase(),
        lat: track.lat,
        lon: track.lon,
        altitude: 9999999.0,
        groupName,
        role,
        phone,
        stale,
    };
}

export function passesAdditionalFilter(name: string, settings: PliSettings): boolean {
    if (!settings.addFilter) return true;
    const lower = name.toLowerCase();
    return settings.addFilterList.some((term) => term.trim() && lower.includes(term.trim().toLowerCase()));
}

export function callsignLookupJsonValid(raw: string): CallsignLookupEntry[] | null {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return null;
        return parsed as CallsignLookupEntry[];
    } catch {
        return null;
    }
}

export function regexLookUpJsonValid(raw: string): Record<string, string> | null {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed as Record<string, string>;
    } catch {
        return null;
    }
}
