<template>
  <div v-if="generationStore.showReviewDialog" class="review-prompt-modal">
    <div class="modal-backdrop" @click="closeDialog"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h3>Review Prompt</h3>
        <button class="close-btn" @click="closeDialog">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="switch-container">
            <input type="checkbox" v-model="generationStore.alwaysReview" class="switch-input" />
            <span class="switch-slider"></span>
            <span class="switch-label">Always Review</span>
          </label>
        </div>
        <div class="form-group">
          <label for="prompt-textarea">Generated Prompt:</label>
          <textarea
            id="prompt-textarea"
            v-model="generationStore.currentPrompt"
            class="prompt-textarea"
            rows="8"
            placeholder="Generated prompt will appear here..."
          ></textarea>
        </div>

        <!-- Prompt Template Section -->
        <div class="form-group">
          <label>Prompt Templates:</label>

          <!-- OpenAI Template -->
          <div class="template-section">
            <h6>Whole Image Editing Template:</h6>
            <div class="template-preview">
              <EditableText v-model="generationStore.promptTemplates.openAI.prefix" />
              <span class="variable-text">${propsAltered}</span>
              <EditableText v-model="generationStore.promptTemplates.openAI.middle1" />
              <span class="variable-text">${adjObjectText} ${objectText}</span>
              <EditableText v-model="generationStore.promptTemplates.openAI.middle2" />
              <span class="variable-text">${descriptors}</span>
              <EditableText v-model="generationStore.promptTemplates.openAI.suffix" />
            </div>
          </div>

          <!-- OpenAI Mask Template -->
          <div class="template-section">
            <h6>Selected Area Editing Template:</h6>
            <div class="template-preview">
              <EditableText v-model="generationStore.promptTemplates.openAIMask.prefix" />
              <span class="variable-text">${objectText}</span>
              <EditableText v-model="generationStore.promptTemplates.openAIMask.middle1" />
              <span class="variable-text">${descriptors}</span>
              <EditableText v-model="generationStore.promptTemplates.openAIMask.middle2" />
              <span class="variable-text">${adjObjectText}</span>
              <EditableText v-model="generationStore.promptTemplates.openAIMask.suffix" />
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="closeDialog">Cancel</button>
        <button class="btn btn-primary" @click="generateImage">Generate</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, defineComponent } from 'vue'
import { useGeneration } from '../stores/generationStore'

// EditableText component
const EditableText = defineComponent({
  name: 'EditableText',
  props: {
    modelValue: {
      type: String,
      required: true,
    },
  },
  emits: ['update:modelValue'],
  template: `
    <span
      v-if="!isEditing"
      @click="startEditing"
      class="editable-text"
      :title="modelValue"
    >
      {{ modelValue }}
    </span>
    <input
      v-else
      v-model="localValue"
      @blur="stopEditing"
      @keyup.enter="stopEditing"
      @keyup.escape="cancelEditing"
      class="editable-input"
      ref="inputRef"
    />
  `,
  setup(props, { emit }) {
    const isEditing = ref(false)
    const localValue = ref('')
    const inputRef = ref(null)

    const startEditing = () => {
      localValue.value = props.modelValue
      isEditing.value = true
      nextTick(() => {
        inputRef.value?.focus()
        inputRef.value?.select()
      })
    }

    const stopEditing = () => {
      emit('update:modelValue', localValue.value)
      isEditing.value = false
    }

    const cancelEditing = () => {
      isEditing.value = false
    }

    return {
      isEditing,
      localValue,
      inputRef,
      startEditing,
      stopEditing,
      cancelEditing,
    }
  },
})

const generationStore = useGeneration()

const closeDialog = () => {
  generationStore.showReviewDialog = false
  generationStore.currentPrompt = ''
  generationStore.pendingGeneration = null
}

const generateImage = async () => {
  if (generationStore.pendingGeneration && generationStore.currentPrompt.trim()) {
    const { copiedPayload, altId, resolve } = generationStore.pendingGeneration

    // Update the payload with the reviewed prompt
    copiedPayload.prompt = generationStore.currentPrompt.trim()
    copiedPayload.altId = altId

    // Close dialog immediately when user clicks generate
    closeDialog()

    try {
      const imgUrl = await generationStore.generateOpenAIImg(copiedPayload)
      resolve(imgUrl)
    } catch (error) {
      console.error('Generation failed:', error)
      resolve(null)
    }
  }
}
</script>

<style scoped>
.review-prompt-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 5000;
}

.modal-content {
  position: relative;
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 99999;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e9ecef;
}

.modal-header h3 {
  margin: 0;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 20px;
  max-height: 60vh;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 20px;
}

.switch-container {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.switch-input {
  display: none;
}

.switch-slider {
  position: relative;
  width: 50px;
  height: 25px;
  background-color: #ccc;
  border-radius: 25px;
  transition: background-color 0.3s;
  margin-right: 10px;
}

.switch-slider::before {
  content: '';
  position: absolute;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  background-color: white;
  top: 2px;
  left: 2px;
  transition: transform 0.3s;
}

.switch-input:checked + .switch-slider {
  background-color: #007bff;
}

.switch-input:checked + .switch-slider::before {
  transform: translateX(25px);
}

.switch-label {
  font-weight: 500;
  color: #333;
}

.form-group label:not(.switch-container) {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
}

.prompt-textarea {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 12px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  min-height: 120px;
}

.prompt-textarea:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border-top: 1px solid #e9ecef;
  background-color: #f8f9fa;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background-color: #5a6268;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-primary:hover {
  background-color: #0056b3;
}

/* Template Section Styles */
.template-section {
  margin-bottom: 20px;
  padding: 15px;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  background-color: #f8f9fa;
}

.template-section h6 {
  margin: 0 0 10px 0;
  color: #495057;
  font-weight: 600;
}

.template-preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  line-height: 1.8;
}

.variable-text {
  background-color: #e3f2fd;
  color: #1976d2;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: 500;
  font-family: monospace;
}

.editable-text {
  background-color: #fff3cd;
  color: #856404;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.editable-text:hover {
  background-color: #ffeaa7;
  border-color: #f39c12;
}

.editable-input {
  padding: 2px 6px;
  border: 1px solid #007bff;
  border-radius: 3px;
  background-color: white;
  font-size: 14px;
  min-width: 100px;
}

.editable-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}
</style>
