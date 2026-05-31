<template>
    <MenuTemplate name='Caltopo Sync'>
        <template #default>
            <TablerPillGroup
                v-model='activeTab'
                :options='tabs'
            >
                <template #option='{ option }'>
                    <component
                        :is='tabIcons[option.value]'
                        v-tooltip='option.label'
                        :size='32'
                        stroke='1'
                    />
                </template>
            </TablerPillGroup>

            <SettingsPanel v-if='activeTab === "settings"' />
            <PairManager v-else-if='activeTab === "pairs"' />
            <HealthPanel v-else-if='activeTab === "health"' />
        </template>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import { ref, defineComponent, h, onMounted } from 'vue';
import type { Component } from 'vue';
import { TablerPillGroup, TablerLoading, TablerAlert } from '@tak-ps/vue-tabler';
import {
    IconSettings,
    IconLink,
    IconHeartbeat,
    IconCircleCheck,
    IconCircleX,
    IconRefresh,
} from '@tabler/icons-vue';
import MenuTemplate from '@/components/CloudTAK/util/MenuTemplate.vue';
import SettingsPanel from './SettingsPanel.vue';
import PairManager from './PairManager.vue';
import { useCaltopoSyncStore } from '../stores/plugin-state.ts';
import { health } from '../api/nodered-client.ts';

const activeTab = ref<string>('pairs');

const tabs = [
    { value: 'pairs', label: 'Pairs' },
    { value: 'health', label: 'Health' },
    { value: 'settings', label: 'Settings' },
];

const tabIcons: Record<string, Component> = {
    settings: IconSettings,
    pairs: IconLink,
    health: IconHeartbeat,
};

const HealthPanel = defineComponent({
    setup() {
        const store = useCaltopoSyncStore();
        const loading = ref(false);
        const error = ref<Error | undefined>();

        async function refresh() {
            if (!store.noderedUrl) {
                error.value = new Error('Configure Node-RED Base URL in Settings first.');
                return;
            }
            error.value = undefined;
            loading.value = true;
            try {
                store.setLastHealth(await health());
            } catch (err) {
                store.setLastHealth(null);
                error.value = err instanceof Error ? err : new Error(String(err));
            } finally {
                loading.value = false;
            }
        }

        onMounted(() => {
            if (store.noderedUrl && !store.lastHealth) {
                void refresh();
            }
        });

        function row(label: string, ok: boolean) {
            return h('div', { class: 'd-flex align-items-center py-1' }, [
                ok
                    ? h(IconCircleCheck, { size: 20, stroke: '1', class: 'text-green' })
                    : h(IconCircleX, { size: 20, stroke: '1', class: 'text-red' }),
                h('div', { class: 'ms-2', textContent: label }),
            ]);
        }

        return () => h('div', { class: 'col-12 py-3' }, [
            h('div', { class: 'd-flex align-items-center mb-3' }, [
                h('div', { class: 'h3 mb-0', textContent: 'Health Status' }),
                h('div', { class: 'ms-auto' }, [
                    h('button', {
                        type: 'button',
                        class: 'btn btn-sm btn-primary',
                        disabled: loading.value,
                        onClick: refresh,
                    }, [
                        h(IconRefresh, { size: 16, stroke: '1' }),
                        h('span', { class: 'ms-1', textContent: 'Refresh' }),
                    ]),
                ]),
            ]),
            loading.value
                ? h(TablerLoading, { compact: true })
                : error.value
                    ? h(TablerAlert, { err: error.value })
                    : store.lastHealth
                        ? h('div', { class: 'card' }, [
                            h('div', { class: 'card-body' }, [
                                row('Caltopo credentials', store.lastHealth.caltopo_creds_ok),
                                row('PostGIS reachable', store.lastHealth.postgis_ok),
                                row('Icon configs present', store.lastHealth.icon_configs_ok),
                                row('TAK server reachable', store.lastHealth.tak_reachable),
                            ]),
                        ])
                        : h('div', { class: 'text-muted', textContent: 'No health check yet — click Refresh.' }),
        ]);
    },
});
</script>
