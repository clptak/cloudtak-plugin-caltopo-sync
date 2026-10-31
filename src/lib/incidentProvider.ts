/**
 * Runtime hook for the incident-manager Create Mission card.
 * That card calls window.__cloudtakCaltopo.createMap when the toggle is on.
 * Plugins cannot import each other, so the contract lives on window.
 *
 * The map is created by the CloudTAK CalTopo ETL through a flagged Event shared on the
 * user's active channels (lib/caltopo-map-event.ts).
 */
import type { Pinia } from 'pinia';
import { useMapStore } from '../../../../src/stores/map.ts';
import { activeChannels, createCaltopoMap } from '../api/caltopo-map-client.ts';

export interface IncidentMapRequest {
    missionName: string;
    missionGuid: string;
    title?: string;
    activityNumber?: string;
    lat?: number;
    lng?: number;
}

export interface IncidentMapResult {
    mapId: string;
    url?: string;
}

type CaltopoHostWindow = Window & {
    __cloudtakCaltopo?: {
        createMap(req: IncidentMapRequest): Promise<IncidentMapResult>;
    };
};

function hostWindow(): CaltopoHostWindow {
    return window as CaltopoHostWindow;
}

export function registerIncidentProvider(pinia: Pinia): void {
    hostWindow().__cloudtakCaltopo = {
        async createMap(req) {
            const hasCoords = typeof req.lat === 'number' && typeof req.lng === 'number'
                && Number.isFinite(req.lat) && Number.isFinite(req.lng);

            // An Event needs a location - without one the map is centred on the current view
            const center = hasCoords
                ? { lat: req.lat as number, lng: req.lng as number }
                : useMapStore(pinia).map.getCenter();

            const result = await createCaltopoMap({
                name: req.missionName,
                remarks: (req.activityNumber || '').trim(),
                lat: center.lat,
                lon: center.lng,
                channels: await activeChannels(),
                mission: req.missionGuid ? { name: req.missionName, guid: req.missionGuid } : undefined,
            });

            return { mapId: result.mapId, url: result.url };
        },
    };
}

export function unregisterIncidentProvider(): void {
    delete hostWindow().__cloudtakCaltopo;
}
