<template>
    <MenuTemplate name='Caltopo Sync'>
        <template #header>
            <SartopoCloudtakFavicon :size='28' />
            <span class='strong user-select-none'>Caltopo Sync</span>
        </template>
        <PairManager />
    </MenuTemplate>
</template>

<script setup lang='ts'>
import MenuTemplate from './MenuTemplate.vue';
import SartopoCloudtakFavicon from './SartopoCloudtakFavicon.vue';
import PairManager from './PairManager.vue';
</script>
