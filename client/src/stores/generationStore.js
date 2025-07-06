import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export const useGeneration = defineStore('generation', () => {
  // 'notDragging', 'startDragging', 'finishedDragging'
  const img2imgOut = ref({ src: '' })
  const txt2imgOut = ref({ src: '' })
  const detectedObjects = ref([])
  const generatePromise = ref('')
  const promiseLoadImageLabel = ref('')
  const shouldTriggerT2I = ref(false)
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
    cfg: 6.0,
    sampler_name: 'dpm_2_ancestral',
    scheduler: 'karras',
  }

  const propValSysPrompt = `You are a visual description assistant.

The user will give you one visual property (like color, texture, or material) and an image.

Your task is to write a concise, vivid description of that property as clearly seen in the image.

Use natural language, not a list of keywords.
Limit your response to 8 words or fewer.
Use adjectives or phrases like “shell-like,” “light reflections,” “wood grain,” etc.
Be specific, expressive, and grounded in what’s visible.
If the property is not visible, respond only with “none”.

Return only the description. Do not explain or add anything else.`

  const objSysPrompt = `You are a visual description assistant.

The user will give you a visual feature or property (like color, texture, or material) and an image.

Your task is to write two short outputs, separated by a comma:

1. A detailed description of the primary object that **intentionally excludes any mention of the specified visual property but includes other clearly visible attributes (e.g., shape, form, surface detail, style, material, etc.)** plus the name of the object (e.g., when users input "color", the output could be “a midi flowy bohemian dress with linen textiles and some flower textures at the bottom” without describing the color).

2. The name of the primary object alone (e.g., “dress”).

Use natural language, not a list of keywords.
Limit the first description to 10 words or fewer.
Be specific, expressive, and grounded in what’s visible.

Return only the two phrases, separated by a comma. Do not explain or add anything else.`
  function setGeneratePromise(promiseState) {
    generatePromise.value = promiseState
  }
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
    const raw = await describeImage(lassoBoundUrl, propsString, objSysPrompt)
    const [adjPart = '', objPart = ''] = raw.split(',').map((s) => s.trim())
    if (!raw || typeof raw !== 'string') {
      throw new Error('describeImage returned empty or non‑string')
    }
    return {
      adjObjectText: adjPart, // e.g. "elegant wooden leather sofa"
      objectText: objPart, // e.g. "sofa"
    }
  }

  async function generateMaskedImg({
    original_image,
    add_color_image,
    add_edge_image,
    remove_edge_image,
    total_mask,
    props,
    adjObjectText,
    objectText,
  }) {
    //props [{tag: 'red', propName: 'color'}, {tag: 'red', propName: 'color' }, ....]
    const descriptors = props.map((p) => `${p.tag} ${p.propName}`) // ["Red color", "Velvet fabric", ...]
    const imgGenPrompt = adjObjectText + ' in ' + descriptors.join(' and ')
    console.log(imgGenPrompt)
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
          prompt: imgGenPrompt,
          ...generationParams,
        }),
      })

      const result = await response.json()

      return result.generated_image //base 64 url
    } catch (error) {
      console.error('Error generating image:', error)
      alert('Image generation failed. Please try again.')
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
    generatePromise,
    detectedObjects,
    storeDetection,
    img2imgOut,
    txt2imgOut,
    setGeneratePromise,
    propValSysPrompt,
    whatIsObject,
  }
})
