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
  const canvasW = 300
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
  const currentColorPenInfo = ref({})
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

  function addNode(nodeBranchId, midXPos = initialNodeX, midYPos = initialNodeY) {
    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)
    if (branch) {
      const newNode = {
        id: `node_${Date.now()}`,
        alts: [],
        midXPos: midXPos,
        midYPos: midYPos,
      }
      currentNodeId.value = newNode.id
      branch.nodes.push(newNode)
    }
  }

  function setCurrentLassoInfo(lassoPayload) {
    currentLassoInfo.value = lassoPayload
  }

  async function applyColorPen(colorPenPayload) {
    currentColorPenInfo.value = colorPenPayload
    let imgUrl
    try {
      const output = await generationStore.guessPrompt({
        original_image: colorPenPayload.original_image,
        add_color_image: colorPenPayload.add_color_image,
        add_edge_image: colorPenPayload.add_edge_image,
      })
      currentColorPenInfo.value.prompt = output
      imgUrl = await generationStore.generateMaskedImg(currentColorPenInfo.value)
      addAltImgPayload.value = { url: imgUrl, altId: colorPenPayload.altId }
    } catch (e) {
      console.error('Image generation failed:', e)
      imgUrl = null
    }
  }

  async function addAlt(
    altObj,
    nodeBranchId,
    nodeId,
    index,
    posX = initialNodeX,
    posY = initialNodeY,
    prevAltId = null,
    adjObjectText = '',
  ) {
    // default if nothing gets generated
    let imgUrl = null

    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)
    const prevNode = branch.nodes.find((n) => n.id === nodeId)
    const newNode = branch.nodes.find((n) => n.id === currentNodeId.value)
    const newAlt = {
      id: `alt_${Date.now() + index}`,
      position: { x: posX, y: posY },
      branchId: nodeBranchId,
      nodeId: currentNodeId.value,
      edges: [],
      z: 1000,
      properties: [altObj], // e.g. [{ tag: 'Red', propName: 'color' }]
    }
    const descriptors = newAlt.properties.map((p) => `${p.tag} ${p.propName}`) // ["Red color", "Velvet fabric", ...]
    const prompt = descriptors.join(' and ') + ' ' + adjObjectText
    console.log(prompt)
    currentLassoInfo.value.prompt = prompt

    if (prevAltId) {
      newNode.alts.push(newAlt)
      //meaning the alt is in an alt nodes branch rather than starting from scratch
      const prevAlt = prevNode.alts.find((n) => n.id === prevAltId)
      if (prevAlt) {
        prevAlt.edges.push({ fromAltId: prevAltId, toAltId: newAlt.id })
        console.log(prevAlt.edges)
      }
      try {
        imgUrl = await generationStore.generateMaskedImg(currentLassoInfo.value)
        addAltImgPayload.value = { url: imgUrl, altId: newAlt.id }
      } catch (e) {
        console.error('Image generation failed:', e)
        imgUrl = null
      }
    } else {
      prevNode.alts.push(newAlt)
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
    const prevNode = branch.nodes.find((n) => n.id === nodeId)
    const x = currentNodeX + nodeW + adjacent
    // Shift everything down if new nodes would go above 0
    if (minY < 0) {
      offsetY.value = -minY
      branch.nodes.forEach((n) => n.alts.forEach((a) => (a.position.y += offsetY.value)))
    } else {
      offsetY.value = 0
    }
    if ('nextNodeId' in prevNode) {
      // create alts on existing node
    } else {
      //create a new node
      addNode(nodeBranchId, x, (maxY + minY) / 2 + offsetY.value)
    }
    prevNode.nextNodeId = currentNodeId.value

    nodeYT.value = minY + offsetY.value
    nodeYB.value = Math.max(maxY + nodeH, nodeYB.value) + offsetY.value

    nodeXR.value = Math.max(nodeXR.value, x + nodeW)

    const urls = [] // collect generated URLs
    const propsString = altObjs
      .map((o) => o.propName) // → ["color","texture"]
      .filter((v, i, arr) => arr.indexOf(v) === i) // optional: remove duplicates
      .join(', ') // → "color, texture"
    //detect what exactly the object selection is before generating alts
    let adjObjectText = ''
    let objectText = ''
    try {
      const result = await generationStore.whatIsObject(
        currentLassoInfo.value.lassoBoundUrl,
        propsString,
      )
      adjObjectText = result.adjObjectText
      objectText = result.objectText
      ////TODO: Consider a cleaner state update mechanism than direct deletion
      delete currentLassoInfo.value.lassoBoundUrl
    } catch (e) {
      console.error('Primary object detection failed:', e)
      return
    }

    for (let i = 0; i < num; i++) {
      // SERIAL loop, await each addAlt
      const y = maxY - nodeH * i + offsetY.value
      const url = await addAlt(
        altObjs[i],
        nodeBranchId,
        nodeId,
        i,
        x,
        y,
        currentAltId,
        adjObjectText,
      )

      urls.push(url) // keep if you need them
    }
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
    applyColorPen,
  }
})
