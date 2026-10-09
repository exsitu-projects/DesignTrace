import { onMounted, onBeforeUnmount } from 'vue'
import { useCamera } from '@/stores/cameraStore.js'
import { useNode } from '@/stores/nodeStore.js'

// UI that scrolls by itself: plain wheel events there are left alone
const SELF_SCROLLING =
  '.palette-panel, .review-prompt-modal, textarea, select, .dropdown-menu, .popover'
const ZOOM_STEP = 1.2

// Free canvas content bounds (world coords), registered by FreeCanvas
let freeCanvasBounds = () => null
export function registerFreeCanvasBounds(fn) {
  freeCanvasBounds = fn
}

// Zoom and pan so every node and free-canvas object is visible
export function fitAll() {
  const camera = useCamera()
  const b = { ...useNode().contentBounds }
  const fc = freeCanvasBounds()
  if (fc) {
    b.left = Math.min(b.left, fc.left)
    b.top = Math.min(b.top, fc.top)
    b.right = Math.max(b.right, fc.right)
    b.bottom = Math.max(b.bottom, fc.bottom)
  }
  if (!isFinite(b.left) || !isFinite(b.top)) {
    camera.resetZoom()
    return
  }
  camera.fitRect(b)
}

function isTyping() {
  const el = document.activeElement
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

// Figma-style navigation:
// - trackpad scroll / mouse wheel pans, pinch or Ctrl/Cmd + wheel zooms at the cursor
// - Space + drag or middle-mouse drag pans
// - Cmd/Ctrl + = / - / 0 zoom in / out / 100%, Shift + 1 fits everything
export function useCanvasNavigation() {
  const camera = useCamera()

  let spaceDown = false
  let panning = null // { x, y } last pointer position while panning

  function onWheel(e) {
    if (e.defaultPrevented) return // e.g. a node's tag row scrolling sideways
    const zoomGesture = e.ctrlKey || e.metaKey // trackpad pinch arrives as ctrl + wheel
    if (!zoomGesture && e.target.closest?.(SELF_SCROLLING)) return
    e.preventDefault()
    // deltaMode 1 = lines (some mouse wheels), normalise to pixels
    const scale = e.deltaMode === 1 ? 16 : 1
    const dx = e.deltaX * scale
    const dy = e.deltaY * scale
    if (zoomGesture) {
      // pinch sends small deltas, a mouse wheel ~100 per notch; clamp so one notch is ~1.22x
      const step = Math.max(-40, Math.min(40, dy))
      camera.zoomAt(e.clientX, e.clientY, camera.zoom * Math.exp(-step * 0.005))
    } else if (e.shiftKey && dx === 0) {
      camera.panBy(-dy, 0) // shift + mouse wheel scrolls sideways
    } else {
      camera.panBy(-dx, -dy)
    }
  }

  // Safari sends trackpad pinches as gesture events instead of ctrl + wheel
  let gestureStartZoom = 1
  function onGestureStart(e) {
    e.preventDefault()
    gestureStartZoom = camera.zoom
  }
  function onGestureChange(e) {
    e.preventDefault()
    camera.zoomAt(e.clientX, e.clientY, gestureStartZoom * e.scale)
  }

  function startPan(e) {
    panning = { x: e.clientX, y: e.clientY }
    document.body.classList.add('canvas-panning')
    e.preventDefault()
    e.stopPropagation() // keep Fabric and node dragging from also reacting
  }

  function onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) startPan(e)
  }

  function onMouseMove(e) {
    if (!panning) return
    camera.panBy(e.clientX - panning.x, e.clientY - panning.y)
    panning = { x: e.clientX, y: e.clientY }
    e.stopPropagation()
  }

  function onMouseUp(e) {
    if (!panning) return
    panning = null
    document.body.classList.remove('canvas-panning')
    e.stopPropagation()
  }

  function onKeyDown(e) {
    if (isTyping()) return
    if (e.code === 'Space') {
      e.preventDefault() // no page scroll / button activation
      if (!spaceDown) {
        spaceDown = true
        document.body.classList.add('canvas-pan-ready')
      }
      return
    }
    const mod = e.ctrlKey || e.metaKey
    if (mod && (e.key === '=' || e.key === '+')) {
      e.preventDefault()
      camera.zoomBy(ZOOM_STEP)
    } else if (mod && e.key === '-') {
      e.preventDefault()
      camera.zoomBy(1 / ZOOM_STEP)
    } else if (mod && e.key === '0') {
      e.preventDefault()
      camera.resetZoom()
    } else if (e.shiftKey && e.code === 'Digit1') {
      e.preventDefault()
      fitAll()
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space') {
      spaceDown = false
      document.body.classList.remove('canvas-pan-ready')
    }
  }

  function onBlur() {
    spaceDown = false
    panning = null
    document.body.classList.remove('canvas-pan-ready', 'canvas-panning')
  }

  onMounted(() => {
    window.addEventListener('wheel', onWheel, { passive: false })
    // capture phase so panning wins over Fabric and node dragging
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('mousemove', onMouseMove, true)
    window.addEventListener('mouseup', onMouseUp, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('gesturestart', onGestureStart)
    window.addEventListener('gesturechange', onGestureChange)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('mousedown', onMouseDown, true)
    window.removeEventListener('mousemove', onMouseMove, true)
    window.removeEventListener('mouseup', onMouseUp, true)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('gesturestart', onGestureStart)
    window.removeEventListener('gesturechange', onGestureChange)
  })
}
