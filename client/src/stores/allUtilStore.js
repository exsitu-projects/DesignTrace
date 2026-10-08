import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAllUtil = defineStore('allUtil', () => {
  const isLassoMode = ref(false)
  const nodeOnDrag = ref(false)
  const isStepLock = ref(false)
  const isToolTip = ref(false)
  const isTxt2Img = ref(false)
  function switchLassoMode() {
    isLassoMode.value = !isLassoMode.value
  }

  function switchTxt2Img() {
    isTxt2Img.value = !isTxt2Img.value
  }
  function switchStepLock() {
    isStepLock.value = !isStepLock.value
  }

  return {
    nodeOnDrag,
    isLassoMode,
    isStepLock,
    isToolTip,
    switchLassoMode,
    switchStepLock,
    switchTxt2Img,
    isTxt2Img,
  }
})
