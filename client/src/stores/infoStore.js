import { defineStore } from 'pinia'
import { ref } from 'vue'

/* simple uid helper */
function uid() {
  return Date.now() + Math.random().toString(16).slice(2) // millis + random
}

export const useInfoStore = defineStore('infoStore', () => {
  const promiseThumbnailUpdate = ref('')
  const currentUID = ref('')
  const propertyTags = ref([])
  const selectedTags = ref([])
  const isPropertyMode = ref(false)
  const lassoTagContent = ref('')
  const rows = ref([
    {
      name: 'Color',
      color: '#000',
      tags: [
        { uid: uid(), tag: 'Cream white' },
        { uid: uid(), tag: 'Dusty rose' },
      ],
    },
    {
      name: 'Material',
      color: '#000',
      tags: [
        { uid: uid(), tag: 'Soft velvet' },
        { uid: uid(), tag: 'Leather' },
      ],
    },
    // {
    //   name: 'Sleeve Style',
    //   color: '#000',
    //   tags: [
    //     { uid: uid(), tag: 'Lantern Sleeve' },
    //     { uid: uid(), tag: 'Slim Sleeve' },
    //     { uid: uid(), tag: 'Kimono Sleeve' },
    //   ],
    // },
  ])

  const addRow = () => {
    rows.value.push({
      name: 'Attribute',
      color: '#6c757d',
      tags: [],
    })
  }

  const addTag = (rowIdx, label = '') => {
    const row = rows.value[rowIdx]
    currentUID.value = uid()
    if (row) row.tags.push({ uid: currentUID.value, tag: label })
  }

  const addThumbnailToTag = (rowIdx, url, uid = currentUID.value) => {
    const tagEl = rows.value[rowIdx].tags.find((t) => t.uid === uid)
    if (tagEl) {
      tagEl.thumbnail = url
      console.log(url)
    }
  }

  const removeTag = (rowIdx, tagIdx) => {
    const row = rows.value[rowIdx]
    if (row) row.tags.splice(tagIdx, 1)
  }

  const generateLayer = async (currentPrompt) => {
    const response = await fetch('http://localhost:53577/api/generatelayer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: currentPrompt,
      }),
    })
    return await response.json()
  }

  const generateThumbnail = async (prop, propVal) => {
    //how to deal with prompts, now just connecting them with ,

    const oneLinePrompt = 'A clean thumbnail that visually represents the ' + prop + 'of ' + propVal

    try {
      promiseThumbnailUpdate.value = 'loading'
      const result = await generateLayer(oneLinePrompt)
      return result.images_base64
    } catch (error) {
      console.error('Error generating image:', error)
      alert('Image generation failed. Please try again.')
    } finally {
      promiseThumbnailUpdate.value = 'finished' // Ensures it always updates
    }
  }

  return {
    rows,
    propertyTags,
    selectedTags,
    isPropertyMode,
    lassoTagContent,
    addRow,
    addTag,
    removeTag,
    generateThumbnail,
    addThumbnailToTag,
  }
})
