<template>
  <div id="app">
    <!-- wrapper provides the relative positioning context -->
    <FreeCanvas />

    <!-- nodes & alts overlay -->
    <svg
      class="arrows-layer"
      :width="nodeStore.nodeXR"
      :height="nodeStore.nodeYB"
      style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 500"
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="6"
          markerHeight="4"
          refX="6"
          refY="2"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <!-- scale the triangle down and soften the colour -->
          <polygon points="0 0, 6 2, 0 4" fill="#666666" />
        </marker>
      </defs>

      <path
        v-for="edge in allEdges"
        :key="edge.fromAltId + '-' + edge.toAltId"
        :d="getBezierPath(edge)"
        stroke="#666"
        stroke-width="1.4"
        fill="none"
        marker-end="url(#arrowhead)"
      />
    </svg>
    <transition-group name="fade" tag="div" class="nodes-layer">
      <VueDraggableResizable
        v-for="alt in allAlts"
        :key="alt.id"
        :x="alt.position.x"
        :y="alt.position.y"
        :w="'auto'"
        :h="'auto'"
        @mouseup="mouseUpNode(alt.position.x, alt.position.y, alt.id)"
        :draggable="true"
        :drag-handle="'.nodeHandle'"
        class="design-space-container"
        @dragging="(x, y) => onDrag(x, y, alt)"
      >
        <NewNode :alt="alt" />
      </VueDraggableResizable>
    </transition-group>
    <!-- floating palette panel -->
    <VueDraggableResizable
      :x="position.x"
      :y="position.y"
      :w="'auto'"
      :h="'auto'"
      :draggable="true"
      :drag-handle="'.handle'"
      class="design-space-container"
      @dragging="onDrag"
    >
      <div class="header handle small fw-bolder">
        Palette
        <button class="btn btn-sm btn-light" @click="toggleDesignSpace">
          <i :class="isDesignSpaceVisible ? 'bx bx-chevron-up' : 'bx bx-chevron-down'"></i>
        </button>
      </div>

      <div class="row p-2" style="width: 35vw" v-show="isDesignSpaceVisible">
        <InfoPalette />
      </div>
    </VueDraggableResizable>
  </div>
</template>

<script setup>
/* external libs / helpers */
import { ref, reactive, onMounted, nextTick, computed } from 'vue'
import VueDraggableResizable from 'vue-draggable-resizable'

/* components */
import FreeCanvas from '@/components/FreeCanvas.vue'
import NewNode from '@/components/NewNode.vue'
import InfoPalette from '@/components/InfoPalette.vue'

/* Pinia stores */
import { useNode } from '@/stores/nodeStore.js'
import { useLayout } from '@/stores/layoutStore.js'
import { useObject } from '@/stores/objectStore.js'
import { nodeBuiltin } from 'globals'
/* --- store instances --- */

const layoutStore = useLayout()
const nodeStore = useNode()
const objectStore = useObject()
/* --- plain state --- */
const availableModels = ref([])
const allAlts = computed(() =>
  nodeStore.nodeBranchList.flatMap((b) => b.nodes.flatMap((n) => n.alts)),
)
const allEdges = computed(() =>
  allAlts.value.flatMap((alt) =>
    (alt.edges ?? []).map(({ fromAltId, toAltId }) => ({ fromAltId, toAltId })),
  ),
)
const generationParams = reactive({
  ckpt_name: 'SD1.5/realisticVisionV60B1_v51VAE.safetensors',
  auto_save: false,
  resolution: 512,
  negative_prompt: '',
  fine_edge: 'disable',
  grow_size: 15,
  edge_strength: 0.55,
  color_strength: 0.55,
  inpaint_strength: 1.0,
  seed: -1,
  steps: 20,
  cfg: 5.0,
  sampler_name: 'euler_ancestral',
  scheduler: 'karras',
})

const isDesignSpaceVisible = ref(false)
const position = reactive({ x: 20, y: 20 })
const generatedImage = ref(null)
const prompt = ref('')
/* example async — not used right now */
async function fetchModels() {
  try {
    const res = await fetch('http://localhost:5000/api/checkpoints')
    const data = await res.json()
    availableModels.value = data.checkpoints
  } catch (err) {
    console.error('Error fetching models:', err)
  }
}

function toggleDesignSpace() {
  isDesignSpaceVisible.value = !isDesignSpaceVisible.value
}

async function mouseUpNode(altPosX, altPosY, altId) {
  if (objectStore.dragState !== 'startDragging') return
  if (objectStore.obj !== null) {
    if (objectStore.obj.type === 'tag') {
      console.log(objectStore.obj.text)
      nodeStore.addMultAlt(
        [objectStore.obj.text], // the arr length will be used to decide how many ele
        nodeStore.currentBranchId,
        nodeStore.currentNodeId,
        altPosX,
        altPosY,
        altId,
      )
    } else if (objectStore.obj.type === 'property') {
      nodeStore.addMultAlt(
        objectStore.obj.tags,
        nodeStore.currentBranchId,
        nodeStore.currentNodeId,
        altPosX,
        altPosY,
        altId,
      )
    }
  }
}

function onDrag(x, y, alt) {
  if (alt !== undefined) {
    //dragging an alt
    alt.position.x = x
    alt.position.y = y
    ensureNodeInView(x, y)
  } else {
    //dragging the palette
    position.x = x
    position.y = y
  }
}

function ensureNodeInView(nodeXL, nodeYT) {
  const draggingXR = nodeXL + nodeStore.nodeW
  const draggingYB = nodeYT + nodeStore.nodeH
  if (nodeStore.nodeXR < draggingXR) nodeStore.setNodeXR(draggingXR)
  if (nodeStore.nodeYB < draggingYB) nodeStore.setNodeYB(draggingYB)
}

function getBezierPath(edge) {
  const fromAlt = allAlts.value.find((a) => a.id === edge.fromAltId)
  const toAlt = allAlts.value.find((a) => a.id === edge.toAltId)
  if (!fromAlt || !toAlt) return ''

  // Calculate start and end positions (center of nodes)
  const startX = fromAlt.position.x + nodeStore.nodeW
  const startY = fromAlt.position.y + nodeStore.nodeH / 2
  const endX = toAlt.position.x
  const endY = toAlt.position.y + nodeStore.nodeH / 2

  // Control points for cubic bezier — adjust for curvature
  const controlX1 = startX + (endX - startX) / 2
  const controlY1 = startY
  const controlX2 = controlX1
  const controlY2 = endY

  return `M${startX},${startY} C${controlX1},${controlY1} ${controlX2},${controlY2} ${endX},${endY}`
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
}
.nodes-layer {
  position: absolute;
  inset: 0; /* full overlay */
  pointer-events: auto; /* nodes handle their own events */
}
.header {
  background: #f8f9fa;
  cursor: move;
  padding: 8px 12px;
  border-radius: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}

.design-space-container {
  position: absolute;
  top: 0;
  left: 0;
  background: white;
  border: 1px solid #ddd;
  border-radius: 5px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  transform: none;
}
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.7s ease,
    transform 0.7s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
.fade-enter-to,
.fade-leave-from {
  opacity: 1;
  transform: scale(1);
}
</style>
