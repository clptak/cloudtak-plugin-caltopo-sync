<template>
    <TablerIconButton
        title='Pop out to separate window'
        @click='popOut'
    >
        <IconExternalLink
            :size='24'
            stroke='1'
        />
    </TablerIconButton>
</template>

<script setup lang='ts'>
import { IconExternalLink } from '@tabler/icons-vue';
import { TablerIconButton } from '@tak-ps/vue-tabler';
import { openPopout } from '../lib/popout.ts';
import { minimizeDesktopPane } from '../lib/floatPane.ts';

async function popOut(): Promise<void> {
    // openPopout hides the in-map float as soon as the child window opens.
    // Keep this minimize call as a safety net if the pane was re-shown.
    const opened = await openPopout();
    if (opened) minimizeDesktopPane();
}
</script>
