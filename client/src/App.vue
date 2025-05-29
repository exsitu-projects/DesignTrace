<template>
  <div id="app">
    <header></header>

    <main>
      <FreeCanvas></FreeCanvas>

      <button
        class="btn btn-primary"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#collapseExample"
        aria-expanded="false"
        aria-controls="collapseExample"
      >
        Open Design Space
      </button>

      <div class="collapse" id="collapseExample">
        <div class="card card-body" style="max-width: 80%">
          <div class="row"><VisualEditor /> <SemanticEditor /></div>
        </div>
      </div>

      <ParametersPanel
        :params="generationParams"
        :models="availableModels"
        @update:params="updateParams"
      />
      <ImageEditor @prompt-guessed="updatePrompt" @image-generated="displayGeneratedImage" />
      <div class="preview-section" v-if="generatedImage">
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
import ImageEditor from './components/ImageEditor.vue'
import ParametersPanel from './components/ParametersPanel.vue'
import FreeCanvas from '@/components/FreeCanvas.vue'
import VisualEditor from '@/components/VisualEditor.vue'
import SemanticEditor from '@/components/SemanticEditor.vue'
export default {
  name: 'App',
  components: {
    SemanticEditor,
    VisualEditor,
    ImageEditor,
    ParametersPanel,
    FreeCanvas,
  },
  data() {
    return {
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
    }
  },
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
  },
  mounted() {
    // this.fetchModels()
  },
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
  background-color: rgba(255, 255, 255, 0.9); /* Optional: background for readability */
}
</style>
