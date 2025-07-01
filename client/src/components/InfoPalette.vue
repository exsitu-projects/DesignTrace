<template>
  <div class="content">
    <!-- One row per visual property -->
    <div
      v-for="(row, rowIdx) in rows"
      :key="rowIdx"
      class="d-flex flex-column flex-md-row align-items-start mb-2"
    >
      <!-- Editable property name tag (not draggable) -->

      <EditableLabel v-model="row.name" />

      <!-- Draggable area for tags -->
      <draggable
        v-model="row.tags"
        item-key="uid"
        :animation="200"
        class="d-flex flex-wrap align-items-center"
      >
        <!-- each tag -->
        <template #item="{ element, index: tagIdx }">
          <span class="badge bg-light text-dark d-flex align-items-center me-1 mb-1">
            <input
              v-model="element.text"
              class="form-control form-control-sm border-0 bg-transparent p-0 me-1"
            />
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
    <button class="btn btn-sm btn-outline-dark" @click="addRow">+ Add property</button>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import draggable from 'vuedraggable'
import { useInfoStore } from '@/stores/infoStore'
import EditableLabel from '@/components/EditableLabel.vue'

const infoStore = useInfoStore()
const { rows } = storeToRefs(infoStore)

/* Thin wrappers that call store actions */
const addRow = () => infoStore.addRow()
const addTag = (rowIdx) => infoStore.addTag(rowIdx)
const removeTag = (rowIdx, tagIdx) => infoStore.removeTag(rowIdx, tagIdx)
</script>

<style scoped>
/* keep inline‑edited inputs tidy */
.form-control-sm {
  width: auto;
  max-width: 80px;
}
</style>
