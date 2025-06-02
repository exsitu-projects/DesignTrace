<template>
  <div class="col-6">
    <!--testing groundingdino only, the path is relative to the server-->
    <button
      @click="detectObject('..\\static\\images\\fruit.jpg', 'orange. banana.')"
      class="btn btn-primary"
    >
      Detect Object
    </button>
    <canvas class="border border-black" id="visualEditor" width="512" height="512"></canvas>
    <canvas class="border border-danger" id="previewCanvas" width="512" height="512"></canvas>
    <button @click="mergeEverything" class="btn btn-primary">Merge Everything</button>

    <!--    <div class="drawing-mode-options border border-black">-->
    <!--      <button id="drawing-mode" class="btn btn-info">Enter drawing mode</button>-->
    <!--      <button id="clear-canvas" class="btn btn-info">Clear</button>-->

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
    <!--    </div>-->
  </div>
</template>

<script setup>
import { onMounted, markRaw, ref, watch } from 'vue'
import * as fabric from 'fabric'
import { useLayers } from '@/stores/layersStore.js'
import { useObject } from '@/stores/objectStore.js'
import { useGeneration } from '@/stores/generationStore.js'

const layersStore = useLayers()
const objectStore = useObject()
const generationStore = useGeneration()
const $ = (id) => document.getElementById(id)
let canvas = null
let previewStart = null
let previewOffset = { x: 0, y: 0 }
let hasMoved = false
const clickedObject = ref({ width: 0, height: 0 })
let previewCanvas = null
const describeImage = async (image_path) => {
  try {
    objectStore.promiseLoadImageLabel = 'loading'

    const response = await fetch('http://localhost:5000/api/image_to_text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_path }),
    })

    const result = await response.json()

    if (response.ok) {
      return result.result
    } else {
      console.log(result.error)
      return null // Optional: explicitly return null on error
    }
  } catch (err) {
    console.log(err.message)
    return null // Optional: consistently return on error
  } finally {
    objectStore.promiseLoadImageLabel = 'finished' // Ensures it always updates
  }
}

const mergeEverything = async () => {
  //uncomment below to test openai api
  try {
    const canvasImgBase64 = canvas.toDataURL('image/png')
    const output_path = 'static/assets/output.png'
    const prompt = layersStore.buildStructuredPrompt()
    // code below (openai api) can be commented for testing
    const res = await fetch('http://localhost:5555/merge-everything', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: canvasImgBase64,
        prompt: prompt,
        output_path: output_path, //"static/assets/..."
      }),
    })
    layersStore.mergeEverything = true

    const data = await res.json()
    if (res.ok) {
      const bgImage = new Image()
      bgImage.src = data.output //data.output is base64
      generationStore.mergedAllImage.src = data.output
      console.log(bgImage.src)
      const previewContext = previewCanvas.getContext('2d')

      bgImage.onload = () => {
        previewContext.drawImage(bgImage, 0, 0, previewCanvas.width, previewCanvas.height)
      }
      const promptForDetection = layersStore.buildPromptForDetection()
      console.log('promptForDetection', promptForDetection)
      const detectBoxes = await detectObject(generationStore.mergedAllImage.src, promptForDetection)
      generationStore.storeDetection(detectBoxes)
      return `Success! Output: ${data.output}`
    } else {
      return data.error || 'Request failed'
    }
  } catch (err) {
    return 'Network error or server unavailable.'
  }
  //end of comment

  //uncomment below to test one image
  // const bgImage = new Image()
  // bgImage.src = generationStore.testBase64
  // generationStore.mergedAllImage.src = generationStore.testBase64
  // const previewContext = previewCanvas.getContext('2d')
  //
  // bgImage.onload = () => {
  //   previewContext.drawImage(bgImage, 0, 0, previewCanvas.width, previewCanvas.height)
  // }
  // const promptForDetection = layersStore.buildPromptForDetection()
  // console.log('promptForDetection', promptForDetection)
  // const detectBoxes = await detectObject(generationStore.mergedAllImage.src, promptForDetection)
  // generationStore.storeDetection(detectBoxes)
  //end of comment
}

function drawBgImg(canvas, imgSrc) {
  const bgImage = new Image()
  bgImage.src = imgSrc
  const context = canvas.getContext('2d')
  bgImage.onload = () => {
    context.drawImage(bgImage, 0, 0, canvas.width, canvas.height)
  }
}

const detectObject = async (image_path, text_prompt) => {
  try {
    const res = await fetch('http://localhost:5003/detect-object', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_path, text_prompt }),
    })

    if (!res.ok) {
      const errorData = await res.json()
      console.log(errorData.error)
      return errorData.error || 'Request failed'
    }

    const results = await res.json()
    console.log(results)
    return results // Array of { box: [x0, y0, x1, y1], text: phrase }
  } catch (err) {
    return 'Network error or server unavailable'
  }
}

const removeBg = async (src, dst) => {
  //src and dst should be both "static/assets/..."
  try {
    const res = await fetch('http://localhost:5555/remove-bg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ src, dst }),
    })

    if (!res.ok) {
      const errorData = await res.json()
      return errorData.error || 'Request failed'
    }

    return true
  } catch (err) {
    return 'Network error or server unavailable'
  }
}

watch(
  () => layersStore.layerPayload,
  (newPayload) => {
    const existingImage = canvas.getObjects().find((obj) => obj.idInLayers === newPayload.id)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = newPayload.url

    img.onload = () => {
      try {
        const fabricImage = new fabric.Image(img, {
          selectable: true,
          hasControls: true,
          left: newPayload.left,
          top: newPayload.top,
          //newPayload.left newPayload.top
        })

        fabricImage.scaleToWidth(250)
        fabricImage.set('idInLayers', newPayload.id) // assign your own ID
        if (existingImage) {
          canvas.remove(existingImage)
        }
        canvas.add(fabricImage) // <-- changed from canvas.value.add(...)
        canvas.isDrawingMode = false // <-- changed from canvas.value.isDrawingMode
        canvas.renderAll() // <-- changed from canvas.value.renderAll()
      } catch (error) {
        console.error('Failed to add image to canvas:', error)
      }
    }

    img.onerror = () => {
      console.error('Failed to load image:', newPayload.url)
    }
  },
)

const updateDrawingModeButtonText = async () => {
  $('drawing-mode').textContent = canvas.isDrawingMode
    ? 'Cancel drawing mode'
    : 'Enter drawing mode'
}

const isPointInBox = (mouseX, mouseY, box) => {
  const [x0, y0, x1, y1] = box
  return mouseX >= x0 && mouseX <= x1 && mouseY >= y0 && mouseY <= y1
}

const clickOnDetectionBox = (mouseX, mouseY, objList) => {
  for (const obj of objList) {
    if (isPointInBox(mouseX, mouseY, obj.box)) {
      return { clickedPhrase: obj.text, clickedCoord: obj.box }
    }
  }
  return null // No box matched
}

onMounted(() => {
  previewCanvas = document.getElementById('previewCanvas')
  const previewContext = previewCanvas.getContext('2d')
  let selectedFabricObject = null
  let isDragging = false
  canvas = markRaw(
    new fabric.Canvas($('visualEditor'), {
      isDrawingMode: false,
    }),
  )

  // Set Default Brush
  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
  fabric.Object.prototype.transparentCorners = false
  const canvasElement = canvas.lowerCanvasEl

  function drawOutline(x, y, width, height) {
    // previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    drawBgImg(previewCanvas, generationStore.mergedAllImage.src) //base 64 link for test
    previewContext.strokeStyle = 'orange'
    previewContext.lineWidth = 2
    previewContext.setLineDash([5, 5]) // dashed line
    previewContext.strokeRect(x - width / 2, y - height / 2, width, height)
  }
  previewCanvas.addEventListener('mousedown', (e) => {
    const previewRect = previewCanvas.getBoundingClientRect()
    const mouseX = e.clientX - previewRect.left
    const mouseY = e.clientY - previewRect.top
    previewStart = { x: mouseX, y: mouseY }
    hasMoved = false

    const { clickedPhrase, clickedCoord } = clickOnDetectionBox(
      mouseX,
      mouseY,
      generationStore.detectedObjects,
    )

    if (clickedPhrase) {
      const clickedLayerId = layersStore.findLayerIdByPhrase(clickedPhrase)
      const [x0, y0, x1, y1] = clickedCoord
      clickedObject.value.width = x1 - x0
      clickedObject.value.oriX = x0
      clickedObject.value.height = y1 - y0
      clickedObject.value.oriY = y0
      drawOutline(x0, y0, clickedObject.value.width, clickedObject.value.height)

      selectedFabricObject = canvas.getObjects().find((obj) => obj.idInLayers === clickedLayerId)
      isDragging = true
    }
  })

  previewCanvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const previewRect = previewCanvas.getBoundingClientRect()
      const mouseX = e.clientX - previewRect.left
      const mouseY = e.clientY - previewRect.top

      previewOffset = {
        x: mouseX - previewStart.x,
        y: mouseY - previewStart.y,
      }

      // Detect real movement
      if (Math.abs(previewOffset.x) > 1 || Math.abs(previewOffset.y) > 1) {
        hasMoved = true
        drawOutline(
          previewStart.x + previewOffset.x,
          previewStart.y + previewOffset.y,
          clickedObject.value.width,
          clickedObject.value.height,
        )
      }
    }
  })

  previewCanvas.addEventListener('mouseup', (e) => {
    if (isDragging) {
      isDragging = false

      if (!previewStart || !selectedFabricObject) return

      if (hasMoved) {
        const previewRect = previewCanvas.getBoundingClientRect()
        const dxPreview = previewOffset.x
        const dyPreview = previewOffset.y

        const scaleX = canvas.width / previewRect.width
        const scaleY = canvas.height / previewRect.height

        const dxFabric = dxPreview * scaleX
        const dyFabric = dyPreview * scaleY

        selectedFabricObject.left += dxFabric
        selectedFabricObject.top += dyFabric
        selectedFabricObject.setCoords()

        canvas.requestRenderAll()
        mergeEverything()
      } else {
        previewContext.strokeStyle = 'orange'
        previewContext.lineWidth = 2
        previewContext.setLineDash([5, 5]) // dashed line
        previewContext.strokeRect(
          clickedObject.value.oriX,
          clickedObject.value.oriY,
          clickedObject.value.width,
          clickedObject.value.height,
        )
      }
      previewOffset = { x: 0, y: 0 } // <- Add this!
      selectedFabricObject = null
      previewStart = null
    }
  })
  window.addEventListener('mouseup', async (e) => {
    const rect = canvasElement.getBoundingClientRect()

    if (
      objectStore.dragState === 'startDragging' &&
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    ) {
      //Mouse up inside visualEditor canvas and dragging
      // handle drop
      const droppedObj = objectStore.obj
      objectStore.startDragTop = droppedObj.top
      objectStore.startDragLeft = droppedObj.left
      const parsedUrl = droppedObj.src.match(/static\/.*/)[0]

      const pointer = canvas.getPointer(e, true) // use `true` to skip viewportTransform

      const newId = Date.now()
      const newLayerDOMInfo = {
        id: newId,
        url: droppedObj.src,
        left: pointer.x,
        top: pointer.y,
      }
      layersStore.addDOMLayer(newLayerDOMInfo)
      objectStore.dragState = 'finishedDragging'
      const extractedPrompt = await describeImage(parsedUrl)
      // droppedObj.src is in the format of "http://localhost:5555/static/assets/ce80ded4-5c2a-4c2a-aa2a-4df6b0f3223a.png"
      // to sent to back end it should be parsed to "static/..."
      const newLayer = {
        id: newId,
        prompt: [extractedPrompt],
        url: droppedObj.src,
        left: pointer.x,
        top: pointer.y,
        selectable: true,
        hasControls: true,
        type: 'object',
      }
      layersStore.addLayer(newLayer)
    } else {
      objectStore.dragState = 'notDragging'
    }
  })

  // Get DOM Elements
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

<style scoped>
#previewCanvas {
  width: 512px;
  height: 512px;
}
</style>
