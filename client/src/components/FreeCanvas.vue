<template>
  <canvas id="freeCanvas"></canvas>
  <div class="drawing-mode-options border border-black rounded-1 p-1">
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
    <VisualTool @forwardLayer="forwardOneLayer" @backwardLayer="backwardOneLayer"></VisualTool>

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
import { useObject } from '@/stores/objectStore.js'
import { useNode } from '@/stores/nodeStore.js'
import { useLayout } from '@/stores/layoutStore'

import VisualTool from '@/components/VisualTool.vue'
import { useGeneration } from '@/stores/generationStore.js'
import { ImageUp, Lasso } from 'lucide-vue-next'
import { useAllUtil } from '@/stores/allUtilStore.js'
const generationStore = useGeneration()
const { generatePromise, setGeneratePromise } = useGeneration()
let canvas = null
const objectStore = useObject()
const allUtilStore = useAllUtil()
const nodeStore = useNode()
const layoutStore = useLayout()
const wrapper = ref(null)
const $ = (id) => document.getElementById(id)
let isLasso = false
let points = []
let path = null
let lassoStart = false
let startPointer = null
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
      }
    }
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

const loadImgFromUrl = (url, id) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  img.onload = () => {
    try {
      const fabricImage = new fabric.Image(img, {
        selectable: true,
        hasControls: true,
        perPixelTargetFind: true,
        hasBorders: false,
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

const addBranchNodeAlt = () => {
  // it opens a new node and add a new alt
  nodeStore.addNodeBranch()
  nodeStore.addNode(nodeStore.currentBranchId)
  nodeStore.addAlt({}, nodeStore.currentBranchId, nodeStore.currentNodeId, 0)
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

function resizeFabric(newW, newH) {
  canvas.setDimensions({ width: newW, height: newH })

  canvas.getElement().style.width = newW + 'px'
  canvas.getElement().style.height = newH + 'px'

  canvas.renderAll()
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
      if (path) canvas.remove(path)
      path = null
      points = []
      canvas.requestRenderAll()
      return
    }

    if (path) {
      path.setCoords()
      const bounds = path.getBoundingRect()
      canvas.remove(path)
      // Render first to make sure everything is drawn
      canvas.renderAll()
      canvas.add(path)
      // Extract just the area covered by the path + content inside it
      const dataUrl = canvas.toDataURL({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        format: 'png',
        multiplier: 1, // can set to 2 for higher resolution
      })
    }
  })

  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
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
      objectStore.dragState = 'finishedDragging' // not dropping to anywhere meaningful. may rewrite later to avoid other conditions...
      objectStore.obj = {}
    },
    'mouse:down': function (e) {
      // start dragging
      if (e.target && 'idInUpload' in e.target) {
        //meaning the object being dragged is an image on free canvas
        objectStore.id = e.target.idInUpload
        objectStore.obj = e.target.toObject()
        objectStore.obj.type = 'image'
        objectStore.dragState = 'startDragging'
      }

      const activeObjects = canvas.getActiveObjects() // Gets current multi-selection
      const activeObject = canvas.getActiveObject()
      const targetSize = 512

      // if (activeObjects.length > 0) {
      //   const bounds = activeObject.getBoundingRect(true) // `true` includes stroke
      //   const scale = targetSize / Math.max(bounds.width, bounds.height)
      //   // Multi-selection exists (Shift/Cmd + Click)
      //   objectStore.dragObjects = activeObjects.map((obj) => ({
      //     id: obj.idInUpload,
      //     fabricObj: obj, // Reference to the Fabric object
      //     originalPos: { ...obj.oCoords }, // Save initial position
      //     left: (obj.oCoords.tl.x - bounds.left) * scale,
      //     top: (obj.oCoords.tl.y - bounds.top) * scale,
      //     scaleX: (obj.scaleX ?? 1) * scale,
      //     scaleY: (obj.scaleY ?? 1) * scale,
      //   }))
      // } else if (e.target) {
      //   // Single object selected
      //   objectStore.dragObjects = [
      //     {
      //       id: e.target.idInUpload,
      //       fabricObj: e.target,
      //       originalPos: { ...e.target.oCoords },
      //     },
      //   ]
      // } else {
      //   // Clicked on empty space → clear selection
      //   objectStore.dragObjects = []
      // }
      // console.log(objectStore.dragObjects)
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
</script>

<style>
html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
}
</style>
