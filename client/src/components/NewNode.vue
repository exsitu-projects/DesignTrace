<template>
  <div ref="nodeEl" :id="alt.id" class="node">
    <div
      v-if="alt.expand || alt.dragAgain"
      @click="handleClick(alt.id, alt.branchId)"
      class="nodeHandle rounded-top pe-2 d-flex align-items-center py-1"
      style="background: #ededed"
    >
      <!--      @dblclick="clickOnNodeTap()"-->
      <!--      <EditableLabel v-model="nodeName" />-->
      <!--      {{ alt.id }}-->

      <!-- Transform Button (appears on the left when needed) -->

      <button v-show="changeDetected" @click="transform()" class="btn btn-outline-dark btn-sm ms-2">
        Transform
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
          ⟲
        </button>
        <button
          @click="redo($event)"
          :disabled="redoStack.length === 0"
          class="btn btn-sm transparent-btn gray-symbol"
          title="Redo"
          @mouseup.stop
        >
          ⟳
        </button>
        <button
          @click="switchStepLock(alt.id)"
          :class="['btn btn-sm ', { active: alt.isStepLock }]"
          @mouseup.stop
        >
          <Lock v-show="alt.isStepLock" class="mb-1" color="gray" :size="13"></Lock>
          <LockOpen v-show="!alt.isStepLock" class="mb-1" color="gray" :size="13"></LockOpen>
        </button>
        <button
          @click="deleteAlt($event)"
          class="btn btn-sm transparent-btn red-symbol"
          title="Delete Alt"
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
        v-show="
          generationStore.currentGenId === alt.id && generationStore.loadingStatus === 'loading'
        "
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
    <div class="resize-handles" v-if="alt.expand || alt.dragAgain">
      <div 
        class="resize-handle resize-handle-nw" 
        @mousedown="startResize($event, 'nw')"
      ></div>
      <div 
        class="resize-handle resize-handle-ne" 
        @mousedown="startResize($event, 'ne')"
      ></div>
      <div 
        class="resize-handle resize-handle-sw" 
        @mousedown="startResize($event, 'sw')"
      ></div>
      <div 
        class="resize-handle resize-handle-se" 
        @mousedown="startResize($event, 'se')"
      ></div>
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
  toRaw,
  toRef,
} from 'vue'
import { Lock, LockOpen } from 'lucide-vue-next'
import * as fabric from 'fabric'
import EditableLabel from './EditableLabel.vue'
import { useObject } from '@/stores/objectStore.js'
import { useNode } from '@/stores/nodeStore.js'
import { useAllUtil } from '@/stores/allUtilStore.js'
import { CannyJS } from '@/js/canny'
import { useGeneration } from '@/stores/generationStore.js'
import { useInfoStore } from '@/stores/infoStore.js'

const emit = defineEmits(['remove']) // or whatever event you want to emit

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
const posEdgeUrl = ref('')
const negEdgeUrl = ref('')
const totalEdgeUrl = ref('')
const brushMask = ref('')
const emptyMask = ref('')
const changeDetected = ref(false)
const objectStore = useObject()
const nodeStore = useNode()
const cannyHt = 150 //canny edge high threshold
const cannyLt = 40 //canny edge low threshold
const allUtilStore = useAllUtil()
const generationStore = useGeneration()
const canvasUrlWithoutPath = ref('')
const pathStr = ref('')
let isLasso = false
let points = []
const lassoBoundUrl = ref('')
const strokesBoundUrl = ref('')
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
watch(() => alt.sizing, (newSizing) => {
  if (newSizing) {
    localCanvasW.value = newSizing.canvasWidth
    localNodeW.value = newSizing.nodeWidth
    localNodeH.value = newSizing.nodeHeight
  }
}, { deep: true, immediate: true })
const canvasUrlWithoutBrush = ref('')
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

const cursor = new fabric.Circle({
  //brush cursor
  radius: allUtilStore.brush.width / 2,
  fill: allUtilStore.brush.color,
  originX: 'center',
  originY: 'center',
  selectable: false,
  evented: false,
  absolutePositioned: true, // ← stays in screen coords
})
function updateCursor() {
  cursor.set({
    radius: allUtilStore.brush.width / 2,
    fill: allUtilStore.brush.color,
  })
  cursor.dirty = true // force re‑render
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
  fabricCanvas.upperCanvasEl.style.cursor = 'none'

  fabricCanvasW.value = fabricCanvas.width
  fabricCanvasH.value = fabricCanvas.height
  fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas)
  const brush = fabricCanvas.freeDrawingBrush
  brush.width = allUtilStore.brush.width
  brush.color = allUtilStore.brush.color

  fabricCanvas.add(cursor) // top of stack
  cursor.visible = false // hidden until drawing starts

  updateCursor()

  // Save initial canvas state for undo functionality
  setTimeout(() => {
    saveState()
  }, 100)

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
      startPointer = opt.pointer
      points = [`M ${opt.pointer.x} ${opt.pointer.y}`] // Start path
    } else if (allUtilStore.isColorPen) {
      cursor.visible = true
      fabricCanvas.requestRenderAll()
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
    } else if (allUtilStore.isColorPen) {
      cursor.visible = true
      const p = fabricCanvas.getPointer(opt.e)
      cursor.set({ left: p.x, top: p.y })
      cursor.setCoords()
      fabricCanvas.bringObjectToFront(cursor)
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

  fabricCanvas.on('path:created', ({ path, e }) => {
    changeDetected.value = true
    path.objectCaching = false // render directly, no off‑screen crop

    fabricCanvas.bringObjectToFront(cursor)

    // Save state after drawing (with slight delay to ensure path is fully added)
    setTimeout(() => {
      console.log('Saving state after path creation')
      saveState()
    }, 50)
  })

  fabricCanvas.upperCanvasEl.addEventListener('mouseout', () => {
    cursor.visible = false
    fabricCanvas.requestRenderAll()
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
          // uncomment to use google imagen api for inpainting
          // Create canvas same size as original
          // const alphaMaskCanvas = document.createElement('canvas')
          // alphaMaskCanvas.width = fabricCanvas.width
          // alphaMaskCanvas.height = fabricCanvas.height
          // const alphaCtx = alphaMaskCanvas.getContext('2d')
          //
          // // Fill the whole canvas black (opaque)
          // alphaCtx.fillStyle = 'black'
          // alphaCtx.fillRect(0, 0, alphaMaskCanvas.width, alphaMaskCanvas.height)
          //
          // // Cut out the lasso region (make transparent)
          // alphaCtx.globalCompositeOperation = 'destination-out'
          // const lasPath = new Path2D(pathStr.value)
          // alphaCtx.fillStyle = 'white' // Any color, since it's being cut out
          // alphaCtx.fill(lasPath)
          //
          // // Set back to default blending mode
          // alphaCtx.globalCompositeOperation = 'source-over'
          //
          // // Final result: lasso = transparent, rest = black (opaque)
          // totalEdgeUrl.value = alphaMaskCanvas.toDataURL('image/png')
          // console.log(totalEdgeUrl.value)
          // uncomment to use openai api for inpainting (masks not working well with 4.1 api)
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

          // uncomment to use magic quill for inpainting
          // const lassoMaskCan = document.createElement('canvas')
          // lassoMaskCan.width = fabricCanvas.width // same pixel size as the source
          // lassoMaskCan.height = fabricCanvas.height
          // const lassoMaskCtx = lassoMaskCan.getContext('2d')
          //
          // lassoMaskCtx.fillStyle = 'black'
          // lassoMaskCtx.fillRect(0, 0, lassoMaskCan.width, lassoMaskCan.height)
          //
          // const lasPath = new Path2D(pathStr.value)
          // lassoMaskCtx.fillStyle = 'white'
          // lassoMaskCtx.fill(lasPath)
          //
          // // totalEdgeUrl.value = lassoMaskCan.toDataURL('image/png')
          // totalEdgeUrl.value = whiteToTransparent(lassoMaskCan)
          // console.log(totalEdgeUrl.value) // lasso selection mask, lasso area white, other black -> total mask
          //
          // const srcCanv = fabricCanvas.lowerCanvasEl
          // const canny = CannyJS.canny(
          //   srcCanv,
          //   cannyHt, // ht: canny high threshold
          //   cannyLt, // lt: canny low threshold
          //   1.4, // gaussian blur sigma
          //   3, // kernel size, default 3 usually
          //   2,
          // )
          //
          // let cannyCan = document.createElement('canvas')
          // cannyCan.width = fabricCanvas.getWidth()
          // cannyCan.height = fabricCanvas.getHeight()
          //
          // const cannyCtx = cannyCan.getContext('2d')
          // cannyCtx.imageSmoothingEnabled = false // keep edges crisp
          // const hiRes = document.createElement('canvas')
          // hiRes.width = srcCanv.width // 1024
          // hiRes.height = srcCanv.height
          // canny.drawOn(hiRes) // fills hiRes
          //
          // cannyCtx.drawImage(
          //   hiRes,
          //   0,
          //   0,
          //   hiRes.width,
          //   hiRes.height, // src rect
          //   0,
          //   0,
          //   cannyCan.width,
          //   cannyCan.height, // dest rect (scaled)
          // )
          //
          // const cannyURL = cannyCan.toDataURL('image/png')
          // // console.log(cannyURL) // canny edge mask, canny edge white, other black
          //
          // let cannyInLassoCan = document.createElement('canvas')
          // cannyInLassoCan.width = cannyCan.width
          // cannyInLassoCan.height = cannyCan.height
          // const cannyInLassoCtx = cannyInLassoCan.getContext('2d')
          //
          // cannyInLassoCtx.fillStyle = 'white'
          // const lassoPath = new Path2D(pathStr.value)
          // cannyInLassoCtx.fill(lassoPath)
          //
          // cannyInLassoCtx.globalCompositeOperation = 'source-in'
          // cannyInLassoCtx.drawImage(cannyCan, 0, 0)
          //
          // cannyInLassoCtx.globalCompositeOperation = 'destination-over'
          // cannyInLassoCtx.fillStyle = 'black'
          // cannyInLassoCtx.fillRect(0, 0, cannyInLassoCan.width, cannyInLassoCan.height)
          //
          // // Reset composite mode for safety
          // cannyInLassoCtx.globalCompositeOperation = 'source-over'
          // // posEdgeUrl.value = cannyInLassoCan.toDataURL('image/png')
          // posEdgeUrl.value = whiteToTransparent(cannyInLassoCan)
          // // console.log(posEdgeUrl.value) // canny edge inside lasso mask, canny edge white, other black -> pos edge mask
          //
          // lassoMaskCtx.globalCompositeOperation = 'difference'
          // lassoMaskCtx.fillStyle = '#fff' // white rectangle
          // lassoMaskCtx.fillRect(0, 0, cannyInLassoCan.width, cannyInLassoCan.height)
          // lassoMaskCtx.globalCompositeOperation = 'lighter'
          // lassoMaskCtx.drawImage(cannyInLassoCan, 0, 0)
          // lassoMaskCtx.globalCompositeOperation = 'difference'
          // lassoMaskCtx.fillStyle = '#fff' // white rectangle
          // lassoMaskCtx.fillRect(0, 0, cannyInLassoCan.width, cannyInLassoCan.height)
          // negEdgeUrl.value = whiteToTransparent(lassoMaskCan)
          // // console.log(negEdgeUrl.value) // non-canny edge inside lasso mask, non-canny edge inside lasso white, other black -> neg edge mask
          // cannyCan = null
          // cannyInLassoCan = null
          storeLassoInfo()

          // Save state after lasso operation
          saveState()

          // Add the new lasso to existing selections (multi-selection)
          prevLassoPaths = [...prevLassoPaths, ...lassoPaths]
          console.log('Added lasso to existing selections, total:', prevLassoPaths.length)
        }
      }
    } else if (allUtilStore.isColorPen) {
      cursor.visible = false
      fabricCanvas.requestRenderAll()
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

onBeforeUnmount(() => {
  // Clean up event listeners
  if (fabricCanvas?.upperCanvasEl) {
    fabricCanvas.upperCanvasEl.removeEventListener('keydown', handleCanvasKeyDown)
  }

  // Clean up hover overlay and reset state
  removeHoverOverlay()
  isHoveringPrevLasso = false
  prevLassoPaths = []
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

function whiteToTransparent(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imgData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    // If pixel is white (or near white, threshold optional)
    if (r === 255 && g === 255 && b === 255) {
      data[i + 3] = 0 // make transparent
    }
  }

  ctx.putImageData(imgData, 0, 0)
  return canvas.toDataURL('image/png')
} // the magicquill input requires mask area to be transparent, and non-mask area to be opaque

function transform() {
  if (allUtilStore.isColorPen) {
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity

    const paths = fabricCanvas.getObjects('path')

    // 1. snapshot with strokes
    canvasUrlWithoutPath.value = fabricCanvas.toDataURL()

    // 3. build the mask
    const mask = document.createElement('canvas')
    mask.width = fabricCanvasW.value
    mask.height = fabricCanvasH.value
    const ctx = mask.getContext('2d')

    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, mask.width, mask.height)
    emptyMask.value = mask.toDataURL('image/png')

    ctx.save()
    paths.forEach((p) => {
      // Update path's coordinate cache
      p.setCoords()
      const rect = p.getBoundingRect()

      left = Math.min(left, rect.left)
      top = Math.min(top, rect.top)
      right = Math.max(right, rect.left + rect.width)
      bottom = Math.max(bottom, rect.top + rect.height)
      // Get transformed coordinates (accounts for rotation, scale, skew)
      // remember original settings
      const prevComp = p.globalCompositeOperation
      const prevOpacity = p.opacity

      p.globalCompositeOperation = 'destination-out'
      p.opacity = 1 // full erase, no half‑alpha edges

      p.render(ctx) // now it really punches the hole

      // restore original settings in case you need the object later
      p.globalCompositeOperation = prevComp
      p.opacity = prevOpacity
    })
    strokesBoundUrl.value = fabricCanvas.toDataURL({
      left: isFinite(left) ? left : 0,
      top: isFinite(top) ? top : 0,
      width: isFinite(left) ? right - left : 0,
      height: isFinite(top) ? bottom - top : 0,
      format: 'png',
      multiplier: 1,
    })

    ctx.restore()

    brushMask.value = mask.toDataURL('image/png') // pure black + transparent holes

    // 4. now strip the strokes from the main canvas
    paths.forEach((p) => fabricCanvas.remove(p))
    fabricCanvas.renderAll()

    // 5. snapshot without strokes
    canvasUrlWithoutBrush.value = fabricCanvas.toDataURL()

    const colorPenPayload = {
      original_image: canvasUrlWithoutBrush.value,
      add_color_image: canvasUrlWithoutPath.value,
      add_edge_image: emptyMask.value,
      remove_edge_image: emptyMask.value,
      total_mask: brushMask.value,
      strokesBoundUrl: strokesBoundUrl.value,
      altId: alt.id,
    }
    nodeStore.applyColorPen(colorPenPayload)
    changeDetected.value = false

    // Save state after transform
    saveState()
  }
  // else if (allUtilStore.isLassoMode) {
  //   saveState()
  //   changeDetected.value = false
  //   lassoPayload.value.type = 'lasso'
  //   transformImage()
  //   prevLassoPaths = lassoPathInfo
  //   //prevLassoPaths = lassoPaths
  //   lassoPaths = []
  //   allPathStrs = []
  //   allUtilStore.isLassoMode = false
  // }
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
    objContent = [{ tag: infoStore.lassoTagContent, propName: 'visual property' }]
  }

  // Apply the same logic as mouseUpNode
  if (objContent.length > 0) {
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
defineExpose({
  deleteSelectedObjects,
  applyToFullImg,
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
  const canvas = fabricCanvas // this component’s own instance
  const activeObjects = canvas.getActiveObjects()
  if (activeObjects.length > 0) {
    activeObjects.forEach((obj) => canvas.remove(obj))
    canvas.discardActiveObject()
    canvas.requestRenderAll()
  } else {
    emit('remove') // remove this whole node if nothing selected
  }
}

function storeLassoInfo() {
  lassoPayload.value = {
    original_image: canvasUrlWithoutPath.value,
    total_mask: totalEdgeUrl.value,
    altId: alt.id,
    lassoBoundUrl: lassoBoundUrl.value,
  }
  // lassoPayload.value = {
  //   original_image: canvasUrlWithoutPath.value,
  //   add_color_image: canvasUrlWithoutPath.value,
  //   add_edge_image: posEdgeUrl.value,
  //   remove_edge_image: negEdgeUrl.value,
  //   total_mask: totalEdgeUrl.value,
  //   altId: alt.id,
  //   lassoBoundUrl: lassoBoundUrl.value,
  // }
}

watch(
  () => allUtilStore.brush,
  (brush) => {
    if (fabricCanvas) {
      fabricCanvas.freeDrawingBrush.color = brush.color
      fabricCanvas.freeDrawingBrush.width = brush.width
      updateCursor()
    }
  },
  { deep: true },
)

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

          fabricImage.scaleToWidth(fabricCanvas.width)
          fabricImage.set('idInLayers', newPayload.id) // assign your own ID
          if (existingImage) {
            fabricCanvas.remove(existingImage)
          }
          fabricCanvas.add(fabricImage)
          fabricCanvas.renderAll()
          objectStore.obj = {}

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
  () => allUtilStore.isColorPen,
  (newVal) => {
    fabricCanvas.isDrawingMode = newVal
    fabricCanvas.forEachObject((obj) => {
      obj.selectable = !newVal
    })
    fabricCanvas.discardActiveObject()
    fabricCanvas.selection = !newVal
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
          left: 0,
          top: 0,
        })

        fabricImage.scaleToWidth(fabricCanvas.width)
        fabricCanvas.add(fabricImage)
        fabricCanvas.isDrawingMode = false
        fabricCanvas.renderAll()

        // Save state after adding new alt image
        console.log('Saving state after adding alt image')
        saveState()
      } catch (error) {
        console.error('Failed to add image to canvas:', error)
      } finally {
        allUtilStore.isColorPen = false
        allUtilStore.isLassoMode = false // reset both modes
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

        // Re-add cursor
        fabricCanvas.add(cursor)
        cursor.visible = false
        fabricCanvas.bringObjectToFront(cursor)

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

  const cursorExists = fabricCanvas.getObjects().includes(cursor)
  if (cursorExists) {
    fabricCanvas.remove(cursor)
  }

  const canvasState = JSON.stringify(fabricCanvas.toJSON(['idInLayers']))
  nodeStore.saveState(alt.id, canvasState)

  if (cursorExists) {
    fabricCanvas.add(cursor)
    cursor.visible = false
    fabricCanvas.bringObjectToFront(cursor)
  }
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
  
  const objects = fabricCanvas.getObjects().filter(obj => obj !== cursor)
  originalObjectStates.value = objects.map(obj => ({
    object: obj,
    left: obj.left,
    top: obj.top,
    scaleX: obj.scaleX || 1,
    scaleY: obj.scaleY || 1
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
      scaleY: newScaleY
    })
    
    // Update object coordinates for hit detection
    obj.setCoords()
  })
  
  // Ensure cursor is properly positioned
  if (cursor) {
    cursor.visible = false
    if (!fabricCanvas.getObjects().includes(cursor)) {
      fabricCanvas.add(cursor)
    }
    fabricCanvas.bringObjectToFront(cursor)
  }
  
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
    height: canvasW.value // Canvas is always square (1:1 aspect ratio)
  }
  
  // Store original canvas size for scaling calculations
  originalCanvasSize.value = {
    width: canvasW.value,
    height: canvasW.value
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
  
  const deltaX = event.clientX - resizeStartPos.value.x
  const deltaY = event.clientY - resizeStartPos.value.y
  
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
  const minSize = 300
  const maxSize = 600
  newCanvasWidth = Math.max(minSize, Math.min(maxSize, newCanvasWidth))
  
  // Update the alt's sizing through the store
  nodeStore.updateAltSizing(alt.id, newCanvasWidth)
  
  // Update local reactive values immediately for UI responsiveness
  localCanvasW.value = newCanvasWidth
  localNodeW.value = newCanvasWidth + 20
  localNodeH.value = newCanvasWidth + 120
  
  // Update fabric canvas size and scale objects if it exists
  if (fabricCanvas) {    
    // Scale all objects from their original states
    scaleCanvasObjectsFromOriginal(newCanvasWidth)
    
    // Update canvas dimensions
    fabricCanvas.setDimensions({ 
      width: newCanvasWidth, 
      height: newCanvasWidth 
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

.nodeHandle {
  width: 100%; /* constrain to parent width */
  max-width: 100%; /* don't exceed node width */
  overflow: hidden; /* prevent expansion */
}

.node-tags {
  display: flex;
  flex-wrap: nowrap; /* no wrapping, keep single line */
  gap: 0.2rem;
  flex: 1; /* take available space but don't expand parent */
  max-width: 100%;
  box-sizing: border-box;
  padding: 0.3rem;
  /* optionally set a fixed height */
  height: 2rem; /* adjust to fit your tag buttons nicely */
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
  width: 12px;
  height: 12px;
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
  top: -6px;
  left: -6px;
  cursor: nw-resize;
}

.resize-handle-ne {
  top: -6px;
  right: -6px;
  cursor: ne-resize;
}

.resize-handle-sw {
  bottom: -6px;
  left: -6px;
  cursor: sw-resize;
}

.resize-handle-se {
  bottom: -6px;
  right: -6px;
  cursor: se-resize;
}

/* Hide resize handles when node is collapsed */
.node:not(:hover) .resize-handle {
  opacity: 0;
  transform: scale(0.8);
}
</style>
