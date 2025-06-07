<script setup>
import draggable from 'vuedraggable'
import { useLayers } from '@/stores/layersStore.js'
import { ref } from 'vue'
import EditableLabel from '@/components/EditableLabel.vue'
import { useObject } from '@/stores/objectStore.js'
import { useGeneration } from '@/stores/generationStore.js'

const layersStore = useLayers()
const objectStore = useObject()
const generationStore = useGeneration()
let dragging = false
const { triggerT2I } = useGeneration()
const addNewLabel = (idInLayers) => {
  layersStore.addNewLabel(idInLayers)
}

const handleChange = (e) => {
  console.log(e.moved)
  if (e.moved.element.hiddenStyle === '' && e.moved.element.type === 'object') {
    for (let i = 0; i < e.moved.newIndex; i++) {
      if (layersStore.layers[i].type === 'style') {
        e.moved.element.hiddenStyle += layersStore.layers[i].prompt[0]
        reGenerateLayer(e.moved.element.id)
      }
    }
  }
  if (e.moved.element.type === 'style') {
    for (let i = e.moved.newIndex + 1; i < layersStore.layers.length; i++) {
      if (layersStore.layers[i].type === 'object' && layersStore.layers[i].hiddenStyle === '') {
        layersStore.layers[i].hiddenStyle += e.moved.element.prompt[0]
        reGenerateLayer(layersStore.layers[i].id)
      }
    }
  }
}
////TODO: This code only runs once layersStore.layers[i].hiddenStyle === ''
////TODO: Delete semantics doesnt delete DOM element for now
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
      hiddenStyle: '',
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

  const oneLinePrompt = layersStore.getPromptsOneLayer(idInLayers)

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
    <i class="bx bx-refresh-cw-dot m-auto btn btn-light" @click="triggerT2I"></i>
    <!--////TODO DELETE CONTEXT LABEL-->
    <draggable
      v-model="layersStore.layers"
      item-key="id"
      group="outer"
      @change="handleChange"
      @start="dragging = true"
      @end="dragging = false"
    >
      <template #item="{ element, index }">
        <div class="list-group-item">
          <div class="d-flex align-items-center justify-content-start">
            <!-- Inner draggable list for names -->
            <draggable
              v-model="element.prompt"
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
