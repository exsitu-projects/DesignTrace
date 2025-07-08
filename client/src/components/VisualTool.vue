<script setup>
import { ref } from 'vue'
import { Lasso, ArrowBigUpDash, ArrowBigDownDash, SprayCan } from 'lucide-vue-next'
import { useAllUtil } from '@/stores/allUtilStore.js'
import * as fabric from 'fabric'
const emit = defineEmits(['forwardLayer', 'backwardLayer', 'switchLasso'])

const allUtilStore = useAllUtil()

function switchLasso() {
  allUtilStore.switchLassoMode()
}

function switchColorPen() {
  allUtilStore.switchColorPen()
}
</script>

<template>
  <div class="btn-group m-2" role="group" aria-label="Basic example">
    <button
      type="button"
      @click="switchLasso()"
      :class="['btn btn-sm btn-light', { active: allUtilStore.isLassoMode }]"
    >
      <Lasso color="black" :size="15" />
    </button>
    <button
      :class="['btn btn-sm btn-light', { active: allUtilStore.isColorPen }]"
      @click="switchColorPen"
    >
      <SprayCan color="black" :size="15"></SprayCan>
    </button>
    <!--    <button type="button" class="btn btn-light">Left</button>-->
    <!--    <button type="button" class="btn btn-light">Middle</button>-->
    <!--    <button type="button" class="btn btn-light">Right</button>-->
  </div>

  <div class="btn-group m-1" role="group" aria-label="Basic example">
    <button @click="emit('forwardLayer')" type="button" class="btn btn-sm btn-light">
      <ArrowBigUpDash color="black" :size="15" /> Forward
    </button>
    <button @click="emit('backwardLayer')" type="button" class="btn btn-sm btn-light">
      <ArrowBigDownDash color="black" :size="15" /> Backward
    </button>
  </div>
</template>

<style scoped></style>
