import type { DeploymentSettings } from './src/storage/deploymentDefaults.ts';

/**
 * Copy to config.local.ts (gitignored), fill in this deployment, then restart
 * or rebuild CloudTAK's app/.
 *
 * These values are compiled into the web bundle. Anyone who can load CloudTAK
 * can read them, including the CalTopo credential key. Do not put per-user
 * secrets here. PLI settings stay in the browser.
 */
export const deploymentDefaults: DeploymentSettings = {
    credentialKey: '',
    credentialId: '',
    accountId: '',
    /** Prefills the Node-RED Base URL field. */
    noderedUrl: '',
};
