<template>
    <TablerBorder
        class='cloudtak-accent text-white mb-3'
        :fill-height='false'
        :shadow='false'
        gap='sm'
    >
        <template #label>
            <p class='text-uppercase text-white-50 small mb-0'>
                Share PLI Configuration
            </p>
        </template>

        <p class='text-muted small mb-0'>
            TAK PLI is read from everything visible on the CloudTAK map. CalTopo connect keys
            and regex rules decide which map receives each position report.
        </p>

        <TablerInput
            v-model='local.baseCaltopoUrl'
            label='CalTopo Base URL'
            placeholder='https://caltopo.com'
        />

        <div class='cloudtak-accent border rounded-3 text-white px-2 py-2'>
            <p class='text-uppercase text-white-50 small mb-2'>
                CalTopo Connect Keys
            </p>
            <div
                v-for='(entry, index) in local.connectKeys'
                :key='entry.id'
                class='cloudtak-accent border rounded-3 text-white px-2 py-2 mb-2'
            >
                <div class='row g-2'>
                    <div class='col-md-4'>
                        <TablerInput
                            v-model='entry.label'
                            :label='`Label ${index + 1}`'
                            placeholder='e.g. Sworn'
                        />
                    </div>
                    <div class='col-md-7'>
                        <TablerInput
                            v-model='entry.connectKey'
                            label='Connect Key'
                            placeholder='tak_...'
                        />
                    </div>
                    <div class='col-md-1 d-flex align-items-end'>
                        <button
                            type='button'
                            class='btn btn-outline-danger w-100'
                            :disabled='local.connectKeys.length <= 1'
                            @click='removeConnectKey(entry.id)'
                        >
                            <IconX
                                :size='16'
                                stroke='1'
                            />
                        </button>
                    </div>
                </div>
            </div>
            <button
                type='button'
                class='btn btn-sm btn-outline-primary'
                :disabled='local.connectKeys.length >= MAX_CONNECT_KEYS'
                @click='addConnectKeyRow'
            >
                <IconPlus
                    :size='16'
                    stroke='1'
                />
                <span class='ms-1'>Add Connect Key</span>
            </button>
        </div>

        <TablerInput
            v-model='regexLookUpText'
            label='Regex Lookup (JSON)'
            description='Maps regex names to pattern strings used by routing rules.'
            :rows='6'
        />

        <div class='cloudtak-accent border rounded-3 text-white px-2 py-2'>
            <p class='text-uppercase text-white-50 small mb-2'>
                Connect Key Routing Rules
            </p>
            <div
                v-for='(rule, index) in local.regexRules'
                :key='`${rule.regexKey}-${rule.connectKeyId}-${index}`'
                class='row g-2 mb-2'
            >
                <div class='col-md-5'>
                    <TablerEnum
                        v-model='rule.regexKey'
                        label='Regex Name'
                        :options='regexKeyOptions'
                    />
                </div>
                <div class='col-md-6'>
                    <TablerEnum
                        :model-value='connectKeyLabelForRule(rule.connectKeyId)'
                        label='Connect Key'
                        :options='connectKeyLabels'
                        @update:model-value='setRuleConnectKey(index, $event)'
                    />
                </div>
                <div class='col-md-1 d-flex align-items-end'>
                    <button
                        type='button'
                        class='btn btn-outline-danger w-100'
                        @click='removeRegexRule(index)'
                    >
                        <IconX
                            :size='16'
                            stroke='1'
                        />
                    </button>
                </div>
            </div>
            <button
                type='button'
                class='btn btn-sm btn-outline-primary'
                @click='addRegexRuleRow'
            >
                <IconPlus
                    :size='16'
                    stroke='1'
                />
                <span class='ms-1'>Add Rule</span>
            </button>
        </div>

        <TablerInput
            v-model='callsignLookupText'
            label='Callsign Lookup (JSON)'
            :rows='8'
        />

        <TablerEnum
            v-model='local.takGroupName'
            label='Default TAK Team'
            :options='[...TAK_GROUP_OPTIONS]'
        />

        <TablerToggle
            v-model='local.addFilter'
            label='Enable Additional CalTopo→TAK Name Filters'
        />
        <NumberedTextList
            v-if='local.addFilter'
            v-model='local.addFilterList'
            :max='MAX_FILTER_TERMS'
            item-label='Filter term'
            max-hint='Maximum of 20 filter terms.'
        />

        <div class='d-flex align-items-center mt-2'>
            <button
                type='button'
                class='btn btn-primary'
                :disabled='pliSaving'
                @click='savePli'
            >
                <IconDeviceFloppy
                    :size='18'
                    stroke='1'
                />
                <span class='ms-2'>Save PLI Settings</span>
            </button>
            <span
                v-if='pliSaved'
                class='ms-3 text-green'
            >Saved</span>
        </div>
        <TablerAlert
            v-if='pliError'
            class='mt-3'
            :err='pliError'
        />
    </TablerBorder>
</template>

<script setup lang='ts'>
import { computed, ref, watch } from 'vue';
import {
    TablerInput,
    TablerAlert,
    TablerBorder,
    TablerEnum,
    TablerToggle,
} from '@tak-ps/vue-tabler';
import { IconDeviceFloppy, IconPlus, IconX } from '@tabler/icons-vue';
import NumberedTextList from './NumberedTextList.vue';
import { useCaltopoSyncStore } from '../stores/plugin-state.ts';
import type { PliSettings } from '../types.ts';
import {
    MAX_CONNECT_KEYS,
    MAX_FILTER_TERMS,
    TAK_GROUP_OPTIONS,
} from '../lib/pli/constants.ts';
import {
    addConnectKey,
    addRegexRule,
} from '../lib/pli/connect-key-routing.ts';
import {
    callsignLookupJsonValid,
    regexLookUpJsonValid,
} from '../lib/pli/kml-app-tracks.ts';

const props = defineProps<{
    username: string;
}>();

const store = useCaltopoSyncStore();
const local = ref<PliSettings>({ ...store.loadPliSettings(props.username) });
const pliSaving = ref(false);
const pliSaved = ref(false);
const pliError = ref<Error | undefined>();

const regexLookUpText = ref(JSON.stringify(local.value.regexLookUp, null, 2));
const callsignLookupText = ref(JSON.stringify(local.value.callsignLookup, null, 2));

watch(() => props.username, (username) => {
    local.value = { ...store.loadPliSettings(username) };
    regexLookUpText.value = JSON.stringify(local.value.regexLookUp, null, 2);
    callsignLookupText.value = JSON.stringify(local.value.callsignLookup, null, 2);
});

const regexKeyOptions = computed(() => {
    const keys = Object.keys(local.value.regexLookUp);
    return keys.length ? keys : [''];
});

function connectKeyDisplay(id: string): string {
    const key = local.value.connectKeys.find((k) => k.id === id);
    if (!key) return id;
    return key.label || key.connectKey || key.id;
}

const connectKeyLabels = computed(() => {
    return local.value.connectKeys.map((k) => connectKeyDisplay(k.id));
});

function connectKeyLabelForRule(connectKeyId: string): string {
    return connectKeyDisplay(connectKeyId);
}

function setRuleConnectKey(index: number, label: string): void {
    const key = local.value.connectKeys.find((k) => connectKeyDisplay(k.id) === label);
    if (!key) return;
    const rules = [...local.value.regexRules];
    rules[index] = { ...rules[index], connectKeyId: key.id };
    local.value = { ...local.value, regexRules: rules };
}

function addConnectKeyRow(): void {
    local.value = addConnectKey(local.value);
}

function removeConnectKey(id: string): void {
    if (local.value.connectKeys.length <= 1) return;
    local.value = {
        ...local.value,
        connectKeys: local.value.connectKeys.filter((k) => k.id !== id),
        regexRules: local.value.regexRules.filter((r) => r.connectKeyId !== id),
    };
}

function addRegexRuleRow(): void {
    local.value = {
        ...local.value,
        regexRules: [...local.value.regexRules, addRegexRule(local.value)],
    };
}

function removeRegexRule(index: number): void {
    local.value = {
        ...local.value,
        regexRules: local.value.regexRules.filter((_, i) => i !== index),
    };
}

function savePli(): void {
    pliError.value = undefined;
    pliSaved.value = false;

    const regexLookUp = regexLookUpJsonValid(regexLookUpText.value);
    if (!regexLookUp) {
        pliError.value = new Error('Regex Lookup JSON is invalid.');
        return;
    }
    const callsignLookup = callsignLookupJsonValid(callsignLookupText.value);
    if (!callsignLookup) {
        pliError.value = new Error('Callsign Lookup JSON is invalid.');
        return;
    }

    const payload: PliSettings = {
        ...local.value,
        regexLookUp,
        callsignLookup,
        addFilterList: local.value.addFilterList.map((s) => s.trim()).filter(Boolean),
        connectKeys: local.value.connectKeys.map((k) => ({
            ...k,
            label: k.label.trim(),
            connectKey: k.connectKey.trim(),
        })),
    };

    pliSaving.value = true;
    try {
        store.savePliSettings(props.username, payload);
        local.value = { ...store.pliSettings };
        pliSaved.value = true;
        setTimeout(() => { pliSaved.value = false; }, 2500);
    } finally {
        pliSaving.value = false;
    }
}
</script>
