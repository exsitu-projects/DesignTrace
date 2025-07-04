import { defineStore } from 'pinia'
import { ref } from 'vue'

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
  const nodeW = 300
  const nodeH = 400
  const initialNodeX = 150
  const initialNodeY = 150
  const adjacent = 100
  const nodeXR = ref(0)
  const nodeYB = ref(0)
  const nodeYT = ref(0)
  const offsetY = ref(0)

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

  function addDOMLayer(layer) {
    layerPayload.value = { url: layer.url, id: layer.id, left: layer.left, top: layer.top }
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

  function addAlt(
    altObj,
    nodeBranchId,
    nodeId,
    posX = initialNodeX,
    posY = initialNodeY,
    currentAltId = null,
    index,
  ) {
    ////TODO: Maybe optimize here, duplicated code as addMultAlt
    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)

    if (branch) {
      const node = branch.nodes.find((n) => n.id === nodeId)
      if (node) {
        const newAlt = {
          id: `alt_${Date.now() + index}`,
          position: { x: posX, y: posY },
          edges: [],
          properties: [altObj],
        }
        node.alts.push(newAlt)
        if (currentAltId) {
          const currentAlt = node.alts.find((n) => n.id === currentAltId)
          currentAlt.edges.push({ fromAltId: currentAltId, toAltId: newAlt.id })
        }
      }
    }
  }

  function addMultAlt(altObjs, nodeBranchId, nodeId, currentNodeX, currentNodeY, currentAltId) {
    const num = altObjs.length
    const maxY = currentNodeY + (nodeH / 2) * (num - 1)
    const minY = currentNodeY - (nodeH / 2) * (num - 1)

    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)

    if (minY < 0) {
      offsetY.value = -minY
      for (let node of branch.nodes) {
        for (let alt of node.alts) {
          alt.position.y += offsetY.value
        }
      }
    } else {
      offsetY.value = 0
    }
    nodeYT.value = minY + offsetY.value
    nodeYB.value = Math.max(maxY + nodeH, nodeYB.value) + offsetY.value
    let x = currentNodeX + nodeW + adjacent
    let y

    nodeXR.value = Math.max(nodeXR.value, x + nodeW)
    for (let i = 0; i < num; i++) {
      y = maxY - nodeH * i + offsetY.value
      addAlt(altObjs[i], nodeBranchId, nodeId, x, y, currentAltId, i)
    }
  }

  return {
    nodeXR,
    nodeYB,
    nodeYT,
    nodeW,
    nodeH,
    layerPayload,
    nodeBranchList,
    currentNodeId,
    currentBranchId,
    setNodeXR,
    setNodeYB,
    addDOMLayer,
    addNodeBranch,
    addNode,
    addAlt,
    addMultAlt,
  }
})
