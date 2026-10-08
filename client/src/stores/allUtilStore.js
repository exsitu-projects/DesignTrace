import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAllUtil = defineStore('allUtil', () => {
  const isLassoMode = ref(false)
  const nodeOnDrag = ref(false)
  const isStepLock = ref(false)
  const isToolTip = ref(false)
  const isPropagate = ref(false)
  const isTxt2Img = ref(false)
  // Propagation state
  const propagationStartAlt = ref(null)
  const propagationEndAlt = ref(null)
  const propagationRange = ref([])
  const isSelectingStartAlt = ref(false)
  const isSelectingRange = ref(false)
  function switchLassoMode() {
    if (isPropagate.value) isPropagate.value = false
    isLassoMode.value = !isLassoMode.value
  }

  function switchTxt2Img() {
    if (isPropagate.value) isPropagate.value = false
    isTxt2Img.value = !isTxt2Img.value
  }
  function switchPropagateMode() {
    if (isLassoMode.value) isLassoMode.value = false
    isPropagate.value = !isPropagate.value

    if (isPropagate.value) {
      // Reset propagation state when entering propagate mode
      propagationStartAlt.value = null
      propagationEndAlt.value = null
      propagationRange.value = []
      isSelectingStartAlt.value = true
      isSelectingRange.value = false
    } else {
      // Reset all propagation state when exiting
      propagationStartAlt.value = null
      propagationEndAlt.value = null
      propagationRange.value = []
      isSelectingStartAlt.value = false
      isSelectingRange.value = false
    }
  }
  function switchStepLock() {
    isStepLock.value = !isStepLock.value
  }

  function setStartAlt(altId) {
    propagationStartAlt.value = altId
    isSelectingStartAlt.value = false
    isSelectingRange.value = true
    propagationRange.value = [altId]
  }

  function addToRange(altId) {
    if (!propagationRange.value.includes(altId)) {
      propagationRange.value.push(altId)
    }
  }

  function removeFromRange(altId) {
    const index = propagationRange.value.indexOf(altId)
    if (index > -1) {
      propagationRange.value.splice(index, 1)
    }
  }

  function confirmPropagationRange() {
    console.log('Propagating to alts:', propagationRange.value)
    return propagationRange.value
  }

  return {
    nodeOnDrag,
    isLassoMode,
    isStepLock,
    isToolTip,
    isPropagate,
    propagationStartAlt,
    propagationEndAlt,
    propagationRange,
    isSelectingStartAlt,
    isSelectingRange,
    switchPropagateMode,
    switchLassoMode,
    switchStepLock,
    setStartAlt,
    addToRange,
    removeFromRange,
    confirmPropagationRange,
    switchTxt2Img,
    isTxt2Img,
  }
})
