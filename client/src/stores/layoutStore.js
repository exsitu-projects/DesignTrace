// src/stores/layoutStore.js
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLayout = defineStore('layout', () => {
  /* ------------------------------------------------------------------
     reactive wrapper size
  ------------------------------------------------------------------ */
  const width = ref(0)
  const height = ref(0)

  /* ------------------------------------------------------------------
     called by FreeCanvas (ResizeObserver) whenever the real wrapper
     is measured — keeps store in sync with DOM
  ------------------------------------------------------------------ */
  function setWrapperSize(w, h) {
    width.value = w
    height.value = h
  }

  /* ------------------------------------------------------------------
     any node or tool can call this to request extra space
     (e.g. when a node is dragged beyond the current edge)
  ------------------------------------------------------------------ */
  function ensureFits(needW, needH) {
    if (needW > width.value) width.value = needW
    if (needH > height.value) height.value = needH
  }

  return {
    width,
    height,
    setWrapperSize,
    ensureFits,
  }
})
