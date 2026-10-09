<template>
  <canvas id="freeCanvas"></canvas>
  <div
    v-show="generationStore.textGenStatus === 'loading'"
    class="position-fixed top-50 start-50 translate-middle"
    style="z-index: 9000"
  >
    <div class="spinner-border" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
  </div>
  <!-- Cutout tooltip -->
  <div
    v-if="isDraggingCutout && cutoutTooltip.visible"
    class="cutout-tooltip"
    :style="{
      left: cutoutTooltip.x + 'px',
      top: cutoutTooltip.y + 'px',
      position: 'fixed',
    }"
  >
    <img :src="cutoutTooltip.imageData" alt="cutout" />
  </div>
  <div
    class="border border-black rounded-1 p-1 position-fixed bottom-0 start-50 translate-middle-x d-flex justify-content-center"
    style="z-index: 1050; width: max-content; max-width: calc(100vw - 32px)"
  >
    <VisualTool
      @removeBg="removeBg"
      @forwardLayer="forwardOneLayer"
      @backwardLayer="backwardOneLayer"
      @exportBranchTags="exportBranchTags"
      @loadImg="(payload) => loadImgFromUrl(payload.filepath, payload.id)"
    ></VisualTool>
  </div>
</template>

<script setup>
import { onMounted, markRaw, ref, watch, onBeforeUnmount } from 'vue'
import * as fabric from 'fabric'
import { useNode } from '@/stores/nodeStore.js'
import { useObject } from '@/stores/objectStore.js'

import VisualTool from '@/components/VisualTool.vue'
import { useGeneration } from '@/stores/generationStore.js'

import { useAllUtil } from '@/stores/allUtilStore.js'
import { useCamera } from '@/stores/cameraStore.js'
import { registerFreeCanvasBounds } from '@/composables/useCanvasNavigation.js'
const props = defineProps({
  childActiveSelected: Boolean,
})
const emit = defineEmits([
  'forwardLayerFromNodes',
  'backwardLayerFromNodes',
  'exportBranchTags',
  'removeBgFromNodes',
])
let canvas = null
const objectStore = useObject()
const allUtilStore = useAllUtil()
const generationStore = useGeneration()
const nodeStore = useNode()
const camera = useCamera()
const $ = (id) => document.getElementById(id)
let isLasso = false
let points = []
let path = null
let lassoStart = false
let startPointer = null
let lassoMaxDistance = 0 // furthest the mouse got from the start while drawing (screen px)
let lassoPaths = [] // Store completed lasso paths
let prevLassoPaths = [] // Store previous lasso paths for hover/drag
let isHoveringPrevLasso = false // Track if hovering over previous lasso
let prevLassoHoverOverlay = null // Overlay for darkening effect
let isDraggingCutout = ref(false) // Track if dragging a cut-out image
let cutoutImage = null // Store the cut-out image data
const cutoutTooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  imageData: null,
})
watch(
  () => objectStore.dragState,
  (newVal) => {
    if (newVal === 'restoreInitialDOM') {
      const draggedObj = canvas.getObjects().find((obj) => obj.idInUpload === objectStore.id)
      if (draggedObj) {
        draggedObj.set({
          left: objectStore.startDragLeft,
          top: objectStore.startDragTop,
        })
        draggedObj.setCoords() // Very important for hit detection and rendering
        canvas.renderAll()
        objectStore.obj = {}
        objectStore.dragState = 'finishedDragging'
      }
    }
  },
)

watch(
  () => nodeStore.exportAlt.flag,
  (flag) => {
    if (flag) {
      loadImgFromUrl(
        nodeStore.exportAlt.base64CanvasUrl,
        nodeStore.exportAlt.unique_id,
        nodeStore.exportAlt.x,
        nodeStore.exportAlt.y,
      )
    }
    nodeStore.exportAlt.flag = false
  },
)

watch(
  () => allUtilStore.isLassoMode,
  (newVal) => {
    lassoStart = newVal
    canvas.forEachObject((obj) => {
      obj.selectable = !newVal
    })
    canvas.discardActiveObject()
    canvas.selection = !newVal
  },
)
// The canvas always fills the window; the camera decides which part of the world it shows
function fitCanvasToWindow() {
  if (canvas) resizeFabric(window.innerWidth, window.innerHeight)
}

function syncViewport() {
  if (!canvas) return
  canvas.setViewportTransform([camera.zoom, 0, 0, camera.zoom, camera.x, camera.y])
  canvas.requestRenderAll()
}
watch(() => [camera.x, camera.y, camera.zoom], syncViewport)

// Bounding box of everything on the free canvas, in world coordinates
function sceneBounds() {
  if (!canvas || canvas.getObjects().length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  canvas.getObjects().forEach((obj) => {
    const r = obj.getBoundingRect()
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.left + r.width)
    bottom = Math.max(bottom, r.top + r.height)
  })
  return { left, top, right, bottom }
}

// Run fn with the camera transform removed, so exports use plain world coordinates
function withoutViewport(fn) {
  const vpt = canvas.viewportTransform.slice()
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  try {
    return fn()
  } finally {
    canvas.setViewportTransform(vpt)
  }
}

// x/y are world coordinates; without them the image is centred in the current view
const loadImgFromUrl = (url, id, x, y) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'

  img.src = url
  img.onload = () => {
    try {
      const fabricImage = new fabric.Image(img, {
        left: x ?? 0,
        top: y ?? 0,
        selectable: true,
        hasControls: true,
        perPixelTargetFind: true,
        hasBorders: false,
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

      fabricImage.scaleToWidth(250)
      if (x === undefined || y === undefined) {
        const center = camera.viewCenter()
        fabricImage.set({
          left: center.x - fabricImage.getScaledWidth() / 2,
          top: center.y - fabricImage.getScaledHeight() / 2,
        })
      }
      fabricImage.set('idInUpload', id) // assign your own ID
      canvas.add(fabricImage) // <-- changed from canvas.value.add(...)
      canvas.renderAll() // <-- changed from canvas.value.renderAll()
    } catch (error) {
      console.error('Failed to add image to canvas:', error)
    }
  }

  img.onerror = () => {
    console.error('Failed to load image')
  }
}
async function removeBg() {
  const activeObj = canvas.getActiveObject()
  if (props.childActiveSelected) {
    canvas.discardActiveObject()
    canvas.requestRenderAll() // Emit event to check node canvases if child has active object
    emit('removeBgFromNodes')
  } else if (activeObj) {
    let objectsToProcess =
      activeObj.type === 'activeSelection' ? activeObj.getObjects() : [activeObj]
    for (const obj of objectsToProcess) {
      // 1. Export object as base64 (you may want to export just that object)
      const base64Url = obj.toDataURL({
        format: 'png',
        multiplier: 2,
      })

      // 2. Call your bg removal API
      const newBase64Url = await generationStore.removeBg(base64Url)
      canvas.remove(obj)
      // 3. Create new Fabric.Image from processed base64
      loadImgFromUrl(newBase64Url, obj.idInUpload, obj.left, obj.top)
    }
  }
}

const forwardOneLayer = () => {
  const activeObject = canvas.getActiveObject()
  if (props.childActiveSelected) {
    // Emit event to check node canvases if no active object on main canvas
    emit('forwardLayerFromNodes')
  } else if (activeObject) {
    canvas.bringObjectForward(activeObject, true)
    canvas.renderAll()
  }
}
const backwardOneLayer = () => {
  const activeObject = canvas.getActiveObject()
  if (props.childActiveSelected) {
    // Emit event to check node canvases if no active object on main canvas
    emit('backwardLayerFromNodes')
  } else if (activeObject) {
    canvas.sendObjectToBack(activeObject, true)
    canvas.renderAll()
  }
}

const exportBranchTags = () => {
  emit('exportBranchTags')
}

const deleteSelectedObjects = () => {
  const activeObjects = canvas.getActiveObjects()
  if (activeObjects.length > 0) {
    activeObjects.forEach((obj) => canvas.remove(obj))
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    return true // Objects were deleted
  }
  return false // No objects were deleted
}

function resizeFabric(newW, newH) {
  canvas.setDimensions({ width: newW, height: newH })

  canvas.getElement().style.width = newW + 'px'
  canvas.getElement().style.height = newH + 'px'

  canvas.renderAll()
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
  if (prevLassoHoverOverlay || prevLassoPaths.length === 0) return

  let combinedPathStr = ''
  prevLassoPaths.forEach((path) => {
    if (path.path) {
      const pathStr = path.path.map((cmd) => cmd.join(' ')).join(' ')
      combinedPathStr += pathStr + ' '
    }
  })

  if (combinedPathStr) {
    prevLassoHoverOverlay = new fabric.Path(combinedPathStr.trim(), {
      stroke: 'transparent',
      strokeWidth: 0,
      fill: 'rgba(0, 0, 0, 0.3)', // Darker overlay
      selectable: false,
      evented: false,
      absolutePositioned: false,
    })
    canvas.add(prevLassoHoverOverlay)
    canvas.bringObjectToFront(prevLassoHoverOverlay)
    canvas.requestRenderAll()
  }
}

// Remove hover overlay
function removeHoverOverlay() {
  if (prevLassoHoverOverlay) {
    canvas.remove(prevLassoHoverOverlay)
    prevLassoHoverOverlay = null
    canvas.requestRenderAll()
  }
}

// Function to extract image area within lasso paths
function extractLassoArea(lassoPath) {
  if (!lassoPath) return null

  // Get bounding rect of the lasso path
  const bounds = lassoPath.getBoundingRect()

  // Temporarily remove the lasso path to get clean image
  canvas.remove(lassoPath)
  canvas.renderAll()

  // Extract the area as image data (bounds are world coordinates)
  const imageData = withoutViewport(() =>
    canvas.toDataURL({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      format: 'png',
      multiplier: 1,
    }),
  )

  // Re-add the lasso path
  canvas.add(lassoPath)
  canvas.renderAll()

  return {
    imageData: imageData,
    bounds: bounds,
    lassoPath: lassoPath,
  }
}

onMounted(() => {
  // Initialize Fabric Canvas with markRaw to avoid Vue reactivity overhead
  canvas = markRaw(
    new fabric.Canvas($('freeCanvas'), {
      isDrawingMode: false,
      width: window.innerWidth,
      height: window.innerHeight,
      hoverCursor: 'pointer',
      selection: true,
      targetFindTolerance: 2,
      preserveObjectStacking: true,
      containerClass: 'free-canvas-container',
    }),
  )
  syncViewport()
  registerFreeCanvasBounds(sceneBounds)
  window.addEventListener('resize', fitCanvasToWindow)
  canvas.on('mouse:down', function (opt) {
    if (lassoStart === true) {
      // Check if clicking on existing lasso area
      if (prevLassoPaths.length !== 0) {
        const isInPrevLasso = isPointInPrevLasso(opt.scenePoint.x, opt.scenePoint.y)

        if (isInPrevLasso) {
          // Start drag-to-cut operation
          removeHoverOverlay()

          // Find the specific lasso path that contains this point
          let targetLassoPath = null
          for (const path of prevLassoPaths) {
            if (path && path.containsPoint) {
              const point = new fabric.Point(opt.scenePoint.x, opt.scenePoint.y)
              if (path.containsPoint(point)) {
                targetLassoPath = path
                break
              }
            }
          }

          if (targetLassoPath) {
            // Extract the lassoed area
            cutoutImage = extractLassoArea(targetLassoPath)
            isDraggingCutout.value = true

            // Remove the lasso path from canvas and arrays
            canvas.remove(targetLassoPath)
            prevLassoPaths = prevLassoPaths.filter((p) => p !== targetLassoPath)

            // Store cutout data for dragging to properties
            objectStore.obj = {
              type: 'image-cutout',
              src: cutoutImage.imageData,
              left: cutoutImage.bounds.left,
              top: cutoutImage.bounds.top,
              width: cutoutImage.bounds.width,
              height: cutoutImage.bounds.height,
            }

            // Show tooltip with cutout preview
            // Get the canvas element position for proper tooltip positioning
            cutoutTooltip.value = {
              visible: true,
              x: opt.e.clientX + 10,
              y: opt.e.clientY - 10,
              imageData: cutoutImage.imageData,
            }
            console.log('Tooltip set:', cutoutTooltip.value)

            console.log('im dragging this cutout', cutoutImage.imageData)
            objectStore.dragState = 'startDragging'
          }
          return
        }
      }

      canvas.forEachObject((obj) => {
        obj.selectable = false
      })
      canvas.selection = false
      isLasso = true
      // copy: Fabric reuses the point object for later events
      startPointer = { x: opt.viewportPoint.x, y: opt.viewportPoint.y }
      lassoMaxDistance = 0
      points = [`M ${opt.scenePoint.x} ${opt.scenePoint.y}`] // Start path (world coords)
    }
  })

  canvas.on('mouse:move', function (opt) {
    // Update cutout tooltip position during drag
    if (isDraggingCutout.value && cutoutTooltip.value.visible) {
      cutoutTooltip.value.x = opt.e.clientX + 10
      cutoutTooltip.value.y = opt.e.clientY - 10
    }

    // Handle hover detection for existing lasso paths
    if (!isLasso && lassoStart && prevLassoPaths.length > 0) {
      const isInPrevLasso = isPointInPrevLasso(opt.scenePoint.x, opt.scenePoint.y)

      if (isInPrevLasso && !isHoveringPrevLasso) {
        isHoveringPrevLasso = true
        createHoverOverlay()
      } else if (!isInPrevLasso && isHoveringPrevLasso) {
        isHoveringPrevLasso = false
        removeHoverOverlay()
      }
    }

    if (!isLasso || !lassoStart) return
    lassoMaxDistance = Math.max(
      lassoMaxDistance,
      Math.hypot(opt.viewportPoint.x - startPointer.x, opt.viewportPoint.y - startPointer.y),
    )
    points.push(`L ${opt.scenePoint.x} ${opt.scenePoint.y}`) // Draw smooth lines

    if (path) canvas.remove(path)

    const pathStr = points.join(' ') + ' Z' // Close the path
    path = new fabric.Path(pathStr, {
      stroke: 'black',
      strokeWidth: 1,
      fill: 'rgba(0, 0, 0, 0.1)',
      selectable: false,
      evented: false,
      strokeDashArray: [5, 5],
    })

    canvas.add(path)
    canvas.requestRenderAll()
  })

  canvas.on('mouse:up', async function () {
    if (!isLasso) return

    isLasso = false
    // a click vs. a drawn lasso: judge by how far the mouse travelled, not where it ended,
    // because a closed lasso ends right next to where it started
    const moved = lassoMaxDistance > 5

    if (!moved) {
      // Single click without drawing - clear ALL existing lassos
      if (path) canvas.remove(path)
      path = null
      points = []

      // Clear all existing lasso selections
      prevLassoPaths.forEach((lassoPath) => {
        if (lassoPath && canvas.getObjects().includes(lassoPath)) {
          canvas.remove(lassoPath)
        }
      })
      prevLassoPaths = []
      lassoPaths = []
      removeHoverOverlay()
      isHoveringPrevLasso = false

      canvas.requestRenderAll()
      return
    }

    if (path) {
      // Convert current drawing path to completed path
      const completedPath = new fabric.Path(points.join(' ') + ' Z', {
        stroke: 'black',
        strokeWidth: 1,
        fill: 'rgba(0, 0, 0, 0.1)',
        selectable: false,
        evented: false,
        strokeDashArray: [5, 5],
      })

      // Remove the temporary drawing path
      canvas.remove(path)

      // Add the completed path
      canvas.add(completedPath)
      lassoPaths.push(completedPath)

      // Clear previous lassos and set only the current one (disable multiple selection)
      prevLassoPaths.forEach((lassoPath) => {
        if (lassoPath && canvas.getObjects().includes(lassoPath)) {
          canvas.remove(lassoPath)
        }
      })
      prevLassoPaths = [...lassoPaths]
      console.log('Set single lasso selection on FreeCanvas')

      path = null
      points = []
      lassoPaths = [] // Reset for next drawing operation
      canvas.requestRenderAll()
    }
  })

  fabric.Object.prototype.transparentCorners = false

  canvas.on({
    'object:moving': function (e) {
      allUtilStore.isLassoMode = false
      e.target.opacity = 0.5
    },
    'object:modified': function (e) {
      e.target.opacity = 1
    },
    'mouse:up': function () {
      // Hide cutout tooltip when drag ends
      if (isDraggingCutout.value) {
        cutoutTooltip.value.visible = false
        isDraggingCutout.value = false
        cutoutImage = null
      }

      objectStore.dragState = 'finishedDragging' // not dropping to anywhere meaningful. may rewrite later to avoid other conditions...
      objectStore.obj = {}
    },
    'mouse:down': function (e) {
      // start dragging
      if (e.target && 'idInUpload' in e.target && !allUtilStore.isLassoMode) {
        //meaning the object being dragged is an image on free canvas
        objectStore.id = e.target.idInUpload
        objectStore.obj = e.target.toObject()
        objectStore.obj.type = 'image'
        objectStore.dragState = 'startDragging'
      }
    },
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', fitCanvasToWindow)
  registerFreeCanvasBounds(() => null)
  // Clean up hover overlay and reset state
  removeHoverOverlay()
  isHoveringPrevLasso = false
  prevLassoPaths = []
  lassoPaths = []
  isDraggingCutout.value = false
  cutoutImage = null
  cutoutTooltip.value.visible = false
})

defineExpose({
  deleteSelectedObjects,
})
</script>

<style>
html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
}

/* the free canvas fills the window; the camera pans/zooms its contents */
.free-canvas-container {
  position: fixed !important;
  top: 0;
  left: 0;
}

/* Space held: ready to pan; dragging: panning */
body.canvas-pan-ready,
body.canvas-pan-ready * {
  cursor: grab !important;
}
body.canvas-panning,
body.canvas-panning * {
  cursor: grabbing !important;
  user-select: none;
}

.cutout-tooltip {
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 4px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  max-width: 200px;
  max-height: 200px;
}

.cutout-tooltip img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 2px;
  display: block;
}
</style>
