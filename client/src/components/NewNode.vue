<template>
  <div ref="nodeEl" :id="alt.id" class="node">
    <div
      class="nodeHandle rounded-top p-1 d-flex align-items-center"
      @dblclick="clickOnNodeTap()"
      style="background: #ededed"
    >
      <EditableLabel v-model="nodeName" />
      <button
        v-show="changeDetected"
        @click="transformColorStroke"
        class="btn btn-outline-dark btn-sm ms-auto"
      >
        Transform
      </button>
    </div>
    <div class="node-tags p-2">
      <button
        v-for="property in alt.properties"
        :key="property.tag"
        class="btn btn-sm btn-outline-dark"
      >
        <img
          v-show="property.thumbnail"
          :src="property.thumbnail"
          alt="thumb"
          class="thumb-icon"
        />{{ property.tag }}
      </button>
    </div>
    <div class="m-auto" ref="canvasContainer">
      <canvas ref="canvasEl" class="inset-border" :width="canvasW" :height="canvasW"></canvas>
    </div>
  </div>
</template>

<script setup>
import { computed, markRaw, onMounted, ref, watch } from 'vue'
import * as fabric from 'fabric'
import EditableLabel from './EditableLabel.vue'
import { useObject } from '@/stores/objectStore.js'
import { useNode } from '@/stores/nodeStore.js'
import { useAllUtil } from '@/stores/allUtilStore.js'
import { CannyJS } from '@/js/canny'
import { useGeneration } from '@/stores/generationStore.js'

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
  })

  fabricCanvas.upperCanvasEl.addEventListener('mouseout', () => {
    cursor.visible = false
    fabricCanvas.requestRenderAll()
  })

  fabricCanvas.on('mouse:up', async function (opt) {
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
        console.log(canvasUrlWithoutPath.value)
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
          const erasePath = new fabric.Path(pathStr.value, {
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
          fabricCanvas.remove(path)
          fabricCanvas.requestRenderAll()
          totalEdgeUrl.value = fabricCanvas.toDataURL()
          console.log(totalEdgeUrl.value)
          fabricCanvas.add(path)
          fabricCanvas.remove(erasePath) // gone from the display list
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
          // const srcCanv = fabricCanvas.lowerCanvasEl // 1024 × 1024
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
        }
      }
    } else if (allUtilStore.isColorPen) {
      cursor.visible = false
      fabricCanvas.requestRenderAll()
    }
  })
})
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
  // const lassoPayload = {
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
        nodeStore.receiveCanvasData(lassoPayload.value)
        console.log('transform lasso')
      } else {
        // else send the whole image
        const fabricCanvasUrl = fabricCanvas.toDataURL()
        const wholeImgPayload = {
          original_image: fabricCanvasUrl,
          total_mask: null,
          altId: alt.id,
          lassoBoundUrl: fabricCanvasUrl,
        }
        console.log('transform image')
        nodeStore.receiveCanvasData(wholeImgPayload)
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
      } catch (error) {
        console.error('Failed to add image to canvas:', error)
      }
    }

    img.onerror = () => {
      console.error('Failed to load image:', newPayload.url)
    }
  },
)
</script>

<style scoped>
.node {
  width: v-bind(nodeW);
  height: v-bind(nodeH);
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  position: relative;
}

.inset-border {
  border: 1px solid #ccc;
  border-radius: 5px;
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.25),
    inset 0 0 0 3px rgba(255, 255, 255, 0.82);
}

.node-tags {
  min-height: 30px;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
}
</style>
