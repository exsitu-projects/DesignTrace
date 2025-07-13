import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAllUtil = defineStore('allUtil', () => {
  // 'notDragging', 'startDragging', 'finishedDragging'
  const obj = ref(null)
  const isLassoMode = ref(false)
  const isColorPen = ref(false)
  const brush = { color: ref('#000000'), width: ref(10) }
  const isStepLock = ref(false)
  function switchLassoMode() {
    isLassoMode.value = !isLassoMode.value
  }
  function switchColorPen() {
    isColorPen.value = !isColorPen.value
  }
  function switchStepLock() {
    isStepLock.value = !isStepLock.value
  }
  return {
    isColorPen,
    isLassoMode,
    brush,
    isStepLock,
    switchLassoMode,
    switchColorPen,
    switchStepLock,
  }
})
