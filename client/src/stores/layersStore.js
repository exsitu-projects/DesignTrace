import { defineStore } from 'pinia'

export const useLayers = defineStore('layers', {
  state: () => ({
    layers: [], // { id, url}
  }),
  actions: {
    addLayer(layer) {
      this.layers.push(layer)
    },
    removeLayer(id) {
      this.layers = this.layers.filter((l) => l.id !== id)
    },
  },
})
