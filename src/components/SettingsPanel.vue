<template>
    <div
        class='settings-panel'
        :class='embedded ? "" : "px-3 py-3"'
    >
        <TablerBorder
            class='cloudtak-accent text-white mb-3'
            :fill-height='false'
            :shadow='false'
            gap='sm'
        >
            <template #label>
                <p class='text-uppercase text-white-50 small mb-0'>
                    Caltopo Settings
                </p>
            </template>

            <div class='row g-2'>
                <div class='col-12'>
                    <TablerInput
                        v-model='caltopo.credentialKey'
                        label='Credential Key'
                        placeholder='Caltopo credential key'
                    />
                </div>
                <div class='col-12'>
                    <TablerInput
                        v-model='caltopo.credentialId'
                        label='Credential ID'
                        placeholder='Caltopo credential ID'
                    />
                </div>
                <div class='col-12'>
                    <TablerInput
                        v-model='caltopo.accountId'
                        label='Team (Folder) ID'
                        placeholder='e.g. SUVCDH'
                        description='The 6-character ID of the team/folder where maps should be created and where your credential has write rights — not your parent account ID. Find it in the team admin URL: caltopo.com/group/<TEAM_ID>/admin/details'
                    />
                </div>
                <div class='col-12 d-flex align-items-center'>
                    <button
                        type='button'
                        class='btn btn-primary'
                        :disabled='caltopoSaving'
                        @click='saveCaltopo'
                    >
                        <IconDeviceFloppy
                            :size='18'
                            stroke='1'
                        />
                        <span class='ms-2'>Save</span>
                    </button>
                    <span
                        v-if='caltopoSaved'
                        class='ms-3 text-green d-flex align-items-center'
                    >
                        <IconCircleCheck
                            :size='18'
                            stroke='1'
                        />
                        <span class='ms-1'>Saved</span>
                    </span>
                </div>
            </div>
        </TablerBorder>

        <PliSettingsPanel
            v-if='currentUsername'
            :username='currentUsername'
        />

        <TablerBorder
            class='cloudtak-accent text-white'
            :fill-height='false'
            :shadow='false'
            gap='sm'
        >
            <template #label>
                <p class='text-uppercase text-white-50 small mb-0'>
                    Node-RED Connection
                </p>
            </template>

            <div class='row g-2'>
                <div class='col-12'>
                    <TablerInput
                        v-model='localUrl'
                        label='Node-RED Base URL'
                        placeholder='https://node-red.example.com'
                        :description='`Base URL of the Node-RED instance hosting the CalTAKsync subflow. Stored locally under "caltopo-sync-nodered-url".`'
                    />
                </div>
                <div class='col-12 d-flex align-items-center'>
                    <button
                        type='button'
                        class='btn btn-primary'
                        :disabled='!localUrl.trim() || testing'
                        @click='saveAndTest'
                    >
                        <IconPlugConnected
                            :size='18'
                            stroke='1'
                        />
                        <span class='ms-2'>Save &amp; Test Connection</span>
                    </button>
                    <button
                        type='button'
                        class='btn btn-secondary ms-2'
                        :disabled='localUrl === store.noderedUrl'
                        @click='resetField'
                    >
                        Reset
                    </button>
                </div>
            </div>
        </TablerBorder>

        <TablerLoading
            v-if='testing'
            class='mt-3'
            :compact='true'
            desc='Contacting Node-RED…'
        />

        <TablerAlert
            v-else-if='error'
            class='mt-3'
            :err='error'
        />

        <TablerBorder
            v-else-if='store.lastHealth'
            class='cloudtak-accent text-white mt-3'
            :fill-height='false'
            :shadow='false'
            gap='sm'
        >
            <template #label>
                <p class='text-uppercase text-white-50 small mb-0'>
                    Last Health Check
                </p>
            </template>

            <HealthRow
                label='Caltopo credentials'
                :ok='store.lastHealth.caltopo_creds_ok'
            />
            <HealthRow
                label='PostGIS reachable'
                :ok='store.lastHealth.postgis_ok'
            />
            <HealthRow
                label='Icon configs present'
                :ok='store.lastHealth.icon_configs_ok'
            />
            <HealthRow
                label='TAK server reachable'
                :ok='store.lastHealth.tak_reachable'
            />
        </TablerBorder>
    </div>
</template>

<script setup lang='ts'>
import { ref, watch, onMounted, defineComponent, h } from 'vue';
import {
    TablerInput,
    TablerLoading,
    TablerAlert,
    TablerBorder,
} from '@tak-ps/vue-tabler';
import {
    IconPlugConnected,
    IconCircleCheck,
    IconCircleX,
    IconDeviceFloppy,
} from '@tabler/icons-vue';
import ProfileConfig from '../../../../src/base/profile.ts';
import { useCaltopoSyncStore } from '../stores/plugin-state.ts';
import { health } from '../api/nodered-client.ts';
import type { CaltopoSettings } from '../types.ts';
import PliSettingsPanel from './PliSettingsPanel.vue';

const props = defineProps({
    embedded: {
        type: Boolean,
        default: false,
    },
    username: {
        type: String,
        default: '',
    },
});

const HealthRow = defineComponent({
    props: {
        label: { type: String, required: true },
        ok: { type: Boolean, required: true },
    },
    setup(healthProps) {
        return () => h('div', { class: 'd-flex align-items-center py-1' }, [
            healthProps.ok
                ? h(IconCircleCheck, { size: 20, stroke: '1', class: 'text-green' })
                : h(IconCircleX, { size: 20, stroke: '1', class: 'text-red' }),
            h('div', { class: 'ms-2', textContent: healthProps.label }),
        ]);
    },
});

const store = useCaltopoSyncStore();
const localUrl = ref<string>(store.noderedUrl);
const testing = ref(false);
const error = ref<Error | undefined>();

const caltopo = ref<CaltopoSettings>({ ...store.caltopoSettings });
const caltopoSaving = ref(false);
const caltopoSaved = ref(false);
const currentUsername = ref<string>(props.username);

watch(() => store.noderedUrl, (v) => {
    if (localUrl.value !== v) localUrl.value = v;
});

// Resolve the logged-in CloudTAK username so Caltopo credentials persist for
// this user only. Prefer the locally-synced profile, fall back to the API.
async function resolveUsername(): Promise<string> {
    try {
        const cfg = await ProfileConfig.get('username');
        if (cfg && cfg.value) return String(cfg.value);
    } catch {
        // ignore; fall through to network fetch
    }
    try {
        const profile = await ProfileConfig.fetch();
        if (profile && profile.username) return String(profile.username);
    } catch {
        // ignore; no username available
    }
    return '';
}

onMounted(async () => {
    if (!currentUsername.value) {
        currentUsername.value = await resolveUsername();
    }
    caltopo.value = { ...store.loadCaltopoSettings(currentUsername.value) };
    store.loadPliSettings(currentUsername.value);

    if (store.noderedUrl && !store.lastHealth) {
        try {
            store.setLastHealth(await health());
        } catch {
            store.setLastHealth(null);
        }
    }
});

async function saveCaltopo() {
    caltopoSaving.value = true;
    caltopoSaved.value = false;
    try {
        if (!currentUsername.value) {
            currentUsername.value = await resolveUsername();
        }
        store.saveCaltopoSettings(currentUsername.value, {
            credentialKey: caltopo.value.credentialKey.trim(),
            credentialId: caltopo.value.credentialId.trim(),
            accountId: caltopo.value.accountId.trim(),
        });
        caltopo.value = { ...store.caltopoSettings };
        caltopoSaved.value = true;
        setTimeout(() => { caltopoSaved.value = false; }, 2500);
    } finally {
        caltopoSaving.value = false;
    }
}

function resetField() {
    localUrl.value = store.noderedUrl;
}

async function saveAndTest() {
    error.value = undefined;
    store.setNoderedUrl(localUrl.value);
    testing.value = true;
    try {
        const result = await health();
        store.setLastHealth(result);
    } catch (err) {
        store.setLastHealth(null);
        error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
        testing.value = false;
    }
}
</script>

<style scoped>
.settings-panel {
    --tabler-input-bg: var(--cloudtak-inset-bg);
    --tblr-bg-forms: var(--cloudtak-inset-bg);
}

.settings-panel :deep(.cloudtak-bg),
.settings-panel :deep(.card) {
    background-color: var(--cloudtak-inset-bg) !important;
    border-color: var(--cloudtak-inset-border);
}

.settings-panel :deep(.card-header) {
    background-color: transparent !important;
}
</style>
