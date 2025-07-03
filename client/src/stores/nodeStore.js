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
  const nodeXR = ref(0)
  const nodeYB = ref(0)
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

  function addAlt(altObj, nodeBranchId, nodeId) {
    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)
    if (branch) {
      const node = branch.nodes.find((n) => n.id === nodeId)
      if (node) {
        const newAlt = {
          id: `alt_${Date.now()}`,
          position: { x: node.alts.length * 30, y: node.alts.length * 30 },
          ...altObj,
        }
        node.alts.push(newAlt)
      }
    }
  }

  return {
    nodeXR,
    nodeYB,
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
  }
})
