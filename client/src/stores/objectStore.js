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

  async function describeImage(image_path, prompt) {
    //tested working image path: base64 url → "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA…"
    try {
      promiseLoadImageLabel.value = 'loading'

      const response = await fetch('http://localhost:5555/image-to-labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_path, prompt }),
      })
      const result = await response.json()

      if (response.ok) {
        // return result.result
        return result.output
      } else {
        console.log(result.error)
        return null // Optional: explicitly return null on error
      }
    } catch (err) {
      console.log(err.message)
      return null // Optional: consistently return on error
    } finally {
      promiseLoadImageLabel.value = 'finished' // Ensures it always updates
    }
  }
  return {
    id,
    obj,
    dragState,
    dragObjects,
    startDragTop,
    startDragLeft,
    promiseLoadImageLabel,
    describeImage,
  }
})
