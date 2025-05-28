<script setup>
import draggable from 'vuedraggable'
import { useLayers } from '@/stores/layersStore.js'
import { ref } from 'vue'
import EditableLabel from '@/components/EditableLabel.vue'

const layerPrompt = ref('')
const layersStore = useLayers()
const layerArr = layersStore.layers
const myList = ref([
  { name: ['John', 'Joe'], id: 0 },
  { name: ['Joao'], id: 1 },
  { name: ['Bob'], id: 2 },
])
let dragging = false
let componentData = {
  type: 'transition',
  name: 'flip-list',
}

function replace() {
  myList.value = [{ name: ['Edgard'], id: 3 }]
}

const addNewLabel = (idInLayers) => {
  layersStore.addNewLabel(idInLayers)
}

const generateLayer = async (currentPrompt) => {
  const response = await fetch('http://localhost:53577/api/generatelayer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: currentPrompt,
    }),
  })
  return await response.json()
}

const generateNewLayer = async () => {
  try {
    const currentPrompt = layerPrompt.value
    const result = await generateLayer(currentPrompt)
    const imageUrl = result.images_base64
    const newLayer = {
      id: Date.now(),
      prompt: [currentPrompt],
      url: imageUrl,
      left: 100,
      top: 100,
      selectable: true,
      hasControls: true,
    }

    layersStore.addLayer(newLayer)
  } catch (error) {
    console.error('Error generating image:', error)
    alert('Image generation failed. Please try again.')
  }
}

const reGenerateLayer = async (idInLayers) => {
  //how to deal with prompts, now just connecting them with ,

  const currentPrompt = layersStore.getPromptsOneLayer(idInLayers)
  const oneLinePrompt = currentPrompt.join(',')
  try {
    const result = await generateLayer(oneLinePrompt)
    layersStore.setLayerUrl(idInLayers, result.images_base64)
  } catch (error) {
    console.error('Error generating image:', error)
    alert('Image generation failed. Please try again.')
  }
}
</script>

<template>
  <div class="col-6">
    <draggable
      v-model="layerArr"
      item-key="id"
      group="outer"
      @start="dragging = true"
      @end="dragging = false"
    >
      <template #item="{ element, index }">
        <div class="list-group-item">
          <div>
            <strong>Object {{ index }}</strong>
          </div>

          <!-- Inner draggable list for names -->
          <draggable
            v-model="element.prompt"
            item-key="n => n"
            group="inner"
            :component-data="{ type: 'transition', name: 'flip-list' }"
          >
            <template #item="{ element: label, index: labelIndex }">
              <EditableLabel v-model="element.prompt[labelIndex]" />
            </template>
          </draggable>
          <i class="bx bx-plus-square m-auto btn btn-light" @click="addNewLabel(element.id)"></i>
          <i
            class="bx bx-refresh-cw-dot m-auto btn btn-light"
            @click="reGenerateLayer(element.id)"
          ></i>
        </div>
      </template>

      <template #footer>
        <textarea
          v-model="layerPrompt"
          placeholder="Describe what you want to generate..."
          rows="3"
          class="my-2"
        ></textarea>
        <div class="btn-group list-group-item" role="group" key="footer">
          <button class="btn btn-secondary" @click="generateNewLayer">Add Object</button>
        </div>
      </template>
    </draggable>
  </div>
</template>

<style scoped></style>
