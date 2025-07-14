<template>
  <div id="app">
    <!-- wrapper provides the relative positioning context -->

    <FreeCanvas />
    <button
      v-show="nodesSelected"
      @click="confirmNodes"
      class="btn btn-sm btn-outline-success m-1 mx-auto"
      style="z-index: 5000; position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%)"
    >
      <Check color="green" :size="15" />&nbsp;Proceed to Next Step
    </button>
    <!-- nodes & alts overlay -->
    <svg
      class="arrows-layer"
      :width="nodeStore.nodeXR"
      :height="nodeStore.nodeYB"
      style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 500"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="6"
          markerHeight="4"
          refX="6"
          refY="2"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <!-- scale the triangle down and soften the colour -->
          <polygon points="0 0, 6 2, 0 4" fill="#666666" />
        </marker>
      </defs>

      <path
        v-for="edge in allVisibleEdges"
        :key="edge.fromAltId + '-' + edge.toAltId"
        :d="getBezierPath(edge)"
        stroke="#666"
        stroke-width="1.4"
        fill="none"
        marker-end="url(#arrowhead)"
      />
    </svg>
    <transition-group name="fade" tag="div" class="nodes-layer">
      <VueDraggableResizable
        v-for="alt in allAlts"
        v-show="alt.visible"
        :id="'drag_' + alt.id"
        :key="alt.id"
        :x="alt.position.x"
        :y="alt.position.y"
        :w="'auto'"
        :h="'auto'"
        :z="alt.z"
        :class="['design-space-container alt-item', isSelected(alt.id) ? 'selected' : '']"
        :requestForLasso="requestForLasso"
        @mousedown="allUtilStore.nodeOnDrag = false"
        @click="handleClick(alt.id, alt.branchId)"
        @mouseup="
          mouseUpNode(alt.position.x, alt.position.y, alt.branchId, alt.nodeId, alt.id, $event)
        "
        :draggable="true"
        :drag-handle="'.nodeHandle'"
        @dragging="(x, y) => onDrag(x, y, alt)"
      >
        <NewNode :alt="alt" :imgPayload="alt.id === dropAltId ? imgDOMPayload : null" />
      </VueDraggableResizable>
    </transition-group>
    <!-- floating palette panel -->
    <VueDraggableResizable
      :x="position.x"
      :y="position.y"
      :w="'auto'"
      :h="'auto'"
      :draggable="true"
      :drag-handle="'.handle'"
      class="design-space-container"
      @dragging="onDrag"
    >
      <div class="header handle small fw-bolder">
        Palette
        <button class="btn btn-sm btn-light" @click="toggleDesignSpace">
          <i :class="isDesignSpaceVisible ? 'bx bx-chevron-up' : 'bx bx-chevron-down'"></i>
        </button>
      </div>

      <div class="row p-2" style="width: 35vw" v-show="isDesignSpaceVisible">
        <InfoPalette />
      </div>
    </VueDraggableResizable>
  </div>
</template>

<script setup>
/* external libs / helpers */
import { ref, reactive, onMounted, nextTick, computed } from 'vue'
import VueDraggableResizable from 'vue-draggable-resizable'

/* components */
import FreeCanvas from '@/components/FreeCanvas.vue'
import NewNode from '@/components/NewNode.vue'
import InfoPalette from '@/components/InfoPalette.vue'

/* Pinia stores */
import { useNode } from '@/stores/nodeStore.js'
import { useObject } from '@/stores/objectStore.js'
import { Check } from 'lucide-vue-next'
import { useAllUtil } from '@/stores/allUtilStore.js'
/* --- store instances --- */

const nodeStore = useNode()
const objectStore = useObject()
const allUtilStore = useAllUtil()
const selectedBranchId = ref('')
/* --- plain state --- */
const availableModels = ref([])
const allAlts = computed(() =>
  nodeStore.nodeBranchList.flatMap((b) => b.nodes.flatMap((n) => n.alts)),
)
const allVisibleEdges = computed(() =>
  allAlts.value.flatMap((alt) =>
    (alt.visibleEdges ?? []).map(({ fromAltId, toAltId }) => ({ fromAltId, toAltId })),
  ),
)
const requestForLasso = ref(false)
const imgDOMPayload = ref({})
const dropAltId = ref(0)
const isDesignSpaceVisible = ref(false)
const position = reactive({ x: 20, y: 20 })
const selectedIndices = ref([])
const lastSelectedIndex = ref(null)
const ctrlPressed = ref(false)
/* example async — not used right now */
function confirmNodes() {
  console.log(selectedIndices.value)
  nodeStore.updateParents(selectedIndices.value, selectedBranchId.value)
  selectedIndices.value = []
}

function handleClick(altId, branchId) {
  if (allUtilStore.nodeOnDrag) return

  if (ctrlPressed.value) {
    // Toggle selection
    const idx = selectedIndices.value.indexOf(altId)
    if (idx > -1) {
      selectedIndices.value.splice(idx, 1)
    } else {
      selectedIndices.value.push(altId)
    }
  } else {
    // Single selection
    const idx = selectedIndices.value.indexOf(altId)
    if (idx > -1) {
      selectedIndices.value = []
    } else {
      selectedIndices.value = [altId]
    }
  }
  selectedBranchId.value = branchId
  lastSelectedIndex.value = altId
}

function isSelected(altId) {
  return selectedIndices.value.includes(altId)
}

const nodesSelected = computed(() => selectedIndices.value.length > 0)

function handleKeyDown(e) {
  if (e.key === 'Control') ctrlPressed.value = true
}
function handleKeyUp(e) {
  if (e.key === 'Control') ctrlPressed.value = false
}

function toggleDesignSpace() {
  isDesignSpaceVisible.value = !isDesignSpaceVisible.value
}

async function mouseUpNode(altPosX, altPosY, branchId, nodeId, altId, e) {
  allUtilStore.nodeOnDrag = false // reset
  if (objectStore.dragState !== 'startDragging') return
  if (objectStore.obj !== null) {
    if (objectStore.obj.type === 'tag' || objectStore.obj.type === 'property') {
      requestForLasso.value = true
      // objectStore.obj in form of { type: 'tag', content: [{ tag: tagObj.tag, propName: propName }] }
      // objectStore.obj in form of
      /*{ type: 'tag', content:
      [{ tag: 'Red',   propName: 'color' },
      { tag: 'Green', propName: 'color' },
      { tag: 'Blue',  propName: 'color' },]}*/
      if (allUtilStore.isStepLock) {
        await nodeStore.addOnExistingAlt(
          objectStore.obj.content,
          branchId,
          nodeId,
          altPosX,
          altPosY,
          altId,
        )
      } else {
        await nodeStore.addMultAlt(
          objectStore.obj.content,
          branchId,
          nodeId,
          altPosX,
          altPosY,
          altId,
        )
      }

      objectStore.obj = {}
      objectStore.dragState = 'finishedDragging'
      requestForLasso.value = false
    } else if (objectStore.obj.type === 'image') {
      //the dropped thing is an image and is dropped to the canvas area
      const droppedObj = objectStore.obj
      objectStore.startDragTop = droppedObj.top
      objectStore.startDragLeft = droppedObj.left
      const newId = Date.now()
      imgDOMPayload.value = {
        id: newId,
        url: droppedObj.src,
        e: e,
      }
      objectStore.dragState = 'restoreInitialDOM'
      dropAltId.value = altId
    }
  }
}

function onDrag(x, y, alt) {
  allUtilStore.nodeOnDrag = true
  if (alt !== undefined) {
    //dragging an alt
    alt.position.x = x
    alt.position.y = y
    ensureNodeInView(x, y)
  } else {
    //dragging the palette
    position.x = x
    position.y = y
  }
  selectedIndices.value = []
}

function ensureNodeInView(nodeXL, nodeYT) {
  const draggingXR = nodeXL + nodeStore.nodeW
  const draggingYB = nodeYT + nodeStore.nodeH
  if (nodeStore.nodeXR < draggingXR) nodeStore.setNodeXR(draggingXR)
  if (nodeStore.nodeYB < draggingYB) nodeStore.setNodeYB(draggingYB)
}

function getBezierPath(edge) {
  const fromAlt = allAlts.value.find((a) => a.id === edge.fromAltId)
  const toAlt = allAlts.value.find((a) => a.id === edge.toAltId)
  if (!fromAlt || !toAlt) return ''

  // Calculate start and end positions (center of nodes)
  const startX = fromAlt.position.x + nodeStore.nodeW
  const startY = fromAlt.position.y + nodeStore.nodeH / 2
  const endX = toAlt.position.x
  const endY = toAlt.position.y + nodeStore.nodeH / 2

  // Control points for cubic bezier — adjust for curvature
  const controlX1 = startX + (endX - startX) / 2
  const controlY1 = startY
  const controlX2 = controlX1
  const controlY2 = endY

  return `M${startX},${startY} C${controlX1},${controlY1} ${controlX2},${controlY2} ${endX},${endY}`
}
async function fetchModels() {
  try {
    const res = await fetch('http://localhost:5000/api/checkpoints')
    const data = await res.json()
    availableModels.value = data.checkpoints
  } catch (err) {
    console.error('Error fetching models:', err)
  }
}
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
}
.nodes-layer {
  position: absolute;
  inset: 0; /* full overlay */
  pointer-events: none;
}

/* direct children (each VueDraggableResizable) regain events */
.nodes-layer > * {
  pointer-events: auto;
}

.header {
  background: #f8f9fa;
  cursor: move;
  padding: 8px 12px;
  border-radius: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}

.design-space-container {
  position: absolute;
  top: 0;
  left: 0;
  background: white;
  border: 1px solid #ddd;
  border-radius: 5px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 0;
  transform: none;
}
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.7s ease,
    transform 0.7s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
.fade-enter-to,
.fade-leave-from {
  opacity: 1;
  transform: scale(1);
}
.alt-item.selected {
  border: 2px solid #42b983; /* Green border */
}
</style>
