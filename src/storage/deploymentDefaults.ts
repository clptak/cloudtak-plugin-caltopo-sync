import type { CaltopoSettings } from '../types.ts';

/** Shared settings compiled in from gitignored config.local.ts. */
export type DeploymentSettings = Partial<CaltopoSettings & { noderedUrl: string }>;

interface DeploymentModule {
    deploymentDefaults?: DeploymentSettings;
}

/**
 * Vite includes config.local.ts only when that file exists at build time.
 * A missing file becomes an empty module map, so clones without it still build.
 * The glob path is relative to this file and must stay a direct import.meta.glob call.
 */
export function deploymentDefaults(): DeploymentSettings {
    const modules = import.meta.glob<DeploymentModule>('../../config.local.ts', {
        eager: true,
    });

    for (const mod of Object.values(modules)) {
        const defaults = mod?.deploymentDefaults;
        if (!defaults || typeof defaults !== 'object') continue;
        return { ...defaults };
    }

    return {};
}

export function hasDeploymentDefaults(): boolean {
    return Object.values(deploymentDefaults()).some((value) => {
        if (typeof value === 'string') return value.trim().length > 0;
        return value !== undefined && value !== null;
    });
}
