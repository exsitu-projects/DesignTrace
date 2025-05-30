<!-- components/EditableLabel.vue -->
<template>
  <span @dblclick="startEditing" :class="`bg-${props.type}`" class="btn me-1">
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
import { useLayers } from '@/stores/layersStore.js'
const model = defineModel()

const emit = defineEmits(['update:modelValue'])
const props = defineProps({
  type: String, // Your extra prop
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

const save = () => {
  emit('update:modelValue', text.value)
  isEditing.value = false
}
</script>
<style scoped>
.bg-object {
  background-color: #ffdddd; /* light red */
  transition: background-color 0.3s ease;
}
.bg-object:hover,
.bg-object:focus {
  background-color: #ffaaaa; /* deeper red */
}

.bg-context {
  background-color: #ddffdd; /* light green */
  transition: background-color 0.3s ease;
}
.bg-context:hover,
.bg-context:focus {
  background-color: #aaddaa; /* deeper green */
}

.bg-style {
  background-color: #ddddff; /* light blue */
  transition: background-color 0.3s ease;
}
.bg-style:hover,
.bg-style:focus {
  background-color: #aaaadd; /* deeper blue */
}
</style>
