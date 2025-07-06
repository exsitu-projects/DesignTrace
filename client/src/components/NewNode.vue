<template>
  <div ref="nodeEl" class="node">
    <div class="nodeHandle rounded-top p-1" style="background: #ededed">
      <EditableLabel v-model="nodeName" />
    </div>
    <div class="node-tags p-2">
      <span
        v-for="property in alt.properties"
        :key="property.tag"
        class="btn btn-sm btn-outline-dark"
        >{{ property.tag }}</span
      >
    </div>
    <div class="m-auto" ref="canvasContainer">
      <canvas ref="canvasEl" class="inset-border" :width="canvasW" :height="canvasW"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, markRaw, watch, computed, toRef } from 'vue'
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
let path = null
let lassoStart = false
let startPointer = null
const canvasW = computed(() => nodeStore.canvasW)
const nodeW = computed(() => nodeStore.nodeW)
const nodeH = computed(() => nodeStore.nodeH)
onMounted(() => {
  fabricCanvas = markRaw(
    new fabric.Canvas(canvasEl.value, {
      isDrawingMode: false,
      preserveObjectStacking: true,
    }),
  )
  fabricCanvas.on('mouse:down', function (opt) {
    if (lassoStart === true) {
      fabricCanvas.forEachObject((obj) => {
        obj.selectable = false
      })
      fabricCanvas.selection = false
      isLasso = true
      startPointer = opt.pointer
      points = [`M ${opt.pointer.x} ${opt.pointer.y}`] // Start path
    }
  })

  fabricCanvas.on('mouse:move', function (opt) {
    if (!isLasso || !lassoStart) return
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
  })

  fabricCanvas.on('mouse:up', async function (opt) {
    if (!isLasso) return

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
        // --- 1. create a plain canvas --------------------------------------------
        const lassoMaskCan = document.createElement('canvas')
        lassoMaskCan.width = fabricCanvas.width // same pixel size as the source
        lassoMaskCan.height = fabricCanvas.height
        const lassoMaskCtx = lassoMaskCan.getContext('2d')

        // --- 2. paint background black -------------------------------------------
        lassoMaskCtx.fillStyle = 'black'
        lassoMaskCtx.fillRect(0, 0, lassoMaskCan.width, lassoMaskCan.height)

        // --- 3. draw the lasso path in white -------------------------------------
        const lasPath = new Path2D(pathStr.value)
        lassoMaskCtx.fillStyle = 'white'
        lassoMaskCtx.fill(lasPath)

        // totalEdgeUrl.value = lassoMaskCan.toDataURL('image/png')
        totalEdgeUrl.value = whiteToTransparent(lassoMaskCan)
        // console.log(totalEdgeUrl.value) // lasso selection mask, lasso area white, other black -> total mask

        const srcCanv = fabricCanvas.lowerCanvasEl // 1024 × 1024
        const canny = CannyJS.canny(
          srcCanv,
          cannyHt, // ht: canny high threshold
          cannyLt, // lt: canny low threshold
          1.4, // gaussian blur sigma
          3, // kernel size, default 3 usually
          2,
        )

        let cannyCan = document.createElement('canvas')
        cannyCan.width = fabricCanvas.getWidth()
        cannyCan.height = fabricCanvas.getHeight()

        const cannyCtx = cannyCan.getContext('2d')
        cannyCtx.imageSmoothingEnabled = false // keep edges crisp
        const hiRes = document.createElement('canvas')
        hiRes.width = srcCanv.width // 1024
        hiRes.height = srcCanv.height
        canny.drawOn(hiRes) // fills hiRes

        cannyCtx.drawImage(
          hiRes,
          0,
          0,
          hiRes.width,
          hiRes.height, // src rect
          0,
          0,
          cannyCan.width,
          cannyCan.height, // dest rect (scaled)
        )

        const cannyURL = cannyCan.toDataURL('image/png')
        // console.log(cannyURL) // canny edge mask, canny edge white, other black

        let cannyInLassoCan = document.createElement('canvas')
        cannyInLassoCan.width = cannyCan.width
        cannyInLassoCan.height = cannyCan.height
        const cannyInLassoCtx = cannyInLassoCan.getContext('2d')

        cannyInLassoCtx.fillStyle = 'white'
        const lassoPath = new Path2D(pathStr.value)
        cannyInLassoCtx.fill(lassoPath)

        cannyInLassoCtx.globalCompositeOperation = 'source-in'
        cannyInLassoCtx.drawImage(cannyCan, 0, 0)

        cannyInLassoCtx.globalCompositeOperation = 'destination-over'
        cannyInLassoCtx.fillStyle = 'black'
        cannyInLassoCtx.fillRect(0, 0, cannyInLassoCan.width, cannyInLassoCan.height)

        // Reset composite mode for safety
        cannyInLassoCtx.globalCompositeOperation = 'source-over'
        // posEdgeUrl.value = cannyInLassoCan.toDataURL('image/png')
        posEdgeUrl.value = whiteToTransparent(cannyInLassoCan)
        // console.log(posEdgeUrl.value) // canny edge inside lasso mask, canny edge white, other black -> pos edge mask

        lassoMaskCtx.globalCompositeOperation = 'difference'
        lassoMaskCtx.fillStyle = '#fff' // white rectangle
        lassoMaskCtx.fillRect(0, 0, cannyInLassoCan.width, cannyInLassoCan.height)
        lassoMaskCtx.globalCompositeOperation = 'lighter'
        lassoMaskCtx.drawImage(cannyInLassoCan, 0, 0)
        lassoMaskCtx.globalCompositeOperation = 'difference'
        lassoMaskCtx.fillStyle = '#fff' // white rectangle
        lassoMaskCtx.fillRect(0, 0, cannyInLassoCan.width, cannyInLassoCan.height)
        negEdgeUrl.value = whiteToTransparent(lassoMaskCan)
        // console.log(negEdgeUrl.value) // non-canny edge inside lasso mask, non-canny edge inside lasso white, other black -> neg edge mask
        storeLassoInfo()

        cannyCan = null
        cannyInLassoCan = null
      }
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
// async function generateAlt(propsPerAlt) {
//   const altImgURL = await generationStore.generateMaskedImg({
//     original_image: canvasUrlWithoutPath.value,
//     add_color_image: canvasUrlWithoutPath.value,
//     add_edge_image: posEdgeUrl.value,
//     remove_edge_image: negEdgeUrl.value,
//     total_mask: totalEdgeUrl.value,
//     props: propsPerAlt,
//     lassoBoundUrl: lassoBoundUrl.value,
//   })
//   return altImgURL
// }

function storeLassoInfo() {
  const lassoPayload = {
    original_image: canvasUrlWithoutPath.value,
    add_color_image: canvasUrlWithoutPath.value,
    add_edge_image: posEdgeUrl.value,
    remove_edge_image: negEdgeUrl.value,
    total_mask: totalEdgeUrl.value,
    altId: alt.id,
    lassoBoundUrl: lassoBoundUrl.value,
  }
  nodeStore.setCurrentLassoInfo(lassoPayload)
}
watch(
  () => props.imgPayload,
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
          fabricCanvas.isDrawingMode = false
          fabricCanvas.renderAll()
          objectStore.dragState = 'finishedDragging'
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
  () => allUtilStore.isLassoMode,
  (newVal) => {
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
