<template>
  <div class="content" style="z-index: 0">
    <!-- One row per visual property -->
    <div
      v-for="(row, rowIdx) in rows"
      :key="rowIdx"
      class="d-flex flex-column flex-md-row align-items-start mb-2"
      @mouseenter="hoveredRowIndex = rowIdx"
      @mouseleave="hoveredRowIndex = null"
    >
      <!-- Editable property name tag (not draggable) -->

      <EditableLabel
        v-model="row.name"
        style="min-width: 80px"
        class="my-auto bg-transparent"
        :draggable="true"
        @dragstart="(e) => handleDragStart(e, row, row.name)"
        @mouseup="handleMouseUp(rowIdx, row.name)"
      ></EditableLabel
      ><span
        v-show="hoveredRowIndex === rowIdx && objectStore.obj && objectStore.obj.type === 'image'"
        class="my-auto badge rounded-pill text-bg-success"
        >+</span
      >

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
              @dragstart="
                (e) =>
                  handleDragStart(
                    e,
                    element,
                    row.name,
                    element.thumbnail ? { thumbnail: element.thumbnail } : {},
                  )
              "
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
    <a
      ref="popoverButton"
      tabindex="0"
      @click="addRow"
      class="btn btn-sm btn-light"
      role="button"
      data-bs-trigger="focus"
      title="Dismissible popover"
      >+ Add Attributes</a
    >
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import draggable from 'vuedraggable'
import { useInfoStore } from '@/stores/infoStore'
import { useObject } from '@/stores/objectStore.js'
import EditableLabel from '@/components/EditableLabel.vue'
import { useGeneration } from '@/stores/generationStore.js'
import { onMounted, ref } from 'vue'
import { Popover } from 'bootstrap'
const infoStore = useInfoStore()
const objectStore = useObject()
const generationStore = useGeneration()
const { rows } = storeToRefs(infoStore)
const hoveredRowIndex = ref(null)
const popoverButton = ref(null)
let currentPopover = null

// Function to handle attribute selection
const selectAttribute = (attributeName) => {
  // Update the last (newly added) row's name with the selected attribute
  if (rows.value.length > 0) {
    const lastRowIndex = rows.value.length - 1
    rows.value[lastRowIndex].name = attributeName
  }

  // Close the popover
  if (currentPopover) {
    currentPopover.hide()
  }
}

// Function to generate popover HTML content
const createPopoverContent = () => {
  return `
    <div class="p-1">
      <div class="d-flex flex-column gap-1">
        <button class="btn btn-sm btn-light attribute-btn" style="height: 2rem;" data-attribute="Color Palette">🎨 Color Palette</button>
        <button class="btn btn-sm btn-light attribute-btn" style="height: 2rem;" data-attribute="Primary Font">🗛 Primary Font</button>
        <button class="btn btn-sm btn-light attribute-btn" style="height: 2rem;" data-attribute="Graphic Design Layout">💠 Graphic Design Layout</button>
        <button class="btn btn-sm btn-light attribute-btn" style="height: 2rem;" data-attribute="Visual Contrast">🖼️ Visual Contrast</button>
        <button class="btn btn-sm btn-light attribute-btn" style="height: 2rem;" data-attribute="Landmark">📍 Landmark</button>
      </div>
    </div>
  `.trim()
}

/* Thin wrappers that call store actions */
const addRow = () => infoStore.addRow()
const addTag = (rowIdx) => infoStore.addTag(rowIdx)
const removeTag = (rowIdx, tagIdx) => infoStore.removeTag(rowIdx, tagIdx)

const handleDragStart = (e, tagObj, propName, thumbnail) => {
  objectStore.dragState = 'startDragging'
  if ('uid' in tagObj) {
    //meaning this is one tag being dragged
    objectStore.obj = {
      type: 'tag',
      content: [{ tag: tagObj.tag, propName: propName, thumbnail: thumbnail.thumbnail }],
    }

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
onMounted(() => {
  // Initialize Bootstrap tooltips and popovers
  setTimeout(() => {
    // Initialize custom popover with function-generated content
    if (popoverButton.value) {
      currentPopover = new Popover(popoverButton.value, {
        content: createPopoverContent(),
        html: true,
        sanitize: false,
        trigger: 'focus',
        title: 'Attribute Inspiration',
      })

      // Add event listener for attribute button clicks
      popoverButton.value.addEventListener('shown.bs.popover', () => {
        // Wait for popover content to be rendered, then add click listeners
        setTimeout(() => {
          const attributeButtons = document.querySelectorAll('.attribute-btn')
          attributeButtons.forEach((button) => {
            button.addEventListener('click', (e) => {
              const attributeName = e.target.getAttribute('data-attribute')
              selectAttribute(attributeName)
            })
          })
        }, 50)
      })
    }

    // Initialize other popovers (if any)
    const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]')
    popoverTriggerList.forEach((popoverTriggerEl) => {
      new Popover(popoverTriggerEl, {
        html: true,
        sanitize: false,
      })
    })
  }, 100)
})

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
    //const propVal = ''
    infoStore.addTag(rowIdx, propVal)
    console.log(droppedObj)
    const thumbnailUrl = droppedObj.src
    // const thumbnailUrl = await infoStore.generateThumbnail(propName, propVal)
    infoStore.addThumbnailToTag(rowIdx, thumbnailUrl)
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
