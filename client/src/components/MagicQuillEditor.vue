<template>
  <div class="magic-quill-editor">
    <!-- Image Upload Section -->
    <div class="upload-section">
      <label>
        Brush Size: {{ brushSize }}
        <input type="range" min="1" max="100" v-model="brushSize" />
      </label>
      <input
        type="file"
        id="image-upload"
        accept="image/*"
        @change="handleImageUpload"
        style="display: none"
      />
      <label for="image-upload" class="upload-button">
        <i class="fas fa-upload"></i> Upload Base Image
      </label>

      <!-- Drawing Tools -->
      <div class="toolbar">
        <button @click="setTool('brush')" :class="{ active: currentTool === 'brush' }">
          <i class="fas fa-paint-brush"></i> Brush
        </button>
        <button @click="setTool('eraser')" :class="{ active: currentTool === 'eraser' }">
          <i class="fas fa-eraser"></i> Eraser
        </button>
        <button @click="clearCanvas"><i class="fas fa-trash-alt"></i> Clear</button>
      </div>
    </div>

    <!-- Canvas Area -->
    <div
      class="canvas-container"
      :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px' }"
    >
      <canvas ref="canvas" class="baseCanvas"></canvas>
      <canvas
        ref="drawingCanvas"
        class="strokeCanvas"
        @mousedown="startDrawing"
        @mousemove="draw"
        @mouseup="stopDrawing"
        @mouseleave="stopDrawing"
      ></canvas>
    </div>

    <!-- Prompt Section -->
    <div class="prompt-section">
      <div class="prompt-header">
        <h3>Prompt</h3>
        <button @click="guessPrompt" :disabled="!hasImage">
          <i class="fas fa-lightbulb"></i> Guess Prompt
        </button>
      </div>
      <textarea
        v-model="prompt"
        placeholder="Describe what you want to generate..."
        rows="3"
      ></textarea>
    </div>

    <!-- Generation Controls -->
    <div class="generate-controls">
      <button class="generate-button" @click="generateImage" :disabled="!canGenerate">
        <i class="fas fa-magic"></i> Generate Image
      </button>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'

export default {
  name: 'MagicQuillEditor',
  data() {
    return {
      currentTool: 'brush',
      brushSize: 10,
      isDrawing: false,
      lastX: 0,
      lastY: 0,
      originalImage: null,
      prompt: '',
      hasImage: false,
      canvasWidth: 0,
      canvasHeight: 0,
    }
  },
  computed: {
    canGenerate() {
      return this.hasImage && this.prompt.trim().length > 0
    },
  },
  methods: {
    // Image Handling
    handleImageUpload(e) {
      const file = e.target.files[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        this.originalImage = new Image()
        this.originalImage.onload = () => {
          this.setupCanvas()
          this.hasImage = true
        }
        this.originalImage.src = event.target.result
      }
      reader.readAsDataURL(file)
    },

    setupCanvas() {
      const canvas = this.$refs.canvas
      const ctx = canvas.getContext('2d')

      // Set canvas dimensions
      canvas.width = this.originalImage.width
      canvas.height = this.originalImage.height
      this.canvasWidth = this.originalImage.width
      this.canvasHeight = this.originalImage.height
      // Draw original image
      ctx.drawImage(this.originalImage, 0, 0)
      const drawingCanvas = this.$refs.drawingCanvas
      const drawingCtx = drawingCanvas.getContext('2d')
      drawingCanvas.width = this.originalImage.width
      drawingCanvas.height = this.originalImage.height
      drawingCtx.clearRect(0, 0, canvas.width, canvas.height)
      // Setup drawing styles
      drawingCtx.lineJoin = 'round'
      drawingCtx.lineCap = 'round'
      drawingCtx.lineWidth = this.brushSize
    },

    // Drawing Methods
    setTool(tool) {
      this.currentTool = tool
    },

    startDrawing(e) {
      this.isDrawing = true
      const rect = this.$refs.drawingCanvas.getBoundingClientRect()
      this.lastX = e.clientX - rect.left
      this.lastY = e.clientY - rect.top
    },

    draw(e) {
      if (!this.isDrawing) return
      const ctx = this.$refs.drawingCanvas.getContext('2d')
      const rect = this.$refs.drawingCanvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      ctx.strokeStyle = 'white'
      ctx.lineWidth = this.brushSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.beginPath()
      ctx.moveTo(this.lastX, this.lastY)
      ctx.lineTo(x, y)
      ctx.stroke()

      this.lastX = x
      this.lastY = y
    },

    stopDrawing() {
      this.isDrawing = false
    },

    clearCanvas() {
      if (!this.hasImage) return

      const canvas = this.$refs.canvas
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(this.originalImage, 0, 0)
    },

    getCanvasCoordinates(e) {
      const drawingCanvas = this.$refs.drawingCanvas
      const rect = drawingCanvas.getBoundingClientRect()

      const scaleX = drawingCanvas.width / rect.width
      const scaleY = drawingCanvas.height / rect.height

      return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY]
    },

    // Prompt Handling
    async guessPrompt() {
      try {
        const canvas = this.$refs.canvas
        const imageData = canvas.toDataURL('image/png')

        const response = await fetch('/api/magic_quill/guess_prompt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            original_image: imageData,
            add_color_image: imageData,
            add_edge_image: this.getEdgeData(),
          }),
        })

        const result = await response.json()
        this.prompt = result.result
      } catch (error) {
        console.error('Error guessing prompt:', error)
        alert('Failed to guess prompt. Please try again.')
      }
    },

    // Image Processing (Matches Gradio Format)
    getEdgeData() {
      const canvas = this.$refs.drawingCanvas
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      const tempCtx = tempCanvas.getContext('2d')

      // Fill background with black
      tempCtx.fillStyle = 'black'
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)

      // Erase strokes by using destination-out
      tempCtx.globalCompositeOperation = 'destination-out'
      tempCtx.drawImage(canvas, 0, 0)

      return tempCanvas.toDataURL('image/png')
    },

    getMaskData() {
      const canvas = this.$refs.drawingCanvas
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      const tempCtx = tempCanvas.getContext('2d')

      // Fill background with black
      tempCtx.fillStyle = 'black'
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)

      // Erase strokes by using destination-out
      tempCtx.globalCompositeOperation = 'destination-out'
      tempCtx.drawImage(canvas, 0, 0)

      return tempCanvas.toDataURL('image/png')
    },

    // Generation
    async generateImage() {
      try {
        const canvas = this.$refs.canvas
        const imageData = canvas.toDataURL('image/png')

        const response = await fetch('/api/magic_quill/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ms_data: {
              original_image: imageData,
              add_color_image: imageData,
              add_edge_image: this.getEdgeData(),
              remove_edge_image: '',
              total_mask: this.getMaskData(),
            },
            prompt: this.prompt,
            ...this.$parent.generationParams,
          }),
        })

        const result = await response.json()
        this.$emit('image-generated', result.generated_image)
      } catch (error) {
        console.error('Error generating image:', error)
        alert('Image generation failed. Please try again.')
      }
    },
  },
}
</script>

<style scoped>
.magic-quill-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 8px;
}

.upload-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.upload-button {
  padding: 0.5rem 1rem;
  background: #4caf50;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.upload-button:hover {
  background: #45a049;
}

.toolbar {
  display: flex;
  gap: 0.5rem;
}

.toolbar button {
  padding: 0.5rem 1rem;
  background: #f1f1f1;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar button.active {
  background: #ddd;
}

.prompt-section {
  background: white;
  padding: 1rem;
  border-radius: 4px;
  border: 1px solid #ddd;
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.prompt-header button {
  padding: 0.25rem 0.5rem;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.prompt-header button:disabled {
  background: #cccccc;
  cursor: not-allowed;
}

textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: vertical;
  min-height: 80px;
}

.generate-controls {
  display: flex;
  justify-content: center;
}

.generate-button {
  padding: 0.75rem 1.5rem;
  background: #673ab7;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.generate-button:hover {
  background: #5e35b1;
}

.generate-button:disabled {
  background: #cccccc;
  cursor: not-allowed;
}
.canvas-container {
  position: relative;
  max-width: 100%;
  overflow: hidden;
}

.baseCanvas,
.strokeCanvas {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  max-width: 100%;
  height: auto;
}
</style>
