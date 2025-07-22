<template>
  <div ref="nodeEl" :id="alt.id" class="node">
    <div
      @click="handleClick(alt.id, alt.branchId)"
      class="nodeHandle rounded-top p-1 d-flex align-items-center"
      style="background: #ededed"
    >
      <div class="node-tags p-2" ref="nodeTagsRef" @wheel="handleHorizontalScroll">
        <button
          v-for="property in alt.properties"
          :key="property.tag"
          class="btn btn-sm btn-outline-dark mx-1"
        >
          <img
            v-show="property.thumbnail"
            :src="property.thumbnail"
            alt="thumb"
            class="thumb-icon"
          />{{ property.tag }}
        </button>
      </div>
      <!--      @dblclick="clickOnNodeTap()"-->
      <!--      <EditableLabel v-model="nodeName" />-->
      <!--      {{ alt.id }}-->
      <!-- Undo/Redo Controls -->
      <div class="d-flex align-items-center gap-1 ms-auto">
        <button
          @click="undo($event)"
          :disabled="undoStack.length <= 1"
          class="btn btn-sm btn-outline-secondary"
          title="Undo"
          @mouseup.stop
        >
          ⟲
        </button>
        <button
          @click="redo($event)"
          :disabled="redoStack.length === 0"
          class="btn btn-sm btn-outline-secondary"
          title="Redo"
          @mouseup.stop
        >
          ⟳
        </button>
        <button
          @click="deleteAlt($event)"
          class="btn btn-sm btn-outline-danger"
          title="Delete Alt"
          @mouseup.stop
        >
          ✕
        </button>
      </div>

      <button
        v-show="changeDetected"
        @click="transformColorStroke"
        class="btn btn-outline-dark btn-sm ms-auto"
      >
        Transform
      </button>
    </div>

    <div @click.stop class="my-2 m-auto position-relative" ref="canvasContainer">
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
  </div>
</template>

<script setup>
import { computed, markRaw, onMounted, onBeforeUnmount, ref, watch, defineEmits } from 'vue'
import * as fabric from 'fabric'
import { Tooltip } from 'bootstrap'
import EditableLabel from './EditableLabel.vue'
import { useObject } from '@/stores/objectStore.js'
import { useNode } from '@/stores/nodeStore.js'
import { useAllUtil } from '@/stores/allUtilStore.js'
import { CannyJS } from '@/js/canny'
import { useGeneration } from '@/stores/generationStore.js'
const emit = defineEmits(['remove']) // or whatever event you want to emit

const props = defineProps({
  alt: {
    type: Object,
    required: true,
  },
  imgPayload: Object,
  requestForLasso: Boolean,
})
const canvasEl = ref(null)
const nodeEl = ref(null)
const nodeTagsRef = ref(null)
let fabricCanvas = null
const { alt } = props
const $ = (id) => document.getElementById(id)
const nodeName = ref('New Node')
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
let path = null
let lassoStart = false
let startPointer = null
const fabricCanvasW = ref(0) // reactive refs
const fabricCanvasH = ref(0)
const lassoPayload = ref({})
const canvasW = computed(() => nodeStore.canvasW)
const nodeW = computed(() => nodeStore.nodeW)
const nodeH = computed(() => nodeStore.nodeH)
const canvasUrlWithoutBrush = ref('')
// Undo/Redo functionality
const isLoadingState = ref(false) // Prevent saving state during undo/redo
const undoStack = computed(() => alt.history?.undoStack || [])
const redoStack = computed(() => alt.history?.redoStack || [])

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

      if (path) fabricCanvas.remove(path)

      pathStr.value = points.join(' ') + ' Z' // Close the path
      path = new fabric.Path(pathStr.value, {
        stroke: 'black',
        strokeWidth: 1,
        fill: 'rgba(0, 0, 0, 0.1)',
        selectable: false,
        evented: false,
        strokeDashArray: [5, 5],
      })

      fabricCanvas.add(path)
      fabricCanvas.requestRenderAll()
    } else if (allUtilStore.isColorPen) {
      cursor.visible = true
      const p = fabricCanvas.getPointer(opt.e)
      cursor.set({ left: p.x, top: p.y })
      cursor.setCoords()
      fabricCanvas.bringObjectToFront(cursor)
      fabricCanvas.requestRenderAll()
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
      const moved = Math.sqrt(dx * dx + dy * dy) > 5 // threshold for "movement"

      if (!moved) {
        if (path) fabricCanvas.remove(path)
        path = null
        points = []
        fabricCanvas.requestRenderAll()
        return
      }
      if (path) {
        path.setCoords()
        const bounds = path.getBoundingRect() //lasso extracted but rectangular bounds
        fabricCanvas.remove(path)
        // Render first to make sure everything is drawn
        fabricCanvas.renderAll()
        canvasUrlWithoutPath.value = fabricCanvas.toDataURL()
        // Save state before adding lasso
        console.log('Saving state before adding lasso')
        saveState()
        // Extract just the area covered by the path + content inside it
        lassoBoundUrl.value = fabricCanvas.toDataURL({
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          format: 'png',
          multiplier: 1,
        })

        fabricCanvas.add(path)

        if (pathStr.value) {
          // uncomment to use google imagen api for inpainting
          // Create canvas same size as original
          const alphaMaskCanvas = document.createElement('canvas')
          alphaMaskCanvas.width = fabricCanvas.width
          alphaMaskCanvas.height = fabricCanvas.height
          const alphaCtx = alphaMaskCanvas.getContext('2d')

          // Fill the whole canvas black (opaque)
          alphaCtx.fillStyle = 'black'
          alphaCtx.fillRect(0, 0, alphaMaskCanvas.width, alphaMaskCanvas.height)

          // Cut out the lasso region (make transparent)
          alphaCtx.globalCompositeOperation = 'destination-out'
          const lasPath = new Path2D(pathStr.value)
          alphaCtx.fillStyle = 'white' // Any color, since it's being cut out
          alphaCtx.fill(lasPath)

          // Set back to default blending mode
          alphaCtx.globalCompositeOperation = 'source-over'

          // Final result: lasso = transparent, rest = black (opaque)
          totalEdgeUrl.value = alphaMaskCanvas.toDataURL('image/png')
          console.log(totalEdgeUrl.value)
          // uncomment to use openai api for inpainting (masks not working well with 4.1 api)
          // const erasePath = new fabric.Path(pathStr.value, {
          //   absolutePositioned: true,
          //   globalCompositeOperation: 'destination-out', // <-- eraser mode
          //   fill: 'black', // fill is needed even if transparent
          //   strokeWidth: 0,
          //   selectable: false,
          //   evented: false,
          //   objectCaching: false, // do NOT cache or it’ll clip edges
          // })
          //
          // // Add the path to canvas (which erases underlying content)
          // fabricCanvas.add(erasePath)
          // fabricCanvas.remove(path)
          // fabricCanvas.requestRenderAll()
          // totalEdgeUrl.value = fabricCanvas.toDataURL()
          // console.log(totalEdgeUrl.value)
          // fabricCanvas.add(path)
          // fabricCanvas.remove(erasePath) // gone from the display list

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
})

function deleteAlt(e) {
  e.preventDefault()
  e.stopPropagation()
  emit('remove')
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

function transformColorStroke() {
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
}
defineExpose({
  deleteSelectedObjects,
})

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
function clickOnNodeTap() {
  //DOM Change
  const branch = nodeStore.nodeBranchList.find((b) => b.id === alt.branchId)
  const node = branch.nodes.find((n) => n.id === alt.nodeId)

  alt.position.y = node.midYPos
  let startZId = alt.z
  let startPosY = node.midYPos
  for (let eachAlt of node.alts) {
    eachAlt.position.x = node.midXPos
    if (eachAlt.id !== alt.id) {
      startZId -= 1
      startPosY -= 20
      eachAlt.position.y = startPosY
      eachAlt.z = startZId
    }
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
      if (path !== null) {
        // if there is lasso path
        lassoPayload.value.type = 'lasso'
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
    allUtilStore.isLassoMode = false // force lasso off
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
    allUtilStore.isColorPen = false // force color pen off
    lassoStart = newVal
    fabricCanvas.forEachObject((obj) => {
      obj.selectable = !newVal
    })
    fabricCanvas.discardActiveObject()
    fabricCanvas.selection = !newVal
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
</script>

<style scoped>
.node {
  width: v-bind(nodeW);
  height: v-bind(nodeH); /* fixed height */
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
  gap: 0.25rem;
  flex: 1; /* take available space but don't expand parent */
  max-width: calc(100% - 50px); /* leave space for undo/redo buttons */
  box-sizing: border-box;
  padding: 0.5rem;
  /* optionally set a fixed height */
  height: 2.5rem; /* adjust to fit your tag buttons nicely */
  align-items: center; /* vertically center buttons */
  overflow-x: auto; /* enable horizontal scrolling */
  overflow-y: hidden; /* hide vertical scrolling */
  scrollbar-width: thin; /* Firefox - show thin scrollbar */
  scrollbar-color: #cbd5e0 transparent; /* Firefox - thumb and track colors */
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
</style>
