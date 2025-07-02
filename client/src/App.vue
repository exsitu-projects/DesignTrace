<template>
  <div id="app">
    <header></header>

    <main>
      <!-- wrapper provides the relative positioning context -->
      <div ref="wrapper" class="canvas-wrapper">
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
              :draggable="true"
              :drag-handle="'.nodeHandle'"
              @dragging="(x, y) => onDrag(alt, x, y)"
            >
              <NewNode :alt="alt" />
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
    </main>
  </div>
</template>

<script setup>
/* external libs / helpers */
import { ref, reactive } from 'vue'
import VueDraggableResizable from 'vue-draggable-resizable'

/* components */
import FreeCanvas from '@/components/FreeCanvas.vue'
import NewNode from '@/components/NewNode.vue'
import InfoPalette from '@/components/InfoPalette.vue'

/* Pinia stores */
import { useNode } from '@/stores/nodeStore.js'

import { useLayout } from '@/stores/layoutStore.js'

/* --- store instances --- */

const layoutStore = useLayout()
const nodeStore = useNode()
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

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */
function ensureNodeInView(alt, nodeW = 300, nodeH = 400) {
  const needRight = alt.position.x + nodeW + 40
  const needBottom = alt.position.y + nodeH + 40
  console.log('ensureNodeInView')
  layoutStore.ensureFits(needRight, needBottom) // wrapper & fabric grow if needed
}

function downloadImage() {
  const link = document.createElement('a')
  link.href = generatedImage.value
  link.download = 'magicquill-generated.png'
  link.click()
}

function useAsNewBase() {
  editor.value?.loadGeneratedImage(generatedImage.value)
}

function updatePrompt(p) {
  prompt.value = p
}

function displayGeneratedImage(imgData) {
  generatedImage.value = imgData
}

function updateParams(newParams) {
  Object.assign(generationParams, newParams)
}

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

/**
 * Called by <VueDraggableResizable>:
 *  • When dragging nodes:   onDrag(altObj, newX, newY)
 *  • When dragging palette: onDrag(newX, newY)
 */
function onDrag(alt, x, y) {
  if (y !== undefined) {
    alt.position = { x, y }
    // ensureNodeInView(alt)
  } else {
    position.x = alt
    position.y = x
  }
}
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

.canvas-wrapper {
  position: relative; /* absolute children (nodes) live here */
  user-select: none;
}
.design-space-container {
  position: fixed;
  top: 20px;
  left: 20px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 5px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  transform: none;
}
</style>
