<template>
    <div class='caltopo-popout d-flex flex-column'>
        <div
            class='d-flex align-items-center px-2 border-bottom flex-shrink-0'
            style='height: 50px;'
        >
            <SartopoCloudtakFavicon
                class='flex-shrink-0'
                :size='20'
            />
            <span class='ms-2 text-truncate'>Caltopo Sync</span>
        </div>
        <div class='flex-grow-1 min-height-0 overflow-auto'>
            <PairManager />
        </div>
    </div>
</template>

<script setup lang='ts'>
import PairManager from '../PairManager.vue';
import SartopoCloudtakFavicon from '../SartopoCloudtakFavicon.vue';
</script>

<style>
.caltopo-popout {
    height: 100vh;
    background-color: var(--tblr-bg-surface, #182433);
    color: var(--tblr-body-color, #dce1e7);
}
</style>
