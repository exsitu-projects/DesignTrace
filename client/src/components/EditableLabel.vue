<!-- components/EditableLabel.vue -->
<template>
  <span @dblclick="startEditing" class="btn btn-success me-1">
    <template v-if="isEditing">
      <input
        v-model="text"
        class="form-control"
        style="height: 100%"
        @keyup.enter="save"
        @blur="save"
        autofocus
      />
    </template>
    <template v-else>
      {{ modelValue }}
    </template>
  </span>
</template>

<script setup>
import { ref, watch } from 'vue'

const model = defineModel()
const emit = defineEmits(['update:modelValue'])

const isEditing = ref(false)
const text = ref('')

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

const save = () => {
  emit('update:modelValue', text.value)
  isEditing.value = false
}
</script>
