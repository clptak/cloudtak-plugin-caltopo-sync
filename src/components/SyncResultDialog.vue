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
                v-if='result._signal?.caltopo_synthetic || result._signal?.tak_synthetic'
                class='mt-3 alert alert-warning mb-0'
            >
                <div class='d-flex align-items-center'>
                    <IconInfoCircle
                        :size='18'
                        stroke='1'
                    />
                    <span class='ms-2'>
                        Best-effort completion: no terminal signal received from
                        <span v-if='result._signal?.caltopo_synthetic'>Caltopo</span>
                        <span v-if='result._signal?.caltopo_synthetic && result._signal?.tak_synthetic'> and </span>
                        <span v-if='result._signal?.tak_synthetic'>TAK</span>
                        direction (likely empty side). Counts are derived rather than transactional.
                    </span>
                </div>
            </div>
            <div
                v-if='displayErrors.length'
                class='mt-3'
            >
                <div class='subheader mb-2'>
                    Errors
                </div>
                <ul class='list-unstyled mb-0'>
                    <li
                        v-for='(err, idx) in displayErrors'
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
import { computed } from 'vue';
import { TablerModal } from '@tak-ps/vue-tabler';
import { IconClock, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-vue';
import type { PropType } from 'vue';
import type { SyncResult } from '../types.ts';

const props = defineProps({
    result: {
        type: Object as PropType<SyncResult>,
        required: true,
    },
});

defineEmits<{
    (e: 'close'): void;
}>();

// When the "Best-effort completion" banner is visible, these messages are
// the cause of (or safety guard for) the synthetic state shown by the
// banner. Showing them again as red errors duplicates the signal.
const SUPPRESSED_WHEN_SYNTHETIC = [
    'overall safety timeout',
    'stale-delete skipped: both directions synthetic',
];

const displayErrors = computed(() => {
    const errors = props.result.errors || [];
    const synthetic = !!(props.result._signal?.caltopo_synthetic || props.result._signal?.tak_synthetic);
    if (!synthetic) return errors;
    return errors.filter(err => !SUPPRESSED_WHEN_SYNTHETIC.some(p => err.includes(p)));
});
</script>
