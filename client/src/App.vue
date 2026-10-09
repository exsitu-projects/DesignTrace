<template>
  <div id="app">
    <!-- wrapper provides the relative positioning context -->

    <FreeCanvas
      ref="freeCanvasRef"
      :childActiveSelected="childActiveSelected"
      @forwardLayerFromNodes="handleForwardLayerFromNodes"
      @backwardLayerFromNodes="handleBackwardLayerFromNodes"
      @exportBranchTags="handleExportBranchTags"
      @removeBgFromNodes="handleRemoveBgFromNodes"
    />
    <button
      v-show="nodesSelected"
      @click="confirmNodes"
      class="btn btn-sm btn-outline-success m-1 mx-auto"
      style="z-index: 9999; position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%)"
    >
      <Check color="green" :size="15" />&nbsp;Save Step
    </button>

    <!-- Copy/Paste notification -->
    <div
      v-if="notification.visible"
      class="notification-toast"
      :class="{ 'fade-out': notification.fadeOut }"
    >
      {{ notification.message }}
    </div>

    <!-- world layer: nodes and edges, moved and scaled by the camera -->
    <div class="world-layer" :style="worldStyle">
      <div @keydown.delete="handleDelete" tabindex="0" ref="svgWrapper" style="outline: none">
        <svg
          width="1"
          height="1"
          style="position: absolute; top: 0; left: 0; overflow: visible; pointer-events: none"
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
            { 'branch-highlighted': highlightedBranchId === alt.branchId },
            { 'export-mode': isExportingBranch },
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
          :scale="camera.zoom"
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
            @selection-changed="handleSelectionChanged"
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
              right: 'calc(-8px * var(--ui-scale, 1))',
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
                isConnecting &&
                sourceAltId !== alt.id &&
                hoveredConnectionDot === `${alt.id}-target`,
            }"
            @mouseenter="hoveredConnectionDot = `${alt.id}-target`"
            @mouseleave="hoveredConnectionDot = null"
            @mouseup="finishConnection(alt.id, $event)"
            :style="{
              left: 'calc(-8px * var(--ui-scale, 1))',
              top: '50%',
              transform: 'translateY(-50%)',
            }"
          ></div>
        </VueDraggableResizable>
      </transition-group>
    </div>
    <!-- floating palette panel -->
    <VueDraggableResizable
      :x="position.x"
      :y="position.y"
      :w="'auto'"
      :h="'auto'"
      :draggable="true"
      :drag-handle="'.handle'"
      class="design-space-container palette-panel"
      @dragging="(x, y) => onDrag(x, y)"
    >
      <div class="header handle small fw-bolder">
        Palette
        <button class="btn btn-sm btn-light" @click="toggleDesignSpace">
          <i :class="isDesignSpaceVisible ? 'bx bx-chevron-up' : 'bx bx-chevron-down'"></i>
        </button>
      </div>

      <div class="row p-2 palette-body" v-show="isDesignSpaceVisible">
        <InfoPalette />
      </div>
    </VueDraggableResizable>

    <!-- Review Prompt Components -->
    <ReviewPromptTab />
    <ReviewPrompt />
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
import ReviewPrompt from '@/components/ReviewPrompt.vue'
import ReviewPromptTab from '@/components/ReviewPromptTab.vue'

/* Pinia stores */
import { useNode } from '@/stores/nodeStore.js'
import { useObject } from '@/stores/objectStore.js'
import { Check } from 'lucide-vue-next'
import { useAllUtil } from '@/stores/allUtilStore.js'
import { useCamera } from '@/stores/cameraStore.js'
import { useCanvasNavigation } from '@/composables/useCanvasNavigation.js'
/* --- store instances --- */
const nodeCanvasRefs = reactive({}) // { [altId]: componentRef }
const freeCanvasRef = ref(null)
const nodeHoverStates = reactive({})
const nodeStore = useNode()
const objectStore = useObject()
const allUtilStore = useAllUtil()
const camera = useCamera()
useCanvasNavigation()
const worldStyle = computed(() => ({
  transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
  // handles and dots keep a usable on-screen size when zoomed (capped so they never get huge)
  '--ui-scale': Math.min(3, Math.max(0.5, 1 / camera.zoom)),
}))
const childActiveSelected = ref(false)
/* --- plain state --- */
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

// Copy/Paste state
const copiedNodes = ref([])
const notification = reactive({
  visible: false,
  message: '',
  fadeOut: false,
})

// Branch export state
const isExportingBranch = ref(false)
const highlightedBranchId = ref(null)

// Copy/Paste functions
function showNotification(message) {
  notification.message = message
  notification.visible = true
  notification.fadeOut = false

  // Auto-hide after 1.5 seconds
  setTimeout(() => {
    notification.fadeOut = true
    setTimeout(() => {
      notification.visible = false
    }, 300) // Wait for fade-out animation to complete
  }, 1500)
}

function copySelectedNodes() {
  if (nodeStore.selectedIndices.length === 0) return

  // Deep copy selected nodes data with current canvas state
  const selectedAlts = allAlts.value.filter((alt) => nodeStore.selectedIndices.includes(alt.id))

  copiedNodes.value = selectedAlts.map((alt) => {
    // Get current canvas state from the NewNode component
    const canvasRef = nodeCanvasRefs[alt.id]
    const currentCanvasState = canvasRef?.getCurrentCanvasState?.()

    return {
      ...JSON.parse(JSON.stringify(alt)), // Deep copy to avoid reference issues
      originalId: alt.id, // Keep reference to original for positioning
      currentCanvasState: currentCanvasState, // Store current canvas state
    }
  })

  showNotification('Nodes copied!')
}

async function pasteNodes() {
  if (copiedNodes.value.length === 0) return

  const PASTE_OFFSET = 50 // Offset for pasted nodes

  for (const copiedAlt of copiedNodes.value) {
    // Create new alt based on copied data
    const newPosition = {
      x: copiedAlt.position.x + PASTE_OFFSET,
      y: copiedAlt.position.y + PASTE_OFFSET,
    }

    // Add new node and alt
    nodeStore.addNodeBranch()
    nodeStore.addNode(nodeStore.currentBranchId)
    nodeStore.addAlt(
      copiedAlt.properties || [], // properties
      nodeStore.currentBranchId, // branchId
      nodeStore.currentNodeId, // nodeId
      newPosition.x, // x position
      newPosition.y, // y position
      null, // prevAltId
    )

    // Update position after creation
    const newBranch = nodeStore.nodeBranchList.find((b) => b.id === nodeStore.currentBranchId)
    if (newBranch && newBranch.nodes.length > 0) {
      const newNode = newBranch.nodes[newBranch.nodes.length - 1]
      if (newNode.alts.length > 0) {
        const newAlt = newNode.alts[newNode.alts.length - 1]
        newAlt.position.x = newPosition.x
        newAlt.position.y = newPosition.y

        // Copy canvas data if it exists
        if (copiedAlt.history && copiedAlt.history.undoStack.length > 0) {
          // Copy the latest canvas state
          const latestState = copiedAlt.history.undoStack[copiedAlt.history.undoStack.length - 1]
          if (latestState && latestState.canvasData) {
            newAlt.history.undoStack = [{ ...latestState }]
            newAlt.history.currentIndex = 0
          }
        }

        // Apply the current canvas state after the component is mounted
        await nextTick() // Wait for the component to be rendered

        // Try to apply canvas state with a small delay to ensure canvas is initialized
        setTimeout(async () => {
          const newCanvasRef = nodeCanvasRefs[newAlt.id]
          if (newCanvasRef && copiedAlt.currentCanvasState) {
            try {
              await newCanvasRef.setCanvasState?.(copiedAlt.currentCanvasState)
              console.log('Canvas state applied to pasted node:', newAlt.id)
            } catch (error) {
              console.error('Failed to apply canvas state to pasted node:', error)
            }
          }
        }, 100) // Small delay to ensure canvas is fully initialized
      }
    }
  }

  showNotification('Nodes pasted!')
}

function selectEdge(edge) {
  selectedEdge.value = edge
}
function handleDelete() {
  if (selectedEdge.value) {
    removeEdgeConnection(selectedEdge.value)
    selectedEdge.value = null
  }
}

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

  // Copy/Paste shortcuts
  if (e.ctrlKey && e.key === 'c') {
    e.preventDefault()
    copySelectedNodes()
    return
  }

  if (e.ctrlKey && e.key === 'v') {
    e.preventDefault()
    pasteNodes()
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

function handleForwardLayerFromNodes() {
  // Iterate through all node canvas refs to find one with active objects
  for (const canvasRef of Object.values(nodeCanvasRefs)) {
    if (canvasRef?.forwardOneLayer?.()) {
      // If forwardOneLayer returns true, an object was moved
      break
    }
  }
}

function handleBackwardLayerFromNodes() {
  // Iterate through all node canvas refs to find one with active objects
  for (const canvasRef of Object.values(nodeCanvasRefs)) {
    if (canvasRef?.backwardOneLayer?.()) {
      // If backwardOneLayer returns true, an object was moved
      break
    }
  }
}

async function handleRemoveBgFromNodes() {
  // Iterate through all node canvas refs to find one with active objects
  for (const canvasRef of Object.values(nodeCanvasRefs)) {
    if (canvasRef?.removeBg) {
      const result = await canvasRef.removeBg()
      if (result) {
        // If removeBg returns true, objects were processed
        break
      }
    }
  }
}

function handleExportBranchTags() {
  // Activate export mode - user needs to click on a node to select the branch
  isExportingBranch.value = true
  showNotification('Click on any node to select and export the branch tags')
}

function exportBranchTags(branchId) {
  // Find the branch by ID
  const branch = nodeStore.nodeBranchList.find((b) => b.id === branchId)
  if (!branch) {
    showNotification('Branch not found')
    return
  }

  // Collect all tags from expanded alts in this branch
  const branchTags = new Set()
  let expandedAltCount = 0

  branch.nodes.forEach((node) => {
    node.alts.forEach((alt) => {
      if (alt.expand) {
        // Only collect from expanded nodes
        expandedAltCount++
        if (alt.properties && alt.properties.length > 0) {
          alt.properties.forEach((property) => {
            if (property.tag && property.tag.trim()) {
              branchTags.add(`${property.tag} (${property.propName || 'property'})`)
            }
          })
        }
      }
    })
  })

  // Convert Set to Array and sort
  const tagsArray = Array.from(branchTags).sort()

  if (tagsArray.length === 0) {
    showNotification(`No tags found in ${expandedAltCount} expanded nodes of this branch`)
    return
  }

  // Create export content
  const exportContent = {
    branchId: branchId,
    exportDate: new Date().toISOString(),
    expandedNodesCount: expandedAltCount,
    totalTags: tagsArray.length,
    uniqueTags: tagsArray,
  }

  // Create and download JSON file
  const dataStr = JSON.stringify(exportContent, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)

  const link = document.createElement('a')
  link.href = url
  link.download = `branch-${branchId}-tags-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  showNotification(
    `Exported ${tagsArray.length} unique tags from ${expandedAltCount} expanded nodes`,
  )
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
  // Handle branch export mode
  if (isExportingBranch.value) {
    highlightedBranchId.value = branchId
    // Export tags for this branch
    exportBranchTags(branchId)
    // Reset export mode
    isExportingBranch.value = false
    highlightedBranchId.value = null
    return
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
  allUtilStore.nodeOnDrag = true
  if (alt !== undefined) {
    alt.expand = true
    // dragging an alt: world coordinates, no limits on an infinite canvas
    alt.position.x = x
    alt.position.y = y
  } else {
    // dragging the palette: keep it on screen
    position.x = Math.max(0, x)
    position.y = Math.max(0, y)
  }
  nodeStore.selectedIndices = []
}

function getBezierPath(edge) {
  const fromAlt = allAlts.value.find((a) => a.id === edge.fromAltId)
  const toAlt = allAlts.value.find((a) => a.id === edge.toAltId)
  if (!fromAlt || !toAlt) return ''

  // Calculate start and end positions (center of nodes)
  const startX = fromAlt.position.x + (fromAlt.sizing?.nodeWidth ?? nodeStore.nodeW)
  const startY = fromAlt.position.y + (fromAlt.sizing?.nodeHeight ?? nodeStore.nodeH) / 2
  const endX = toAlt.position.x
  const endY = toAlt.position.y + (toAlt.sizing?.nodeHeight ?? nodeStore.nodeH) / 2

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
function handleSelectionChanged(val) {
  childActiveSelected.value = val
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
html,
body {
  overflow: hidden; /* the camera pans the canvas; the page itself never scrolls */
}
.world-layer {
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
  pointer-events: none; /* clicks fall through to the free canvas, except on nodes/edges */
}
.nodes-layer {
  position: absolute;
  top: 0;
  left: 0;
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

/* palette stays on screen while the canvas scrolls */
.palette-panel {
  position: fixed !important;
  z-index: 1040 !important;
}
.palette-body {
  width: clamp(440px, 36vw, 640px);
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 140px); /* leave room for the bottom toolbar */
  overflow-y: auto;
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

/* Branch export highlighting */
.export-mode {
  cursor: pointer !important;
}

.branch-highlighted {
  outline: 3px solid #ff9500 !important;
  box-shadow: 0 0 15px rgba(255, 149, 0, 0.7) !important;
  animation: branch-pulse 1s ease-in-out;
}

@keyframes branch-pulse {
  0% {
    box-shadow: 0 0 15px rgba(255, 149, 0, 0.7);
  }
  50% {
    box-shadow: 0 0 25px rgba(255, 149, 0, 0.9);
  }
  100% {
    box-shadow: 0 0 15px rgba(255, 149, 0, 0.7);
  }
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
  z-index: 900000;
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
  width: calc(12px * var(--ui-scale, 1));
  height: calc(12px * var(--ui-scale, 1));
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

/* Notification toast styles */
.notification-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  background: #42b983;
  color: white;
  padding: 12px 20px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  font-weight: 500;
  z-index: 10000;
  animation: slideIn 0.3s ease-out;
}

.notification-toast.fade-out {
  animation: slideOut 0.3s ease-in forwards;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOut {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}
</style>
