<!-- components/EditableLabel.vue -->
<template>
  <span
    tabindex="0"
    @dblclick="startEditing"
    @keydown="onKeyDown($event)"
    class="btn btn-sm btn-light position-relative d-inline-flex"
    style="min-width: 50px; min-height: 20px"
  >
    <img v-if="props.thumbnail" :src="props.thumbnail" alt="thumb" class="thumb-icon" />
    <template v-if="isEditing">
      <input
        v-model="text"
        class="form-control form-control-sm m-auto border-0 p-0"
        style="min-height: auto"
        @keyup.enter="save"
        @blur="save"
      />
    </template>
    <template v-else class="m-auto">
      {{ modelValue }}
    </template>
  </span>
</template>

<script setup>
import { ref, watch } from 'vue'
const model = defineModel()

const emit = defineEmits(['update:modelValue', 'delete-label'])
const props = defineProps({
  type: String, // Your extra prop
  index: Number,
  thumbnail: { type: String, default: null },
})

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
<style>
.thumb-icon {
  width: 20px;
  height: 20px;
  border-radius: 8px; /* nice rounded corners, but not a circle */
  object-fit: cover; /* 👈 show the real-size image pixels */
  object-position: center; /* or 'center' if you prefer */
  margin-right: 0.5rem;
  align-self: center;
}
</style>
