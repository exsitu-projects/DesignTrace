import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLayers = defineStore('layers', () => {
  const layers = ref([])
  const context = ref({ visual: null, semantics: 'An oil painting of a table', type: 'context' })
  const styles = ref([])
  const layerPayload = ref(null)
  const promiseLoadLayerUpdate = ref('')
  const mergeEverything = ref(false)
  const promptMap = ref(null)
  // layers.value.push({
  //   id: '111',
  //   prompt: ['impressionism'],
  //   url: 'xxx',
  //   type: 'style',
  // })
  // layers.value.push({
  //   id: Date.now(),
  //   prompt: ['apple', 'with green leaves'],
  //   url: 'xxx',
  //   left: 100,
  //   top: 100,
  //   selectable: true,
  //   hasControls: true,
  //   type: 'object',
  // }) //for testing the layers array only
  function buildPromptForDetection() {
    promptMap.value = layers.value
      .filter((layer) => layer.type === 'object')
      .map((layer) => ({
        id: layer.id,
        sentence: layer.prompt
          .map((p) => p.replace(/\.\s*$/, ''))
          .join(' ')
          .trim(), //remove . if there's any
      }))

    const fullPrompt = promptMap.value.map((p) => p.sentence).join('. ') + '.'
    console.log(fullPrompt)
    return fullPrompt
  }

  function findLayerIdByPhrase(detectedPhrase) {
    const cleanPhrase = detectedPhrase.trim().replace(/\.$/, '') // strip any stray period
    const match = promptMap.value.find((entry) => entry.sentence === cleanPhrase)
    return match ? match.id : null
  }
  function buildStructuredPrompt() {
    const contextParts = []
    const objectParts = []
    const styleParts = []

    for (const layer of layers.value) {
      if (!layer.prompt || !Array.isArray(layer.prompt)) continue

      // Clean up prompt parts: remove trailing periods for objects
      let cleanedPrompt = layer.prompt.map((p) => {
        return layer.type === 'object' ? p.replace(/\.+$/, '') : p
      })

      const joinedPrompt =
        layer.type === 'object' ? cleanedPrompt.join('; ').trim() : cleanedPrompt.join(', ').trim()

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
    const objectText = objectParts.join('; ') // semicolon here too
    const styleText = styleParts.join(', ')

    let prompt =
      'Generate a new image that keeps all the objects of the image input and strictly preserve the original object positions. The new image should be in '

    if (contextText) {
      prompt += `${contextText} context`
    }
    if (objectText) {
      prompt += contextText
        ? `, making sure to include ${objectText} in their original locations`
        : `Include ${objectText} in their original locations`
    }
    if (styleText) {
      prompt +=
        contextText || objectText
          ? `, and apply the style of ${styleText}`
          : `Apply the style of ${styleText}`
    }
    console.log(prompt)
    return prompt
  }

  function addLayer(layer) {
    layers.value.unshift(layer)
  }

  function addStyle(layer) {
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
    return found.prompt.join(',') + 'in the style of ' + found.hiddenStyle
  }

  function setLayerUrl(idInLayers, newUrl) {
    let found = findOneLayer(idInLayers)
    found.url = newUrl
    layerPayload.value = { url: newUrl, id: idInLayers, left: 0, top: 0 }
  }

  return {
    styles,
    context,
    addStyle,
    findLayerIdByPhrase,
    buildPromptForDetection,
    mergeEverything,
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
