<script setup>
import { useAllUtil } from '@/stores/allUtilStore.js'

const allUtilStore = useAllUtil()
</script>

<template>
  <div class="mx-1 small row g-3 align-items-center">
    <div class="col-auto">
      <label for="colorPicker" class="form-label mb-0">Stroke&nbsp;Color</label>
    </div>
    <div class="col-auto">
      <input
        type="color"
        class="form-control form-control-color"
        id="colorPicker"
        v-model="allUtilStore.brush.color"
      />
    </div>

    <div class="col-auto">
      <label for="widthRange" class="form-label mb-0">Width</label>
    </div>
    <div class="col">
      <input
        type="range"
        class="form-range"
        id="widthRange"
        min="1"
        max="50"
        v-model="allUtilStore.brush.width"
      />
    </div>

    <div class="col-auto">
      <span id="widthVal" class="badge bg-secondary">{{ allUtilStore.brush.width }}</span>
    </div>
  </div>
</template>

<style scoped></style>
