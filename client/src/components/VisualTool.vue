<script setup>
import { ref } from 'vue'
import {
  ImageUp,
  Lasso,
  ArrowBigUpDash,
  ArrowBigDownDash,
  ImageOff,
  Download,
} from 'lucide-vue-next'
import { useAllUtil } from '@/stores/allUtilStore.js'
import { useNode } from '@/stores/nodeStore.js'
import { useGeneration } from '@/stores/generationStore.js'
import { BACKEND_URL } from '../../public/endpoint.js'
const emit = defineEmits([
  'forwardLayer',
  'backwardLayer',
  'switchLasso',
  'removeBg',
  'exportBranchTags',
  'loadImg',
])
const files = ref([])
const fileInput = ref(null)
const triggerFileSelect = () => {
  fileInput.value.click()
}
const generationStore = useGeneration()
const allUtilStore = useAllUtil()
const nodeStore = useNode()
function switchLasso() {
  allUtilStore.switchLassoMode()
}

const addBranchNodeAlt = () => {
  // it opens a new node and add a new alt
  nodeStore.addNodeBranch()
  nodeStore.addNode(nodeStore.currentBranchId)
  nodeStore.addAlt(
    [],
    nodeStore.currentBranchId,
    nodeStore.currentNodeId,
    0,
    nodeStore.currentNodeId,
  )
}

const uploadFiles = async (event) => {
  files.value = Array.from(event.target.files)
  if (!files.value.length) {
    alert('Please select at least one file')
    return
  }

  for (const file of files.value) {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(BACKEND_URL + '/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (response.ok) {
        emit('loadImg', {
          filepath: BACKEND_URL + data.filepath,
          id: data.id,
        })
      } else {
        console.error(`Failed to upload ${file.name}: ${data.error}`)
        alert(`Failed to upload ${file.name}: ${data.error}`)
      }
    } catch (err) {
      console.error('Upload error:', err)
      alert(`Upload failed. Is the backend running at ${BACKEND_URL}?`)
    }
  }
}
async function generateImage() {
  try {
    const imgUrl = await generationStore.txt2Img({
      prompt: generationStore.generalPrompt,
    })
    const uuid = crypto.randomUUID()
    emit('loadImg', {
      filepath: imgUrl,
      id: uuid,
    })
  } catch (error) {
    console.error('Error generating image:', error)
  }
}

function switchTxt2Img() {
  allUtilStore.switchTxt2Img()
}
</script>

<template>
  <div class="mx-auto">
    <div v-show="allUtilStore.isTxt2Img" class="input-group my-2">
      <textarea
        v-model="generationStore.generalPrompt"
        class="form-control"
        aria-label="With textarea"
      ></textarea>
      <button class="btn-outline-dark input-group-text btn" @click="generateImage">Generate</button>
    </div>
    <button title="Add Node" class="btn btn-sm btn-light m-1" @click="addBranchNodeAlt">+</button>
    <button class="btn btn-sm btn-light m-1" @click="triggerFileSelect">
      <ImageUp color="black" :size="15" /> Upload
    </button>
    <input
      type="file"
      ref="fileInput"
      multiple
      accept="image/*"
      @change="uploadFiles"
      style="display: none"
    />
    <button
      title="Generate AI Image"
      @click="switchTxt2Img"
      :class="['btn btn-sm btn-light mx-1', { active: allUtilStore.isTxt2Img }]"
    >
      <img src="/assets/ai-file.png" alt="description" width="20" height="20" /> Generate
    </button>

    <button title="Remove background" @click="emit('removeBg')" class="btn btn-sm btn-light">
      <ImageOff color="black" :size="15"></ImageOff> Remove Bg
    </button>

    <div class="btn-group m-2" role="group" aria-label="Basic example">
      <button
        type="button"
        @click="switchLasso()"
        :class="['btn btn-sm btn-light', { active: allUtilStore.isLassoMode }]"
      >
        <Lasso color="black" :size="15" /> Select
      </button>

    </div>

    <div class="btn-group m-1" role="group" aria-label="Basic example">
      <button
        title="Move Image Forward"
        @click="emit('forwardLayer')"
        type="button"
        class="btn btn-sm btn-light"
      >
        <ArrowBigUpDash color="black" :size="15" /> Forward
      </button>
      <button
        title="Move Image Backward"
        @click="emit('backwardLayer')"
        type="button"
        class="btn btn-sm btn-light"
      >
        <ArrowBigDownDash color="black" :size="15" /> Backward
      </button>
    </div>
    <button
      title="Export Branch Tags"
      @click="emit('exportBranchTags')"
      class="btn btn-sm btn-light"
    >
      <Download color="black" :size="15"></Download>
    </button>
  </div>
</template>

<style scoped></style>
