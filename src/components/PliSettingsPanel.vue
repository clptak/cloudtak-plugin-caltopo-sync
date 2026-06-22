<template>
    <div class='card mb-3'>
        <div class='card-header'>
            <div class='card-title'>
                Share PLI Configuration
            </div>
        </div>
        <div class='card-body'>
            <p class='text-muted small'>
                TAK PLI is read from everything visible on the CloudTAK map. CalTopo connect keys
                and regex rules decide which map receives each position report.
            </p>

            <div class='mb-3'>
                <label class='form-label'>CalTopo Base URL</label>
                <TablerInput
                    v-model='local.baseCaltopoUrl'
                    placeholder='https://caltopo.com'
                />
            </div>

            <div class='operational-hazard-section border rounded p-3 mb-3'>
                <div class='operational-hazard-section-title mb-2'>
                    CalTopo Connect Keys
                </div>
                <div
                    v-for='(entry, index) in local.connectKeys'
                    :key='entry.id'
                    class='border rounded p-2 mb-2'
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

            <div class='mb-3'>
                <label class='form-label'>Regex Lookup (JSON)</label>
                <textarea
                    v-model='regexLookUpText'
                    class='form-control font-monospace'
                    rows='6'
                />
                <small class='text-muted'>Maps regex names to pattern strings used by routing rules.</small>
            </div>

            <div class='operational-hazard-section border rounded p-3 mb-3'>
                <div class='operational-hazard-section-title mb-2'>
                    Connect Key Routing Rules
                </div>
                <div
                    v-for='(rule, index) in local.regexRules'
                    :key='`${rule.regexKey}-${rule.connectKeyId}-${index}`'
                    class='row g-2 mb-2'
                >
                    <div class='col-md-5'>
                        <label class='form-label'>Regex name</label>
                        <select
                            v-model='rule.regexKey'
                            class='form-select'
                        >
                            <option
                                v-for='key in regexKeyOptions'
                                :key='key'
                                :value='key'
                            >
                                {{ key }}
                            </option>
                        </select>
                    </div>
                    <div class='col-md-6'>
                        <label class='form-label'>Connect key</label>
                        <select
                            v-model='rule.connectKeyId'
                            class='form-select'
                        >
                            <option
                                v-for='key in local.connectKeys'
                                :key='key.id'
                                :value='key.id'
                            >
                                {{ key.label || key.connectKey || key.id }}
                            </option>
                        </select>
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

            <div class='mb-3'>
                <label class='form-label'>Callsign Lookup (JSON)</label>
                <textarea
                    v-model='callsignLookupText'
                    class='form-control font-monospace'
                    rows='8'
                />
            </div>

            <div class='mb-3'>
                <label class='form-label'>Default TAK Team</label>
                <select
                    v-model='local.takGroupName'
                    class='form-select'
                >
                    <option
                        v-for='team in TAK_GROUP_OPTIONS'
                        :key='team'
                        :value='team'
                    >
                        {{ team }}
                    </option>
                </select>
            </div>

            <div class='form-check mb-2'>
                <input
                    id='pli-add-filter'
                    v-model='local.addFilter'
                    class='form-check-input'
                    type='checkbox'
                >
                <label
                    class='form-check-label'
                    for='pli-add-filter'
                >
                    Enable additional CalTopo→TAK name filters
                </label>
            </div>
            <NumberedTextList
                v-if='local.addFilter'
                v-model='local.addFilterList'
                :max='MAX_FILTER_TERMS'
                item-label='Filter term'
                max-hint='Maximum of 20 filter terms.'
            />

            <div class='d-flex align-items-center mt-3'>
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
        </div>
    </div>
</template>

<script setup lang='ts'>
import { computed, ref, watch } from 'vue';
import { TablerInput, TablerAlert } from '@tak-ps/vue-tabler';
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

const regexKeyOptions = computed(() => Object.keys(local.value.regexLookUp));

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

<style scoped>
.operational-hazard-section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    opacity: 0.85;
}
</style>
