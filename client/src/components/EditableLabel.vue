<!-- components/EditableLabel.vue -->
<template>
  <span
    tabindex="0"
    @dblclick="startEditing"
    @keydown="onKeyDown($event)"
    class="btn me-1 position-relative d-inline-flex"
    style="min-width: 70px; min-height: 38px"
  >
    <template v-if="isEditing">
      <input
        v-model="text"
        class="form-control form-control-sm border-0 p-0"
        style="min-height: auto"
        @keyup.enter="save"
        @blur="save"
      />
    </template>
    <template v-else>
      {{ modelValue }}
    </template>
  </span>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useLayers } from '@/stores/layersStore.js'
const model = defineModel()

const emit = defineEmits(['update:modelValue', 'delete-label'])
const props = defineProps({
  type: String, // Your extra prop
  index: Number,
})

const isEditing = ref(false)
const text = ref('')
const layersStore = useLayers()
watch(
  () => model.value,
  (newVal) => {
    if (!isEditing.value) text.value = newVal
  },
)

const startEditing = () => {
  isEditing.value = true
  text.value = model.value
}

const onKeyDown = (e) => {
  if (e.key === 'Delete') {
    emit('delete-label')
  }
}

const save = () => {
  emit('update:modelValue', text.value)
  isEditing.value = false
}
</script>
<style scoped></style>
