<script setup>
import { ref } from 'vue'

const emit = defineEmits(['forwardLayer', 'backwardLayer', 'switchLasso'])
const isLassoMode = ref(false)

function switchLasso() {
  isLassoMode.value = !isLassoMode.value
  emit('switchLasso')
}
</script>

<template>
  <div class="btn-group m-2" role="group" aria-label="Basic example">
    <button type="button" @click="switchLasso" :class="['btn btn-light', { active: isLassoMode }]">
      <i class="my-auto bxr bx-lasso"></i> Select
    </button>
    <button type="button" class="btn btn-light">Left</button>
    <button type="button" class="btn btn-light">Middle</button>
    <button type="button" class="btn btn-light">Right</button>
  </div>

  <div class="btn-group m-2" role="group" aria-label="Basic example">
    <button @click="emit('forwardLayer')" type="button" class="btn btn-light">Forward</button>
    <button @click="emit('backwardLayer')" type="button" class="btn btn-light">Backward</button>
  </div>
</template>

<style scoped></style>
