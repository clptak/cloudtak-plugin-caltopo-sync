<template>
    <div class='col-12 py-3'>
        <div class='card mb-3'>
            <div class='card-header'>
                <div class='card-title'>
                    Caltopo Settings
                </div>
            </div>
            <div class='card-body'>
                <div class='mb-3'>
                    <TablerInput
                        v-model='caltopo.credentialKey'
                        label='Credential Key'
                        placeholder='Caltopo credential key'
                    />
                </div>
                <div class='mb-3'>
                    <TablerInput
                        v-model='caltopo.credentialId'
                        label='Credential ID'
                        placeholder='Caltopo credential ID'
                    />
                </div>
                <div class='mb-3'>
                    <TablerInput
                        v-model='caltopo.accountId'
                        label='Account ID'
                        placeholder='Caltopo account ID'
                    />
                </div>
                <div class='d-flex align-items-center'>
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
        </div>

        <div class='card'>
            <div class='card-header'>
                <div class='card-title'>
                    Node-RED Connection
                </div>
            </div>
            <div class='card-body'>
                <div class='mb-3'>
                    <TablerInput
                        v-model='localUrl'
                        label='Node-RED Base URL'
                        placeholder='https://node-red.example.com'
                        :description='`Base URL of the Node-RED instance hosting the CalTAKsync subflow. Stored locally under "caltopo-sync-nodered-url".`'
                    />
                </div>
                <div class='d-flex align-items-center'>
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
        </div>

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

        <div
            v-else-if='store.lastHealth'
            class='card mt-3'
        >
            <div class='card-header'>
                <div class='card-title'>
                    Last Health Check
                </div>
            </div>
            <div class='card-body'>
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
            </div>
        </div>
    </div>
</template>

<script setup lang='ts'>
import { ref, watch, onMounted, defineComponent, h } from 'vue';
import {
    TablerInput,
    TablerLoading,
    TablerAlert,
} from '@tak-ps/vue-tabler';
import {
    IconPlugConnected,
    IconCircleCheck,
    IconCircleX,
    IconDeviceFloppy,
} from '@tabler/icons-vue';
import ProfileConfig from '../../../src/base/profile.ts';
import { useCaltopoSyncStore } from '../stores/plugin-state.ts';
import { health } from '../api/nodered-client.ts';
import type { CaltopoSettings } from '../types.ts';

const HealthRow = defineComponent({
    props: {
        label: { type: String, required: true },
        ok: { type: Boolean, required: true },
    },
    setup(props) {
        return () => h('div', { class: 'd-flex align-items-center py-1' }, [
            props.ok
                ? h(IconCircleCheck, { size: 20, stroke: '1', class: 'text-green' })
                : h(IconCircleX, { size: 20, stroke: '1', class: 'text-red' }),
            h('div', { class: 'ms-2', textContent: props.label }),
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
const currentUsername = ref<string>('');

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
    currentUsername.value = await resolveUsername();
    caltopo.value = { ...store.loadCaltopoSettings(currentUsername.value) };
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
