<template>
    <MenuTemplate name='Caltopo Sync'>
        <template #title>
            <SartopoCloudtakFavicon :size='28' />
            <span class='strong user-select-none'>Caltopo Sync</span>
        </template>
        <template #default>
            <PairManager />
        </template>
    </MenuTemplate>
</template>

<script setup lang='ts'>
import MenuTemplate from './MenuTemplate.vue';
import SartopoCloudtakFavicon from './SartopoCloudtakFavicon.vue';
import PairManager from './PairManager.vue';
</script>
