<template>
  <div class="review-prompt-tab" @click="openReviewDialog">
    <span class="tab-text btn-light btn btn-sm">review prompt</span>
  </div>
</template>

<script setup>
import { useGeneration } from '../stores/generationStore'

const generationStore = useGeneration()

const openReviewDialog = () => {
  generationStore.showReviewDialog = true
}
</script>

<style scoped>
.review-prompt-tab {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  color: white;
  padding: 12px 8px;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  z-index: 3000;
  transition: all 0.3s ease;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  user-select: none;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
}

.tab-text {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 1px;
  text-transform: uppercase;
}
</style>
