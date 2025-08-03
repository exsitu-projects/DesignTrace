<template>
  <div id="app">
    <!-- wrapper provides the relative positioning context -->

    <FreeCanvas ref="freeCanvasRef" />
    <button
      v-show="nodesSelected"
      @click="confirmNodes"
      class="btn btn-sm btn-outline-success m-1 mx-auto"
      style="z-index: 5000; position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%)"
    >
      <Check color="green" :size="15" />&nbsp;Collapse Other Nodes
    </button>

    <!-- Propagation confirm button -->
    <button
      v-show="
        allUtilStore.isPropagate &&
        allUtilStore.isSelectingRange &&
        allUtilStore.propagationRange.length > 1
      "
      @click="confirmPropagationRange"
      class="btn btn-sm btn-outline-primary m-1 mx-auto"
      style="z-index: 5000; position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%)"
    >
      <Check color="blue" :size="15" />&nbsp;Confirm Propagating Range
    </button>
    <!-- nodes & alts overlay -->
    <div @keydown.delete="handleDelete" tabindex="0" ref="svgWrapper" style="outline: none">
      <svg
        :width="nodeStore.nodeXR"
        :height="nodeStore.nodeYB"
        style="position: absolute; top: 0; left: 0; pointer-events: none"
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
          class="edge-line"
          :class="{ 'selected-edge': selectedEdge === edge }"
          @click="selectEdge(edge)"
          style="pointer-events: stroke"
        />
      </svg>
    </div>
    <transition-group name="fade" tag="div" class="nodes-layer">
      <VueDraggableResizable
        @mouseenter="() => setNodeHover(alt.id, true)"
        @mouseleave="() => setNodeHover(alt.id, false)"
        v-for="alt in allAlts"
        v-show="alt.visible"
        :id="'drag_' + alt.id"
        :key="alt.id"
        :x="alt.position.x"
        :y="alt.position.y"
        :w="alt.sizing.nodeWidth"
        :h="'auto'"
        :z="alt.z"
        :class="[
          'design-space-container alt-item',
          { 'card-hover': allUtilStore.isToolTip && nodeHoverStates[alt.id] },
          isSelected(alt.id) ? 'selected' : '',
          { 'propagate-blink': allUtilStore.isPropagate && allUtilStore.isSelectingStartAlt },
          { 'propagate-start': allUtilStore.propagationStartAlt === alt.id },
          { 'propagate-range': allUtilStore.propagationRange.includes(alt.id) },
        ]"
        @mouseup="
          mouseUpNode(
            alt.position.x,
            alt.position.y,
            alt.branchId,
            alt.nodeId,
            alt.id,
            alt.isStepLock,
            $event,
          )
        "
        :draggable="true"
        :drag-handle="'.nodeHandle'"
        @dragging="(x, y) => onDrag(x, y, alt)"
      >
        <transition name="tooltip-fade">
          <div
            v-if="allUtilStore.isToolTip && nodeHoverStates[alt.id]"
            :style="{
              width: alt.sizing.nodeWidth + 'px',
            }"
            class="tooltip-popout text-white"
            @click="applyToFullImg(alt.id)"
          >
            Apply to the whole image
          </div>
        </transition>
        <NewNode
          :onCanvasHover="setNodeHover"
          @remove="() => deleteAlt(alt.id)"
          :alt="alt"
          :ref="(el) => setActiveNodeCanvas(el, alt.id)"
          :imgPayload="alt.id === dropAltId ? imgDOMPayload : null"
        />

        <!-- Connection dots -->
        <!-- Right edge connection dot (source) -->
        <div
          class="connection-dot source-dot"
          :class="{
            visible: hoveredConnectionDot === `${alt.id}-source` || isConnecting,
            active: sourceAltId === alt.id,
          }"
          @mouseenter="hoveredConnectionDot = `${alt.id}-source`"
          @mouseleave="hoveredConnectionDot = null"
          @mousedown="startConnection(alt.id, $event)"
          :style="{
            right: '-8px',
            top: '50%',
            transform: 'translateY(-50%)',
          }"
        ></div>

        <!-- Left edge connection dot (target) -->
        <div
          class="connection-dot target-dot"
          :class="{
            visible:
              hoveredConnectionDot === `${alt.id}-target` ||
              (isConnecting && sourceAltId !== alt.id),
            highlighted:
              isConnecting && sourceAltId !== alt.id && hoveredConnectionDot === `${alt.id}-target`,
          }"
          @mouseenter="hoveredConnectionDot = `${alt.id}-target`"
          @mouseleave="hoveredConnectionDot = null"
          @mouseup="finishConnection(alt.id, $event)"
          :style="{
            left: '-8px',
            top: '50%',
            transform: 'translateY(-50%)',
          }"
        ></div>
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
      @dragging="(x, y) => onDrag(x, y)"
    >
      <div class="header handle small fw-bolder">
        Conceptual Assets
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
import { ref, reactive, onMounted, nextTick, computed, toRaw } from 'vue'
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
const nodeCanvasRefs = reactive({}) // { [altId]: componentRef }
const freeCanvasRef = ref(null)
const nodeHoverStates = reactive({})
const nodeStore = useNode()
const objectStore = useObject()
const allUtilStore = useAllUtil()
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
const selectedEdge = ref(null)
const svgWrapper = ref(null)
const imgDOMPayload = ref({})
const dropAltId = ref(0)
const isDesignSpaceVisible = ref(false)
const position = reactive({ x: 20, y: 20 })

// Edge connection state
const isConnecting = ref(false)
const sourceAltId = ref(null)
const hoveredConnectionDot = ref(null)
const tempEdge = ref(null)

// Propagation state

function selectEdge(edge) {
  selectedEdge.value = edge
}
function handleDelete() {
  if (selectedEdge.value) {
    removeEdgeConnection(selectedEdge.value)
    selectedEdge.value = null
  }
}

function confirmPropagationRange() {
  const selectedAlts = allUtilStore.confirmPropagationRange()
  // Reset propagation mode after confirmation
  // allUtilStore.switchPropagateMode()
}

/* example async — not used right now */
function confirmNodes() {
  nodeStore.updateParents(nodeStore.selectedIndices, nodeStore.selectedBranchId)
  nodeStore.selectedIndices = []
}
function deleteAlt(altId) {
  nodeStore.nodeBranchList.forEach((branch) => {
    branch.nodes.forEach((node) => {
      node.alts = node.alts.filter((alt) => alt.id !== altId)
    })
  })
}
function setNodeHover(id, isHovering) {
  nodeHoverStates[id] = isHovering && allUtilStore.isToolTip
}
function isSelected(altId) {
  return nodeStore.selectedIndices.includes(altId)
}

const nodesSelected = computed(() => nodeStore.selectedIndices.length > 0)

function handleKeyDown(e) {
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return

  if (e.key === 'Control') {
    nodeStore.ctrlPressed = true
    return
  }

  if (e.key === 'Escape') {
    cancelConnection()
    return
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    // Try to delete from FreeCanvas first (main canvas objects)
    const freeCanvasDeleted = freeCanvasRef.value?.deleteSelectedObjects?.()

    // If no objects were selected on FreeCanvas, delete from selected alt elements
    if (!freeCanvasDeleted && nodeStore.selectedIndices.length > 0) {
      nodeStore.selectedIndices.forEach((altId) => {
        const canvasComp = nodeCanvasRefs[altId]
        canvasComp?.deleteSelectedObjects?.()
      })
    }
  }
}
function applyToFullImg(altId) {
  // Apply the current node's properties to the whole image
  nodeCanvasRefs[altId]?.applyToFullImg()
}
function handleKeyUp(e) {
  if (e.key === 'Control') nodeStore.ctrlPressed = false
}
function setActiveNodeCanvas(el, altId) {
  if (el) {
    nodeCanvasRefs[altId] = el
  } else {
    delete nodeCanvasRefs[altId] // cleanup when component unmounts
  }
}

function toggleDesignSpace() {
  isDesignSpaceVisible.value = !isDesignSpaceVisible.value
}

async function mouseUpNode(altPosX, altPosY, branchId, nodeId, altId, altIsStepLock, e) {
  // Handle propagation mode
  if (allUtilStore.isPropagate) {
    if (allUtilStore.isSelectingStartAlt) {
      // Set the starting alt
      allUtilStore.setStartAlt(altId)
      return
    } else if (allUtilStore.isSelectingRange) {
      // Add or remove alt from range
      if (allUtilStore.propagationRange.includes(altId)) {
        allUtilStore.removeFromRange(altId)
      } else {
        allUtilStore.addToRange(altId)
      }
      return
    }
  }

  if (objectStore.dragState === 'startDragging' && objectStore.obj !== null) {
    if (objectStore.obj.type === 'tag' || objectStore.obj.type === 'property') {
      // objectStore.obj in form of { type: 'tag', content: [{ tag: tagObj.tag, propName: propName }] }
      // objectStore.obj in form of
      /*{ type: 'tag', content:
      [{ tag: 'Red',   propName: 'color' },
      { tag: 'Green', propName: 'color' },
      { tag: 'Blue',  propName: 'color' },]}*/
      // uncomment to enable dropping tags or properties
      // const objContent = toRaw(objectStore.obj.content).slice()
      // objectStore.obj = {}
      // if (altIsStepLock) {
      //   await nodeStore.addOnExistingAlt(objContent, branchId, nodeId, altPosX, altPosY, altId)
      // } else {
      //   await nodeStore.addMultAlt(objContent, branchId, nodeId, altPosX, altPosY, altId)
      // }
      //
      // objectStore.dragState = 'finishedDragging'
      // return
    } else if (objectStore.obj.type === 'image' || objectStore.obj.type === 'image-cutout') {
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
      if (objectStore.obj.type === 'image') objectStore.dragState = 'restoreInitialDOM'
      if (objectStore.obj.type === 'image-cutout') allUtilStore.isLassoMode = false
      dropAltId.value = altId
      return
    }
  }
}

function onDrag(x, y, alt) {
  const clampedX = Math.max(0, x)
  const clampedY = Math.max(0, y)
  allUtilStore.nodeOnDrag = true
  if (alt !== undefined) {
    alt.dragAgain = true
    //dragging an alt
    alt.position.x = clampedX
    alt.position.y = clampedY
    ensureNodeInView(x, y)
  } else {
    //dragging the palette
    position.x = clampedX
    position.y = clampedY
  }
  nodeStore.selectedIndices = []
}

function ensureNodeInView(nodeXL, nodeYT) {
  const draggingXR = nodeXL + nodeStore.nodeW
  const draggingYB = nodeYT + nodeStore.nodeH
  // Handle positive boundaries (right and bottom)
  if (nodeStore.nodeXR < draggingXR) nodeStore.setNodeXR(draggingXR)
  if (nodeStore.nodeYB < draggingYB) nodeStore.setNodeYB(draggingYB)

  // Handle negative boundaries (left and top)
  if (nodeXL < 0) {
    // Shift all existing nodes to the right by the absolute value of the negative X
    const offsetX = Math.abs(nodeXL)

    // Update all alt positions
    nodeStore.nodeBranchList.forEach((branch) => {
      branch.nodes.forEach((node) => {
        node.alts.forEach((alt) => {
          alt.position.x += offsetX
        })
      })
    })

    // Extend the right boundary to accommodate the shift
    nodeStore.setNodeXR(nodeStore.nodeXR + offsetX)
  }

  if (nodeYT < 0) {
    // Shift all existing nodes down by the absolute value of the negative Y
    const offsetY = Math.abs(nodeYT)

    // Update all alt positions
    nodeStore.nodeBranchList.forEach((branch) => {
      branch.nodes.forEach((node) => {
        node.alts.forEach((alt) => {
          alt.position.y += offsetY
        })
      })
    })

    // Extend the bottom boundary to accommodate the shift
    nodeStore.setNodeYB(nodeStore.nodeYB + offsetY)

    // Update the top boundary reference if it exists
    if (nodeStore.nodeYT !== undefined) {
      nodeStore.nodeYT = Math.max(0, nodeStore.nodeYT + offsetY)
    }
  }
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

// Edge connection functions
function startConnection(altId, event) {
  event.preventDefault()
  event.stopPropagation()
  isConnecting.value = true
  sourceAltId.value = altId
}

function finishConnection(targetAltId, event) {
  event.preventDefault()
  event.stopPropagation()

  if (isConnecting.value && sourceAltId.value && sourceAltId.value !== targetAltId) {
    // Add edge connection
    nodeStore.addEdgeConnection(sourceAltId.value, targetAltId)
  }

  // Reset connection state
  isConnecting.value = false
  sourceAltId.value = null
  hoveredConnectionDot.value = null
}

// Cancel connection on escape key or outside click
function cancelConnection() {
  isConnecting.value = false
  sourceAltId.value = null
  hoveredConnectionDot.value = null
}

// Remove edge connection (double-click on existing edge)
function removeEdgeConnection(edge) {
  nodeStore.removeEdgeConnection(edge.fromAltId, edge.toAltId)
}

onMounted(() => {
  svgWrapper.value?.focus()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('click', (e) => {
    // Cancel connection if clicking outside of connection dots
    if (isConnecting.value && !e.target.closest('.connection-dot')) {
      cancelConnection()
    }
  })
})
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
}
.nodes-layer {
  position: absolute;
  inset: 0; /* full overlay */
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
    opacity 0.3s ease,
    transform 0.3s ease;
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
  outline: 3px solid #42b983; /* Green border */
}

/* Propagation animations */
@keyframes propagate-blink {
  0%,
  50% {
    outline: 3px solid #ffcc25;
    box-shadow: 0 0 10px rgb(255, 218, 149);
  }
  100% {
    outline: 3px solid transparent;
    box-shadow: none;
  }
}

.propagate-blink {
  animation: propagate-blink 1s infinite;
}

.propagate-start {
  outline: 3px solid #4ecdc4 !important;
  box-shadow: 0 0 15px rgba(78, 205, 196, 0.7) !important;
}

.propagate-range {
  outline: 3px solid #45b7d1 !important;
  box-shadow: 0 0 10px rgba(69, 183, 209, 0.5) !important;
}
.card-hover:hover {
  box-shadow:
    0 0 0 100vmax rgba(0, 0, 0, 0.05) inset,
    0 8px 24px rgba(0, 0, 0, 0.3);
  outline: 2px solid rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
  transition:
    box-shadow 0.3s ease,
    transform 0.2s ease,
    outline 0.3s ease;
  z-index: 20;
}
.tooltip-popout {
  cursor: pointer;
  background-color: rgba(25, 135, 84, 0.9); /* Bootstrap green */
  padding: 6px 0; /* vertical padding, no horizontal */
  border-radius: 6px 6px 0 0; /* rounded corners top only */
  font-size: 0.9rem;
  text-align: center;
  width: 100%; /* full width */
  box-sizing: border-box; /* make padding included in width */
  user-select: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.4s ease-out;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(5px);
}
.tooltip-fade-enter-to,
.tooltip-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

/* Connection dots styles */
.connection-dot {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #42b983;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 1000;
  pointer-events: all;
}

.connection-dot.visible {
  opacity: 1;
  pointer-events: all;
}

.connection-dot.active {
  background-color: #ff6b6b;
  transform: translateY(-50%) scale(1.2);
}

.connection-dot.highlighted {
  background-color: #4ecdc4;
  transform: translateY(-50%) scale(1.3);
  box-shadow: 0 0 8px rgba(78, 205, 196, 0.6);
}

.connection-dot:hover {
  transform: translateY(-50%) scale(1.1);
}

.source-dot {
  background-color: #42b983;
}

.target-dot {
  background-color: #4ecdc4;
}

/* Edge line styles */
.edge-line {
  cursor: pointer;
  stroke-width: 1.4;
  transition: stroke-width 0.2s ease;
}

.edge-line:hover {
  stroke-width: 2.5;
  stroke: #42b983;
}
</style>
