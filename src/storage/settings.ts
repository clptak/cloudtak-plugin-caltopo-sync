import type { CaltopoSettings } from '../types.ts';
import { deploymentDefaults } from './deploymentDefaults.ts';

const CALTOPO_STRING_KEYS = [
    'credentialKey',
    'credentialId',
    'accountId',
] as const satisfies readonly (keyof CaltopoSettings)[];

function trimmed(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNoderedUrl(value: string): string {
    return value.trim().replace(/\/+$/, '');
}

/** Blank credential fields fall back to config.local.ts. A saved non-blank string wins. */
export function applyCaltopoDefaults(stored: Partial<CaltopoSettings> | null): CaltopoSettings {
    const deployed = deploymentDefaults();
    const settings: CaltopoSettings = {
        credentialKey: trimmed(deployed.credentialKey),
        credentialId: trimmed(deployed.credentialId),
        accountId: trimmed(deployed.accountId),
    };

    if (!stored) return settings;

    for (const key of CALTOPO_STRING_KEYS) {
        const fromUser = trimmed(stored[key]);
        settings[key] = fromUser || trimmed(settings[key]);
    }

    return settings;
}

/**
 * Do not freeze deployment credentials into localStorage. A later config.local.ts
 * change then applies on the next load unless the user saved a different value.
 */
export function caltopoForStorage(settings: CaltopoSettings): CaltopoSettings {
    const deployed = deploymentDefaults();
    const stored: CaltopoSettings = { ...settings };

    for (const key of CALTOPO_STRING_KEYS) {
        const fromDeployment = trimmed(deployed[key]);
        if (fromDeployment && stored[key].trim() === fromDeployment) {
            stored[key] = '';
        }
    }

    return stored;
}

/** A blank stored URL falls back to the deployment Node-RED base URL. */
export function resolveNoderedUrl(stored: string | null): string {
    const fromUser = normalizeNoderedUrl(trimmed(stored));
    const fromDeployment = normalizeNoderedUrl(trimmed(deploymentDefaults().noderedUrl));
    return fromUser || fromDeployment;
}

/** Persist '' when the URL still matches config.local.ts, after slash trimming. */
export function noderedUrlForStorage(url: string): string {
    const normalized = normalizeNoderedUrl(url);
    const fromDeployment = normalizeNoderedUrl(trimmed(deploymentDefaults().noderedUrl));
    if (fromDeployment && normalized === fromDeployment) return '';
    return normalized;
}
