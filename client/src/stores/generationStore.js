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

  const propValSysPrompt = `You are a visual description assistant.

The user provides an image and a feature to describe — it can be a visual feature (like layout, color, font, texture, material) or a semantic feature (like landmark, object, architecture).

Your task is to describe only that feature in vivid, natural language, focusing on specific, visible details.
 Do **not** start with phrases like “The layout shows...” or “The color is...” — only write the raw description.
 No full sentences. No subjective words like “beautiful” or “elegant.”
 Use phrases like: “centered bold serif title, small icon bottom-right,” or “light grainy texture, vertical brush strokes.”
 Use up to **15 words**. Be specific, expressive, and spatially grounded.
Be precise and spatially grounded (e.g., where a logo is placed, how a fabric folds, etc.).

Return only the description. No labels, no lists, no explanation.
`

  const objSysPrompt = `You are a visual description assistant.

The user will provide an image.

Your task is to write two short outputs, separated by a colon:

A richly detailed visual description of the primary object in the image, using as many clearly visible features as possible (e.g., color, texture, material, pattern, shape, structure, surface detail). The description must use concrete, observable details only — avoid abstract or subjective terms like "elegant" or "nice." The last word of the description must be the object’s name such as 'dress' or 'armchair' without any descriptors.

The name of the primary object alone.

Use natural language, not a list of keywords.
Limit the first description to 10 words or fewer.
Be specific, expressive, and grounded in what’s visible.

Return only the two phrases, separated by a colon. Do not explain or add anything else.`

  const nonPropsSysPrompt = `You are a visual description assistant.

The user will provide an image and may optionally specify a visual property to exclude (e.g., color, texture).

Your task is to return exactly three outputs, separated by colons **with no extra colons inside**:

1. A comma-separated list of clearly visible visual properties of the primary object, excluding the specified property. Use only concrete, observable details (e.g., "wooden, smooth, floral patched, curvy, T-shape"). Do not include subjective or abstract terms.

2. The name of the primary object only (e.g., "chair", "backpack").

3. A comma-separated list of all applicable visual property categories that were used in the first output (e.g., color, texture, material, pattern, shape, structure, surface detail).

Limit the first description to 20 words or fewer. Make sure to return exactly three parts, where each part is separated by **a colon**. Do not include any explanation or additional punctuation.
`

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

      const response = await fetch('http://localhost:5555/image-to-labels', {
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
      console.log(raw)

      const [adjPart = '', objPart = '', visibleProps = ''] = raw.split(':').map((s) => s.trim())
      if (!raw || typeof raw !== 'string') {
        throw new Error('describeImage returned empty or non‑string')
      }
      return {
        adjObjectText: adjPart, // e.g. "elegant wooden leather sofa"
        objectText: objPart, // e.g. "sofa"
        visibleProps: visibleProps, // e.g. "color, texture, material, pattern, shape, structure, surface detail"
      }
    } finally {
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

  async function generateOpenAIImg({ original_image, total_mask, prompt, altId }) {
    loadingStatus.value = 'loading'
    try {
      currentGenId.value = altId
      promiseLoadImageLabel.value = 'loading'
      const response = await fetch('http://localhost:5555/edit-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ original_image, total_mask, prompt }),
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
      const response = await fetch('http://localhost:5555/gen-img-imagen', {
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
  }
})
