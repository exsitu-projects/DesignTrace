<script setup>
import { ref } from 'vue'
import { Lasso, ArrowBigUpDash, ArrowBigDownDash } from 'lucide-vue-next'
const emit = defineEmits(['forwardLayer', 'backwardLayer', 'switchLasso'])
const isLassoMode = ref(false)

function switchLasso() {
  isLassoMode.value = !isLassoMode.value
  emit('switchLasso')
}
</script>

<template>
  <div class="btn-group m-2" role="group" aria-label="Basic example">
    <button
      type="button"
      @click="switchLasso()"
      :class="['btn btn-sm btn-light', { active: isLassoMode }]"
    >
      <Lasso color="black" :size="15" />
    </button>
    <!--    <button type="button" class="btn btn-light">Left</button>-->
    <!--    <button type="button" class="btn btn-light">Middle</button>-->
    <!--    <button type="button" class="btn btn-light">Right</button>-->
  </div>

  <div class="btn-group m-2" role="group" aria-label="Basic example">
    <button @click="emit('forwardLayer')" type="button" class="btn btn-sm btn-light">
      <ArrowBigUpDash color="black" :size="15" /> Forward
    </button>
    <button @click="emit('backwardLayer')" type="button" class="btn btn-sm btn-light">
      <ArrowBigDownDash color="black" :size="15" /> Backward
    </button>
  </div>
</template>

<style scoped></style>
