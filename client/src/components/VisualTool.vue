<script setup>
import { ref } from 'vue'
import {
  Lasso,
  ArrowBigUpDash,
  ArrowBigDownDash,
  SprayCan,
  Lock,
  LockOpen,
  ImageMinus,
} from 'lucide-vue-next'
import { useAllUtil } from '@/stores/allUtilStore.js'
import { Collapse } from 'bootstrap'

import * as fabric from 'fabric'
const emit = defineEmits(['forwardLayer', 'backwardLayer', 'switchLasso', 'removeBg'])

const allUtilStore = useAllUtil()

function switchLasso() {
  allUtilStore.switchLassoMode()

  // Hide color picker when lasso is activated (after the toggle)
  if (allUtilStore.isLassoMode) {
    setTimeout(() => {
      const collapseEl = document.getElementById('collapseExample')
      if (collapseEl && collapseEl.classList.contains('show')) {
        const bsCollapse = Collapse.getOrCreateInstance(collapseEl)
        bsCollapse.hide()
      }
    }, 10) // Small delay to ensure toggle has completed
  }
}

function switchColorPen() {
  allUtilStore.switchColorPen()

  // Show color picker when color pen is activated
  if (allUtilStore.isColorPen) {
    const collapseEl = document.getElementById('collapseExample')
    const bsCollapse = Collapse.getOrCreateInstance(collapseEl)
    const isExpanded = collapseEl.classList.contains('show')
    if (!isExpanded) {
      bsCollapse.show()
    }
  } else {
    // Hide color picker when color pen is deactivated
    const collapseEl = document.getElementById('collapseExample')
    const bsCollapse = Collapse.getOrCreateInstance(collapseEl)
    const isExpanded = collapseEl.classList.contains('show')
    if (isExpanded) {
      bsCollapse.hide()
    }
  }
}

function switchStepLock() {
  allUtilStore.switchStepLock()
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
  <button title="Remove background" @click="emit('removeBg')" class="btn btn-sm ms-2">
    <ImageMinus color="black" :size="15"></ImageMinus>
  </button>
  <!--  <button-->
  <!--    type="button"-->
  <!--    @click="switchStepLock()"-->
  <!--    :class="['btn btn-sm btn-light', { active: allUtilStore.isStepLock }]"-->
  <!--  >-->
  <!--    <Lock v-show="allUtilStore.isStepLock" color="black" :size="15" />-->
  <!--    <LockOpen v-show="!allUtilStore.isStepLock" color="black" :size="15" />-->
  <!--    Step Lock-->
  <!--  </button>-->
</template>

<style scoped></style>
