import { defineStore } from 'pinia'
import { ref } from 'vue'

// Shared camera for the infinite canvas.
// World coordinates are what nodes (alt.position) and the free Fabric canvas (scene coords) use.
// screen = world * zoom + pan
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

export const useCamera = defineStore('camera', () => {
  const x = ref(0)
  const y = ref(0)
  const zoom = ref(1)

  const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  function screenToWorld(sx, sy) {
    return { x: (sx - x.value) / zoom.value, y: (sy - y.value) / zoom.value }
  }

  function worldToScreen(wx, wy) {
    return { x: wx * zoom.value + x.value, y: wy * zoom.value + y.value }
  }

  function panBy(dx, dy) {
    x.value += dx
    y.value += dy
  }

  // Zoom keeping the world point under (sx, sy) fixed on screen
  function zoomAt(sx, sy, newZoom) {
    const z = clampZoom(newZoom)
    const world = screenToWorld(sx, sy)
    zoom.value = z
    x.value = sx - world.x * z
    y.value = sy - world.y * z
  }

  // Zoom around the middle of the window (toolbar buttons and shortcuts)
  function zoomBy(factor) {
    zoomAt(window.innerWidth / 2, window.innerHeight / 2, zoom.value * factor)
  }

  function resetZoom() {
    zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1)
  }

  // Fit a world rectangle into the window, leaving room for the bottom toolbar
  function fitRect({ left, top, right, bottom }, padding = 60, bottomInset = 80) {
    const w = right - left
    const h = bottom - top
    if (!(w > 0 && h > 0)) return
    const availW = window.innerWidth - padding * 2
    const availH = window.innerHeight - padding * 2 - bottomInset
    const z = clampZoom(Math.min(availW / w, availH / h, 1))
    zoom.value = z
    x.value = padding + (availW - w * z) / 2 - left * z
    y.value = padding + (availH - h * z) / 2 - top * z
  }

  // World position at the centre of the window
  function viewCenter() {
    return screenToWorld(window.innerWidth / 2, window.innerHeight / 2)
  }

  return {
    x,
    y,
    zoom,
    screenToWorld,
    worldToScreen,
    panBy,
    zoomAt,
    zoomBy,
    resetZoom,
    fitRect,
    viewCenter,
  }
})
