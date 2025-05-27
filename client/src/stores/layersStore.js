import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLayers = defineStore('layers', () => {
  const layers = ref([])
  const layerPayload = ref(null)
  //for testing the layers array only
  layers.value.push({
    id: Date.now(),
    prompt: ['apple'],
    url: 'xxx',
    left: 100,
    top: 100,
    selectable: true,
    hasControls: true,
  })
  function addLayer(layer) {
    layers.value.push(layer)
    layerPayload.value = layer
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
    layerPayload.value = { url: newUrl, idInLayers: idInLayers }
  }

  return {
    layers,
    layerPayload,
    addLayer,
    removeLayer,
    addNewLabel,
    getPromptsOneLayer,
    setLayerUrl,
  }
})
