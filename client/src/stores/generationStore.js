import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export const useGeneration = defineStore('generation', () => {
  // 'notDragging', 'startDragging', 'finishedDragging'
  const img2imgOut = ref({ src: '' })
  const txt2imgOut = ref({ src: '' })
  const detectedObjects = ref([])
  const loadingStatus = ref('')
  const promiseLoadImageLabel = ref('')
  const shouldTriggerT2I = ref(false)
  const currentGenId = ref('')
  const generalPrompt = ref('')
  const textGenStatus = ref('finished') // Track text generation status
  const ghostTagsPerRow = ref({}) // Store ghost tags for each row by rowIndex
  const ghostTagsLoading = ref({}) // Track loading state for each row
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
  const generationParams = {
    ckpt_name: 'SD1.5/realisticVisionV60B1_v51VAE.safetensors',
    auto_save: false,
    resolution: 512,
    negative_prompt: '',
    fine_edge: 'disable',
    grow_size: 15,
    edge_strength: 0.55,
    color_strength: 0.55,
    inpaint_strength: 1.0,
    seed: -1,
    steps: 20,
    cfg: 5,
    sampler_name: 'euler_ancestral',
    scheduler: 'karras',
  }

  // Function to generate and store ghost tags when property name is finalized
  const onPropertyNameFinalized = async (propertyName, rowIndex) => {
    // Set loading state for this row
    ghostTagsLoading.value[rowIndex] = true

    try {
      const prompt =
        'Please give three common examples for the visual attribute ' +
        propertyName +
        '. Return only the values, separated by colons. No explanation.'
      const response = await fetch('http://localhost:10000/sample-properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      })
      const result = await response.json()

      if (response.ok) {
        console.log(`Ghost tags for "${propertyName}":`, result.output)

        // Parse the colon-separated result and store it for this row
        const ghostTags = result.output
          .split(':')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
        ghostTagsPerRow.value[rowIndex] = ghostTags

        return result.output
      } else {
        console.log(result.error)
        return null
      }
    } catch (err) {
      console.log(err.message)
      return null
    } finally {
      // Clear loading state for this row
      ghostTagsLoading.value[rowIndex] = false
    }
  }

  // Function to get ghost tags for a specific row
  const getGhostTagsForRow = (rowIndex) => {
    return ghostTagsPerRow.value[rowIndex] || []
  }

  // Function to check if ghost tags are loading for a specific row
  const isGhostTagsLoading = (rowIndex) => {
    return ghostTagsLoading.value[rowIndex] || false
  }

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

This should prevent things like:

❌ “green” (when there’s no green)

❌ “two berries”

✅ “matte surface, dark red, bumpy texture, spherical shape”

Let me know if you want a variant with a limit (e.g., max 4 traits) or ordered by perceptual salience.


2. The name of the primary object only (e.g., "chair", "backpack").

3. Provide a visual styling phrase based only on visible characteristics. Start with “in [visual style] style,” followed by the most prominent material, texture, or graphic feature. Do not mention or imply any object. Use only concrete, observable traits. Exclude the user specified visual attribute in text input. No full sentences, no punctuation, no vague or subjective words.

4. Depending on the user's input text prompt, return either 'object' or 'property'. Return 'property' if the input is visual characteristic or attribute, including but not limited to Color Palette, pattern, color, material, texture, shape, visual style, form, layout, lighting, or spatial structure. Return 'object' only if the input refers to a recognizable physical entity such as a specific item, — e.g., “apple,” “Eiffel Tower,” “cat,” or “table.” Do not explain your reasoning — only return 'object' or 'property'.
Limit the first description to 20 words or fewer. Make sure to return exactly four parts, where each part is separated by **a colon**. Do not include any explanation or additional punctuation.
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

      const response = await fetch('http://localhost:10000/image-to-labels', {
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
    try {
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
    } finally {
    }
  }

  async function excludePropObject(lassoBoundUrl, propsString) {
    try {
      const raw = await describeImage(lassoBoundUrl, propsString, nonPropsSysPrompt)

      if (!raw || typeof raw !== 'string' || !raw.includes(':')) {
        throw new Error('describeImage returned invalid format: ' + raw)
      }

      const parts = raw.split(':').map((s) => s.trim())
      if (parts.length < 4) {
        throw new Error('describeImage returned too few parts: ' + JSON.stringify(parts))
      }

      const [adjObjectText, objectText, visibleProps, objOrProp] = parts

      return {
        adjObjectText,
        objectText,
        visibleProps,
        objOrProp,
      }
    } catch (err) {
      console.error('excludePropObject failed:', err)
      throw err
    }
  }

  async function guessPrompt({ original_image, add_color_image, add_edge_image }) {
    //props [{tag: 'red', propName: 'color'}, {tag: 'red', propName: 'color' }, ....]

    try {
      const response = await fetch('http://localhost:5000/api/magic_quill/guess_prompt', {
        // const response = await fetch('/api/magic_quill/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ms_data: {
            original_image: original_image,
            add_color_image: add_color_image,
            add_edge_image: add_edge_image,
          },
        }),
      })

      const result = await response.json()

      return result.result
    } catch (error) {
      console.error('Error generating image:', error)
      alert('Image generation failed. Please try again.')
    }
  }

  async function txt2Img({ prompt }) {
    try {
      textGenStatus.value = 'loading'
      const response = await fetch('http://localhost:10000/text-to-image', {
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
      const response = await fetch('http://localhost:10000/remove-bg', {
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
    loadingStatus.value = 'loading'
    try {
      currentGenId.value = altId
      promiseLoadImageLabel.value = 'loading'
      const response = await fetch('http://localhost:10000/edit-image', {
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
      promiseLoadImageLabel.value = 'finished' // Ensures it always updates
      loadingStatus.value = 'finished'
    }
  }

  async function generateGoogleImg({ original_image, total_mask, prompt, altId }) {
    try {
      loadingStatus.value = 'loading'
      currentGenId.value = altId
      const response = await fetch('http://localhost:10000/gen-img-imagen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ original_image, total_mask, prompt }),
      })
      const result = await response.json()

      if (response.ok) {
        // return result.result
        console.log(result)
        return result.filepath
      } else {
        console.log(result.error)
        return null // Optional: explicitly return null on error
      }
    } catch (err) {
      console.log(err.message)
      return null // Optional: consistently return on error
    } finally {
      loadingStatus.value = 'finished'
    }
  }

  async function generateMaskedImg({
    original_image,
    add_color_image,
    add_edge_image,
    remove_edge_image,
    total_mask,
    prompt,
    altId,
  }) {
    loadingStatus.value = 'loading'
    currentGenId.value = altId
    //props [{tag: 'red', propName: 'color'}, {tag: 'red', propName: 'color' }, ....]

    try {
      const response = await fetch('http://localhost:5000/api/magic_quill/generate', {
        // const response = await fetch('/api/magic_quill/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ms_data: {
            original_image: original_image,
            add_color_image: add_color_image,
            add_edge_image: add_edge_image,
            remove_edge_image: remove_edge_image,
            total_mask: total_mask,
          },
          prompt: prompt,
          ...generationParams,
        }),
      })

      const result = await response.json()

      return result.generated_image //base 64 url
    } catch (error) {
      console.error('Error generating image:', error)
      alert('Image generation failed. Please try again.')
    } finally {
      loadingStatus.value = 'finished'
    }
  }
  //when mousedown, detect if the pressed area belong to any of the boxes, if so, highlight the boxes
  return {
    generationParams,
    shouldTriggerT2I,
    triggerT2I,
    resetT2I,
    describeImage,
    promiseLoadImageLabel,
    generateMaskedImg,
    loadingStatus,
    detectedObjects,
    storeDetection,
    img2imgOut,
    txt2imgOut,
    propValSysPrompt,
    whatIsObject,
    objSysPrompt,
    guessPrompt,
    generateOpenAIImg,
    generateGoogleImg,
    currentGenId,
    excludePropObject,
    onPropertyNameFinalized,
    getGhostTagsForRow,
    ghostTagsPerRow,
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
