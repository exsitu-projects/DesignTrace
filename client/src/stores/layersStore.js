import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLayers = defineStore('layers', () => {
  const layers = ref([])
  const layerPayload = ref(null)
  const promiseLoadLayerUpdate = ref('')

  layers.value.push({
    id: Date.now(),
    prompt: ['A bright living room with minimalistic design'],
    url: 'xxx',
    type: 'context',
  }) //for testing the layers array only
  layers.value.push({
    id: Date.now(),
    prompt: ['apple', 'with green leaves'],
    url: 'xxx',
    left: 100,
    top: 100,
    selectable: true,
    hasControls: true,
    type: 'object',
  }) //for testing the layers array only
  function buildStructuredPrompt() {
    const contextParts = []
    const objectParts = []
    const styleParts = []

    for (const layer of layers.value) {
      if (!layer.prompt || !Array.isArray(layer.prompt)) continue

      const joinedPrompt = layer.prompt.join(', ').trim()
      if (!joinedPrompt) continue

      if (layer.type === 'context') {
        contextParts.push(joinedPrompt)
      } else if (layer.type === 'object') {
        objectParts.push(joinedPrompt)
      } else if (layer.type === 'style') {
        styleParts.push(joinedPrompt)
      }
    }

    const contextText = contextParts.join(', ')
    const objectText = objectParts.join(', ')
    const styleText = styleParts.join(', ')

    let prompt = 'Generate an image based on the given image'

    if (contextText) {
      prompt += `, the generated image should be ${contextText}`
    }
    if (objectText) {
      prompt += contextText ? `, including ${objectText}` : `, including ${objectText}`
    }
    if (styleText) {
      prompt +=
        contextText || objectText
          ? ` in the style of ${styleText}`
          : `, in the style of ${styleText}`
    }

    prompt += '.'

    return prompt
  }
  function addLayer(layer) {
    layers.value.push(layer)
  }
  function addDOMLayer(layer) {
    layerPayload.value = { url: layer.url, id: layer.id, left: layer.left, top: layer.top }
  }
  function removeLayer(id) {
    layers.value = layers.value.filter((l) => l.id !== id)
  }

  function addNewLabel(idInLayers) {
    const found = findOneLayer(idInLayers)
    found.prompt.push(' ')
  }

  function findOneLayer(idInLayers) {
    return layers.value.find((item) => item.id === idInLayers)
  }

  function getPromptsOneLayer(idInLayers) {
    const found = findOneLayer(idInLayers)
    return found.prompt
  }

  function setLayerUrl(idInLayers, newUrl) {
    let found = findOneLayer(idInLayers)
    layerPayload.value = { url: newUrl, id: idInLayers, left: 0, top: 0 }
  }

  return {
    layers,
    layerPayload,
    buildStructuredPrompt,
    promiseLoadLayerUpdate,
    addLayer,
    addDOMLayer,
    removeLayer,
    addNewLabel,
    getPromptsOneLayer,
    setLayerUrl,
  }
})
