import { defineStore } from 'pinia'

function uid() {
  return Date.now()
}

export const useInfoStore = defineStore('infoStore', {
  state: () => ({
    rows: [
      {
        name: 'Color',
        color: 'purple',
        tags: [
          { uid: uid(), text: 'Red' },
          { uid: uid(), text: 'Green' },
        ],
      },
      {
        name: 'Texture',
        color: '#6c757d',
        tags: [
          { uid: uid(), text: 'Rough' },
          { uid: uid(), text: 'Smooth' },
        ],
      },
    ],
  }),

  actions: {
    addRow() {
      this.rows.push({
        name: 'Property',
        color: '#6c757d',
        tags: [{ uid: uid(), text: 'Tag' }],
      })
    },

    addTag(rowIdx, label = 'New') {
      this.rows[rowIdx]?.tags.push({ uid: uid(), text: label })
    },

    removeTag(rowIdx, tagIdx) {
      this.rows[rowIdx]?.tags.splice(tagIdx, 1)
    },
  },
})
