/**
 * Runtime hook for the incident-manager Create Mission card.
 * That card calls window.__cloudtakCaltopo.createMap when the toggle is on.
 * Plugins cannot import each other, so the contract lives on window.
 */
import type { Pinia } from 'pinia';
import ProfileConfig from '../../../../src/base/profile.ts';
import { buildCreateMapBody, createCaltopoMap } from '../api/caltopo-client.ts';
import { useCaltopoSyncStore } from '../stores/plugin-state.ts';

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

const CREDENTIALS_ERROR = 'Caltopo credentials are incomplete. Fill them in Settings (gear icon).';

type CaltopoHostWindow = Window & {
    __cloudtakCaltopo?: {
        createMap(req: IncidentMapRequest): Promise<IncidentMapResult>;
    };
};

function hostWindow(): CaltopoHostWindow {
    return window as CaltopoHostWindow;
}

async function resolveUsername(): Promise<string> {
    try {
        const cfg = await ProfileConfig.get('username');
        if (cfg && cfg.value) return String(cfg.value);
    } catch {
        // fall through to a network fetch
    }
    try {
        const profile = await ProfileConfig.fetch();
        if (profile && profile.username) return String(profile.username);
    } catch {
        // no username available
    }
    return '';
}

export function registerIncidentProvider(pinia: Pinia): void {
    hostWindow().__cloudtakCaltopo = {
        async createMap(req) {
            const username = await resolveUsername();
            const creds = useCaltopoSyncStore(pinia).loadCaltopoSettings(username);
            if (!creds.credentialId.trim() || !creds.credentialKey.trim() || !creds.accountId.trim()) {
                throw new Error(CREDENTIALS_ERROR);
            }

            const markerTitle = (req.activityNumber || '').trim() || req.missionName;
            const hasCoords = typeof req.lat === 'number' && typeof req.lng === 'number'
                && Number.isFinite(req.lat) && Number.isFinite(req.lng);
            const payload = buildCreateMapBody({
                missionName: req.missionName,
                drOrActivity: markerTitle,
                ...(hasCoords ? { lat: req.lat, lon: req.lng } : {}),
            });
            const result = await createCaltopoMap({
                accountId: creds.accountId.trim(),
                credentialId: creds.credentialId.trim(),
                credentialKey: creds.credentialKey.trim(),
                payload,
            });
            return { mapId: result.id, url: `https://caltopo.com/m/${result.id}` };
        },
    };
}

export function unregisterIncidentProvider(): void {
    delete hostWindow().__cloudtakCaltopo;
}
