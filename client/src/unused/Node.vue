<template>
  <div class="col-6 position-relative" style="width: 200px; height: 250px">
    <canvas class="border border-black" id="visualEditor" width="200" height="200"></canvas>
    <!-- Centered Spinner -->
    <div
      v-show="generatePromise === 'loading'"
      class="position-absolute top-50 start-50 translate-middle"
      style="z-index: 3"
    >
      <div class="spinner-border text-primary" role="status" aria-label="Loading">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, markRaw, ref, watch } from 'vue'
import * as fabric from 'fabric'
import { useLayers } from '@/unused/layersStore.js'
import { useObject } from '@/stores/objectStore.js'
import { useGeneration } from '@/stores/generationStore.js'
import VisualTool from '@/components/VisualTool.vue'
const canvasBgImage = new Image()
const layersStore = useLayers()
const objectStore = useObject()
const generationStore = useGeneration()
const { generatePromise, setGeneratePromise } = useGeneration()
const $ = (id) => document.getElementById(id)
let canvas = null
let isLasso = false
let points = []
let path = null
let lassoStart = false
let startPointer = null
const lassoStatus = ref(false)
const switchLasso = () => {
  lassoStart = !lassoStart

  canvas.forEachObject((obj) => {
    obj.selectable = !lassoStart
  })
  canvas.selection = !lassoStart
}
watch(
  () => generationStore.shouldTriggerT2I,
  (val) => {
    if (val) {
      generateContext(layersStore.context.semantics)
      setTimeout(() => {
        generationStore.resetT2I()
      }, 1000)
    }
  },
)
const describeImage = async (image_path, prompt) => {
  try {
    objectStore.promiseLoadImageLabel = 'loading'

    const response = await fetch('http://localhost:5555/image-to-labels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_path, prompt }),
    })
    const result = await response.json()

    if (response.ok) {
      // return result.result
      return result.output
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
    if (newPayload.url !== ' ') {
      img.src = newPayload.url

      img.onload = () => {
        try {
          const fabricImage = new fabric.Image(img, {
            selectable: true,
            hasControls: true,
            left: newPayload.left,
            top: newPayload.top,
            // scaleX: newPayload.scaleX,
            // scaleY: newPayload.scaleY,
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

onMounted(() => {
  // previewCanvas = document.getElementById('previewCanvas')
  // const previewContext = previewCanvas.getContext('2d')
  let selectedFabricObject = null
  let isDragging = false
  canvas = markRaw(
    new fabric.Canvas($('visualEditor'), {
      isDrawingMode: false,
      preserveObjectStacking: true,
    }),
  )

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

      // const prompt =
      //   'Look at this image and list five most likely semantic labels (e.g., orange, dress, car, sky, tree, etc.) you can identify. List only the labels that are visible in the image.'
      // const prompt =
      //   "Describe the main object in clear, objective language in the format of 'a lamp with a shiny gold base and a white lampshade'. List the visible objects, their positions, and any observable actions or relationships. Avoid interpretation, emotion, or speculation. Focus on what can be directly seen in the image."
    }
  })

  canvas.on('object:moving', function (e) {
    var obj = e.target
    // if object is too big ignore
    if (obj.currentHeight > obj.canvas.height || obj.currentWidth > obj.canvas.width) {
      return
    }
    obj.setCoords()
    // top-left  corner
    if (obj.getBoundingRect().top < 0 || obj.getBoundingRect().left < 0) {
      obj.top = Math.max(obj.top, obj.top - obj.getBoundingRect().top)
      obj.left = Math.max(obj.left, obj.left - obj.getBoundingRect().left)
    }
    // bot-right corner
    if (
      obj.getBoundingRect().top + obj.getBoundingRect().height > obj.canvas.height ||
      obj.getBoundingRect().left + obj.getBoundingRect().width > obj.canvas.width
    ) {
      obj.top = Math.min(
        obj.top,
        obj.canvas.height - obj.getBoundingRect().height + obj.top - obj.getBoundingRect().top,
      )
      obj.left = Math.min(
        obj.left,
        obj.canvas.width - obj.getBoundingRect().width + obj.left - obj.getBoundingRect().left,
      )
    }
  })

  // Set Default Brush
  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
  fabric.Object.prototype.transparentCorners = false
  const canvasElement = canvas.lowerCanvasEl

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
      console.log(droppedObj)
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

      // const describePrompt =
      //   "Describe the image in one precise, concise phrase focusing solely on clearly visible objects and their unambiguous features. Never assume non-visible states (e.g., cut, peeled, opened) unless explicitly shown. Prioritize accuracy over creativity. Example: 'A whole unpeeled avocado with bumpy dark green skin.'"
      // const extractedPrompt = await describeImage(parsedUrl, describePrompt)
      // droppedObj.src is in the format of "http://localhost:5555/static/assets/ce80ded4-5c2a-4c2a-aa2a-4df6b0f3223a.png"
      // to sent to back end it should be parsed to "static/assets/..."
      // const newLayer = {
      //   id: newId,
      //   //prompt: [extractedPrompt],
      //   prompt: [''],
      //   url: droppedObj.src,
      //   left: pointer.x,
      //   top: pointer.y,
      //   selectable: true,
      //   hasControls: true,
      //   type: 'object',
      //   hiddenStyle: '',
      // }
      // layersStore.addLayer(newLayer)
    } else {
      objectStore.dragState = 'notDragging'
    }
  })
})
</script>

<style scoped>
#previewCanvas {
  width: 512px;
  height: 512px;
}
</style>
