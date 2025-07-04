import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useObject = defineStore('object', () => {
  // 'notDragging', 'startDragging', 'finishedDragging'
  const obj = ref(null)
  const dragState = ref('notDragging')
  const startDragTop = ref(0)
  const startDragLeft = ref(0)
  const dragObjects = ref([])
  const activeNodeId = ref(null) // id of node currently being dragged
  const id = ref(0)
  const promiseLoadImageLabel = ref('')

  function start(id) {
    activeNodeId.value = id
    dragState.value = 'startDragging'
  }

  function stop() {
    activeNodeId.value = null
    dragState.value = 'notDragging'
  }
  return {
    id,
    obj,
    dragState,
    dragObjects,
    startDragTop,
    startDragLeft,
    promiseLoadImageLabel,
  }
})
