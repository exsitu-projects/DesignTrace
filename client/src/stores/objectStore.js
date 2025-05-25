import { defineStore } from 'pinia'

export const useObjects = defineStore('objects', {
  state: () => ({
    //image
    dropped: false,
    searchString: '',
    numSearchResult: 30,
    searchPromiseState: {
      loading: false,
      data: [],
      error: null,
    },
  }),
  actions: {
    addColourToCanvas(rgbArray) {
      this.currentColor = rgbArray //dominant color
      this.currentColorPalette = [[...rgbArray]]
    },
    setCurrentImageId(id) {
      this.currentImageId = id
    },

    //process uploaded images
  },
})
