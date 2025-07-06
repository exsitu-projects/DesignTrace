<template>
  <div class="content" style="z-index: 0">
    <!-- One row per visual property -->
    <div
      v-for="(row, rowIdx) in rows"
      :key="rowIdx"
      class="d-flex flex-column flex-md-row align-items-start mb-2"
    >
      <!-- Editable property name tag (not draggable) -->

      <EditableLabel
        v-model="row.name"
        class="my-auto"
        :draggable="true"
        @dragstart="(e) => handleDragStart(e, row, row.name)"
        @mouseup="handleMouseUp(rowIdx, row.name)"
      />

      <!-- Draggable area for tags -->
      <draggable
        v-model="row.tags"
        item-key="uid"
        :animation="200"
        class="d-flex flex-wrap align-items-center"
      >
        <!-- each tag -->
        <template #item="{ element, index: tagIdx }">
          <span class="badge bg-light text-dark m-1">
            <EditableLabel
              :draggable="true"
              @dragstart="(e) => handleDragStart(e, element, row.name)"
              class="fw-normal"
              v-model="element.tag"
              v-bind="element.thumbnail ? { thumbnail: element.thumbnail } : {}"
            ></EditableLabel>
            <!-- remove button -->
            <button
              class="btn btn-sm btn-outline-danger border-0 p-0 lh-1"
              @click="removeTag(rowIdx, tagIdx)"
              title="Remove tag"
            >
              &times;
            </button>
          </span>
        </template>

        <!-- footer (adds a tag) -->
        <template #footer>
          <button class="btn btn-sm btn-outline-secondary me-1 mb-1" @click="addTag(rowIdx)">
            +
          </button>
        </template>
      </draggable>
    </div>

    <!-- Add new property row -->
    <button class="btn btn-sm btn-light" @click="addRow">+ Add property</button>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import draggable from 'vuedraggable'
import { useInfoStore } from '@/stores/infoStore'
import { useObject } from '@/stores/objectStore.js'
import EditableLabel from '@/components/EditableLabel.vue'
import { useGeneration } from '@/stores/generationStore.js'

const infoStore = useInfoStore()
const objectStore = useObject()
const generationStore = useGeneration()
const { rows } = storeToRefs(infoStore)

/* Thin wrappers that call store actions */
const addRow = () => infoStore.addRow()
const addTag = (rowIdx) => infoStore.addTag(rowIdx)
const removeTag = (rowIdx, tagIdx) => infoStore.removeTag(rowIdx, tagIdx)

const handleDragStart = (e, tagObj, propName) => {
  objectStore.dragState = 'startDragging'
  if ('uid' in tagObj) {
    //meaning this is one tag being dragged
    objectStore.obj = { type: 'tag', content: [{ tag: tagObj.tag, propName: propName }] }

    //{ type: 'tag', content: [{ tag: tagObj.tag, propName: propName }] }
  } else {
    const { tags } = tagObj
    const content = tags.map(({ tag }) => ({
      tag, // take the tag value from each element
      propName, // add the common propName
    }))
    /* { type: 'tag', content:
[
{ tag: 'Red',   propName: 'color' },
{ tag: 'Green', propName: 'color' },
{ tag: 'Blue',  propName: 'color' },
...
]}
*/
    objectStore.obj = { type: 'property', content: content }
  }
}

const handleMouseUp = async (rowIdx, propName) => {
  if (objectStore.dragState !== 'startDragging') return
  if (objectStore.obj.type === 'image') {
    //the dropped thing is an image and is dropped to the property
    const droppedObj = objectStore.obj
    objectStore.startDragTop = droppedObj.top
    objectStore.startDragLeft = droppedObj.left
    objectStore.dragState = 'restoreInitialDOM' // this is to ensure image to back in place before the generation starts

    const staticPath = droppedObj.src.match(/static\/.+/)[0] // staticPath: staitc/

    const propVal = await generationStore.describeImage(
      staticPath,
      propName,
      generationStore.propValSysPrompt,
    )
    infoStore.addTag(rowIdx, propVal)
    // const thumbnailUrl = await infoStore.generateThumbnail(propName, propVal)
    // infoStore.addThumbnailToTag(rowIdx, thumbnailUrl)
    objectStore.dragState = 'finishedDragging'
    objectStore.obj = {}
  }
}
</script>

<style scoped>
/* keep inline‑edited inputs tidy */
.form-control-sm {
  width: auto;
  max-width: 80px;
}
</style>
