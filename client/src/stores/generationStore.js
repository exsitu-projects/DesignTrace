import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { BACKEND_URL } from '@/config.js'
import { useInfoStore } from '@/stores/infoStore.js'
export const useGeneration = defineStore('generation', () => {
  // 'notDragging', 'startDragging', 'finishedDragging'
  const img2imgOut = ref({ src: '' })
  const txt2imgOut = ref({ src: '' })
  const detectedObjects = ref([])
  const promiseLoadImageLabel = ref('')
  const shouldTriggerT2I = ref(false)
  // ids of the nodes waiting on a generation; each node shows a spinner while its id is listed
  const currentGenIds = ref([])

  function startGen(altId) {
    currentGenIds.value.push(altId)
  }

  // remove one entry, so two generations on the same node each clear their own
  function endGen(altId) {
    const i = currentGenIds.value.indexOf(altId)
    if (i !== -1) currentGenIds.value.splice(i, 1)
  }
  const generalPrompt = ref('')
  const textGenStatus = ref('finished') // Track text generation status
  const alwaysReview = ref(false) // Whether to always show prompt review dialog
  const showReviewDialog = ref(false) // Controls review dialog visibility
  const currentPrompt = ref('') // Current prompt being reviewed
  const pendingGeneration = ref(null) // Stores pending generation data

  // Prompt template strings for openAIPrompt
  const promptTemplates = reactive({
    openAI: {
      prefix: ref('Change the'),
      middle1: ref('of the'),
      middle2: ref('into'),
      suffix: ref('while other visual properties remain the same.'),
    },
    openAIMask: {
      prefix: ref('Transform the selected'),
      middle1: ref('in the mask to'),
      middle2: ref('in the same style, keeping its'),
      suffix: ref('. Keep other unmasked parts of the image intact.'),
    },
  })
  // Ghost-tag suggestions live on the palette row itself (row.ghost = { name, tags, loading }),
  // so they follow the row when other rows are added or removed.
  async function fetchGhostTags(row) {
    const propertyName = row?.name?.trim()
    if (!propertyName || propertyName === 'Attribute') return
    // already fetched (or fetching) for this name
    if (row.ghost?.name === propertyName && (row.ghost.loading || row.ghost.tags.length)) return

    row.ghost = { name: propertyName, tags: [], loading: true }
    try {
      const prompt =
        'Please give three common examples for the visual attribute ' +
        propertyName +
        '. Return only the values, separated by colons. No explanation.'
      const response = await fetch(BACKEND_URL + '/sample-properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      })
      const result = await response.json()
      if (row.ghost.name !== propertyName) return // renamed while waiting

      if (response.ok) {
        console.log(`Ghost tags for "${propertyName}":`, result.output)
        row.ghost.tags = result.output
          .split(':')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      } else {
        console.log(result.error)
      }
    } catch (err) {
      console.log(err.message)
    } finally {
      if (row.ghost.name === propertyName) row.ghost.loading = false
    }
  }

  // Called when a property name is set (renamed, or chosen in "+ Add Asset")
  const onPropertyNameFinalized = (propertyName, rowIndex) => {
    const row = useInfoStore().rows[rowIndex]
    if (row) fetchGhostTags(row)
  }

  // Suggestions for a row, only if they belong to its current name
  const getGhostTagsForRow = (row) => (row?.ghost?.name === row?.name?.trim() ? row.ghost.tags : [])

  const isGhostTagsLoading = (row) =>
    row?.ghost?.name === row?.name?.trim() && row.ghost.loading === true

  const propValSysPrompt = `You are a visual description assistant.

The user provides an image and a feature to describe — it can be a visual feature (like layout, color, font, texture, material) or a semantic feature (like landmark, object, architecture).

Your task is to describe only the specified visual feature in vivid, natural language, using concrete, visible details.

– Do not start with phrases like “The layout shows...” or “The color is...”
– Do not use full sentences
– Avoid subjective or abstract terms like “beautiful,” “elegant,” or “modern”
– Use spatial and material language (e.g., “centered bold serif title,” “light grainy texture, vertical brush strokes”)
– Be precise and grounded in what’s visible — describe position, structure, texture, shape, color, etc.
– Limit the response to 10 words or fewer
– Return only the raw description with no punctuation at the end`

  const objSysPrompt = `You are a visual description assistant.

The user will provide an image.

Your task is to write two short outputs, separated by a colon:

A richly detailed visual description of the primary object in the image, using as many clearly visible features as possible (e.g., color, texture, material, pattern, shape, structure, surface detail). The description must use concrete, observable details only — avoid abstract or subjective terms like "elegant" or "nice." The last word of the description must be the object’s name such as 'dress' or 'armchair' without any descriptors.

The name of the primary object alone.

Use natural language, not a list of keywords.
Limit the first description to 10 words or fewer.
Be specific, expressive, and grounded in what’s visible.

Return only the two phrases, separated by a colon. Do not include any punctuation at the end. Do not explain or add anything else.
`

  const nonPropsSysPrompt = `You are a visual description assistant.

The user will provide an image and may optionally specify a visual attribute to exclude (e.g., color, texture, landmark, contrast, layout).

Your task is to return exactly four outputs, separated by colons **with no extra colons inside**:

1. Return a comma-separated list of clearly visible visual properties of the primary object, excluding the specified attribute and excluding any reference to the object itself. Do not include any nouns that name objects, parts, or categories (e.g., “berries,” “stem,” “petals”). Only include directly observable visual traits such as color, texture, material, surface detail, shape, or pattern. Do not invent or infer any traits — describe only what is clearly and unambiguously visible in the image. Avoid all subjective, abstract, or interpretive terms (e.g., “elegant,” “strange”). Return only grounded visual properties in short phrases, no full sentences, and no punctuation at the end.

This should prevent things like: “green” (when there’s no green) “two berries”

It should return something like “matte surface, dark red, bumpy texture, spherical shape”

2. The name of the primary object only (e.g., "chair", "backpack").
`

  // 3. A comma-separated list of all applicable visual property categories that were used in the first output (e.g., color, texture, material, pattern, shape, structure, surface detail).

  function triggerT2I() {
    shouldTriggerT2I.value = true
  }

  function resetT2I() {
    shouldTriggerT2I.value = false
  }

  function storeDetection(infoArr) {
    detectedObjects.value = infoArr.map((obj) => ({
      ...obj,
      box: obj.box.map((coord) => coord * 512),
    }))
  }
  async function describeImage(image_path, prompt, system_prompt) {
    //tested working image_path: base64 url → "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA…"
    try {
      promiseLoadImageLabel.value = 'loading'

      const response = await fetch(BACKEND_URL + '/image-to-labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_path, prompt, system_prompt }),
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

  async function whatIsObject(lassoBoundUrl, propsString) {
    const raw = await describeImage(lassoBoundUrl, propsString, objSysPrompt)
    console.log(raw)
    const [adjPart = '', objPart = ''] = raw.split(':').map((s) => s.trim())
    if (!raw || typeof raw !== 'string') {
      throw new Error('describeImage returned empty or non‑string')
    }
    return {
      adjObjectText: adjPart, // e.g. "elegant wooden leather sofa"
      objectText: objPart, // e.g. "sofa"
    }
  }

  async function excludePropObject(lassoBoundUrl, propsString) {
    try {
      const raw = await describeImage(lassoBoundUrl, propsString, nonPropsSysPrompt)
      console.log(raw)
      if (!raw || typeof raw !== 'string' || !raw.includes(':')) {
        throw new Error('describeImage returned invalid format: ' + raw)
      }

      const parts = raw.split(':').map((s) => s.trim())

      const [adjObjectText, objectText] = parts

      return {
        adjObjectText,
        objectText,
      }
    } catch (err) {
      console.error('excludePropObject failed:', err)
      throw err
    }
  }

  async function txt2Img({ prompt }) {
    try {
      textGenStatus.value = 'loading'
      const response = await fetch(BACKEND_URL + '/text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
        }),
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
      textGenStatus.value = 'finished'
    }
  }
  async function removeBg(base64Url) {
    textGenStatus.value = 'loading'
    try {
      const response = await fetch(BACKEND_URL + '/remove-bg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          src: base64Url,
        }),
      })
      const result = await response.json()

      if (response.ok) {
        console.log(result.output)
        return result.output
      } else {
        console.log(result.error)
        return null
      }
    } catch (err) {
      console.log(err.message)
      return null
    } finally {
      textGenStatus.value = 'finished'
    }
  }

  async function generateOpenAIImg({ original_image, total_mask, prompt, altId }) {
    startGen(altId)
    try {
      promiseLoadImageLabel.value = 'loading'
      const response = await fetch(BACKEND_URL + '/edit-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          original_image,
          total_mask,
          prompt,
        }),
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
      // always stop this node's spinner, whichever path started the generation
      endGen(altId)
    }
  }

  return {
    shouldTriggerT2I,
    triggerT2I,
    resetT2I,
    describeImage,
    promiseLoadImageLabel,
    detectedObjects,
    storeDetection,
    img2imgOut,
    txt2imgOut,
    propValSysPrompt,
    whatIsObject,
    objSysPrompt,
    generateOpenAIImg,
    currentGenIds,
    startGen,
    endGen,
    excludePropObject,
    onPropertyNameFinalized,
    fetchGhostTags,
    getGhostTagsForRow,
    isGhostTagsLoading,
    removeBg,
    generalPrompt,
    txt2Img,
    textGenStatus,
    alwaysReview,
    showReviewDialog,
    currentPrompt,
    pendingGeneration,
    promptTemplates,
  }
})
