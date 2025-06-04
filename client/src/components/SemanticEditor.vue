<script setup>
import draggable from 'vuedraggable'
import { useLayers } from '@/stores/layersStore.js'
import { ref } from 'vue'
import EditableLabel from '@/components/EditableLabel.vue'
import { useObject } from '@/stores/objectStore.js'

const layersStore = useLayers()
const objectStore = useObject()
const layerArr = layersStore.layers
let dragging = false

const addNewLabel = (idInLayers) => {
  layersStore.addNewLabel(idInLayers)
}

const handleChange = (e) => {
  console.log(e)
}

const handleDelete = (ele, index) => {
  ele.prompt.splice(index, 1)
  if (ele.prompt.length === 0) {
    const eleIndex = layersStore.layers.indexOf(ele)
    if (eleIndex !== -1) {
      layersStore.layers.splice(eleIndex, 1)
    }
  }
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

const addNewLayer = async () => {
  try {
    const newId = Date.now()
    const newLayerDOMInfo = {
      id: newId,
      url: ' ',
      left: 0,
      top: 0,
    }
    layersStore.addDOMLayer(newLayerDOMInfo)
    const newLayer = {
      id: newId,
      prompt: [' '],
      url: ' ',
      left: 0,
      top: 0,
      selectable: true,
      hasControls: true,
      type: 'object',
    }
    layersStore.addLayer(newLayer)
  } catch (error) {
    console.error('Error generating image:', error)
    alert('Image generation failed. Please try again.')
  }
}

const addEmptyStyle = () => {
  layersStore.addStyle({
    id: Date.now(),
    prompt: [' '],
    type: 'style',
  })
}

const reGenerateLayer = async (idInLayers) => {
  //how to deal with prompts, now just connecting them with ,

  const currentPrompt = layersStore.getPromptsOneLayer(idInLayers)
  const oneLinePrompt = currentPrompt.join(',')

  try {
    layersStore.promiseLoadLayerUpdate = 'loading'
    const result = await generateLayer(oneLinePrompt)
    layersStore.setLayerUrl(idInLayers, result.images_base64)
  } catch (error) {
    console.error('Error generating image:', error)
    alert('Image generation failed. Please try again.')
  } finally {
    layersStore.promiseLoadLayerUpdate = 'finished' // Ensures it always updates
  }
}
</script>

<template>
  <div class="col-6">
    <EditableLabel
      v-model="layersStore.context.semantics"
      :type="layersStore.context.type"
    ></EditableLabel>
    <!--////TODO DELETE CONTEXT LABEL-->
    <draggable
      v-model="layerArr"
      item-key="id"
      group="outer"
      @start="dragging = true"
      @end="dragging = false"
    >
      <template #item="{ element, index }">
        <div class="list-group-item">
          <div class="d-flex align-items-center justify-content-start">
            <!-- Inner draggable list for names -->
            <draggable
              v-model="element.prompt"
              @end="handleChange($event)"
              item-key="n => n"
              group="inner"
              :component-data="{ type: 'transition', name: 'flip-list' }"
            >
              <template #item="{ element: label, index: labelIndex }">
                <EditableLabel
                  v-model="element.prompt[labelIndex]"
                  :type="element.type"
                  :index="labelIndex"
                  @delete-label="handleDelete(element, labelIndex)"
                />
              </template>
            </draggable>
            <div class="flex-shrink-0 me-1">
              <i
                class="bx bx-plus-square m-auto btn btn-light"
                @click="addNewLabel(element.id)"
              ></i>
              <i
                class="bx bx-refresh-cw-dot m-auto btn btn-light"
                @click="reGenerateLayer(element.id)"
              ></i>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div
          v-show="
            objectStore.promiseLoadImageLabel === 'loading' ||
            layersStore.promiseLoadLayerUpdate === 'loading'
          "
          class="spinner-border"
          role="status"
        >
          <span class="visually-hidden">Loading...</span>
        </div>
        <div class="btn-group list-group-item" role="group" key="footer">
          <button class="btn btn-outline-dark" @click="addNewLayer">Add Object</button>
          <button class="btn btn-outline-dark" @click="addEmptyStyle">Add Style</button>
        </div>
      </template>
    </draggable>
  </div>
</template>

<style scoped></style>
