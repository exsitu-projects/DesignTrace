<template>
  <div class="parameters-panel">
    <div class="accordion">
      <button @click="toggleAccordion" class="accordion-button">
        Parameters {{ isOpen ? '▲' : '▼' }}
      </button>
      <div v-if="isOpen" class="accordion-content">
        <div class="parameter-group">
          <label>Base Model Name</label>
          <select v-model="localParams.ckpt_name">
            <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
          </select>
        </div>

        <div class="parameter-group">
          <label> <input type="checkbox" v-model="localParams.auto_save" /> Auto Save </label>
        </div>

        <div class="parameter-group">
          <label>Resolution</label>
          <input type="range" v-model="localParams.resolution" min="256" max="2048" step="64" />
          <span>{{ localParams.resolution }}</span>
        </div>

        <!-- Add all other parameters similarly -->

        <button @click="saveSettings">Save Settings</button>
      </div>
    </div>
  </div>

  <div class="parameter-group">
    <label>Edge Detection</label>
    <select v-model="localParams.edge_detection">
      <option value="simple">Simple</option>
      <option value="canny">Canny</option>
      <option value="sobel">Sobel</option>
    </select>
  </div>
</template>

<script>
export default {
  name: 'ParametersPanel',
  props: {
    params: Object,
    models: Array,
  },
  data() {
    return {
      isOpen: false,
      localParams: {
        ...this.params,
        brush_size: 10,
        edge_detection: 'simple',
      },
    }
  },
  methods: {
    toggleAccordion() {
      this.isOpen = !this.isOpen
    },
    async saveSettings() {
      try {
        //await fetch('/api/settings', {
        await fetch('http://localhost:5000/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            auto_save: this.localParams.auto_save,
            resolution: this.localParams.resolution,
          }),
        })
        this.$emit('update:params', { ...this.localParams })
      } catch (error) {
        console.error('Error saving settings:', error)
      }
    },
  },
  watch: {
    params: {
      handler(newVal) {
        this.localParams = { ...newVal }
      },
      deep: true,
    },
  },
}
</script>

<style scoped>
.parameters-panel {
  width: 90%;
  margin: 1rem auto;
}
.accordion-button {
  width: 100%;
  padding: 0.5rem;
  text-align: left;
  background: #f1f1f1;
  border: none;
  cursor: pointer;
}
.accordion-content {
  padding: 1rem;
  background: white;
  border: 1px solid #ddd;
}
.parameter-group {
  margin-bottom: 1rem;
}
.parameter-group label {
  display: block;
  margin-bottom: 0.25rem;
  font-weight: bold;
}
</style>
