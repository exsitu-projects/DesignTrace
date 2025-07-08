import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAllUtil = defineStore('allUtil', () => {
  // 'notDragging', 'startDragging', 'finishedDragging'
  const obj = ref(null)
  const isLassoMode = ref(false)
  const isColorPen = ref(false)
  function switchLassoMode() {
    isLassoMode.value = !isLassoMode.value
  }
  function switchColorPen() {
    isColorPen.value = !isColorPen.value
  }
  return {
    isColorPen,
    isLassoMode,
    switchLassoMode,
    switchColorPen,
  }
})
