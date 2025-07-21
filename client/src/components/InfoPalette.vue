<template>
  <div class="content" style="z-index: 0">
    <!-- One row per visual property -->
    <div
      v-for="(row, rowIdx) in rows"
      :key="rowIdx"
      class="d-flex flex-column flex-md-row align-items-start mb-2"
      @mouseenter="hoveredRowIndex = rowIdx"
      @mouseleave="((hoveredRowIndex = null), hideGhostTagsWithDelay())"
    >
      <!-- Editable property name tag (not draggable) -->

      <EditableLabel
        v-model="row.name"
        style="min-width: 80px"
        class="my-auto bg-transparent"
        :draggable="true"
        @dragstart="(e) => handleDragStart(e, row, row.name)"
        @mouseup="handleMouseUp(rowIdx, row.name)"
        :isPropertyName="true"
        @property-name-finalized="(propertyName) => generationStore.onPropertyNameFinalized(propertyName, rowIdx)"
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
          <button
            class="btn btn-sm btn-outline-secondary me-1 mb-1"
            @click="addTag(rowIdx)"
            @mouseenter="showGhostTags(rowIdx)"
            @mouseleave="hideGhostTagsWithDelay"
          >
            +
          </button>

          <!-- Ghost tag suggestions -->
          <template v-if="hoveredAddButton === rowIdx && row.tags.length < 3">
            <span
              v-for="(ghostTag, index) in getRemainingGhostTags(rowIdx)"
              :key="`ghost-${rowIdx}-${index}`"
              class="badge bg-light text-muted border me-1 mb-1 ghost-tag"
              style="opacity: 0.6; cursor: pointer; border-style: dashed !important"
              @click="addGhostTag(rowIdx, ghostTag)"
              @mouseenter="cancelGhostTagHiding"
              @mouseleave="hideGhostTagsWithDelay"
            >
              {{ ghostTag }}
            </span>
          </template>
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
import { onMounted, ref, watch } from 'vue'
import { Tooltip, Popover } from 'bootstrap'
const infoStore = useInfoStore()
const objectStore = useObject()
const generationStore = useGeneration()
const { rows } = storeToRefs(infoStore)
const hoveredRowIndex = ref(null)
const hoveredAddButton = ref(null) // Track which row's add button is hovered
const popoverButton = ref(null)
let currentPopover = null
let ghostTagTimeout = null // Timeout for ghost tag hiding

// Ghost tag suggestions
const ghostTags = ['red', 'yellow', 'green']

// Get remaining ghost tags for a specific row (excluding already used ones)
const getRemainingGhostTags = (rowIdx) => {
  if (!rows.value[rowIdx]) return []

  const usedTags = rows.value[rowIdx].tags.map((tag) => tag.tag.toLowerCase())
  const remainingTags = ghostTags.filter((ghostTag) => !usedTags.includes(ghostTag.toLowerCase()))

  return remainingTags.slice(0, 3 - rows.value[rowIdx].tags.length)
}

// Functions to handle ghost tag visibility with delay
const showGhostTags = (rowIdx) => {
  // Clear any existing timeout
  if (ghostTagTimeout) {
    clearTimeout(ghostTagTimeout)
    ghostTagTimeout = null
  }
  hoveredAddButton.value = rowIdx
}

const hideGhostTagsWithDelay = () => {
  // Clear any existing timeout
  if (ghostTagTimeout) {
    clearTimeout(ghostTagTimeout)
  }

  // Set a delay before hiding ghost tags
  ghostTagTimeout = setTimeout(() => {
    hoveredAddButton.value = null
    ghostTagTimeout = null
  }, 200) // 200ms delay
}

const cancelGhostTagHiding = () => {
  // Cancel the hiding timeout if mouse enters ghost tag area
  if (ghostTagTimeout) {
    clearTimeout(ghostTagTimeout)
    ghostTagTimeout = null
  }
}

// Function to handle attribute selection
const selectAttribute = (attributeName) => {
  // Update the last (newly added) row's name with the selected attribute
  if (rows.value.length > 0) {
    const lastRowIndex = rows.value.length - 1
    rows.value[lastRowIndex].name = attributeName

    // Call the generation store function when property name is finalized
    generationStore.onPropertyNameFinalized(attributeName, lastRowIndex)
  }

  // Close the popover
  if (currentPopover) {
    currentPopover.hide()
  }
}

// Function to generate popover HTML content
const createPopoverContent = () => {
  return `
    <div class="p-2">
      <div class="mb-2">
        <input
          type="text"
          class="form-control form-control-sm"
          id="customAttributeInput"
          placeholder="Type attribute..."
        >
        <small class="text-muted mt-1 d-block">Or choose:</small>
      </div>
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

// Handle clicking on ghost tags
const addGhostTag = (rowIdx, tagText) => {
  // Add a new tag to the row
  addTag(rowIdx)
  // Set the tag text to the ghost tag text
  if (rows.value[rowIdx] && rows.value[rowIdx].tags.length > 0) {
    const lastTagIndex = rows.value[rowIdx].tags.length - 1
    rows.value[rowIdx].tags[lastTagIndex].tag = tagText
  }
  // Clear hover state to hide remaining ghost tags
  hoveredAddButton.value = null
}

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
// Simple click-outside directive implementation
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutsideHandler = (event) => {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value(event)
      }
    }
    document.addEventListener('click', el._clickOutsideHandler)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutsideHandler)
  },
}

onMounted(() => {
  // Initialize Bootstrap tooltips and popovers
  setTimeout(() => {
    // Initialize tooltips
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
    tooltipTriggerList.forEach((tooltipTriggerEl) => {
      new Tooltip(tooltipTriggerEl)
    })

    // Initialize custom popover with function-generated content
    if (popoverButton.value) {
      currentPopover = new Popover(popoverButton.value, {
        content: createPopoverContent(),
        html: true,
        sanitize: false,
        trigger: 'click',
      })

      // Add event listeners for attribute button interactions
      popoverButton.value.addEventListener('shown.bs.popover', () => {
        // Wait for popover content to be rendered, then add event listeners
        setTimeout(() => {
          // Handle custom text input
          const customInput = document.getElementById('customAttributeInput')
          if (customInput) {
            // Real-time input update
            customInput.addEventListener('input', (e) => {
              const inputValue = e.target.value.trim()
              if (inputValue && rows.value.length > 0) {
                const lastRowIndex = rows.value.length - 1
                rows.value[lastRowIndex].name = inputValue
              } else if (rows.value.length > 0) {
                const lastRowIndex = rows.value.length - 1
                rows.value[lastRowIndex].name = 'Attribute'
              }
            })

            // Commit on Enter key
            customInput.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                const inputValue = e.target.value.trim()
                if (inputValue) {
                  selectAttribute(inputValue)
                }
              }
            })

            // Auto-focus the input
            setTimeout(() => {
              if (customInput && document.contains(customInput)) {
                customInput.focus()
              }
            }, 100)
          }

          const attributeButtons = document.querySelectorAll('.attribute-btn')
          attributeButtons.forEach((button) => {
            const attributeName = button.getAttribute('data-attribute')

            // Hover to preview (only if input is empty)
            button.addEventListener('mouseenter', () => {
              if (!customInput || !customInput.value.trim()) {
                if (rows.value.length > 0) {
                  const lastRowIndex = rows.value.length - 1
                  rows.value[lastRowIndex].name = attributeName
                }
              }
            })

            // Click to select
            button.addEventListener('click', () => {
              selectAttribute(attributeName)
            })
          })

          // Reset when mouse leaves the popover area (only if input is empty)
          const popoverContent = document.querySelector('.popover-body')
          if (popoverContent) {
            popoverContent.addEventListener('mouseleave', () => {
              if (!customInput || !customInput.value.trim()) {
                if (rows.value.length > 0) {
                  const lastRowIndex = rows.value.length - 1
                  rows.value[lastRowIndex].name = 'Attribute'
                }
              }
            })
          }

          // Add click-outside handler to dismiss popover
          const handleClickOutside = (event) => {
            const popoverElement = document.querySelector('.popover')
            const triggerElement = popoverButton.value

            if (
              popoverElement &&
              !popoverElement.contains(event.target) &&
              !triggerElement.contains(event.target)
            ) {
              currentPopover.hide()
              document.removeEventListener('click', handleClickOutside)
            }
          }

          // Add the click-outside listener with a small delay
          setTimeout(() => {
            document.addEventListener('click', handleClickOutside)
          }, 100)
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
