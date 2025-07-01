<template>
  <div id="new-node">
    <div class="nodeHandle rounded-top p-1" style="background: #ededed">
      <EditableLabel v-model="nodeName" />
    </div>
    <div class="node-tags">
      <span v-for="tag in tags" :key="tag" class="badge …" @dragover.prevent>{{ tag }}</span>
    </div>
    <div class="m-auto" ref="canvasContainer">
      <canvas id="canvasEl" class="inset-border" width="280" height="280"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, markRaw, watch } from 'vue'
import * as fabric from 'fabric'
import EditableLabel from './EditableLabel.vue'
import { useObject } from '@/stores/objectStore.js'
import { useNode } from '@/stores/nodeStore.js'
import { useAllUtil } from '@/stores/allUtilStore.js'

const $ = (id) => document.getElementById(id)
const nodeName = ref('New Node')
const tags = ref([])
const canvasContainer = ref(null)
let fabricCanvas = null
const objectStore = useObject()
const nodeStore = useNode()
const allUtilStore = useAllUtil()
let isLasso = false
let points = []
let path = null
let lassoStart = false
let startPointer = null
const eventInOneDOM = (clientX, clientY, rect) => {
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  )
}
onMounted(() => {
  fabricCanvas = markRaw(
    new fabric.Canvas($('canvasEl'), {
      isDrawingMode: false,
      preserveObjectStacking: true,
    }),
  )
  const canvasElement = fabricCanvas.lowerCanvasEl
  const nodeElement = document.getElementById('new-node')
  window.addEventListener('mouseup', async (e) => {
    const rectCanvas = canvasElement.getBoundingClientRect()
    const rectNode = nodeElement.getBoundingClientRect()
    //manually written dropping event detection
    if (objectStore.dragState === 'startDragging') {
      if (eventInOneDOM(e.clientX, e.clientY, rectCanvas)) {
        //Mouse up inside canvas
        if (objectStore.obj !== null && objectStore.obj.type === 'image') {
          //the dropped thing is an image and is dropped to the canvas area
          const droppedObj = objectStore.obj
          objectStore.startDragTop = droppedObj.top
          objectStore.startDragLeft = droppedObj.left
          const parsedUrl = droppedObj.src.match(/static\/.*/)[0]

          const pointer = fabricCanvas.getPointer(e, true) // use `true` to skip viewportTransform

          const newId = Date.now()
          const newLayerDOMInfo = {
            id: newId,
            url: droppedObj.src,
            left: pointer.x,
            top: pointer.y,
          }
          nodeStore.addDOMLayer(newLayerDOMInfo)
          objectStore.dragState = 'finishedDragging'
        }
      } else if (eventInOneDOM(e.clientX, e.clientY, rectNode)) {
        if (objectStore.obj !== null) {
          if (objectStore.obj.type === 'tag') {
            console.log(objectStore.obj.text)
            ////TODO: opens one alternative under the same node
          } else if (objectStore.obj.type === 'property') {
            console.log(objectStore.obj.tags)
            ////TODO: opens x number of alternatives under the same node
          }
        }
      } else {
        objectStore.dragState = 'notDragging'
      }
    }
  })

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

    const pathStr = points.join(' ') + ' Z' // Close the path
    path = new fabric.Path(pathStr, {
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
      const bounds = path.getBoundingRect()
      fabricCanvas.remove(path)
      // Render first to make sure everything is drawn
      fabricCanvas.renderAll()
      fabricCanvas.add(path)
      // Extract just the area covered by the path + content inside it
      const dataUrl = fabricCanvas.toDataURL({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        format: 'png',
        multiplier: 1, // can set to 2 for higher resolution
      })
      console.log(dataUrl)
      //TODO: the dataurl is the extracted image; Maybe can also use bound coords
    }
  })
})

watch(
  () => nodeStore.layerPayload,
  (newPayload) => {
    const existingImage = fabricCanvas.getObjects().find((obj) => obj.idInLayers === newPayload.id)
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
          })

          fabricImage.scaleToWidth(250)
          fabricImage.set('idInLayers', newPayload.id) // assign your own ID
          if (existingImage) {
            fabricCanvas.remove(existingImage)
          }
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
    }
  },
)
watch(
  () => allUtilStore.isLassoMode,
  (newVal) => {
    lassoStart = !lassoStart
    fabricCanvas.forEachObject((obj) => {
      obj.selectable = !lassoStart
    })
    fabricCanvas.selection = !lassoStart
  },
)
</script>

<style scoped>
#new-node {
  width: 300px;
  height: 400px;
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  position: relative;
}

.drag-active {
  background-color: #e6f7ff;
  border: 2px dashed #1890ff;
}

.inset-border {
  border: 1px solid #ccc;
  border-radius: 5px;
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.25),
    inset 0 0 0 3px rgba(255, 255, 255, 0.82);
}

.node-tags {
  padding: 10px;
  min-height: 60px;
  border-bottom: 1px solid #ddd;
  background-color: #fafafa;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
}
</style>
