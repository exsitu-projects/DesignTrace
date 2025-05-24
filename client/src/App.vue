<template>
  <div id="app">
    <header>
      <h1>Magic Quill</h1>
    </header>

    <main>
      <MagicQuillEditor @prompt-guessed="updatePrompt" @image-generated="displayGeneratedImage" />

      <ParametersPanel
        :params="generationParams"
        :models="availableModels"
        @update:params="updateParams"
      />

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
import MagicQuillEditor from './components/MagicQuillEditor.vue'
import ParametersPanel from './components/ParametersPanel.vue'

export default {
  name: 'App',
  components: {
    MagicQuillEditor,
    ParametersPanel,
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
    this.fetchModels()
  },
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  margin-top: 60px;
}

header {
  text-align: center;
  margin-bottom: 2rem;
}

main {
  max-width: 1200px;
  margin: 0 auto;
}

.result-container {
  margin-top: 2rem;
  text-align: center;
}

.result-container img {
  max-width: 100%;
  height: auto;
  border: 1px solid #ddd;
}
</style>
