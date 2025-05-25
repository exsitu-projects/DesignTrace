<template>
  <canvas class="border border-black" id="freeCanvas" width="512" height="512"></canvas>
  <div id="drawing-mode-options">
    <button id="drawing-mode" class="btn btn-info">Cancel drawing mode</button>
    <button id="clear-canvas" class="btn btn-info">Clear</button>
    <textarea
      v-model="layerPrompt"
      placeholder="Describe what you want to generate..."
      rows="3"
    ></textarea>
    <button class="generate-button btn btn-dark" @click="generateLayer">Generate Layer</button>
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
import { onMounted, ref } from 'vue'
import * as fabric from 'fabric'
import { useLayers } from '@/stores/layersStore.js'
const layerPrompt = ref('')

const layersStore = useLayers()
const $ = (id) => document.getElementById(id)
let canvas = ref(null)
const renderNewLayer = (layer) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = layer.url

  img.onload = () => {
    try {
      const fabricImage = new fabric.Image(img, {
        left: layer.left,
        top: layer.top,
        selectable: layer.selectable,
        hasControls: layer.hasControls,
      })
      // fabricImage.scaleToWidth(250)
      canvas.value.isDrawingMode = false
      canvas.value.add(fabricImage)
      canvas.value.requestRenderAll()
      canvas.value.setActiveObject(fabricImage)
    } catch (error) {
      console.error('Failed to add image to canvas:', error)
    }
  }

  img.onerror = () => {
    console.error('Failed to load image:', layer.url)
  }
}

const generateLayer = async () => {
  try {
    const response = await fetch('http://localhost:53578/api/generatelayer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: layerPrompt.value,
        img_id: 42,
      }),
    })

    const result = await response.json()
    const imageUrl = result.images_base64

    const newLayer = {
      id: Date.now(),
      url: imageUrl,
      left: 100,
      top: 100,
      selectable: true,
      hasControls: true,
    }

    layersStore.addLayer(newLayer)
    renderNewLayer(newLayer)
  } catch (error) {
    console.error('Error generating image:', error)
    alert('Image generation failed. Please try again.')
  }
}
onMounted(() => {
  // 1. Initialize Fabric Canvas
  canvas.value = new fabric.Canvas($('freeCanvas'), {
    isDrawingMode: true,
  })

  // 2. Set Default Brush
  canvas.value.freeDrawingBrush = new fabric.PencilBrush(canvas.value)
  fabric.Object.prototype.transparentCorners = false

  // 3. Get DOM Elements
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

  // 4. Initialize All Brush Types
  const brushes = {
    pencil: new fabric.PencilBrush(canvas.value),

    // Pattern Brushes
    hline: new fabric.PatternBrush(canvas.value),
    vline: new fabric.PatternBrush(canvas.value),
    diamond: new fabric.PatternBrush(canvas.value),
    dotted: new fabric.PatternBrush(canvas.value),
  }

  // 5. Configure Pattern Brushes
  // Horizontal Line Pattern
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

  // Vertical Line Pattern
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

  // Diamond Pattern
  brushes.diamond.getPatternSrc = function () {
    const canvas = new fabric.StaticCanvas()
    canvas.setDimensions({ width: 15, height: 15 })
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
    canvas.add(rect)
    return canvas.getElement()
  }

  // Texture Pattern
  const textureImg = new Image()
  textureImg.src = '../../assets/ladybug.png'
  brushes.dotted.source = textureImg

  // 6. Brush Update Function
  const updateBrush = () => {
    const brush = canvas.value?.freeDrawingBrush
    if (!brush) return

    // Common properties
    brush.color = elements.color.value
    brush.width = parseInt(elements.lineWidth.value) || 1

    // Only apply shadow if supported
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

  // 7. Event Handlers
  elements.brushSelector.onchange = function () {
    const brushName = this.value
    canvas.value.freeDrawingBrush = brushes[brushName]

    // Force re-generation of pattern source (important!)
    if (['hline', 'vline', 'diamond', 'dotted'].includes(brushName)) {
      const brush = canvas.value.freeDrawingBrush
      if (brush.getPatternSrc) {
        brush.source = brush.getPatternSrc.call(brush)
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

  // 8. Other Controls
  elements.clear.onclick = () => canvas.value.clear()
  elements.drawingMode.onclick = () => {
    canvas.value.isDrawingMode = !canvas.value.isDrawingMode
    elements.drawingMode.textContent = canvas.value.isDrawingMode
      ? 'Cancel drawing mode'
      : 'Enter drawing mode'
  }

  // 9. Initial Update
  updateBrush()
})
</script>

<style scoped></style>
