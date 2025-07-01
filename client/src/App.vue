<template>
  <div id="app">
    <header></header>

    <main>
      <FreeCanvas></FreeCanvas>
      <template v-for="(branch, bIdx) in nodeStore.nodeBranchList" :key="branch.id">
        <template v-for="(node, nIdx) in branch.nodes" :key="node.id">
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
            <NewNode :alt="alt"></NewNode>
          </VueDraggableResizable>
        </template>
      </template>

      <VueDraggableResizable
        :x="position.x"
        :y="position.y"
        :w="'auto'"
        :h="'auto'"
        :draggable="true"
        :drag-handle="'.handle'"
        class-name="design-space-container"
        @dragging="onDrag"
      >
        <div class="header handle">
          {{ layersStore.context.semantics }}
          <button class="btn btn-sm btn-light" @click="toggleDesignSpace">
            <i :class="isDesignSpaceVisible ? 'bx bx-chevron-up' : 'bx bx-chevron-down'"></i>
          </button>
        </div>
        <div class="row p-2" style="width: 35vw" v-show="isDesignSpaceVisible">
          <InfoPalette />
        </div>
      </VueDraggableResizable>
      <!--      <ParametersPanel-->
      <!--        v-if="false"-->
      <!--        :params="generationParams"-->
      <!--        :models="availableModels"-->
      <!--        @update:params="updateParams"-->
      <!--      />-->
      <ImageEditor
        v-if="false"
        @prompt-guessed="updatePrompt"
        @image-generated="displayGeneratedImage"
      />
      <div v-if="false" class="preview-section" v-show="generatedImage">
        <h2>Generated Image</h2>
        <div class="image-preview">
          <img :src="generatedImage" alt="Generated Image" />
          <div class="image-actions">
            <button @click="downloadImage">Download</button>
            <button @click="useAsNewBase">Use as New Base</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script>
import Node from '@/components/Node.vue'
import ImageEditor from './components/ImageEditor.vue'
import ParametersPanel from './components/ParametersPanel.vue'
import FreeCanvas from '@/components/FreeCanvas.vue'
import InfoPalette from '@/components/InfoPalette.vue'
import VueDraggableResizable from 'vue-draggable-resizable'
import VisualEditor from '@/components/VisualEditor.vue'
import { useLayers } from './stores/layersStore.js'
import { useNode } from './stores/nodeStore.js'
import NewNode from '@/components/NewNode.vue'
export default {
  name: 'App',
  components: {
    NewNode,
    VisualEditor,
    InfoPalette,
    Node,
    ImageEditor,
    ParametersPanel,
    FreeCanvas,
    VueDraggableResizable,
  },
  data() {
    return {
      layersStore: useLayers(),
      nodeStore: useNode(),
      availableModels: [],
      generationParams: {
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
      },
      generatedImage: null,
      prompt: '',
      isDesignSpaceVisible: false,
      position: { x: 20, y: 20 },
    }
  },
  computed: {},
  methods: {
    downloadImage() {
      const link = document.createElement('a')
      link.href = this.generatedImage
      link.download = 'magicquill-generated.png'
      link.click()
    },
    useAsNewBase() {
      this.$refs.editor.loadGeneratedImage(this.generatedImage)
    },
    typeContext() {
      console.log('test')
    },
    updatePrompt(prompt) {
      this.prompt = prompt
    },
    displayGeneratedImage(imageData) {
      this.generatedImage = imageData
    },
    updateParams(newParams) {
      this.generationParams = { ...newParams }
    },
    async fetchModels() {
      try {
        // const response = await fetch('/api/checkpoints')
        const response = await fetch('http://localhost:5000/api/checkpoints')
        const data = await response.json()
        this.availableModels = data.checkpoints
      } catch (error) {
        console.error('Error fetching models:', error)
      }
    },
    toggleDesignSpace() {
      this.isDesignSpaceVisible = !this.isDesignSpaceVisible
    },
    onDrag(alt, x, y) {
      if (y !== undefined) {
        alt.position = { x, y }
      } else {
        this.position = { x: alt, y: x }
      }
    },
  },
  mounted() {},
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
}

.editor-overlay {
  position: absolute;
  width: 100vw;
  height: 100vh;
  z-index: 10;
  background-color: rgba(255, 255, 255, 0.9);
  /* Optional: background for readability */
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

.header {
  background: #f8f9fa;
  cursor: move;
  padding: 8px 12px;
  /* border-bottom: 1px solid #ddd; */
  border-radius: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}
</style>
