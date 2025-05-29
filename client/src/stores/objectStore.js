import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useObject = defineStore('object', () => {
  // 'notDragging', 'startDragging', 'finishedDragging'
  const obj = ref(null)
  const dragState = ref('notDragging')
  const startDragTop = ref(0)
  const startDragLeft = ref(0)
  const id = ref(null)
  const promiseLoadImageLabel = ref('')
  return {
    id,
    obj,
    dragState,
    startDragTop,
    startDragLeft,
    promiseLoadImageLabel,
  }
})
