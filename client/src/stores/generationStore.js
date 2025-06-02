import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGeneration = defineStore('generation', () => {
  // 'notDragging', 'startDragging', 'finishedDragging'
  const mergedAllImage = ref({ src: '' })

  return {
    mergedAllImage,
  }
})
