<script setup>
import { ref } from 'vue'
import {
  Lasso,
  ArrowBigUpDash,
  ArrowBigDownDash,
  SprayCan,
  Lock,
  LockOpen,
  ImageOff,
  ArrowUpWideNarrow,
  Download,
} from 'lucide-vue-next'
import { useAllUtil } from '@/stores/allUtilStore.js'
import { Collapse } from 'bootstrap'

import * as fabric from 'fabric'
const emit = defineEmits([
  'forwardLayer',
  'backwardLayer',
  'switchLasso',
  'removeBg',
  'exportBranchTags',
])

const allUtilStore = useAllUtil()
function propagateChange() {
  allUtilStore.switchPropagateMode()
  if (allUtilStore.isPropagate) closeColorPicker()
}
function switchLasso() {
  allUtilStore.switchLassoMode()

  // Hide color picker when lasso is activated (after the toggle)
  if (allUtilStore.isLassoMode) closeColorPicker()
}

function switchTxt2Img() {
  allUtilStore.switchTxt2Img()
  // Hide color picker when text to image is activated
  closeColorPicker()
}
function closeColorPicker() {
  setTimeout(() => {
    const collapseEl = document.getElementById('collapseExample')
    if (collapseEl && collapseEl.classList.contains('show')) {
      const bsCollapse = Collapse.getOrCreateInstance(collapseEl)
      bsCollapse.hide()
    }
  }, 10) // Small delay to ensure toggle has completed
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
  <button
    title="Generate AI Image"
    @click="switchTxt2Img"
    :class="['btn btn-sm btn-light mx-1', { active: allUtilStore.isTxt2Img }]"
  >
    <img src="../../public/assets/ai-file.png" alt="description" width="20" height="20" /> Generate
  </button>
  <button title="Remove background" @click="emit('removeBg')" class="btn btn-sm btn-light">
    <ImageOff color="black" :size="15"></ImageOff> Remove Bg
  </button>

  <div class="btn-group m-2" role="group" aria-label="Basic example">
    <button
      type="button"
      @click="switchLasso()"
      :class="['btn btn-sm btn-light', { active: allUtilStore.isLassoMode }]"
    >
      <Lasso color="black" :size="15" /> Select
    </button>

    <!--    <button-->
    <!--      title="Propagate Change"-->
    <!--      @click="propagateChange()"-->
    <!--      :class="['btn btn-sm btn-light', { active: allUtilStore.isPropagate }]"-->
    <!--    >-->
    <!--      <ArrowUpWideNarrow-->
    <!--        style="transform: rotate(90deg)"-->
    <!--        color="black"-->
    <!--        :size="15"-->
    <!--      ></ArrowUpWideNarrow-->
    <!--      >Propagate-->
    <!--    </button>-->

    <!--    <button-->
    <!--      :class="['btn btn-sm btn-light', { active: allUtilStore.isColorPen }]"-->
    <!--      @click="switchColorPen"-->
    <!--    >-->
    <!--      <SprayCan color="black" :size="15"></SprayCan>-->
    <!--    </button>-->

    <!--    <button type="button" class="btn btn-light">Left</button>-->
    <!--    <button type="button" class="btn btn-light">Middle</button>-->
    <!--    <button type="button" class="btn btn-light">Right</button>-->
  </div>

  <div class="btn-group m-1" role="group" aria-label="Basic example">
    <button
      title="Move Image Forward"
      @click="emit('forwardLayer')"
      type="button"
      class="btn btn-sm btn-light"
    >
      <ArrowBigUpDash color="black" :size="15" /> Forward
    </button>
    <button
      title="Move Image Backward"
      @click="emit('backwardLayer')"
      type="button"
      class="btn btn-sm btn-light"
    >
      <ArrowBigDownDash color="black" :size="15" /> Backward
    </button>
  </div>
  <button title="Export Branch Tags" @click="emit('exportBranchTags')" class="btn btn-sm btn-light">
    <Download color="black" :size="15"></Download>
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
