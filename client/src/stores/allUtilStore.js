import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAllUtil = defineStore('allUtil', () => {
  // 'notDragging', 'startDragging', 'finishedDragging'
  const obj = ref(null)
  const isLassoMode = ref(false)
  function switchLassoMode() {
    isLassoMode.value = !isLassoMode.value
  }
  return {
    isLassoMode,
    switchLassoMode,
  }
})
