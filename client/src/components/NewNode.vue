<template>
  <div
    ref="nodeEl"
    :id="alt.id"
    class="node lasso-active-space"
    :class="{ collapsed: !alt.expand }"
  >
    <div
      v-if="alt.expand"
      @click="handleClick(alt.id, alt.branchId)"
      class="nodeHandle rounded-top pe-2 d-flex align-items-center py-1"
      style="background: #ededed"
    >
      <!--      @dblclick="clickOnNodeTap()"-->
      <!--      <EditableLabel v-model="nodeName" />-->
      <!--      {{ alt.id }}-->

      <!-- Transform Button (appears on the left when needed) -->
      <button title="Export" class="btn btn-sm ms-2" @click.stop="exportAltToFreeCanv($event)">
        <SquareArrowUpLeft color="gray" :size="20"></SquareArrowUpLeft>
      </button>
      <button v-show="allUtilStore.isLassoMode" @click="eraseLasso()" class="btn btn-sm ms-2">
        <Eraser color="gray" :size="20"></Eraser>
      </button>
      <button v-show="changeDetected" @click="transform()" class="btn btn-outline-dark btn-sm ms-2">
        Merge
      </button>

      <!-- Undo/Redo Controls -->
      <div class="d-flex align-items-center gap-1 ms-auto">
        <button
          @click="undo($event)"
          :disabled="undoStack.length <= 1"
          class="btn btn-sm transparent-btn gray-symbol"
          title="Undo"
          @mouseup.stop
        >
          <ArrowLeft color="gray" :size="13"></ArrowLeft>
        </button>
        <button
          @click="redo($event)"
          :disabled="redoStack.length === 0"
          class="btn btn-sm transparent-btn gray-symbol"
          title="Redo"
          @mouseup.stop
        >
          <ArrowRight color="gray" :size="13"></ArrowRight>
        </button>
        <button
          @click.stop="switchStepLock(alt.id)"
          :class="['btn btn-sm ', { active: alt.isStepLock }]"
          @mouseup.stop
        >
          <UndoDot v-show="alt.isStepLock" class="mb-1" color="gray" :size="13"></UndoDot>
          <Split
            style="transform: rotate(90deg); transform-origin: center"
            v-show="!alt.isStepLock"
            class="mb-1"
            color="gray"
            :size="13"
          ></Split>
        </button>
        <button
          @click="deleteAlt($event)"
          class="btn btn-sm transparent-btn red-symbol"
          title="Delete"
          @mouseup.stop
        >
          ✕
        </button>
      </div>
    </div>
    <div class="nodeHandle node-tags" ref="nodeTagsRef" @wheel="handleHorizontalScroll">
      <button
        v-for="(property, propIndex) in alt.properties"
        :key="property.tag"
        style="display: flex; align-items: center"
        :class="['btn btn-sm mx-1 btn-light', { active: isPropertyActive(property) }]"
        @click.stop="navigateToPropertyState(property)"
        @dblclick.stop="startEditingTag(propIndex)"
      >
        <div
          v-show="property.thumbnail"
          class="thumb-icon-wrapper me-2"
          :class="{ 'lasso-border': property.thumbnailSource === 'lasso' }"
        >
          <img :src="property.thumbnail" alt="thumb" class="thumb-icon" />
        </div>
        <span v-if="editingTagIndex !== propIndex">{{ property.tag }}</span>
        <input
          v-else
          v-model="editingTagText"
          @blur="saveTagEdit"
          @keyup.enter="saveTagEdit"
          @keyup.escape="cancelTagEdit"
          @click.stop
          class="tag-input"
          :ref="(el) => (tagInputRefs[propIndex] = el)"
        />
      </button>
    </div>
    <div
      @mouseenter="() => props.onCanvasHover(alt.id, false)"
      @mouseleave="() => props.onCanvasHover(alt.id, true)"
      @click.stop
      class="my-2 m-auto position-relative"
      ref="canvasContainer"
    >
      <!-- Spinner positioned absolutely inside the container -->
      <div
        v-show="generationStore.currentGenIds.includes(alt.id)"
        class="position-absolute top-50 start-50 translate-middle"
        style="z-index: 10"
      >
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <!-- Canvas stays behind the spinner -->
      <canvas
        ref="canvasEl"
        class="border border-1 rounded rounded-1 shadow-sm"
        :width="canvasW"
        :height="canvasW"
        style="z-index: 1"
      ></canvas>
    </div>

    <!-- Resize handles -->
    <div class="resize-handles">
      <div class="resize-handle resize-handle-nw" @mousedown="startResize($event, 'nw')"></div>
      <div class="resize-handle resize-handle-ne" @mousedown="startResize($event, 'ne')"></div>
      <div class="resize-handle resize-handle-sw" @mousedown="startResize($event, 'sw')"></div>
      <div class="resize-handle resize-handle-se" @mousedown="startResize($event, 'se')"></div>
    </div>
  </div>
</template>

<script setup>
import {
  computed,
  markRaw,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
  defineEmits,
  nextTick,
} from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  Split,
  UndoDot,
  SquareArrowUpLeft,
  Eraser,
} from 'lucide-vue-next'
import * as fabric from 'fabric'
import { useObject } from '@/stores/objectStore.js'
import { useNode } from '@/stores/nodeStore.js'
import { useAllUtil } from '@/stores/allUtilStore.js'
import { useGeneration } from '@/stores/generationStore.js'
import { useInfoStore } from '@/stores/infoStore.js'
import { useCamera } from '@/stores/cameraStore.js'

const emit = defineEmits(['remove', 'selection-changed']) // or whatever event you want to emit

const props = defineProps({
  alt: {
    type: Object,
    required: true,
  },
  imgPayload: Object,
  onCanvasHover: {
    type: Function,
    default: () => {}, // no-op if not provided
  },
})
const canvasEl = ref(null)
const nodeEl = ref(null)
const nodeTagsRef = ref(null)
let fabricCanvas = null
const { alt } = props
const infoStore = useInfoStore() // Import infoStore to access property tags
const canvasContainer = ref(null)
const totalEdgeUrl = ref('')
const changeDetected = ref(false)
const objectStore = useObject()
const nodeStore = useNode()
const allUtilStore = useAllUtil()
const generationStore = useGeneration()
const camera = useCamera()
const canvasUrlWithoutPath = ref('')
const pathStr = ref('')
let isLasso = false
let points = []
const lassoBoundUrl = ref('')
let currentPath = null // Current path being drawn
let lassoPaths = [] // store all completed lasso paths
let allPathStrs = []
let lassoStart = false
let startPointer = null
let prevLassoPaths = [] // store previous lasso paths for undo/redo
let isHoveringPrevLasso = false // track if hovering over previous lasso
let prevLassoHoverOverlay = null // overlay for darkening effect

// Tag editing state
const editingTagIndex = ref(null)
const editingTagText = ref('')
const tagInputRefs = ref([])
const fabricCanvasW = ref(0) // reactive refs
const fabricCanvasH = ref(0)
const lassoPayload = ref({})
// Create reactive local sizing refs that sync with alt.sizing
const localCanvasW = ref(alt.sizing?.canvasWidth || nodeStore.canvasW.value)
const localNodeW = ref(alt.sizing?.nodeWidth || nodeStore.nodeW.value)
const localNodeH = ref(alt.sizing?.nodeHeight || nodeStore.nodeH.value)

// Use local reactive values for computed properties
const canvasW = computed(() => localCanvasW.value)
const nodeW = computed(() => localNodeW.value)
const nodeH = computed(() => localNodeH.value)

// Watch for changes from the store and update local values
watch(
  () => alt.sizing,
  (newSizing) => {
    if (newSizing) {
      localCanvasW.value = newSizing.canvasWidth
      localNodeW.value = newSizing.nodeWidth
      localNodeH.value = newSizing.nodeHeight
    }
  },
  { deep: true, immediate: true },
)
// Undo/Redo functionality
const isLoadingState = ref(false) // Prevent saving state during undo/redo
const undoStack = computed(() => alt.history?.undoStack || [])

// Resize functionality
const isResizing = ref(false)
const resizeDirection = ref('')
const resizeStartPos = ref({ x: 0, y: 0 })
const resizeStartSize = ref({ width: 0, height: 0 })
const originalCanvasSize = ref({ width: 0, height: 0 })
const originalObjectStates = ref([])
const redoStack = computed(() => alt.history?.redoStack || [])

// Function to check if a property button should be active
const isPropertyActive = (property) => {
  if (typeof property.historyStateIndex !== 'number' || !alt.history) {
    return false
  }
  // Handle case where currentIndex might not be set (default to latest)
  const currentIndex =
    alt.history.currentIndex >= 0 ? alt.history.currentIndex : alt.history.undoStack.length - 1
  return currentIndex === property.historyStateIndex
}

// Helper function to check if point is inside any prev lasso path
function isPointInPrevLasso(x, y) {
  if (prevLassoPaths.length === 0) return false

  for (const path of prevLassoPaths) {
    // Use Fabric.js containsPoint method which is more reliable
    if (path && path.containsPoint) {
      const point = new fabric.Point(x, y)
      if (path.containsPoint(point)) {
        return true
      }
    }
  }
  return false
}

// Create/update hover overlay for darkening effect
function createHoverOverlay() {
  if (prevLassoHoverOverlay) {
    fabricCanvas.remove(prevLassoHoverOverlay)
  }

  if (prevLassoPaths.length === 0) return

  // Create a combined path from all previous lasso paths
  // Handle case where path might be a Fabric path object or have a .path property
  const combinedPathStr = prevLassoPaths
    .map((path) => {
      if (path && path.path) {
        return path.path
      } else if (path && typeof path === 'object' && path.type === 'path') {
        return path.path
      }
      return ''
    })
    .filter((p) => p !== '')
    .join(' ')

  if (combinedPathStr) {
    prevLassoHoverOverlay = new fabric.Path(combinedPathStr, {
      fill: 'rgba(0, 0, 0, 0.3)', // darker overlay
      stroke: 'transparent',
      selectable: false,
      evented: false,
      absolutePositioned: true,
    })

    fabricCanvas.add(prevLassoHoverOverlay)
    fabricCanvas.requestRenderAll()
  }
}

// Remove hover overlay
function removeHoverOverlay() {
  if (prevLassoHoverOverlay) {
    fabricCanvas.remove(prevLassoHoverOverlay)
    prevLassoHoverOverlay = null
    fabricCanvas.requestRenderAll()
  }
}

// Clear all lasso paths from canvas
function clearAllLassoPaths() {
  // Remove all objects that look like lasso paths (have strokeDashArray)
  const objectsToRemove = fabricCanvas.getObjects().filter((obj) => {
    return (
      obj.strokeDashArray && Array.isArray(obj.strokeDashArray) && obj.strokeDashArray.length > 0
    )
  })

  objectsToRemove.forEach((obj) => fabricCanvas.remove(obj))

  // Also clear from our arrays
  prevLassoPaths.forEach((path) => {
    if (path && fabricCanvas.getObjects().includes(path)) {
      fabricCanvas.remove(path)
    }
  })

  prevLassoPaths = []
  lassoPaths = [] // Reset for next drawing operation
  removeHoverOverlay()
  isHoveringPrevLasso = false
  fabricCanvas.requestRenderAll()
}

function handleHorizontalScroll(event) {
  // Convert vertical wheel scroll to horizontal scroll
  if (nodeTagsRef.value && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault() // Prevent page scrolling
    event.stopPropagation() // Stop event bubbling

    // Scroll horizontally instead of vertically
    const scrollAmount = event.deltaY * 0.5 // Adjust scroll sensitivity
    nodeTagsRef.value.scrollLeft += scrollAmount
  }
}
onMounted(() => {
  fabricCanvas = markRaw(
    new fabric.Canvas(canvasEl.value, {
      isDrawingMode: false,
      preserveObjectStacking: true,
    }),
  )

  fabricCanvasW.value = fabricCanvas.width
  fabricCanvasH.value = fabricCanvas.height
  // Save initial canvas state for undo functionality
  setTimeout(() => {
    saveState()
  }, 100)
  // Listen to selection events on fabricCanvas and update reactive ref
  fabricCanvas.on('selection:created', (e) => (activeObject.value = e.target))
  fabricCanvas.on('selection:updated', (e) => (activeObject.value = e.target))
  fabricCanvas.on('selection:cleared', () => (activeObject.value = null))
  fabricCanvas.on('mouse:down', function (opt) {
    if (lassoStart === true) {
      // Check if clicking on existing lasso area
      if (prevLassoPaths.length !== 0) {
        const isInPrevLasso = isPointInPrevLasso(opt.pointer.x, opt.pointer.y)

        if (isInPrevLasso) {
          // Apply tooltip to existing lasso area - trigger transform
          removeHoverOverlay()
          transformLasso(prevLassoPaths)
          return
        }
        // Don't clear existing lassos when starting new lasso - allow multi-selection
      }

      fabricCanvas.forEachObject((obj) => {
        obj.selectable = false
      })
      fabricCanvas.selection = false
      isLasso = true
      // copy: Fabric reuses the point object for later events
      startPointer = { x: opt.pointer.x, y: opt.pointer.y }
      points = [`M ${opt.pointer.x} ${opt.pointer.y}`] // Start path
    }
  })

  fabricCanvas.on('mouse:move', function (opt) {
    allUtilStore.nodeOnDrag = true
    if (isLasso && lassoStart) {
      points.push(`L ${opt.pointer.x} ${opt.pointer.y}`) // Draw smooth lines

      if (currentPath) fabricCanvas.remove(currentPath)

      pathStr.value = points.join(' ') + ' Z' // Close the path
      currentPath = new fabric.Path(pathStr.value, {
        stroke: 'black',
        strokeWidth: 1,
        fill: 'rgba(0, 0, 0, 0.1)',
        selectable: false,
        evented: false,
        strokeDashArray: [5, 5],
      })

      fabricCanvas.add(currentPath)
      fabricCanvas.requestRenderAll()
    } else if (lassoStart && prevLassoPaths.length !== 0 && !isLasso) {
      // Handle hover detection for existing lasso when in lasso mode but not actively drawing
      const isInPrevLasso = isPointInPrevLasso(opt.pointer.x, opt.pointer.y)

      if (isInPrevLasso && !isHoveringPrevLasso) {
        // Mouse entered lasso area - show darkening effect
        isHoveringPrevLasso = true
        createHoverOverlay()
      } else if (!isInPrevLasso && isHoveringPrevLasso) {
        // Mouse left lasso area - remove darkening effect
        isHoveringPrevLasso = false
        removeHoverOverlay()
      }
    }
  })

  fabricCanvas.on('mouse:up', async function (opt) {
    opt.e.preventDefault()
    opt.e.stopPropagation()

    if (isLasso) {
      isLasso = false
      const dx = opt.pointer.x - startPointer.x
      const dy = opt.pointer.y - startPointer.y
      const endToStartDistance = Math.sqrt(dx * dx + dy * dy)

      // Check if we actually drew a path (not just a single click)
      // Consider it "moved" if we have multiple points (regardless of end position)
      const hasMultiplePoints = points.length > 2
      const moved = endToStartDistance > 5 || hasMultiplePoints

      if (!moved) {
        // Single click without drawing - clear ALL existing lassos
        if (currentPath) fabricCanvas.remove(currentPath)
        currentPath = null
        points = []
        clearAllLassoPaths() // Clear all existing lasso selections
        fabricCanvas.requestRenderAll()
        return
      }

      // Always close the path with Z for lasso processing
      pathStr.value = points.join(' ') + ' Z'
      allPathStrs.push(pathStr.value)

      // Convert current drawing path to completed path
      if (currentPath) fabricCanvas.remove(currentPath)
      const completedPath = new fabric.Path(pathStr.value, {
        stroke: 'black',
        strokeWidth: 1,
        fill: 'rgba(0, 0, 0, 0.1)',
        selectable: false,
        evented: false,
        strokeDashArray: [5, 5],
      })
      lassoPaths.push(completedPath) // Add to completed paths
      fabricCanvas.add(completedPath)
      currentPath = null // Clear current path reference
      if (completedPath) {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity

        lassoPaths.forEach((p) => {
          p.setCoords() // ensure coords are up to date
          const rect = p.getBoundingRect()

          minX = Math.min(minX, rect.left)
          minY = Math.min(minY, rect.top)
          maxX = Math.max(maxX, rect.left + rect.width)
          maxY = Math.max(maxY, rect.top + rect.height)
        })

        const combinedBounds = {
          left: minX,
          top: minY,
          width: maxX - minX,
          height: maxY - minY,
        }
        // changeDetected.value = true
        //path.setCoords()
        //const bounds = path.getBoundingRect() //lasso extracted but rectangular bounds
        lassoPaths.forEach((path) => fabricCanvas.remove(path))

        // Render first to make sure everything is drawn
        fabricCanvas.renderAll()
        canvasUrlWithoutPath.value = fabricCanvas.toDataURL()
        // Save state before adding lasso
        saveState()
        // Extract just the area covered by the path + content inside it
        lassoBoundUrl.value = fabricCanvas.toDataURL({
          left: combinedBounds.left,
          top: combinedBounds.top,
          width: combinedBounds.width,
          height: combinedBounds.height,
          format: 'png',
          multiplier: 1,
        })
        lassoPaths.forEach((path) => fabricCanvas.add(path))

        if (pathStr.value) {
          const erasePath = new fabric.Path(allPathStrs.join(' '), {
            absolutePositioned: true,
            globalCompositeOperation: 'destination-out', // <-- eraser mode
            fill: 'black', // fill is needed even if transparent
            strokeWidth: 0,
            selectable: false,
            evented: false,
            objectCaching: false, // do NOT cache or it’ll clip edges
          })

          // Add the path to canvas (which erases underlying content)
          fabricCanvas.add(erasePath)
          lassoPaths.forEach((path) => fabricCanvas.remove(path))
          fabricCanvas.requestRenderAll()
          totalEdgeUrl.value = fabricCanvas.toDataURL()
          lassoPaths.forEach((path) => fabricCanvas.add(path))
          fabricCanvas.remove(erasePath) // gone from the display list

          storeLassoInfo()

          // Save state after lasso operation
          saveState()

          // Add the new lasso to existing selections (multi-selection)
          prevLassoPaths = [...prevLassoPaths, ...lassoPaths]
          console.log('Added lasso to existing selections, total:', prevLassoPaths.length)
        }
      }
    }
  })

  // Make canvas focusable and add keyboard handlers
  fabricCanvas.upperCanvasEl.tabIndex = 0

  fabricCanvas.upperCanvasEl.addEventListener('keydown', handleCanvasKeyDown)

  // Focus canvas when clicked
  fabricCanvas.upperCanvasEl.addEventListener('click', () => {
    fabricCanvas.upperCanvasEl.focus()
  })
})

const handleCanvasKeyDown = (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    e.stopPropagation()
    deleteSelectedObjects()
  }
}
const activeObject = ref(null)
watch(activeObject, (val) => {
  emit('selection-changed', val !== null) // send true/false to parent
})
async function removeBg() {
  const activeObj = fabricCanvas.getActiveObject()
  if (!activeObj) {
    console.warn('No active object selected.')
    return false // Return false if no object was found
  }

  let objectsToProcess = activeObj.type === 'activeSelection' ? activeObj.getObjects() : [activeObj]
  for (const obj of objectsToProcess) {
    // 1. Export object as base64 (you may want to export just that object)
    const base64Url = obj.toDataURL({
      format: 'png',
      multiplier: 2,
    })

    // 2. Call your bg removal API
    generationStore.startGen(alt.id) // show spinner
    let newBase64Url
    try {
      newBase64Url = await generationStore.removeBg(base64Url)
    } finally {
      generationStore.endGen(alt.id)
    }
    if (!newBase64Url) continue // keep the original object if removal failed
    fabricCanvas.remove(obj)
    // 3. Create new Fabric.Image from processed base64
    nodeStore.addAltImgPayload = {
      url: newBase64Url,
      altId: alt.id,
      left: obj.left,
      top: obj.top,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      angle: obj.angle,
      originX: obj.originX,
      originY: obj.originY,
    }
  }
  return true // Return true if objects were processed
}

onBeforeUnmount(() => {
  // Clean up event listeners
  if (fabricCanvas?.upperCanvasEl) {
    fabricCanvas.upperCanvasEl.removeEventListener('keydown', handleCanvasKeyDown)
  }

  // Clean up hover overlay and reset state
  removeHoverOverlay()
  isHoveringPrevLasso = false
  prevLassoPaths = []

  // Release the Fabric canvas (its listeners, objects and image data) when the node is deleted
  fabricCanvas?.dispose()
  fabricCanvas = null
})

function deleteAlt(e) {
  e.preventDefault()
  e.stopPropagation()
  emit('remove')
}

// Tag editing functions
function startEditingTag(propIndex) {
  editingTagIndex.value = propIndex
  editingTagText.value = alt.properties[propIndex].tag

  // Focus the input after DOM update
  nextTick(() => {
    const inputEl = tagInputRefs.value[propIndex]
    if (inputEl && typeof inputEl.focus === 'function') {
      inputEl.focus()
      inputEl.select() // Select all text
    }
  })
}

function saveTagEdit() {
  if (editingTagIndex.value !== null && editingTagText.value.trim()) {
    alt.properties[editingTagIndex.value].tag = editingTagText.value.trim()
  }
  cancelTagEdit()
}

function cancelTagEdit() {
  editingTagIndex.value = null
  editingTagText.value = ''
}

function switchStepLock(altIed) {
  nodeStore.switchStepLock(altIed)
}

function handleClick(altId, branchId) {
  if (allUtilStore.nodeOnDrag) {
    allUtilStore.nodeOnDrag = false // always reset
    return
  }
  if (nodeStore.ctrlPressed) {
    // Toggle selection
    const idx = nodeStore.selectedIndices.indexOf(altId)
    if (idx > -1) {
      nodeStore.selectedIndices.splice(idx, 1)
    } else {
      nodeStore.selectedIndices.push(altId)
    }
  } else {
    // Single selection
    const idx = nodeStore.selectedIndices.indexOf(altId)
    if (idx > -1) {
      nodeStore.selectedIndices = []
    } else {
      nodeStore.selectedIndices = [altId]
    }
  }
  nodeStore.selectedBranchId = branchId
  nodeStore.lastSelectedIndex = altId
}

async function transform() {
  fabricCanvas.discardActiveObject()
  fabricCanvas.requestRenderAll()
  saveState()
  const dataUrl = fabricCanvas.toDataURL({ format: 'png' })
  await nodeStore.mergeWholeCanvas(dataUrl, alt.id)
  changeDetected.value = false
  saveState()
}
function transformLasso(lassoPathInfo) {
  if (allUtilStore.isLassoMode) {
    saveState()
    lassoPayload.value.type = 'lasso'
    transformImage()
    prevLassoPaths = lassoPathInfo
    lassoPaths = []
    allPathStrs = []
    allUtilStore.isLassoMode = false
  }
}
function transformImage() {
  let objContent = []
  if (infoStore.isPropertyMode) {
    objContent = [...infoStore.propertyTags]
  } else {
    objContent = [{ tag: infoStore.lassoTagContent, propName: infoStore.lassoPropsContent }]
  }
  // Apply the same logic as mouseUpNode
  if (objContent.length > 0 && objContent[0].tag.length > 0) {
    if (alt.isStepLock) {
      // Constrain generation inside this node
      nodeStore.addOnExistingAlt(
        objContent,
        alt.branchId,
        alt.nodeId,
        alt.position.x,
        alt.position.y,
        alt.id,
      )
    } else {
      // Create new nodes
      nodeStore.addMultAlt(
        objContent,
        alt.branchId,
        alt.nodeId,
        alt.position.x,
        alt.position.y,
        alt.id,
      )
    }
  }
}
// Function to get current canvas state for copying
function getCurrentCanvasState() {
  if (!fabricCanvas) return null
  return JSON.stringify(fabricCanvas.toJSON(['idInLayers']))
}

// Function to set canvas state for pasting
async function setCanvasState(canvasStateJson) {
  if (!fabricCanvas || !canvasStateJson) return
  try {
    await loadCanvasState(canvasStateJson)
  } catch (error) {
    console.error('Failed to set canvas state:', error)
  }
}

defineExpose({
  deleteSelectedObjects,
  applyToFullImg,
  getCurrentCanvasState,
  setCanvasState,
  forwardOneLayer,
  backwardOneLayer,
  removeBg,
})

function applyToFullImg() {
  if (allUtilStore.isToolTip) {
    lassoPayload.value.type = 'full-img'
    saveState()
    transformImage()
    allUtilStore.isLassoMode = false
  }
}

function deleteSelectedObjects() {
  const canvas = fabricCanvas // this component's own instance
  const activeObjects = canvas.getActiveObjects()
  if (activeObjects.length > 0) {
    activeObjects.forEach((obj) => canvas.remove(obj))
    canvas.discardActiveObject()
    canvas.requestRenderAll()
  } else {
    emit('remove') // remove this whole node if nothing selected
  }
}

function forwardOneLayer() {
  const activeObject = fabricCanvas.getActiveObject()
  if (activeObject) {
    fabricCanvas.bringObjectForward(activeObject, true)
    fabricCanvas.renderAll()
    return true // Return true if an object was moved
  }
  return false // Return false if no object was found
}

function backwardOneLayer() {
  const activeObject = fabricCanvas.getActiveObject()
  if (activeObject) {
    fabricCanvas.sendObjectToBack(activeObject, true)
    fabricCanvas.renderAll()
    return true // Return true if an object was moved
  }
  return false // Return false if no object was found
}

async function eraseLasso() {
  storeLassoInfo()
  if (allUtilStore.isLassoMode) {
    console.log('Erasing lasso area')
    fabricCanvas.discardActiveObject()
    fabricCanvas.requestRenderAll()
    saveState()
    lassoPayload.value.prompt = 'Remove the masked object from this image'
    lassoPayload.value.altId = alt.id
    //({ original_image, total_mask, prompt, altId })
    const imgUrl = await generationStore.generateOpenAIImg(lassoPayload.value)
    if (imgUrl) {
      nodeStore.addAltImgPayload = { url: imgUrl, altId: alt.id }
    }
    changeDetected.value = false
    saveState()
  }
}

function storeLassoInfo() {
  lassoPayload.value = {
    original_image: canvasUrlWithoutPath.value,
    total_mask: totalEdgeUrl.value,
    altId: alt.id,
    lassoBoundUrl: lassoBoundUrl.value,
  }
}

watch(
  () => nodeStore.requestCanvasData.status,
  (shouldSend) => {
    if (shouldSend && nodeStore.requestCanvasData.altId === alt.id) {
      if (lassoPayload.value.type === 'lasso') {
        // if there is lasso path

        nodeStore.receiveCanvasData(lassoPayload.value)
      } else {
        // else send the whole image
        const fabricCanvasUrl = fabricCanvas.toDataURL()
        const fullImgPayload = {
          original_image: fabricCanvasUrl,
          total_mask: null,
          altId: alt.id,
          lassoBoundUrl: fabricCanvasUrl,
          type: 'full-img',
        }
        nodeStore.receiveCanvasData(fullImgPayload)
      }
    }
  },
)
watch(
  () => props.imgPayload, //drag a new image from canvas to node
  (newPayload) => {
    if (!newPayload) return
    const pointer = fabricCanvas.getPointer(newPayload.e, true)
    const existingImage = fabricCanvas.getObjects().find((obj) => obj.idInLayers === newPayload.id)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    if (newPayload.url !== ' ') {
      img.src = newPayload.url
      img.onload = () => {
        try {
          const fabricImage = new fabric.Image(img, {
            selectable: true,
            perPixelTargetFind: true,
            hasControls: true,
            left: pointer.x,
            top: pointer.y,
          })
          // Add skewX control (top-middle)
          // SkewX (horizontal handle – right)
          fabricImage.controls.skewXControl = new fabric.Control({
            x: 0.5,
            y: 0,
            offsetX: 20,
            cursorStyle: 'ew-resize',
            render: fabric.controlsUtils.renderCircleControl,
            actionHandler: function (eventData, transform) {
              const target = transform.target
              const deltaX = eventData.movementX || 0
              const currentSkewX = target.skewX || 0
              target.set('skewX', currentSkewX + deltaX / 20) // smaller step
              return true
            },
          })

          // SkewY (vertical handle – top)
          fabricImage.controls.skewYControl = new fabric.Control({
            x: 0,
            y: -0.5,
            offsetY: -20,
            cursorStyle: 'ns-resize',
            render: fabric.controlsUtils.renderCircleControl,
            actionHandler: function (eventData, transform) {
              const target = transform.target
              const deltaY = eventData.movementY || 0
              const currentSkewY = target.skewY || 0
              target.set('skewY', currentSkewY + deltaY / 10) // smaller step
              return true
            },
          })
          fabricImage.scaleToWidth(fabricCanvas.width)
          fabricImage.set('idInLayers', newPayload.id) // assign your own ID
          if (existingImage) {
            fabricCanvas.remove(existingImage)
          }
          fabricCanvas.add(fabricImage)
          fabricCanvas.renderAll()
          objectStore.obj = {}
          changeDetected.value = true
          // Save state after adding image
          console.log('Saving state after adding dragged image')
          saveState()
        } catch (error) {
          console.error('Failed to add image to canvas:', error)
        }
      }

      img.onerror = () => {
        console.error('Failed to load image:', newPayload.url)
      }
    }
  },
)
watch(
  () => allUtilStore.isLassoMode,
  (newVal) => {
    lassoStart = newVal
    fabricCanvas.forEachObject((obj) => {
      obj.selectable = !newVal
    })
    fabricCanvas.discardActiveObject()
    fabricCanvas.selection = !newVal

    // Clean up hover state when lasso mode is disabled
    if (!newVal) {
      isHoveringPrevLasso = false
      removeHoverOverlay()
    }
  },
)

watch(
  () => alt.expand,
  () => {
    nodeStore.updateVisibleEdges()
  },
)
watch(
  () => nodeStore.addAltImgPayload,
  (newPayload) => {
    if (alt.id !== newPayload.altId) return

    const img = new Image()
    img.src = newPayload.url
    img.onload = () => {
      try {
        const fabricImage = new fabric.Image(img, {
          selectable: true,
          perPixelTargetFind: true,
          hasControls: true,
          left: newPayload.left || 0,
          top: newPayload.top || 0,
          scaleX: newPayload.scaleX || 1,
          scaleY: newPayload.scaleY || 1,
          angle: newPayload.angle || 0,
          originX: newPayload.originX || 'left', // assuming default 'left' if undefined
          originY: newPayload.originY || 'top', // assuming default 'top' if undefined
        })
        // SkewX (horizontal handle – right)
        fabricImage.controls.skewXControl = new fabric.Control({
          x: 0.5,
          y: 0,
          offsetX: 20,
          cursorStyle: 'ew-resize',
          render: fabric.controlsUtils.renderCircleControl,
          actionHandler: function (eventData, transform) {
            const target = transform.target
            const deltaX = eventData.movementX || 0
            const currentSkewX = target.skewX || 0
            target.set('skewX', currentSkewX + deltaX / 20) // smaller step
            return true
          },
        })

        // SkewY (vertical handle – top)
        fabricImage.controls.skewYControl = new fabric.Control({
          x: 0,
          y: -0.5,
          offsetY: -20,
          cursorStyle: 'ns-resize',
          render: fabric.controlsUtils.renderCircleControl,
          actionHandler: function (eventData, transform) {
            const target = transform.target
            const deltaY = eventData.movementY || 0
            const currentSkewY = target.skewY || 0
            target.set('skewY', currentSkewY + deltaY / 10) // smaller step
            return true
          },
        })

        fabricImage.scaleToWidth(fabricCanvas.width)
        fabricCanvas.add(fabricImage)
        fabricCanvas.renderAll()

        // Save state after adding new alt image
        console.log('Saving state after adding alt image')
        saveState()
      } catch (error) {
        console.error('Failed to add image to canvas:', error)
      } finally {
        allUtilStore.isLassoMode = false
      }
    }

    img.onerror = () => {
      console.error('Failed to load image:', newPayload.url)
    }
  },
)

async function loadCanvasState(state) {
  return new Promise((resolve, reject) => {
    if (!state) {
      console.warn('Attempted to load a null or undefined state.')
      return resolve()
    }
    prevLassoPaths = []
    removeHoverOverlay()
    const parsedState = JSON.parse(state)
    fabricCanvas.loadFromJSON(parsedState, () => {
      try {
        fabricCanvas.renderAll()
        fabricCanvas.calcOffset()

        const objects = fabricCanvas.getObjects()
        if (objects.length > 0) {
          fabricCanvas.setActiveObject(objects[0])
          fabricCanvas.requestRenderAll()
        }
        resolve()
      } catch (e) {
        reject(e)
      }
    })
  })
}

async function saveState() {
  if (isLoadingState.value) return

  const canvasState = JSON.stringify(fabricCanvas.toJSON(['idInLayers']))
  nodeStore.saveState(alt.id, canvasState)
}

async function undo(event) {
  allUtilStore.nodeOnDrag = true
  event.stopPropagation()
  if (undoStack.value.length <= 2 || isLoadingState.value) return

  isLoadingState.value = true
  try {
    const prevState = nodeStore.undo(alt.id)
    if (prevState) {
      await loadCanvasState(prevState)
      console.log('Undo completed')
    }
  } catch (error) {
    console.error('Error during undo:', error)
  } finally {
    isLoadingState.value = false
  }
}

function exportAltToFreeCanv(event) {
  if (fabricCanvas.getObjects().length > 0) {
    // place the exported image up-left of the cursor, in world coordinates
    const cursor = camera.screenToWorld(event.clientX, event.clientY)
    const x = cursor.x - fabricCanvas.getWidth()
    const y = cursor.y - fabricCanvas.getHeight()
    const base64CanvasUrl = fabricCanvas.toDataURL({
      format: 'png',
      multiplier: 1,
    })
    const unique_id = crypto.randomUUID() // e.g. 'a8098c1a-f86e-11da-bd1a-00112444be1e'
    nodeStore.exportAltToFreeCanv(base64CanvasUrl, unique_id, x, y)
  } else {
    alert('No content to export to Free Canvas.')
  }
}

async function redo(event) {
  allUtilStore.nodeOnDrag = true
  event.stopPropagation()
  if (redoStack.value.length === 0 || isLoadingState.value) return

  isLoadingState.value = true
  try {
    const redoState = nodeStore.redo(alt.id)
    if (redoState) {
      await loadCanvasState(redoState)
      console.log('Redo completed')
    }
  } catch (error) {
    console.error('Error during redo:', error)
  } finally {
    isLoadingState.value = false
  }
}

async function navigateToPropertyState(property) {
  if (typeof property.historyStateIndex !== 'number') {
    console.warn('No history state index found for this property:', property.tag)
    return
  }

  try {
    isLoadingState.value = true

    // Save current state to undo stack before navigating
    await saveState()

    // Navigate to the specific history state
    const targetState = nodeStore.navigateToHistoryState(alt.id, property.historyStateIndex)
    if (targetState) {
      await loadCanvasState(targetState)
    } else {
      console.warn('Failed to navigate to history state index:', property.historyStateIndex)
    }
  } catch (error) {
    console.error('Error navigating to property state:', error)
  } finally {
    isLoadingState.value = false
  }
}

// Function to store original object states before resize
function storeOriginalObjectStates() {
  if (!fabricCanvas) return

  const objects = fabricCanvas.getObjects()
  originalObjectStates.value = objects.map((obj) => ({
    object: obj,
    left: obj.left,
    top: obj.top,
    scaleX: obj.scaleX || 1,
    scaleY: obj.scaleY || 1,
  }))
}

// Function to scale all fabric objects proportionally from original states
function scaleCanvasObjectsFromOriginal(newWidth) {
  if (!fabricCanvas || originalObjectStates.value.length === 0) {
    return
  }

  const scaleFactor = newWidth / originalCanvasSize.value.width

  originalObjectStates.value.forEach((originalState) => {
    const obj = originalState.object

    // Scale from original values
    const newLeft = originalState.left * scaleFactor
    const newTop = originalState.top * scaleFactor
    const newScaleX = originalState.scaleX * scaleFactor
    const newScaleY = originalState.scaleY * scaleFactor

    // Apply scaling
    obj.set({
      left: newLeft,
      top: newTop,
      scaleX: newScaleX,
      scaleY: newScaleY,
    })

    // Update object coordinates for hit detection
    obj.setCoords()
  })

  fabricCanvas.renderAll()
}

// Resize functions
function startResize(event, direction) {
  event.preventDefault()
  event.stopPropagation()

  isResizing.value = true
  resizeDirection.value = direction
  resizeStartPos.value = { x: event.clientX, y: event.clientY }
  resizeStartSize.value = {
    width: canvasW.value,
    height: canvasW.value, // Canvas is always square (1:1 aspect ratio)
  }

  // Store original canvas size for scaling calculations
  originalCanvasSize.value = {
    width: canvasW.value,
    height: canvasW.value,
  }

  // Store original object states
  storeOriginalObjectStates()

  // Add global event listeners
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)

  // Prevent dragging the node while resizing
  document.body.style.userSelect = 'none'
}

function handleResize(event) {
  if (!isResizing.value) return

  // mouse moves in screen pixels; the node lives in zoomed world space
  const deltaX = (event.clientX - resizeStartPos.value.x) / camera.zoom
  const deltaY = (event.clientY - resizeStartPos.value.y) / camera.zoom

  // Calculate the delta that maintains aspect ratio (use the larger absolute delta)
  const absDeltaX = Math.abs(deltaX)
  const absDeltaY = Math.abs(deltaY)
  const delta = absDeltaX > absDeltaY ? deltaX : deltaY

  let newCanvasWidth = resizeStartSize.value.width

  // Apply delta based on resize direction
  switch (resizeDirection.value) {
    case 'nw': // northwest - shrink when moving in, grow when moving out
      newCanvasWidth = resizeStartSize.value.width - delta
      break
    case 'ne': // northeast - grow when moving right or up
      newCanvasWidth = resizeStartSize.value.width + delta
      break
    case 'sw': // southwest - shrink when moving left or down
      newCanvasWidth = resizeStartSize.value.width - delta
      break
    case 'se': // southeast - grow when moving right or down
      newCanvasWidth = resizeStartSize.value.width + delta
      break
  }

  // Enforce minimum and maximum sizes
  const minSize = 160
  const maxSize = 600
  newCanvasWidth = Math.max(minSize, Math.min(maxSize, newCanvasWidth))

  // Update the alt's sizing through the store
  nodeStore.updateAltSizing(alt.id, newCanvasWidth)

  // Update local reactive values immediately for UI responsiveness
  localCanvasW.value = newCanvasWidth
  localNodeW.value = newCanvasWidth + 20
  localNodeH.value = newCanvasWidth + 100

  // Update fabric canvas size and scale objects if it exists
  if (fabricCanvas) {
    // Scale all objects from their original states
    scaleCanvasObjectsFromOriginal(newCanvasWidth)

    // Update canvas dimensions
    fabricCanvas.setDimensions({
      width: newCanvasWidth,
      height: newCanvasWidth,
    })

    fabricCanvas.renderAll()
  }
}

function stopResize() {
  if (!isResizing.value) return

  isResizing.value = false
  resizeDirection.value = ''

  // Remove global event listeners
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)

  // Re-enable text selection
  document.body.style.userSelect = ''

  // Save state after resize
  setTimeout(() => {
    saveState()
  }, 100)
}
</script>

<style scoped>
.node {
  width: v-bind('nodeW + "px"');
  height: v-bind('nodeH + "px"'); /* fixed height */
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden; /* prevent internal overflow from expanding node */
}

/* When collapsed, adjust the height to fit only the tags */
.node.collapsed {
  height: auto;
  min-height: auto;
  padding: 0;
}

.node.collapsed .node-tags {
  margin: 2px;
  padding: 6px 10px;
}

.nodeHandle {
  width: 100%; /* constrain to parent width */
  max-width: 100%; /* don't exceed node width */
  overflow: hidden; /* prevent expansion */
}

.node-tags {
  display: flex;
  flex-wrap: nowrap; /* no wrapping, keep single line */
  flex: 1; /* take available space but don't expand parent */
  max-width: 100%;
  box-sizing: border-box;
  /* optionally set a fixed height */
  height: auto; /* adjust to fit your tag buttons nicely */
  align-items: center; /* vertically center buttons */
  overflow-x: auto; /* enable horizontal scrolling */
  overflow-y: hidden; /* hide vertical scrolling */
  scrollbar-width: thin; /* Firefox - show thin scrollbar */
  scrollbar-color: #cbd5e0 transparent; /* Firefox - thumb and track colors */
}

/* Tag input styling */
.tag-input {
  background: transparent;
  border: none;
  outline: none;
  color: inherit;
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  padding: 0;
  margin: 0;
  width: auto;
  min-width: 20px;
  max-width: 150px;
}

/* Custom scrollbar for WebKit browsers */
.node-tags::-webkit-scrollbar {
  height: 6px; /* height for horizontal scrollbar */
}

.node-tags::-webkit-scrollbar-track {
  background: transparent; /* light gray track */
  border-radius: 3px;
}

.node-tags::-webkit-scrollbar-thumb {
  background: #cbd5e0; /* medium gray thumb */
  border-radius: 3px;
  transition: background 0.2s ease;
}

.node-tags::-webkit-scrollbar-thumb:hover {
  background: #a0aec0; /* darker gray on hover */
}

.node-tags button {
  flex-shrink: 0; /* prevent buttons from shrinking */
  white-space: nowrap; /* keep text on single line */
  /* Remove overflow/ellipsis to show full text */
  min-width: fit-content; /* button fits its content */
  padding: 0.25rem 0.5rem; /* consistent padding */
}

.transparent-btn {
  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  padding: 0.25rem 0.5rem;
}

.transparent-btn:hover,
.transparent-btn:focus,
.transparent-btn:active {
  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

.gray-symbol {
  color: #6c757d !important;
}

.gray-symbol:hover,
.gray-symbol:focus,
.gray-symbol:active {
  color: #6c757d !important;
}

.red-symbol {
  color: #dc3545 !important;
}

.red-symbol:hover,
.red-symbol:focus,
.red-symbol:active {
  color: #dc3545 !important;
}

.thumb-icon-wrapper {
  display: inline-flex; /* use flex to center image */
  justify-content: center;
  align-items: center;
  width: 24px; /* slightly larger than image to allow for border */
  height: 24px;
  position: relative;
  border-radius: 8px;
}

.thumb-icon-wrapper.lasso-border {
  border: 2px dashed #888;
  box-shadow: 0 0 4px rgba(136, 136, 136, 0.3);
}

.thumb-icon {
  width: 20px;
  height: 20px;
  border-radius: 2px;
  object-fit: cover;
  object-position: center;
  margin: 0; /* remove margin-right to avoid offset */
  display: block;
}

/* Tail */
.thumb-icon-wrapper.lasso-border::after {
  content: '';
  position: absolute;
  width: 15px;
  height: 5px;
  border-style: dashed;
  border-width: 2px;
  border-color: transparent transparent #888 #888;
  border-radius: 50% 50% 50% 0;
  top: 80%;
  left: 100%;
  transform: translateY(-50%) rotate(10deg);
  pointer-events: none;
}

/* Resize handles */
.resize-handles {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none; /* Allow clicks through except on handles */
}

.resize-handle {
  position: absolute;
  background-color: #42b983;
  border: 2px solid white;
  border-radius: 50%;
  /* inside the corner (the node clips overflow) and a constant on-screen size at any zoom */
  width: calc(12px * var(--ui-scale, 1));
  height: calc(12px * var(--ui-scale, 1));
  pointer-events: all;
  cursor: pointer;
  opacity: 0.8;
  transition: all 0.2s ease;
  z-index: 1001; /* Above other elements */
}

.resize-handle:hover {
  opacity: 1;
  transform: scale(1.2);
  box-shadow: 0 2px 8px rgba(66, 185, 131, 0.4);
}

/* Position the handles at each corner */
.resize-handle-nw {
  top: 0;
  left: 0;
  cursor: nw-resize;
}

.resize-handle-ne {
  top: 0;
  right: 0;
  cursor: ne-resize;
}

.resize-handle-sw {
  bottom: 0;
  left: 0;
  cursor: sw-resize;
}

.resize-handle-se {
  bottom: 0;
  right: 0;
  cursor: se-resize;
}

/* Hide resize handles when node is collapsed */
.node:not(:hover) .resize-handle {
  opacity: 0;
  transform: scale(0.8);
}
</style>
