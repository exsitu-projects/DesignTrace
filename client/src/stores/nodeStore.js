import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useGeneration } from '@/stores/generationStore.js'
export const useNode = defineStore('nodes', () => {
  /* ----------------------------------------------------------
   Data‑structure overview
   ----------------------------------------------------------

   nodeBranchList              (array)  [the whole forest]
   ├── nodeBranch              (object) [a single branch]
   │   ├── node                (object) [a point on the branch]
   │   │   ├── alt             (object) [smallest unit — an “alternative”]
   │   │   └── alt
   │   └── node
   │       └── alt
   └── nodeBranch
       └── node
           └── alt

   Legend
   ──────
   nodeBranchList : collection of *node branches* (like a list of branches)
   nodeBranch     : contains several *nodes* that are connected in order
   node           : can hold several *alts*
   alt            : ≪ smallest / leaf level ≫

*/
  const nodeBranchList = ref([])
  const currentBranchId = ref(null)
  const currentNodeId = ref(null)
  const layerPayload = ref(null)
  const canvasW = 400
  const nodeW = canvasW + 20
  const nodeH = canvasW + 120

  const initialNodeX = 150
  const initialNodeY = 150
  const adjacent = 100
  const nodeXR = ref(0)
  const nodeYB = ref(0)
  const nodeYT = ref(0)
  const offsetY = ref(0)
  const currentLassoInfo = ref({})
  const addAltImgPayload = ref({})
  const generationStore = useGeneration()
  function addNodeBranch() {
    const newBranch = {
      id: `branch_${Date.now()}`,
      nodes: [],
    }
    currentBranchId.value = newBranch.id
    nodeBranchList.value.push(newBranch)
  }

  function setNodeXR(newVal) {
    nodeXR.value = newVal
  }

  function setNodeYB(newVal) {
    nodeYB.value = newVal
  }

  function addNode(nodeBranchId) {
    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)
    if (branch) {
      const newNode = {
        id: `node_${Date.now()}`,
        alts: [],
      }
      currentNodeId.value = newNode.id
      branch.nodes.push(newNode)
    }
  }

  function setCurrentLassoInfo(lassoPayload) {
    currentLassoInfo.value = lassoPayload
  }

  async function addAlt(
    altObj,
    nodeBranchId,
    nodeId,
    posX = initialNodeX,
    posY = initialNodeY,
    currentAltId = null,
    index,
  ) {
    // default if nothing gets generated
    let imgUrl = null

    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)
    if (!branch) return null

    const node = branch.nodes.find((n) => n.id === nodeId)
    if (!node) return null

    const newAlt = {
      id: `alt_${Date.now() + index}`,
      position: { x: posX, y: posY },
      edges: [],
      properties: [altObj], // e.g. [{ tag: 'Red', propName: 'color' }]
    }

    node.alts.push(newAlt)

    if (currentAltId) {
      //meaning the alt is in an alt nodes branch rather than starting from scratch
      const currentAlt = node.alts.find((n) => n.id === currentAltId)
      if (currentAlt) {
        currentAlt.edges.push({ fromAltId: currentAltId, toAltId: newAlt.id })
      }
      try {
        imgUrl = await generationStore.generateMaskedImg({
          ...currentLassoInfo.value,
          props: newAlt.properties,
        })
        currentAlt.imgUrl = imgUrl
        addAltImgPayload.value = { url: imgUrl, altId: newAlt.id }
      } catch (e) {
        console.error('Image generation failed:', e)
        currentAlt.imgUrl = null
        imgUrl = null
      }
    }

    return imgUrl // null if nothing generated
  }

  async function addMultAlt(
    altObjs,
    nodeBranchId,
    nodeId,
    currentNodeX,
    currentNodeY,
    currentAltId,
  ) {
    // Guard: only proceed for the current lasso alt
    if (currentAltId !== currentLassoInfo.value.altId) return

    const num = altObjs.length
    const maxY = currentNodeY + (nodeH / 2) * (num - 1)
    const minY = currentNodeY - (nodeH / 2) * (num - 1)

    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)
    if (!branch) return

    // Shift everything down if new nodes would go above 0
    if (minY < 0) {
      offsetY.value = -minY
      branch.nodes.forEach((n) => n.alts.forEach((a) => (a.position.y += offsetY.value)))
    } else {
      offsetY.value = 0
    }

    nodeYT.value = minY + offsetY.value
    nodeYB.value = Math.max(maxY + nodeH, nodeYB.value) + offsetY.value

    const x = currentNodeX + nodeW + adjacent
    nodeXR.value = Math.max(nodeXR.value, x + nodeW)

    const urls = [] // collect generated URLs
    const propsString = altObjs
      .map((o) => o.propName) // → ["color","texture"]
      .filter((v, i, arr) => arr.indexOf(v) === i) // optional: remove duplicates
      .join(', ') // → "color, texture"
    //detect what exactly the object selection is before generating alts
    try {
      const { adjObjectText, objectText } = await generationStore.whatIsObject(
        currentLassoInfo.value.lassoBoundUrl,
        propsString,
      )
      delete currentLassoInfo.value.lassoBoundUrl ////TODO: not the best way to write it like this...
      currentLassoInfo.value.adjObjectText = adjObjectText
      currentLassoInfo.value.objectText = objectText
    } catch (e) {
      console.error('Primary object detection failed:', e)
      return
    }

    for (let i = 0; i < num; i++) {
      // SERIAL loop, await each addAlt
      const y = maxY - nodeH * i + offsetY.value
      const url = await addAlt(altObjs[i], nodeBranchId, nodeId, x, y, currentAltId, i)

      urls.push(url) // keep if you need them
    }
    console.log(urls)
    return urls // or omit if not needed
  }

  return {
    nodeXR,
    nodeYB,
    nodeYT,
    nodeW,
    nodeH,
    canvasW,
    layerPayload,
    nodeBranchList,
    currentNodeId,
    currentBranchId,
    addAltImgPayload,
    setNodeXR,
    setNodeYB,
    addNodeBranch,
    addNode,
    addAlt,
    addMultAlt,
    setCurrentLassoInfo,
  }
})
