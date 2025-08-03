<template>
  <div class="content" style="z-index: 0" :class="{ 'lasso-cursor': allUtilStore.isToolTip }">
    <!-- One row per visual property -->
    <div
      v-for="(row, rowIdx) in rows"
      :key="rowIdx"
      class="d-flex flex-column flex-md-row align-items-start mb-2"
      @mouseenter="hoveredRowIndex = rowIdx"
      @mouseleave="((hoveredRowIndex = null), hideGhostTagsWithDelay())"
    >
      <!-- Editable property name tag (not draggable) -->
      <div
        class="badge m-1 d-flex bg-light border border-2 border-dark fw-bold"
        :class="[
          'my-auto ',
          clickedStates[rowIdx]?.propertyName ? 'bg-dark text-light' : 'bg-light text-dark',
        ]"
      >
        <EditableLabel
          v-model="row.name"
          style="min-width: 80px"
          :draggable="true"
          @dragstart="(e) => handleDragStart(e, row, row.name)"
          @mouseup="handleMouseUp(rowIdx, row.name)"
          @editing-changed="(editing) => onEditingChanged(rowIdx, 'propertyName', editing)"
          @click.stop="
            () => {
              if (!editingStates[rowIdx]?.propertyName) {
                handlePropertyNameClick(rowIdx, row)
              }
            }
          "
          :isPropertyName="true"
          @property-name-finalized="
            (propertyName) => generationStore.onPropertyNameFinalized(propertyName, rowIdx)
          "
        ></EditableLabel>
        <!-- Row delete button -->
        <button
          class="btn btn-sm btn-outline-danger border-0 p-0 lh-1"
          @click.stop="removeRow(rowIdx)"
          title="Remove row"
        >
          &times;
        </button>
        <span
          v-show="hoveredRowIndex === rowIdx && objectStore.obj && objectStore.obj.type === 'image'"
          class="my-auto badge rounded-pill text-bg-success ms-1"
          >+</span
        >
      </div>
      <!-- Draggable area for tags -->
      <draggable
        v-model="row.tags"
        item-key="uid"
        :animation="200"
        class="d-flex flex-wrap align-items-center"
      >
        <!-- each tag -->
        <template #item="{ element, index: tagIdx }">
          <span
            :style="{
              pointerEvents: editingStates[rowIdx]?.[tagIdx] ? 'none' : 'auto',
              cursor: editingStates[rowIdx]?.[tagIdx] ? 'default' : 'pointer',
              userSelect: 'none',
            }"
            @click.stop="!editingStates[rowIdx]?.[tagIdx] && toggleTagSelection(rowIdx, tagIdx)"
            class="badge m-1"
            :class="isTagSelected(rowIdx, tagIdx) ? 'bg-dark text-light' : 'bg-light text-dark'"
          >
            <EditableLabel
              @editing-changed="onEditingChanged(rowIdx, tagIdx, $event)"
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
              @click.stop="removeTag(rowIdx, tagIdx)"
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
            <!-- Show spinner while loading ghost tags -->
            <div
              v-if="generationStore.isGhostTagsLoading(rowIdx)"
              class="spinner-border spinner-border-sm text-muted me-1 mb-1"
              style="width: 1rem; height: 1rem"
              role="status"
            >
              <span class="visually-hidden">Loading ghost tags...</span>
            </div>

            <!-- Show ghost tags when loaded -->
            <span
              v-else
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
      >+ Add Asset</a
    >
    <div class="d-flex justify-content-end">
      <button @click.stop="makeTool" class="btn btn-sm btn-light" role="button">
        <SquareStack color="black" :size="15" /> Save Combination
      </button>
    </div>

    <!-- Lasso cursor tooltip - using Teleport to render at body level -->
    <Teleport to="body">
      <div
        v-if="allUtilStore.isToolTip"
        class="lasso-tooltip"
        :style="{
          left: mousePosition.x + 15 + 'px',
          top: mousePosition.y - 10 + 'px',
        }"
      >
        <Split style="transform: rotate(90deg)" color="black" :size="15"></Split>
        <!-- Property mode: show individual tag elements -->
        <div v-if="infoStore.isPropertyMode" class="property-tags-container">
          <div
            v-for="(propTag, index) in infoStore.propertyTags"
            :key="index"
            class="badge bg-dark my-1"
          >
            {{ propTag.tag }}
          </div>
        </div>
        <!-- Customize sets mode: show regular text -->
        <span class="badge bg-dark" v-else>{{ infoStore.lassoTagContent }}</span>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import draggable from 'vuedraggable'
import { useInfoStore } from '@/stores/infoStore'
import { useObject } from '@/stores/objectStore.js'
import EditableLabel from '@/components/EditableLabel.vue'
import { useGeneration } from '@/stores/generationStore.js'
import { useAllUtil } from '@/stores/allUtilStore.js'
import { onMounted, onUnmounted, ref, watch, Teleport, reactive } from 'vue'
import { Tooltip, Popover } from 'bootstrap'
import { Lasso, SquareStack, Split } from 'lucide-vue-next'

const infoStore = useInfoStore()
const objectStore = useObject()
const generationStore = useGeneration()
const allUtilStore = useAllUtil()
const { rows } = storeToRefs(infoStore)
const hoveredRowIndex = ref(null)
const hoveredAddButton = ref(null) // Track which row's add button is hovered
const popoverButton = ref(null)
let currentPopover = null
let ghostTagTimeout = null // Timeout for ghost tag hiding
let propSelected = false // Track if a property is selected for lasso mode
const mousePosition = ref({ x: 0, y: 0 }) // Track mouse position for tooltip
const getRemainingGhostTags = (rowIdx) => {
  if (!rows.value[rowIdx]) return []

  // Only show ghost tags if we have API results for this row
  const dynamicGhostTags = generationStore.getGhostTagsForRow(rowIdx)
  if (dynamicGhostTags.length === 0) {
    return [] // No ghost tags until API responds
  }

  const usedTags = rows.value[rowIdx].tags.map((tag) => tag.tag.toLowerCase())
  const remainingTags = dynamicGhostTags.filter(
    (ghostTag) => !usedTags.includes(ghostTag.toLowerCase()),
  )

  return remainingTags.slice(0, 3 - rows.value[rowIdx].tags.length)
}

const editingStates = reactive({})

function onEditingChanged(rowIdx, tagIdx, editing) {
  if (!editingStates[rowIdx]) editingStates[rowIdx] = {}
  editingStates[rowIdx][tagIdx] = editing
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

// Function to handle tag selection/deselection
const toggleTagSelection = (rowIdx, tagIdx) => {
  const row = rows.value[rowIdx]
  const tag = row.tags[tagIdx]
  const tagData = {
    propName: row.name,
    tag: tag.tag,
    rowIdx,
    tagIdx,
  }

  // Check if tag is already selected
  const existingIndex = infoStore.selectedTags.findIndex(
    (selected) => selected.rowIdx === rowIdx && selected.tagIdx === tagIdx,
  )

  if (existingIndex >= 0) {
    // Deselect: remove from array
    infoStore.selectedTags.splice(existingIndex, 1)
  } else {
    // Select: add to array
    infoStore.selectedTags.push(tagData)
  }

  // Update cursor tooltip and mode based on current selection
  updateCursorTooltip()
}

// Function to update cursor tooltip based on selected tags
const updateCursorTooltip = () => {
  if (infoStore.selectedTags.length > 0) {
    // Enable lasso mode and show selected tags inline
    const tagTexts = infoStore.selectedTags.map((item) => item.tag)
    infoStore.lassoTagContent = tagTexts.join(', ')
    infoStore.isPropertyMode = false // Use regular text display for accumulated tags
    infoStore.propertyTags = []
    // Enter lasso mode with crosshair cursor
    allUtilStore.isToolTip = true
    document.body.classList.add('lasso-cursor-global')

    // Activate the real lasso tool in allUtilStore
    if (!allUtilStore.isLassoMode) {
      allUtilStore.switchLassoMode() // Only toggle if currently off
    }
  } else {
    // No tags selected, exit lasso mode
    exitLassoMode()
  }
}

// Function to check if a tag is selected
const isTagSelected = (rowIdx, tagIdx) => {
  return infoStore.selectedTags.some(
    (selected) => selected.rowIdx === rowIdx && selected.tagIdx === tagIdx,
  )
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
          class="form-control form-control-sm w-100"
          id="customAttributeInput"
          placeholder="Type any attribute..."
          style="min-width: 200px; width: 80%;"
        >
        <small class="text-muted mt-1 d-block">Or choose from:</small>
      </div>
      <div class="d-flex flex-wrap gap-1">
        <button class="btn btn-light attribute-btn" style="font-size: 0.75rem; padding: 0.15rem 0.5rem;" data-attribute="Color Palette">🎨 Color Palette</button>
        <button class="btn btn-light attribute-btn" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" data-attribute="Form">🗿 Form</button>
        <button class="btn btn-light attribute-btn" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" data-attribute="Text">🗛 Text</button>
        <button class="btn btn-light attribute-btn" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" data-attribute="Material">💠 Material</button>
        <button class="btn btn-light attribute-btn" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" data-attribute="Lighting">💡 Lighting</button>
        <button class="btn btn-light attribute-btn" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" data-attribute="Visual Composition">🖼️ Visual Composition</button>
        <button class="btn btn-light attribute-btn" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" data-attribute="The most unique visual feature">📍 The most unique visual feature</button>
      </div>
    </div>
  `.trim()
}

/* Thin wrappers that call store actions */
const addRow = () => infoStore.addRow()
const addTag = (rowIdx) => infoStore.addTag(rowIdx)
const removeTag = (rowIdx, tagIdx) => infoStore.removeTag(rowIdx, tagIdx)
const removeRow = (rowIdx) => infoStore.removeRow(rowIdx)

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

const handleDragStart = (e, tagObj, propName) => {
  objectStore.dragState = 'startDragging'
  if ('uid' in tagObj) {
    //meaning this is one tag being dragged
    objectStore.obj = {
      type: 'tag',
      content: [{ tag: tagObj.tag, propName: propName }],
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

// Watch for lasso mode changes from external sources (like VisualTool)
watch(
  () => allUtilStore.isLassoMode,
  (newVal, oldVal) => {
    // If lasso mode was turned off externally (like via VisualTool button)
    if (oldVal === true && newVal === false && allUtilStore.isToolTip === true) {
      exitLassoMode(true) // Skip store update to avoid infinite loop
    }
  },
)

onMounted(() => {
  // Add global mouse move listener for lasso tooltip
  document.addEventListener('mousemove', handleMouseMove)

  // Add click listener to exit lasso mode when clicking anywhere
  // document.addEventListener('click', exitLassoMode)

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

            // Commit on blur (when clicking elsewhere)
            customInput.addEventListener('blur', (e) => {
              const inputValue = e.target.value.trim()
              if (inputValue) {
                selectAttribute(inputValue)
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

onUnmounted(() => {
  // Clean up global event listeners
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('click', exitLassoMode)
  // Clean up global cursor class
  document.body.classList.remove('lasso-cursor-global')
})

const handleMouseUp = async (rowIdx, propName) => {
  if (objectStore.dragState !== 'startDragging') return
  if (objectStore.obj.type === 'image' || objectStore.obj.type === 'image-cutout') {
    //the dropped thing is an image and is dropped to the property
    const droppedObj = objectStore.obj
    console.log('received dropped object:', droppedObj)
    objectStore.startDragTop = droppedObj.top
    objectStore.startDragLeft = droppedObj.left
    if (objectStore.obj.type === 'image') objectStore.dragState = 'restoreInitialDOM' // this is to ensure image to back in place before the generation starts

    let finalSrc = ''

    if (droppedObj.src.startsWith('data:image')) {
      // It's already a base64 image, use as is
      finalSrc = droppedObj.src
    } else {
      // It's a static path like "/static/xxx.jpg"
      const match = droppedObj.src.match(/static\/.+/)
      if (match) {
        finalSrc = match[0] // e.g., "static/xxx.jpg"
      } else {
        console.warn('Unexpected src format:', droppedObj.src)
      }
    }
    const propVal = await generationStore.describeImage(
      finalSrc,
      propName,
      generationStore.propValSysPrompt,
    )
    //const propVal = ''
    infoStore.addTag(rowIdx, propVal)
    const thumbnailUrl = droppedObj.src
    // const thumbnailUrl = await infoStore.generateThumbnail(propName, propVal)
    infoStore.addThumbnailToTag(rowIdx, thumbnailUrl)
    objectStore.dragState = 'finishedDragging'
    objectStore.obj = {}
  }
}

// Mouse tracking for lasso tooltip
const handleMouseMove = (event) => {
  if (allUtilStore.isToolTip) {
    mousePosition.value = {
      x: event.clientX,
      y: event.clientY,
    }
  }
}

// Function to exit lasso mode
const exitLassoMode = (skipStoreUpdate = false) => {
  allUtilStore.isToolTip = false
  clickedStates.value = {}
  infoStore.selectedTags = []
  infoStore.lassoTagContent = ''
  infoStore.isPropertyMode = false
  infoStore.propertyTags = []
  // Remove global cursor style
  document.body.classList.remove('lasso-cursor-global')

  // Deactivate the real lasso tool in allUtilStore (unless called from watcher to avoid loops)
  if (!skipStoreUpdate && allUtilStore.isLassoMode) {
    allUtilStore.switchLassoMode() // Only toggle if currently on
  }
}
const clickedStates = ref({})

// Function to handle property name click
const handlePropertyNameClick = (rowIdx, row) => {
  // Get the tags for this property row
  const tagTexts = row.tags.map((tag) => ({
    propName: row.name,
    tag: tag.tag,
  }))

  if (tagTexts.length === 0) {
    return // Do nothing if no tags are available
  }

  propSelected = JSON.stringify(infoStore.propertyTags) === JSON.stringify(tagTexts)
  if (propSelected) {
    infoStore.propertyTags = []
    exitLassoMode()
  } else {
    if (clickedStates.value) exitLassoMode()
    if (!clickedStates.value[rowIdx]) clickedStates.value[rowIdx] = {}
    clickedStates.value[rowIdx].propertyName = true
    const row = rows.value[rowIdx]
    row.tags.forEach((tag, tagIdx) => {
      infoStore.selectedTags.push({
        propName: row.name,
        tag: tag.tag,
        rowIdx,
        tagIdx,
      })
    })

    // Set property mode and store individual tags
    infoStore.isPropertyMode = true
    infoStore.propertyTags = tagTexts
    infoStore.lassoTagContent = '' // Clear regular content since we'll use propertyTags

    // Enter lasso mode with crosshair cursor
    allUtilStore.isToolTip = true
    // Add global cursor style to body
    document.body.classList.add('lasso-cursor-global')
    // Activate the real lasso tool in allUtilStore
    if (!allUtilStore.isLassoMode) {
      allUtilStore.switchLassoMode() // Only toggle if currently off
    }
  }
}

// Function to handle Make Lasso Tool button click
const makeTool = () => {
  if (infoStore.selectedTags.length === 0) {
    return // Do nothing if no tags are selected
  }

  // Create the display text for the customized set
  const tagTexts = infoStore.selectedTags.map((item) => item.tag).join(', ')
  const displayText = `${tagTexts}`

  // Find existing "Customized Sets" row or create new one
  let customizedSetsRowIndex = rows.value.findIndex((row) => row.name === 'Customized Attributes')

  if (customizedSetsRowIndex === -1) {
    // No existing "Customized Sets" row, create a new one
    infoStore.addRow()
    customizedSetsRowIndex = rows.value.length - 1
    rows.value[customizedSetsRowIndex].name = 'Customized Attributes'
  }

  // Add the tag with the display text and store the selected tags data
  infoStore.addTag(customizedSetsRowIndex, displayText)

  // Store the selected tags data in the tag object
  const newTagIndex = rows.value[customizedSetsRowIndex].tags.length - 1
  rows.value[customizedSetsRowIndex].tags[newTagIndex].selectedTagsData = [
    ...infoStore.selectedTags,
  ]

  // Clear the selected tags to unselect them visually
  infoStore.selectedTags = []
}
</script>

<style>
/* keep inline‑edited inputs tidy */
.form-control-sm {
  width: auto;
  max-width: 80px;
}

/* Lasso cursor mode */
.lasso-cursor {
  cursor: crosshair !important;
}

.lasso-cursor * {
  cursor: crosshair !important;
}

/* Lasso tooltip */
.lasso-tooltip {
  position: fixed;
  color: black;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  z-index: 9999;
  white-space: pre-line;
  max-width: 300px;
  word-wrap: break-word;
  line-height: 1.2;
}

/* Property tags container */
.property-tags-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 4px;
  background: transparent;
}

/* Global lasso cursor style (not scoped) */
body.lasso-cursor-global,
body.lasso-cursor-global * {
  cursor: crosshair !important;
}
</style>
