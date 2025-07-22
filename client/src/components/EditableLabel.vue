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
        ref="input"
        class="form-control form-control-sm m-auto border-0 p-0"
        :style="{ minHeight: 'auto', maxWidth: '500px', width: inputWidth + 'px' }"
        @keyup.enter="() => save()"
        @blur="() => save()"
      />
      <!-- hidden span to measure text width -->
      <span ref="sizer" class="invisible position-absolute" style="white-space: pre">{{
        text || ' '
      }}</span>
    </template>

    <template v-else>
      <span
        class="text-truncate d-inline-block"
        style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
      >
        {{ modelValue }}
      </span>
    </template>
  </span>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const model = defineModel()
const emit = defineEmits(['update:modelValue', 'delete-label', 'property-name-finalized'])

const props = defineProps({
  type: String,
  index: Number,
  thumbnail: { type: String, default: null },
  isPropertyName: { type: Boolean, default: false },
})

const isEditing = ref(false)
const text = ref('')
const inputWidth = ref(50)

const sizer = ref(null)
const input = ref(null)

watch(
  () => model.value,
  (newVal) => {
    if (!isEditing.value) text.value = newVal
  },
)

watch(text, () => {
  updateWidth()
})

const updateWidth = () => {
  nextTick(() => {
    if (sizer.value) {
      const width = sizer.value.offsetWidth + 10
      inputWidth.value = Math.min(Math.max(width, 50), 500)
    }
  })
}

const startEditing = () => {
  isEditing.value = true
  text.value = model.value
  updateWidth()

  // Focus the input element after DOM update
  nextTick(() => {
    if (input.value) {
      input.value.focus()
      console.log('Input element focused')
    }
  })
}

const onKeyDown = (e) => {
  if (e.key === 'Delete') {
    emit('delete-label')
  }
}

const save = () => {
  emit('update:modelValue', text.value)

  // Debug logging
  console.log('EditableLabel save called:', {
    isPropertyName: props.isPropertyName,
    textValue: text.value,
    isNotAttribute: text.value !== 'Attribute',
    isNotEmpty: text.value.trim() !== '',
  })

  // Only emit property-name-finalized if this is specifically a property name EditableLabel
  if (props.isPropertyName && text.value !== 'Attribute' && text.value.trim() !== '') {
    emit('property-name-finalized', text.value)
  }

  isEditing.value = false
}
</script>

<style>
.thumb-icon {
  width: 20px;
  height: 20px;
  border-radius: 8px;
  object-fit: cover;
  object-position: center;
  margin-right: 0.5rem;
  align-self: center;
}
</style>
