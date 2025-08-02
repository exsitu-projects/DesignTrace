import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAllUtil = defineStore('allUtil', () => {
  // 'notDragging', 'startDragging', 'finishedDragging'
  const obj = ref(null)
  const isLassoMode = ref(false)
  const isColorPen = ref(false)
  const nodeOnDrag = ref(false)
  const brush = { color: ref('#000000'), width: ref(10) }
  const isStepLock = ref(false)
  const isToolTip = ref(false)
  const isPropagate = ref(false)
  function switchLassoMode() {
    if (isColorPen.value) isColorPen.value = false
    if (isPropagate.value) isPropagate.value = false
    isLassoMode.value = !isLassoMode.value
  }
  function switchPropagateMode() {
    if (isLassoMode.value) isLassoMode.value = false
    if (isColorPen.value) isColorPen.value = false
    isPropagate.value = !isPropagate.value
  }
  function switchColorPen() {
    if (isLassoMode.value) isLassoMode.value = false
    if (isPropagate.value) isPropagate.value = false
    isColorPen.value = !isColorPen.value
  }
  function switchStepLock() {
    isStepLock.value = !isStepLock.value
  }
  return {
    nodeOnDrag,
    isColorPen,
    isLassoMode,
    brush,
    isStepLock,
    isToolTip,
    isPropagate,
    switchPropagateMode,
    switchLassoMode,
    switchColorPen,
    switchStepLock,
  }
})
