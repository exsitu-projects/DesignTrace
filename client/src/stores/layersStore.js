import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLayers = defineStore('layers', () => {
  const layers = ref([])
  const layerPayload = ref(null)

  layers.value.push({
    id: Date.now(),
    prompt: ['A bright living room with minimalistic design'],
    url: 'xxx',
    type: 'context',
  }) //for testing the layers array only
  layers.value.push({
    id: Date.now(),
    prompt: ['apple'],
    url: 'xxx',
    left: 100,
    top: 100,
    selectable: true,
    hasControls: true,
    type: 'object',
  }) //for testing the layers array only
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
    addLayer,
    addDOMLayer,
    removeLayer,
    addNewLabel,
    getPromptsOneLayer,
    setLayerUrl,
  }
})
