import { defineStore } from 'pinia'
import { ref } from 'vue'

/* simple uid helper */
function uid() {
  return Date.now() + Math.random().toString(16).slice(2) // millis + random
}

export const useInfoStore = defineStore('infoStore', () => {
  const rows = ref([
    {
      name: 'Color',
      color: '#000',
      tags: [
        { uid: uid(), tag: 'Red' },
        { uid: uid(), tag: 'Green' },
      ],
    },
    {
      name: 'Texture',
      color: '#000',
      tags: [
        { uid: uid(), tag: 'Rough' },
        { uid: uid(), tag: 'Smooth' },
      ],
    },
  ])

  const addRow = () => {
    rows.value.push({
      name: 'Property',
      color: '#6c757d',
      tags: [{ uid: uid(), tag: 'Tag' }],
    })
  }

  const addTag = (rowIdx, label = 'New') => {
    const row = rows.value[rowIdx]
    if (row) row.tags.push({ uid: uid(), tag: label })
  }

  const removeTag = (rowIdx, tagIdx) => {
    const row = rows.value[rowIdx]
    if (row) row.tags.splice(tagIdx, 1)
  }

  return {
    rows,
    addRow,
    addTag,
    removeTag,
  }
})
