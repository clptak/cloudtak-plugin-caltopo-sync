<template>
    <TablerModal
        size='md'
        @close='$emit("close")'
    >
        <div class='modal-status bg-blue' />
        <div class='modal-header'>
            <div class='modal-title'>
                Sync Result
            </div>
        </div>
        <div class='modal-body'>
            <div class='row g-3'>
                <div class='col-6 col-md-3'>
                    <div class='subheader'>
                        Added
                    </div>
                    <div
                        class='h2'
                        v-text='result.added'
                    />
                </div>
                <div class='col-6 col-md-3'>
                    <div class='subheader'>
                        Updated
                    </div>
                    <div
                        class='h2'
                        v-text='result.updated'
                    />
                </div>
                <div class='col-6 col-md-3'>
                    <div class='subheader'>
                        Deleted
                    </div>
                    <div
                        class='h2'
                        v-text='result.deleted'
                    />
                </div>
                <div class='col-6 col-md-3'>
                    <div class='subheader'>
                        Conflicts
                    </div>
                    <div
                        class='h2'
                        :class='result.conflicts > 0 ? "text-warning" : ""'
                        v-text='result.conflicts'
                    />
                </div>
            </div>
            <div class='mt-3 d-flex align-items-center'>
                <IconClock
                    :size='20'
                    stroke='1'
                />
                <div
                    class='ms-2'
                    v-text='`Completed in ${result.duration_ms} ms`'
                />
            </div>
            <div
                v-if='result.errors.length'
                class='mt-3'
            >
                <div class='subheader mb-2'>
                    Errors
                </div>
                <ul class='list-unstyled mb-0'>
                    <li
                        v-for='(err, idx) in result.errors'
                        :key='idx'
                        class='text-danger'
                    >
                        <IconAlertTriangle
                            :size='16'
                            stroke='1'
                        />
                        <span
                            class='ms-2'
                            v-text='err'
                        />
                    </li>
                </ul>
            </div>
        </div>
        <div class='modal-footer'>
            <button
                type='button'
                class='btn btn-primary ms-auto'
                @click='$emit("close")'
            >
                Close
            </button>
        </div>
    </TablerModal>
</template>

<script setup lang='ts'>
import { TablerModal } from '@tak-ps/vue-tabler';
import { IconClock, IconAlertTriangle } from '@tabler/icons-vue';
import type { PropType } from 'vue';
import type { SyncResult } from '../types.ts';

defineProps({
    result: {
        type: Object as PropType<SyncResult>,
        required: true,
    },
});

defineEmits<{
    (e: 'close'): void;
}>();
</script>
