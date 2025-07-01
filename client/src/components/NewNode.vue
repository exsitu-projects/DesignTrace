<template>
  <div class="new-node">
    <div class="node-header">
      <EditableLabel v-model="nodeName" />
    </div>
    <div class="node-tags" @dragover.prevent @drop="handleTagDrop">
      <span v-for="(tag, index) in tags" :key="index" class="badge bg-secondary me-1 mb-1">{{
        tag
      }}</span>
    </div>
    <div class="node-canvas-container" ref="canvasContainer">
      <canvas ref="canvasEl"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as fabric from 'fabric'
import EditableLabel from './EditableLabel.vue'
import { useObject } from '@/stores/objectStore.js'

const nodeName = ref('New Node')
const tags = ref([])
const canvasEl = ref(null)
const canvasContainer = ref(null)
let fabricCanvas = null
const objectStore = useObject()

const handleTagDrop = (e) => {
  e.preventDefault()
  const tagData = e.dataTransfer.getData('text/plain')
  if (tagData) {
    tags.value.push(tagData)
  }
}

onMounted(() => {
  fabricCanvas = new fabric.Canvas(canvasEl.value, {
    width: canvasContainer.value.clientWidth,
    height: canvasContainer.value.clientHeight,
    backgroundColor: '#fff',
  })

  const handleDrop = (e) => {
    e.preventDefault()
    if (objectStore.dragState === 'startDragging') {
      const droppedObj = objectStore.obj
      const pointer = fabricCanvas.getPointer(e, true)

      fabric.Image.fromURL(
        droppedObj.src,
        (img) => {
          img.set({
            left: pointer.x,
            top: pointer.y,
            scaleX: 0.5,
            scaleY: 0.5,
          })
          fabricCanvas.add(img)
          fabricCanvas.renderAll()
        },
        { crossOrigin: 'anonymous' },
      )

      objectStore.dragState = 'finishedDragging'
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  canvasContainer.value.addEventListener('drop', handleDrop)
  canvasContainer.value.addEventListener('dragover', handleDragOver)

  onBeforeUnmount(() => {
    canvasContainer.value.removeEventListener('drop', handleDrop)
    canvasContainer.value.removeEventListener('dragover', handleDragOver)
    fabricCanvas.dispose()
  })
})
</script>

<style scoped>
.new-node {
  width: 320px;
  height: 420px;
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  position: relative;
}

.node-header {
  padding: 10px;
  background-color: #f1f1f1;
  border-bottom: 1px solid #ddd;
  cursor: grab;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
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

.node-canvas-container {
  flex-grow: 1;
  padding: 10px;
  position: relative;
}

canvas {
  position: absolute;
  top: 0;
  left: 0;
}
</style>
