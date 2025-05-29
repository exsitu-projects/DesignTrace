<template>
  <canvas id="freeCanvas"></canvas>
  <div class="drawing-mode-options border border-black">
    <button class="btn btn-info" @click="triggerFileSelect">Upload Image</button>
    <input
      type="file"
      ref="fileInput"
      multiple
      accept="image/*"
      @change="uploadFiles"
      style="display: none"
    />
    <button id="drawing-mode" class="btn btn-info">Enter drawing mode</button>
    <button id="clear-canvas" class="btn btn-info">Clear</button>

    <label for="drawing-mode-selector">
      Mode:
      <select id="drawing-mode-selector">
        <option>Pencil</option>
        <option>hline</option>
        <option>vline</option>
        <option>diamond</option>
        <option>dotted</option>
      </select>
    </label>

    <label for="drawing-line-width">
      Line width:
      <span class="info">30</span>
      <input type="range" min="0" max="150" id="drawing-line-width" />
    </label>

    <label for="drawing-color">
      Line color:
      <input type="color" id="drawing-color" />
    </label>

    <label for="drawing-shadow-color">
      Shadow color:
      <input type="color" id="drawing-shadow-color" />
    </label>

    <label for="drawing-shadow-width">
      Shadow width:
      <span class="info">0</span>
      <input type="range" value="0" min="0" max="50" id="drawing-shadow-width" />
    </label>

    <label for="drawing-shadow-offset">
      Shadow offset:
      <span class="info">0</span>
      <input type="range" value="0" min="0" max="50" id="drawing-shadow-offset" />
    </label>
  </div>
</template>

<script setup>
import { onMounted, markRaw, ref, watch } from 'vue'
import * as fabric from 'fabric'
import { useLayers } from '@/stores/layersStore.js'
let canvas = null
const layersStore = useLayers()
const $ = (id) => document.getElementById(id)

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

onMounted(() => {
  // Initialize Fabric Canvas with markRaw to avoid Vue reactivity overhead
  canvas = markRaw(
    new fabric.Canvas($('freeCanvas'), {
      isDrawingMode: false,
      width: window.innerWidth,
      height: window.innerHeight,
      hoverCursor: 'pointer',
      selection: false,
      targetFindTolerance: 2,
    }),
  )

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

  // canvas.on('mouse:down', (opt) => {
  //   const event = new CustomEvent('fabric-object-dragged', {
  //     detail: opt.target.toObject(),
  //   })
  //   if (opt.target) {
  //     window.dispatchEvent(event)
  //     console.log('i have ')
  //     layersStore.sharedDragData.draggedObject = opt.target.toObject() // clone as JSON
  //   }
  // })

  canvas.on({
    'object:moving': function (e) {
      e.target.opacity = 0.5
    },
    'object:modified': function (e) {
      e.target.opacity = 1
    },
    'mouse:down': function (e) {
      if (e.target && !layersStore.sharedDragData.dragged) {
        layersStore.sharedDragData.obj = e.target.toObject()
        layersStore.sharedDragData.dragged = true
        console.log('layersStore.sharedDragData:', layersStore.sharedDragData.obj)
      } else {
        console.log('Clicked on empty canvas area')
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

  const textureImg = new Image()
  textureImg.src = '../../assets/ladybug.png'
  brushes.dotted.source = textureImg

  // Brush Update Function
  const updateBrush = () => {
    const brush = canvas.freeDrawingBrush
    if (!brush) return

    brush.color = elements.color.value
    brush.width = parseInt(elements.lineWidth.value) || 1

    if ('shadow' in brush) {
      brush.shadow = new fabric.Shadow({
        blur: parseInt(elements.shadowWidth.value) || 0,
        color: elements.shadowColor.value,
        offsetX: parseInt(elements.shadowOffset.value) || 0,
        offsetY: parseInt(elements.shadowOffset.value) || 0,
        affectStroke: true,
      })
    }
  }

  // Event Handlers
  elements.brushSelector.onchange = function () {
    const brushName = this.value

    if (brushName === 'Pencil') {
      // Always create a new PencilBrush instance when switching to pencil
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
    } else {
      canvas.freeDrawingBrush = brushes[brushName]

      if (['hline', 'vline', 'diamond', 'dotted'].includes(brushName)) {
        const brush = canvas.freeDrawingBrush
        if (brush.getPatternSrc) {
          brush.source = brush.getPatternSrc.call(brush)
        }
      }
    }

    updateBrush()
  }

  elements.color.onchange = updateBrush
  elements.shadowColor.onchange = updateBrush
  elements.lineWidth.onchange = function () {
    this.previousElementSibling.textContent = this.value
    updateBrush()
  }
  elements.shadowWidth.onchange = function () {
    this.previousElementSibling.textContent = this.value
    updateBrush()
  }
  elements.shadowOffset.onchange = function () {
    this.previousElementSibling.textContent = this.value
    updateBrush()
  }

  // Other Controls
  elements.clear.onclick = () => canvas.clear()

  elements.drawingMode.onclick = () => {
    canvas.isDrawingMode = !canvas.isDrawingMode
    updateDrawingModeButtonText()
  }

  // Initial brush update
  updateBrush()
})
</script>

<style>
html,
body {
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  height: 100%;
  width: 100%;
}

canvas {
  display: block; /* removes scrollbar from inline-block spacing */
  width: 100vw;
  height: 100vh;
}
</style>
