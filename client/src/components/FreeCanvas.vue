<template>
  <canvas id="freeCanvas"></canvas>
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
  <div class="drawing-mode-options border border-black rounded-1 p-1">
    <div class="collapse" id="collapseExample">
      <ColorPicker></ColorPicker>
    </div>
    <button class="btn btn-sm btn-light m-1" @click="addBranchNodeAlt">+</button>

    <button class="btn btn-sm btn-light m-1" @click="triggerFileSelect">
      <ImageUp color="black" :size="15" />
    </button>
    <input
      type="file"
      ref="fileInput"
      multiple
      accept="image/*"
      @change="uploadFiles"
      style="display: none"
    />
    <VisualTool
      @removeBg="removeBg"
      @forwardLayer="forwardOneLayer"
      @backwardLayer="backwardOneLayer"
    ></VisualTool>

    <!--      <button id="drawing-mode" class="btn btn-light">Enter drawing mode</button>-->
    <!--      <button id="clear-canvas" class="btn btn-light">Clear</button>-->

    <!--      <label for="drawing-mode-selector">-->
    <!--        Mode:-->
    <!--        <select id="drawing-mode-selector">-->
    <!--          <option>Pencil</option>-->
    <!--          <option>hline</option>-->
    <!--          <option>vline</option>-->
    <!--          <option>diamond</option>-->
    <!--          <option>dotted</option>-->
    <!--        </select>-->
    <!--      </label>-->

    <!--      <label for="drawing-line-width">-->
    <!--        Line width:-->
    <!--        <span class="info">30</span>-->
    <!--        <input type="range" min="0" max="150" id="drawing-line-width" />-->
    <!--      </label>-->

    <!--      <label for="drawing-color">-->
    <!--        Line color:-->
    <!--        <input type="color" id="drawing-color" />-->
    <!--      </label>-->

    <!--      <label for="drawing-shadow-color">-->
    <!--        Shadow color:-->
    <!--        <input type="color" id="drawing-shadow-color" />-->
    <!--      </label>-->

    <!--      <label for="drawing-shadow-width">-->
    <!--        Shadow width:-->
    <!--        <span class="info">0</span>-->
    <!--        <input type="range" value="0" min="0" max="50" id="drawing-shadow-width" />-->
    <!--      </label>-->

    <!--      <label for="drawing-shadow-offset">-->
    <!--        Shadow offset:-->
    <!--        <span class="info">0</span>-->
    <!--        <input type="range" value="0" min="0" max="50" id="drawing-shadow-offset" />-->
    <!--      </label>-->
  </div>
</template>

<script setup>
import { onMounted, markRaw, ref, watch, onBeforeUnmount } from 'vue'
import * as fabric from 'fabric'
import { useNode } from '@/stores/nodeStore.js'
import { useObject } from '@/stores/objectStore.js'
import { useLayout } from '@/stores/layoutStore'

import VisualTool from '@/components/VisualTool.vue'
import { useGeneration } from '@/stores/generationStore.js'
import { ImageUp, Lasso, SprayCan, Check } from 'lucide-vue-next'
import { useAllUtil } from '@/stores/allUtilStore.js'
import ColorPicker from '@/components/colorPicker.vue'
let canvas = null
const objectStore = useObject()
const allUtilStore = useAllUtil()
const generationStore = useGeneration()
const nodeStore = useNode()
const layoutStore = useLayout()
const $ = (id) => document.getElementById(id)
let isLasso = false
let points = []
let path = null
let lassoStart = false
let startPointer = null
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
function syncCanvasToLayout() {
  if (!canvas) return
  canvas.setWidth(layoutStore.width)
  canvas.setHeight(layoutStore.height)
  canvas.renderAll()
}

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
  () => allUtilStore.brush,
  (brush) => {
    if (canvas) {
      canvas.freeDrawingBrush.color = brush.color
      canvas.freeDrawingBrush.width = brush.width
    }
  },
  { deep: true },
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
watch(
  () => allUtilStore.isColorPen,
  (newVal) => {
    canvas.isDrawingMode = newVal
    canvas.forEachObject((obj) => {
      obj.selectable = !newVal
    })
    canvas.discardActiveObject()
    canvas.selection = !newVal
  },
)

watch(
  () => [nodeStore.nodeXR, nodeStore.nodeYB],
  ([nodeXR, nodeYB]) => {
    if (nodeXR > canvas.width || nodeYB > canvas.height) {
      nodeStore.nodeXR = Math.max(canvas.width, nodeXR)
      nodeStore.nodeYB = Math.max(canvas.height, nodeYB)

      resizeFabric(nodeStore.nodeXR, nodeStore.nodeYB)
    }
  },
)

const files = ref([])
const triggerFileSelect = () => {
  fileInput.value.click()
}

const fileInput = ref(null)
const updateDrawingModeButtonText = async () => {
  $('drawing-mode').textContent = canvas.isDrawingMode
    ? 'Cancel drawing mode'
    : 'Enter drawing mode'
}

const uploadFiles = async (event) => {
  files.value = Array.from(event.target.files)
  if (!files.value.length) {
    alert('Please select at least one file')
    return
  }

  for (const file of files.value) {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('http://localhost:5555/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (response.ok) {
        loadImgFromUrl(data.filepath, data.id)
      } else {
        console.error(`Failed to upload ${file.name}: ${data.error}`)
      }
    } catch (err) {
      console.error('Upload error:', err)
    }
  }
}

const loadImgFromUrl = (url, id, x = 0, y = 0) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  img.onload = () => {
    try {
      const fabricImage = new fabric.Image(img, {
        left: x,
        top: y,
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
  if (!activeObj) {
    console.warn('No active object selected.')
    return // Or handle this case as needed
  }

  let objectsToProcess = activeObj.type === 'activeSelection' ? activeObj.getObjects() : [activeObj]
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
const addBranchNodeAlt = () => {
  // it opens a new node and add a new alt
  nodeStore.addNodeBranch()
  nodeStore.addNode(nodeStore.currentBranchId)
  nodeStore.addAlt(
    [],
    nodeStore.currentBranchId,
    nodeStore.currentNodeId,
    0,
    nodeStore.currentNodeId,
  )
}

const forwardOneLayer = () => {
  const activeObject = canvas.getActiveObject()
  if (activeObject) {
    canvas.bringObjectForward(activeObject, true)
    canvas.renderAll()
  }
}
const backwardOneLayer = () => {
  const activeObject = canvas.getActiveObject()
  if (activeObject) {
    canvas.sendObjectToBack(activeObject, true)
    canvas.renderAll()
  }
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

  // Extract the area as image data
  const imageData = canvas.toDataURL({
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
    format: 'png',
    multiplier: 1,
  })

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
    }),
  )
  // measureWrapper()
  // syncCanvasToLayout()
  //
  // /* watch: when store width/height change (ensureFits) -> grow bitmap */
  // watch(() => [layoutStore.width, layoutStore.height], syncCanvasToLayout)

  /* ResizeObserver: when wrapper grows (window resize, flex, etc.)  */
  // const ro = new ResizeObserver(measureWrapper)
  // ro.observe(wrapper.value)
  //
  // window.addEventListener('resize', measureWrapper)
  //
  // onBeforeUnmount(() => {
  //   ro.disconnect()
  //   window.removeEventListener('resize', measureWrapper)
  // })
  canvas.on('mouse:down', function (opt) {
    if (lassoStart === true) {
      // Check if clicking on existing lasso area
      if (prevLassoPaths.length !== 0) {
        const isInPrevLasso = isPointInPrevLasso(opt.pointer.x, opt.pointer.y)

        if (isInPrevLasso) {
          // Start drag-to-cut operation
          removeHoverOverlay()

          // Find the specific lasso path that contains this point
          let targetLassoPath = null
          for (const path of prevLassoPaths) {
            if (path && path.containsPoint) {
              const point = new fabric.Point(opt.pointer.x, opt.pointer.y)
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
            const canvasRect = canvas.getElement().getBoundingClientRect()
            cutoutTooltip.value = {
              visible: true,
              x: canvasRect.left + opt.pointer.x + 10,
              y: canvasRect.top + opt.pointer.y - 10,
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
      startPointer = opt.pointer
      points = [`M ${opt.pointer.x} ${opt.pointer.y}`] // Start path
    }
  })

  canvas.on('mouse:move', function (opt) {
    // Update cutout tooltip position during drag
    if (isDraggingCutout.value && cutoutTooltip.value.visible) {
      const canvasRect = canvas.getElement().getBoundingClientRect()
      cutoutTooltip.value.x = canvasRect.left + opt.pointer.x + 10
      cutoutTooltip.value.y = canvasRect.top + opt.pointer.y - 10
    }

    // Handle hover detection for existing lasso paths
    if (!isLasso && lassoStart && prevLassoPaths.length > 0) {
      const isInPrevLasso = isPointInPrevLasso(opt.pointer.x, opt.pointer.y)

      if (isInPrevLasso && !isHoveringPrevLasso) {
        isHoveringPrevLasso = true
        createHoverOverlay()
      } else if (!isInPrevLasso && isHoveringPrevLasso) {
        isHoveringPrevLasso = false
        removeHoverOverlay()
      }
    }

    if (!isLasso || !lassoStart) return
    points.push(`L ${opt.pointer.x} ${opt.pointer.y}`) // Draw smooth lines

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

  canvas.on('mouse:up', async function (opt) {
    if (!isLasso) return

    isLasso = false
    const dx = opt.pointer.x - startPointer.x
    const dy = opt.pointer.y - startPointer.y
    const moved = Math.sqrt(dx * dx + dy * dy) > 5 // threshold for "movement"

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

  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
  canvas.freeDrawingBrush.width = allUtilStore.brush.width
  canvas.freeDrawingBrush.color = allUtilStore.brush.color
  fabric.Object.prototype.transparentCorners = false

  const elements = {
    drawingMode: $('drawing-mode'),
    clear: $('clear-canvas'),
    color: $('drawing-color'),
    shadowColor: $('drawing-shadow-color'),
    lineWidth: $('drawing-line-width'),
    shadowWidth: $('drawing-shadow-width'),
    shadowOffset: $('drawing-shadow-offset'),
    brushSelector: $('drawing-mode-selector'),
  }

  // Initialize Brushes
  const brushes = {
    pencil: new fabric.PencilBrush(canvas),
    // Pattern Brushes
    hline: new fabric.PatternBrush(canvas),
    vline: new fabric.PatternBrush(canvas),
    diamond: new fabric.PatternBrush(canvas),
    dotted: new fabric.PatternBrush(canvas),
  }

  // Configure Pattern Brushes (same as before)
  brushes.hline.getPatternSrc = function () {
    const patternCanvas = document.createElement('canvas')
    patternCanvas.width = 10
    patternCanvas.height = 10
    const ctx = patternCanvas.getContext('2d')

    ctx.strokeStyle = this.color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 5)
    ctx.lineTo(10, 5)
    ctx.stroke()

    return patternCanvas
  }

  canvas.on({
    'object:moving': function (e) {
      e.target.opacity = 0.5
    },
    'object:modified': function (e) {
      e.target.opacity = 1
    },
    'mouse:up': function (e) {
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
  brushes.vline.getPatternSrc = function () {
    const patternCanvas = document.createElement('canvas')
    patternCanvas.width = 10
    patternCanvas.height = 10
    const ctx = patternCanvas.getContext('2d')

    ctx.strokeStyle = this.color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(5, 0)
    ctx.lineTo(5, 10)
    ctx.stroke()

    return patternCanvas
  }

  brushes.diamond.getPatternSrc = function () {
    const c = new fabric.StaticCanvas()
    c.setDimensions({ width: 15, height: 15 })
    const rect = new fabric.Rect({
      width: 10,
      height: 10,
      angle: 45,
      fill: this.color,
      originX: 'center',
      originY: 'center',
      left: 7.5,
      top: 7.5,
    })
    c.add(rect)
    return c.getElement()
  }
  // Brush Update Function
  // const updateBrush = () => {
  //   const brush = canvas.freeDrawingBrush
  //   if (!brush) return
  //
  //   brush.color = elements.color.value
  //   brush.width = parseInt(elements.lineWidth.value) || 1
  //
  //   if ('shadow' in brush) {
  //     brush.shadow = new fabric.Shadow({
  //       blur: parseInt(elements.shadowWidth.value) || 0,
  //       color: elements.shadowColor.value,
  //       offsetX: parseInt(elements.shadowOffset.value) || 0,
  //       offsetY: parseInt(elements.shadowOffset.value) || 0,
  //       affectStroke: true,
  //     })
  //   }
  // }
  //
  // // Event Handlers
  // elements.brushSelector.onchange = function () {
  //   const brushName = this.value
  //
  //   if (brushName === 'Pencil') {
  //     // Always create a new PencilBrush instance when switching to pencil
  //     canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
  //   } else {
  //     canvas.freeDrawingBrush = brushes[brushName]
  //
  //     if (['hline', 'vline', 'diamond', 'dotted'].includes(brushName)) {
  //       const brush = canvas.freeDrawingBrush
  //       if (brush.getPatternSrc) {
  //         brush.source = brush.getPatternSrc.call(brush)
  //       }
  //     }
  //   }
  //
  //   updateBrush()
  // }
  //
  // elements.color.onchange = updateBrush
  // elements.shadowColor.onchange = updateBrush
  // elements.lineWidth.onchange = function () {
  //   this.previousElementSibling.textContent = this.value
  //   updateBrush()
  // }
  // elements.shadowWidth.onchange = function () {
  //   this.previousElementSibling.textContent = this.value
  //   updateBrush()
  // }
  // elements.shadowOffset.onchange = function () {
  //   this.previousElementSibling.textContent = this.value
  //   updateBrush()
  // }
  //
  // // Other Controls
  // elements.clear.onclick = () => canvas.clear()
  //
  // elements.drawingMode.onclick = () => {
  //   canvas.isDrawingMode = !canvas.isDrawingMode
  //   updateDrawingModeButtonText()
  // }
  //
  // // Initial brush update
  // updateBrush()
})

onBeforeUnmount(() => {
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
