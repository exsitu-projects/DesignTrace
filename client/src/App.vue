<template>
  <div id="app">
    <!-- wrapper provides the relative positioning context -->
    <FreeCanvas />

    <!-- nodes & alts overlay -->
    <template v-for="branch in nodeStore.nodeBranchList" :key="branch.id">
      <template v-for="node in branch.nodes" :key="node.id">
        <VueDraggableResizable
          v-for="alt in node.alts"
          :key="alt.id"
          :x="alt.position.x"
          :y="alt.position.y"
          :w="'auto'"
          :h="'auto'"
          @mouseup="mouseUpNode(alt.position.x, alt.position.y, $event)"
          :draggable="true"
          :drag-handle="'.nodeHandle'"
          class="design-space-container"
          @dragging="(x, y) => onDrag(x, y, alt)"
          :data-branch-id="branch.id"
          :data-node-id="node.id"
          :data-alt-id="alt.id"
        >
          <NewNode :alt="alt" :id="alt.id" />
        </VueDraggableResizable>
      </template>
    </template>

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
import { ref, reactive, onMounted } from 'vue'
import VueDraggableResizable from 'vue-draggable-resizable'

/* components */
import FreeCanvas from '@/components/FreeCanvas.vue'
import NewNode from '@/components/NewNode.vue'
import InfoPalette from '@/components/InfoPalette.vue'

/* Pinia stores */
import { useNode } from '@/stores/nodeStore.js'
import { useLayout } from '@/stores/layoutStore.js'
import { useObject } from '@/stores/objectStore.js'
/* --- store instances --- */

const layoutStore = useLayout()
const nodeStore = useNode()
const objectStore = useObject()
/* --- plain state --- */
const availableModels = ref([])

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

const generatedImage = ref(null)
const prompt = ref('')
const isDesignSpaceVisible = ref(false)
const position = reactive({ x: 20, y: 20 })
/* --- refs to DOM / child comps (if needed) --- */
const wrapper = ref(null)
const editor = ref(null) // <ImageEditor ref="editor" ...> if you restore it

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
function getAltWrapperAt(x, y) {
  const el = document.elementFromPoint(x, y)
  return el?.closest('.node-wrapper') || null
}
function toggleDesignSpace() {
  isDesignSpaceVisible.value = !isDesignSpaceVisible.value
}

function mouseUpNode(altPosX, altPosY, e) {
  if (objectStore.dragState !== 'startDragging') return
  if (objectStore.obj !== null) {
    if (objectStore.obj.type === 'tag') {
      console.log(objectStore.obj.text)
      ////TODO: opens one alternative under the same node
    } else if (objectStore.obj.type === 'property') {
      // nodeStore.addAlts(objectStore.obj.tags, nodeStore.currentBranchId,
      //   nodeStore.currentNodeId, posX = initialNodeX, posY = initialNodeY)
      nodeStore.addMultAlt(
        objectStore.obj.tags,
        nodeStore.currentBranchId,
        nodeStore.currentNodeId,
        altPosX,
        altPosY,
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
  nodeStore.setNodeXR(nodeXL + nodeStore.nodeW)
  nodeStore.setNodeYB(nodeYT + nodeStore.nodeH)
}

onMounted('mouseup', async (e) => {
  // window.addEventListener('mouseup', async (e) => {
  //   //manually written dropping event detection
  //   console.log('global mouseup', e)
  //
  //   const wrapper = getAltWrapperAt(e.clientX, e.clientY)
  //   if (!wrapper) {
  //     console.log('Dropped on empty space')
  //     return
  //   }
  //
  //   // Pull identifying info straight from the wrapper
  //   const branchId = wrapper.dataset.branchId
  //   const nodeId = wrapper.dataset.nodeId
  //   const altId = wrapper.dataset.altId
  //
  //   console.log('Dropped on alt:', { branchId, nodeId, altId })
  //   const rectNode = nodeEl.value.getBoundingClientRect()
  //   console.log(e.clientX, e.clientY, rectNode)
  //   if (eventInOneDOM(e.clientX, e.clientY, rectNode)) {
  //     //tag or tags being dragged
  //     console.log('tag or tags being dragged')
  //   }
  // })
})
</script>

<style scoped>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
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
</style>
