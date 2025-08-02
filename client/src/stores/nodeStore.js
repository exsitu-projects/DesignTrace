import { defineStore } from 'pinia'
import { ref, computed, nextTick } from 'vue'
import { useGeneration } from '@/stores/generationStore.js'

/**
 * Node Store - Manages the node structure for the design application
 *
 * Data Structure Hierarchy:
 * - nodeBranchList: Collection of branches (forest)
 *   - nodeBranch: A branch containing connected nodes
 *     - node: A point on the branch containing alternatives
 *       - alt: Smallest unit - an "alternative" design
 */
export const useNode = defineStore('nodes', () => {
  // ===== DEFAULT SIZING CONSTANTS =====
  const DEFAULT_CANVAS_WIDTH = 300
  const DEFAULT_NODE_WIDTH = DEFAULT_CANVAS_WIDTH + 20
  const DEFAULT_NODE_HEIGHT = DEFAULT_CANVAS_WIDTH + 100
  const INITIAL_NODE_X = 150
  const INITIAL_NODE_Y = 150
  const NODE_ADJACENCY_SPACING = 100

  const exportAlt = ref({})
  // ===== REACTIVE SIZING =====
  // Global default sizes (can be modified)
  const defaultCanvasWidth = ref(DEFAULT_CANVAS_WIDTH)
  const defaultNodeWidth = computed(() => defaultCanvasWidth.value + 20)
  const defaultNodeHeight = computed(() => defaultCanvasWidth.value + 100)

  // ===== STATE =====
  // Core data structure
  const nodeBranchList = ref([])

  // Current selections and positions
  const currentBranchId = ref(null)
  const currentNodeId = ref(null)
  const layerPayload = ref(null)

  // Layout boundaries
  const nodeXR = ref(1920) // Right boundary
  const nodeYB = ref(1080) // Bottom boundary
  const nodeYT = ref(0) // Top boundary
  const offsetY = ref(0) // Vertical offset for positioning

  // Selection state
  const selectedIndices = ref([])
  const selectedBranchId = ref('')
  const lastSelectedIndex = ref(null)
  const ctrlPressed = ref(false)

  // Hover state for expanded alts
  const hoveredParentAltId = ref(null)

  // Payloads and temporary data
  const selectionPayload = ref({})
  const currentColorPenInfo = ref({})
  const addAltImgPayload = ref({})
  const requestCanvasData = ref({ status: false })

  // Canvas data promise resolver
  let resolveCanvasData

  // External dependencies
  const generationStore = useGeneration()

  // ===== HELPER FUNCTIONS =====

  /**
   * Check if a value is empty (null, undefined, empty string, or whitespace-only)
   * @param {any} value - The value to check
   * @returns {boolean} - True if the value is considered empty
   */
  function isEmpty(value) {
    return !value || (typeof value === 'string' && value.trim() === '')
  }

  /**
   * Validate that object properties are not empty
   * @param {Object} properties - Object with properties to validate
   * @param {string[]} requiredFields - Array of field names that must not be empty
   * @returns {boolean} - True if all required fields are valid
   */
  function validateObjectProperties(properties, requiredFields) {
    return requiredFields.every((field) => !isEmpty(properties[field]))
  }

  /**
   * Find an alt by its ID across all branches and nodes
   * @param {string} altId - The ID of the alt to find
   * @returns {Object|undefined} - The found alt object or undefined
   */
  function findAlt(altId) {
    const allAlts = nodeBranchList.value.flatMap((branch) =>
      branch.nodes.flatMap((node) => node.alts),
    )
    return allAlts.find((alt) => alt.id === altId)
  }

  /**
   * Generate a unique ID with timestamp and optional suffix
   * @param {string} prefix - The prefix for the ID
   * @param {string} suffix - Optional suffix for the ID
   * @returns {string} - A unique ID
   */
  function generateId(prefix, suffix = '') {
    return `${prefix}_${Date.now()}${suffix}`
  }

  /**
   * Calculate layout boundaries and update positioning refs
   * @param {number} x - The x coordinate
   * @param {number} y - The y coordinate
   * @param {number} nodeWidth - The width of the node
   * @param {number} nodeHeight - The height of the node
   */
  function updateLayoutBoundaries(
    x,
    y,
    nodeWidth = defaultNodeWidth.value,
    nodeHeight = defaultNodeHeight.value,
  ) {
    nodeXR.value = Math.max(nodeXR.value, x + nodeWidth)
    nodeYB.value = Math.max(nodeYB.value, y + nodeHeight)
    nodeYT.value = Math.min(nodeYT.value, y)
  }

  // ===== UNDO/REDO HISTORY =====

  /**
   * Save the canvas state for a specific alt
   * @param {string} altId - ID of the alt to save state for
   * @param {string} canvasState - JSON string representation of canvas state
   */
  function saveState(altId, canvasState) {
    const alt = findAlt(altId)
    if (!alt) return

    // Initialize history if it doesn't exist
    if (!alt.history) {
      alt.history = {
        undoStack: [],
        redoStack: [],
        currentIndex: -1, // Track current history index
      }
    }

    // Add current state to undo stack
    alt.history.undoStack.push(canvasState)
    alt.history.redoStack = [] // Clear redo stack on new action

    // Update current index to the latest state
    alt.history.currentIndex = alt.history.undoStack.length - 1

    // Associate pending properties with this history state
    // Only assign historyStateIndex when undoStack has more than 1 entry (aligns with undo button logic)
    const currentHistoryIndex = alt.history.undoStack.length - 1
    if (alt.history.undoStack.length > 1) {
      alt.properties.forEach((property) => {
        if (property.pendingHistoryAssociation) {
          property.historyStateIndex = currentHistoryIndex
          property.pendingHistoryAssociation = false
        }
      })
    }

    // Limit undo stack size to prevent memory issues
    const MAX_HISTORY = 50
    if (alt.history.undoStack.length > MAX_HISTORY) {
      alt.history.undoStack.shift()
      // Adjust all history indices when we shift the stack
      alt.properties.forEach((property) => {
        if (typeof property.historyStateIndex === 'number' && property.historyStateIndex > 0) {
          property.historyStateIndex -= 1
        }
      })
    }
  }

  /**
   * Undo the last action for a specific alt
   * @param {string} altId - ID of the alt to perform undo on
   * @returns {string|null} - Previous state or null if undo not possible
   */
  function undo(altId) {
    const alt = findAlt(altId)
    if (!alt || !alt.history || alt.history.undoStack.length <= 1) {
      return null
    }

    const currentState = alt.history.undoStack.pop()
    alt.history.redoStack.push(currentState)

    // Update current index
    alt.history.currentIndex = alt.history.undoStack.length - 1

    return alt.history.undoStack[alt.history.undoStack.length - 1]
  }

  /**
   * Redo the last undone action for a specific alt
   * @param {string} altId - ID of the alt to perform redo on
   * @returns {string|null} - Redone state or null if redo not possible
   */
  function redo(altId) {
    const alt = findAlt(altId)
    if (!alt || !alt.history || alt.history.redoStack.length === 0) {
      return null
    }

    const redoState = alt.history.redoStack.pop()
    alt.history.undoStack.push(redoState)

    // Update current index
    alt.history.currentIndex = alt.history.undoStack.length - 1

    return redoState
  }

  /**
   * Navigate to a specific history state index
   * @param {string} altId - ID of the alt
   * @param {number} targetIndex - The history index to navigate to
   * @returns {string|null} - The target state or null if invalid
   */
  function navigateToHistoryState(altId, targetIndex) {
    const alt = findAlt(altId)
    if (!alt || !alt.history || targetIndex < 0 || targetIndex >= alt.history.undoStack.length) {
      return null
    }

    // Update current index to the target
    alt.history.currentIndex = targetIndex

    return alt.history.undoStack[targetIndex]
  }

  // ===== BRANCH MANAGEMENT =====

  /**
   * Add a new node branch to the forest
   * @returns {Object} - The newly created branch
   */
  function addNodeBranch() {
    const newBranch = {
      id: generateId('branch'),
      nodes: [],
      parents: [],
      steps: [],
      expandedAltIds: [],
    }

    currentBranchId.value = newBranch.id
    nodeBranchList.value.push(newBranch)

    return newBranch
  }

  // ===== LAYOUT AND POSITIONING =====

  /**
   * Set the right boundary position
   * @param {number} newVal - New right boundary value
   */
  function setNodeXR(newVal) {
    nodeXR.value = newVal
  }

  /**
   * Set the bottom boundary position
   * @param {number} newVal - New bottom boundary value
   */
  function setNodeYB(newVal) {
    nodeYB.value = newVal
  }

  // ===== NODE MANAGEMENT =====

  /**
   * Add a new node to a specific branch
   * @param {string} nodeBranchId - ID of the branch to add node to
   * @param {number} midXPos - X position of the node
   * @param {number} midYPos - Y position of the node
   * @returns {Object|null} - The newly created node or null if branch not found
   */
  function addNode(nodeBranchId, midXPos = INITIAL_NODE_X, midYPos = INITIAL_NODE_Y) {
    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)
    if (!branch) {
      console.warn(`Branch with ID ${nodeBranchId} not found`)
      return null
    }

    const newNode = {
      id: generateId('node'),
      alts: [],
      midXPos,
      midYPos,
    }

    currentNodeId.value = newNode.id
    branch.nodes.push(newNode)
    return newNode
  }

  // ===== LASSO AND COLOR PEN MANAGEMENT =====

  /**
   * Set lasso information for a specific alt
   * @param {Object} lassoPayload - Payload containing lasso information
   */
  function setCurrentLassoInfo(lassoPayload) {
    const alt = findAlt(lassoPayload.altId)
    if (alt) {
      alt.lassoPayload = lassoPayload
    } else {
      console.warn(`Alt with ID ${lassoPayload.altId} not found`)
    }
  }

  /**
   * Apply color pen effect and generate new image
   * @param {Object} colorPenPayload - Payload containing color pen information
   * @returns {string|null} - URL of the generated image or null if generation failed
   */
  async function applyColorPen(colorPenPayload) {
    currentColorPenInfo.value = colorPenPayload
    let imgUrl = null

    try {
      // Get prompt suggestion based on images
      const output = await generationStore.guessPrompt({
        original_image: colorPenPayload.original_image,
        add_color_image: colorPenPayload.add_color_image,
        add_edge_image: colorPenPayload.add_edge_image,
      })

      // Generate the image with the prompt
      currentColorPenInfo.value.prompt = output
      imgUrl = await generationStore.generateMaskedImg(currentColorPenInfo.value)

      // Update payload for rendering
      addAltImgPayload.value = {
        url: imgUrl,
        altId: colorPenPayload.altId,
      }
    } catch (error) {
      console.error('Image generation failed:', error)
    }

    return imgUrl
  }

  // ===== PARENT MANAGEMENT =====

  /**
   * Update parent relationships and visibility for selected alts
   * @param {string[]} selectedAltIdArr - Array of selected alt IDs
   * @param {string} branchId - ID of the branch to update
   */
  // NOTE: Change variable name: 'visible' to 'hidden'
  // It no longer means visible since we are hidding alts under parents
  function updateParents(selectedAltIdArr, branchId) {
    console.log(selectedAltIdArr)
    const branch = nodeBranchList.value.find((b) => b.id === branchId)
    if (!branch) {
      console.warn(`Branch with ID ${branchId} not found`)
      return
    }

    // Get all alts in the branch and all alts in previous steps
    const allAlts = branch.nodes.flatMap((n) => n.alts)
    const allAltsInSteps = branch.steps.flatMap((step) => step)

    const newParents = []

    for (const alt of allAlts) {
      // iterate through all alts, if it is hidden/visible, means that we have visited it before,
      // then we dont need to visit it again
      if (alt.expand === true) {
        // If an alt is not included in steps, means we have not visited this alt
        if (!allAltsInSteps.includes(alt.id)) {
          let childAlt = alt
          let currentChildId = alt.id
          let currentParentId = childAlt.prevAltId
          // While the parent of current alt is not in steps, then we need to search the parent of parent

          while (currentParentId && !allAltsInSteps.includes(currentParentId)) {
            // here we move to the parent of parent
            // This might looks odd, but it makes sense because since the currentparent is not in steps,
            // so we need to keep searching from here
            childAlt = allAlts.find((a) => a.id === currentParentId)
            childAlt.expand = false

            // childAlt.visibleEdges = childAlt.visibleEdges.filter(
            //   (edge) => edge.toAltId !== currentChildId,
            // )
            currentChildId = currentParentId
            // IO dont know if this assignment works or not
            // Right now, we have currentChildId = currentParentId
            // Update CurrParentID, so we move forward to check if the parent of childAlt is inside steps
            currentParentId = childAlt?.prevAltId || null
          }
          // Remove the visibleEdge from currentParent (a parent in steps) to the alt that we are looking at
          const parentAlt = allAlts.find((a) => a.id === currentParentId)
          // parentAlt.visibleEdges = parentAlt.visibleEdges.filter(
          //   (edge) => edge.toAltId !== currentChildId,
          // )
          // Then we are still in the for loop, we need to know if alt is slected or not:
          if (selectedAltIdArr.includes(alt.id)) {
            alt.expand = true
            if (parentAlt) {
              // parentAlt.visible = true
              parentAlt.visibleEdges.push({
                fromAltId: currentParentId,
                toAltId: alt.id,
              })
            }
          } else {
            branch.expandedAltIds.push(alt.id)
            console.log(branch.expandedAltIds)
            // console.log('allAltsInSteps', allAltsInSteps)
            if (branch.expandedAltIds.includes(alt.id) && !allAltsInSteps.includes(alt.id)) {
              // unselected alt, so we move it to the parentAlt position
              alt.expand = false

              // Count how many other expanded alts are already stacked at this parent's position
              const stackedAltsAtParent = branch.expandedAltIds.filter((expandedId) => {
                const expandedAlt = allAlts.find((a) => a.id === expandedId)
                return (
                  expandedAlt &&
                  expandedAlt.id !== alt.id &&
                  expandedAlt.prevAltId === alt.prevAltId
                )
              }).length

              const stackOffset = 35 // pixels between each stacked card

              // Position at parent's location with stacking
              alt.position.x = parentAlt.position.x + stackedAltsAtParent * 3 // slight horizontal offset
              alt.position.y = parentAlt.position.y - (50 + stackedAltsAtParent * stackOffset) // stack vertically above parent
              alt.z = parentAlt.z - 1 - stackedAltsAtParent // layer below parent, with proper ordering
            }
          }

          newParents.push(alt.id)
        }
      }
      branch.parents.push(newParents)
      branch.steps.push(newParents)
    }
  }

  // ===== ALT MANAGEMENT =====

  /**
   * Create a new alt object with default properties
   * @param {Object} altObj - Alt properties object
   * @param {string} nodeBranchId - Branch ID
   * @param {number} index - Index for ID generation
   * @param {number} posX - X position
   * @param {number} posY - Y position
   * @param {string|null} prevAltId - Previous alt ID for connections
   * @param {string|null} nodeId - Node ID
   * @returns {Object} New alt object
   */
  function createAlt(altObj, nodeBranchId, index, posX, posY, prevAltId = null, nodeId = null) {
    return {
      id: generateId('alt', index),
      position: { x: posX, y: posY },
      branchId: nodeBranchId,
      nodeId: nodeId,
      edges: [],
      visibleEdges: [],
      nextAltId: [],
      prevAltId,
      z: 1000,
      properties: altObj,
      visible: true,
      history: {
        undoStack: [],
        redoStack: [],
        currentIndex: -1, // Initialize current index properly
      },
      expand: true,
      isStepLock: false,
      // Individual alt sizing (can be different from defaults)
      sizing: {
        canvasWidth: defaultCanvasWidth.value,
        nodeWidth: defaultNodeWidth.value,
        nodeHeight: defaultNodeHeight.value,
      },
    }
  }

  /**
   * Generate a prompt for OpenAI image generation
   * @param {string} propsAltered - Comma-separated property names being altered
   * @param {string} adjObjectText - Object adjectives from detection
   * @param {string} objectText - Object name from detection
   * @param {string[]} descriptors - Array of property descriptions
   * @returns {string} Formatted prompt
   */
  function openAIPrompt(propsAltered, adjObjectText, objectText, descriptors) {
    return `Change the ${propsAltered} of the ${adjObjectText} ${objectText} into ${descriptors.join(' and ')} while other visual properties remain the same.`
  }

  /**
   * Generate a prompt for MagicQuill image generation
   * @param {string} propsAltered - Comma-separated property names being altered
   * @param {string} guessPrompt - Additional context for prompt
   * @param {string} objectText - Object name from detection
   * @param {string[]} descriptors - Array of property descriptions
   * @returns {string} Formatted prompt
   */
  function magicQPrompt(propsAltered, guessPrompt, objectText, descriptors) {
    return `${descriptors.join(' and ')}${guessPrompt} ${objectText}`
  }

  /**
   * Generate a prompt for Imagen image generation
   * @param {string} propsAltered - Comma-separated property names being altered
   * @param {string} adjObjectText - Object adjectives from detection
   * @param {string} objectText - Object name from detection
   * @param {string[]} descriptors - Array of property descriptions
   * @param {string} visibleProps - Properties to preserve
   * @param objOrProp
   * @returns {string} Formatted prompt
   */

  function openAIMaskPrompt(
    propsAltered,
    adjObjectText,
    objectText,
    descriptors,
    visibleProps,
    objOrProp,
  ) {
    return (
      'Transform the selected ' +
      objectText +
      ' in the mask to ' +
      `${descriptors.join(' and ')}` +
      ' in the same style, keeping its ' +
      visibleProps +
      '. Keep other unmasked parts of the image intact.'
    )
  }
  function imagenPrompt(
    propsAltered,
    adjObjectText,
    objectText,
    descriptors,
    visibleProps,
    objOrProp,
  ) {
    console.log('objOrProp', objOrProp)
    if (objOrProp === 'object') {
      return (
        `${descriptors.join(' and ')}, in ` + visibleProps
        //+ ' in the style of ' + adjObjectText
      )
    } else if (objOrProp === 'property') {
      //return `Transform the ${objectText} in the masked area to be ${descriptors.join(' and ')} and focus on the ${adjObjectText}.`
      return `Change to ${descriptors.join(' and ')} ${objectText} while keeping its ${visibleProps}.`
    }

    //return 'an apple illustration'
  }

  /**
   * Generate image based on properties and payload
   * This extracted function handles the common image generation logic
   * @param {Array} properties - Array of property objects
   * @param {string} propsAltered - Comma-separated property names being altered
   * @param {string} adjObjectText - Object adjectives from detection
   * @param {string} objectText - Object name from detection
   * @param {string} visibleProps - Properties to preserve
   * @param objOrProp
   * @param {string} altId - Alt ID for the generated image
   * @returns {Promise<string|null>} URL of generated image or null if failed
   */
  async function generateImage(
    properties,
    propsAltered,
    adjObjectText,
    objectText,
    visibleProps,
    objOrProp,
    altId,
  ) {
    try {
      const descriptors = properties.map((p) => `${p.tag} ${p.propName}`)
      const copiedPayload = { ...selectionPayload.value }
      let imgUrl = null

      // Generate appropriate prompt and image based on payload type
      if (copiedPayload.type === 'full-img') {
        const prompt = openAIPrompt(propsAltered, adjObjectText, objectText, descriptors)
        console.log('Generated prompt:', prompt)

        copiedPayload.prompt = prompt
        copiedPayload.altId = altId
        imgUrl = await generationStore.generateOpenAIImg(copiedPayload)
      } else if (copiedPayload.type === 'lasso') {
        const prompt = openAIMaskPrompt(
          propsAltered,
          adjObjectText,
          objectText,
          descriptors,
          visibleProps,
          objOrProp,
        )
        //'Transform the selected strawberry in the mask to banana in the same style, while keeping other unmasked parts of the packaging intact'
        console.log('Generated prompt:', prompt)

        copiedPayload.prompt = prompt
        copiedPayload.altId = altId
        imgUrl = await generationStore.generateOpenAIImg(copiedPayload)
      }

      if (imgUrl) {
        addAltImgPayload.value = { url: imgUrl, altId: altId }
      }

      return imgUrl
    } catch (error) {
      console.error('Image generation failed:', error)
      return null
    }
  }

  /**
   * Get object properties from image
   * This extracted function handles common object detection logic
   * @param {string} imageUrl - URL of the image to analyze
   * @param {string} propsAltered - Comma-separated property names being altered
   * @returns {Promise<Object>} Object with detected properties
   */
  async function getObjectProperties(imageUrl, propsAltered) {
    try {
      //const result = ''
      const result = await generationStore.excludePropObject(imageUrl, propsAltered)
      return {
        adjObjectText: result.adjObjectText,
        objectText: result.objectText,
        visibleProps: result.visibleProps,
        objOrProp: result.objOrProp,
      }
    } catch (error) {
      console.error('Object detection failed:', error)
      return {
        adjObjectText: '',
        objectText: '',
        visibleProps: '',
        objOrProp: '',
      }
    }
  }

  /**
   * Add a new alt to a node with optional image generation
   * @param {Object} altObj - Alt properties object
   * @param {string} nodeBranchId - Branch ID
   * @param {string} nodeId - Node ID
   * @param {number} index - Index for ID generation
   * @param {string|null} nextNodeId - Next node ID
   * @param {number} posX - X position (default: INITIAL_NODE_X)
   * @param {number} posY - Y position (default: INITIAL_NODE_Y)
   * @param {string|null} prevAltId - Previous alt ID for connections
   * @param {string} propsAltered - Comma-separated property names being altered
   * @param adjObjectText
   * @param objectText
   * @param visibleProps
   * @param objOrProp
   * @returns {Promise<string|null>} URL of generated image or null if failed
   */
  async function addAlt(
    altObj,
    nodeBranchId,
    nodeId,
    index,
    nextNodeId = null,
    posX = INITIAL_NODE_X,
    posY = INITIAL_NODE_Y,
    prevAltId = null,
    propsAltered = '',
    adjObjectText = '',
    objectText = '',
    visibleProps = '',
    objOrProp = '',
  ) {
    // Find relevant branch and nodes
    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)
    const prevNode = branch?.nodes.find((n) => n.id === nodeId)
    const newNode = branch?.nodes.find((n) => n.id === nextNodeId)
    let imgUrl = null

    if (!branch || !prevNode) {
      console.warn('Required branch or node not found')
      return null
    }

    // Create the new alt object
    const newAlt = createAlt([altObj], nodeBranchId, index, posX, posY, prevAltId, nextNodeId)

    // Handle alt with previous connection
    if (prevAltId) {
      if (newNode) {
        // Add to new node
        newNode.alts.push(newAlt)
        const prevAlt = prevNode.alts.find((alt) => alt.id === prevAltId)

        if (prevAlt) {
          // Create bidirectional links between alts
          const edge = { fromAltId: prevAltId, toAltId: newAlt.id }
          prevAlt.edges.push(edge)
          prevAlt.visibleEdges.push(edge)
          prevAlt.nextAltId.push(newAlt.id)
        }
      }

      // Generate image if properties are specified
      if (propsAltered && adjObjectText && objectText) {
        imgUrl = await generateImage(
          newAlt.properties,
          propsAltered,
          adjObjectText,
          objectText,
          visibleProps,
          objOrProp,
          newAlt.id,
        )
      }
    } else {
      // Handle first alt in branch
      const isFirstAltInBranch =
        branch.nodes.length > 0 && branch.nodes[0].id === nodeId && prevNode.alts.length === 0

      if (isFirstAltInBranch) {
        branch.parents.push(newAlt.id)
        branch.steps.push([newAlt.id])
      }
      prevNode.alts.push(newAlt)
    }

    return imgUrl
  }

  // ===== CANVAS DATA MANAGEMENT =====

  /**
   * Create a promise to request canvas data for a specific alt
   * @param {string} requestAltId - Alt ID for which to request canvas data
   * @returns {Promise<Object>} Promise resolving to canvas data
   */
  const canvasDataPromise = (requestAltId) =>
    new Promise((resolve) => {
      resolveCanvasData = resolve
      requestCanvasData.value.status = true
      requestCanvasData.value.altId = requestAltId
    })

  /**
   * Receive and resolve canvas data
   * @param {Object} data - The canvas data to resolve
   */
  function receiveCanvasData(data) {
    resolveCanvasData?.(data)
    requestCanvasData.value.status = false
  }

  // ===== MULTIPLE ALT MANAGEMENT =====

  /**
   * Calculate layout for multiple alts
   * @param {number} currentNodeX - X position of current node
   * @param {number} currentNodeY - Y position of current node
   * @param {number} numAlts - Number of alts to calculate layout for
   * @param {number} nodeWidth - Width of the current node (optional, uses default if not provided)
   * @param {number} nodeHeight - Height of the current node (optional, uses default if not provided)
   * @returns {Object} Layout coordinates
   */
  function calculateMultiAltLayout(
    currentNodeX,
    currentNodeY,
    numAlts,
    nodeWidth = defaultNodeWidth.value,
    nodeHeight = defaultNodeHeight.value,
  ) {
    const maxY = currentNodeY + (nodeHeight / 2) * (numAlts - 1)
    const minY = currentNodeY - (nodeHeight / 2) * (numAlts - 1)

    // Calculate dynamic spacing based on node width (proportional to the default spacing ratio)
    const defaultSpacingRatio = NODE_ADJACENCY_SPACING / DEFAULT_NODE_WIDTH // ~0.31 (100/320)
    const dynamicSpacing = Math.max(50, nodeWidth * defaultSpacingRatio) // Minimum 50px spacing
    const x = currentNodeX + nodeWidth + dynamicSpacing

    return { maxY, minY, x }
  }

  /**
   * Update the sizing of a specific alt
   * @param {string} altId - ID of the alt to update
   * @param {number} canvasWidth - New canvas width
   */
  function updateAltSizing(altId, canvasWidth) {
    const alt = findAlt(altId)
    if (!alt) {
      console.warn(`Alt with ID ${altId} not found`)
      return
    }

    // Update the alt's sizing while maintaining aspect ratio (1:1 for canvas)
    alt.sizing.canvasWidth = canvasWidth
    alt.sizing.nodeWidth = canvasWidth + 20
    alt.sizing.nodeHeight = canvasWidth + 120
  }

  /**
   * Calculate positions for new alts considering existing ones
   * @param {Object} newNode - The target node where alts will be placed
   * @param {number} numNewAlts - Number of new alts to add
   * @param {number} nodeHeight - Height of the nodes
   * @param {number} centerX - X position for the new alts
   * @param {number} centerY - Center Y position reference
   * @returns {Array} Array of {x, y} positions for the new alts
   */
  function calculateNewAltPositions(newNode, numNewAlts, nodeHeight, centerX, centerY) {
    const existingAlts = newNode.alts.filter((alt) => alt.expand !== false)
    const totalAlts = existingAlts.length + numNewAlts

    // Calculate the total height needed for all alts
    const totalSpacing = nodeHeight * (totalAlts - 1)
    const topY = centerY - totalSpacing / 2

    // Ensure minimum Y position is at least 50px from top
    const minY = 50
    const adjustedTopY = Math.max(minY, topY)

    // If we had to adjust upward, recalculate centerY
    const actualCenterY = totalAlts > 1 ? adjustedTopY + totalSpacing / 2 : centerY

    // Create array of all positions (existing + new)
    const allPositions = []
    for (let i = 0; i < totalAlts; i++) {
      const y = adjustedTopY + nodeHeight * i
      allPositions.push({
        x: centerX,
        y: y,
        isNew: i >= existingAlts.length,
      })
    }

    // Update existing alt positions first
    existingAlts.forEach((alt, index) => {
      alt.position.x = allPositions[index].x
      alt.position.y = allPositions[index].y
    })

    // Return positions for new alts only
    return allPositions.filter((pos) => pos.isNew).map((pos) => ({ x: pos.x, y: pos.y }))
  }

  /**
   * Adjust positions if nodes would go above y=0
   * @param {Object} branch - Branch object
   * @param {number} minY - Minimum Y position
   */
  function adjustPositionsForBounds(branch, minY) {
    if (minY < 0) {
      offsetY.value = -minY
      branch.nodes.forEach((node) => node.alts.forEach((alt) => (alt.position.y += offsetY.value)))
    } else {
      offsetY.value = 0
    }
  }

  /**
   * Update properties of an existing alt and generate a new image
   * @param {Array} altObjs - Array of alt property objects
   * @param {string} nodeBranchId - Branch ID
   * @param {string} nodeId - Node ID
   * @param {number} currentNodeX - X position of current node
   * @param {number} currentNodeY - Y position of current node
   * @param {string} currentAltId - Current alt ID
   */
  async function addOnExistingAlt(
    altObjs,
    nodeBranchId,
    nodeId,
    currentNodeX,
    currentNodeY,
    currentAltId,
  ) {
    console.log(altObjs)
    selectionPayload.value = await canvasDataPromise(currentAltId)
    const alt = findAlt(currentAltId)

    if (!alt) {
      console.warn(`Alt with ID ${currentAltId} not found`)
      return
    }
    // Step 2: Set thumbnail and source for all properties, and mark them for history association
    altObjs.forEach((obj) => {
      obj.thumbnail = selectionPayload.value.lassoBoundUrl
      obj.thumbnailSource = selectionPayload.value.type || 'lasso'
      obj.pendingHistoryAssociation = true
    })

    // Step 3: Update properties array
    if (alt.properties.length && alt.properties[0].length === 0) {
      alt.properties.splice(0, alt.properties.length, ...altObjs) // Replace all elements
    } else {
      alt.properties.push(...altObjs) // Add to existing elements
    }

    // Step 4: Get unique property names
    const propsAltered = altObjs
      .map((obj) => obj.propName)
      .filter((value, index, array) => array.indexOf(value) === index)
      .join(', ')

    // Step 4: Get object properties from image
    const { adjObjectText, objectText, visibleProps, objOrProp } = await getObjectProperties(
      selectionPayload.value.lassoBoundUrl,
      propsAltered,
    )

    // Validate that we got proper object properties before proceeding
    const objectProps = { objOrProp, objectText, visibleProps, adjObjectText }
    if (!validateObjectProperties(objectProps, ['objOrProp', 'objectText', 'visibleProps'])) {
      console.warn(
        'getObjectProperties returned empty values, aborting addOnExistingAlt:',
        objectProps,
      )
      return
    }
    // Step 5: Generate new image
    await generateImage(
      alt.properties,
      propsAltered,
      adjObjectText,
      objectText,
      visibleProps,
      objOrProp,
      currentAltId,
    )
  }

  /**
   * Add multiple alts to a node with automatic layout
   * @param {Array} altObjs - Array of alt property objects
   * @param {string} nodeBranchId - Branch ID
   * @param {string} nodeId - Node ID
   * @param {number} currentNodeX - X position of current node
   * @param {number} currentNodeY - Y position of current node
   * @param {string} currentAltId - Current alt ID
   * @returns {Promise<Array>} Array of generated image URLs
   */
  async function addMultAlt(
    altObjs,
    nodeBranchId,
    nodeId,
    currentNodeX,
    currentNodeY,
    currentAltId,
  ) {
    selectionPayload.value = await canvasDataPromise(currentAltId)

    // Step 2: Find branch and node
    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)
    const prevNode = branch?.nodes.find((n) => n.id === nodeId)

    if (!branch || !prevNode) {
      console.warn('Required branch or node not found')
      return []
    }

    // Step 3: Calculate total alts length
    let updatedAltLength
    let newNode
    if (!('nextNodeId' in prevNode)) {
      updatedAltLength = altObjs.length
    } else {
      newNode = branch.nodes.find((n) => n.id === prevNode.nextNodeId)
      updatedAltLength = newNode.alts.filter((alt) => alt.expand !== false).length + altObjs.length
    }

    // Get the current alt to use its sizing for layout calculations
    const currentAlt = findAlt(currentAltId)
    const currentNodeWidth = currentAlt?.sizing?.nodeWidth || defaultNodeWidth.value
    const currentNodeHeight = currentAlt?.sizing?.nodeHeight || defaultNodeHeight.value

    // Step 4: Calculate layout and adjust positions
    const { maxY, minY, x } = calculateMultiAltLayout(
      currentNodeX,
      currentNodeY,
      updatedAltLength,
      currentNodeWidth,
      currentNodeHeight,
    )
    adjustPositionsForBounds(branch, minY)

    // Step 5: Create or use existing next node
    if (!('nextNodeId' in prevNode)) {
      newNode = addNode(nodeBranchId, x, (maxY + minY) / 2 + offsetY.value)
      prevNode.nextNodeId = currentNodeId.value
    }

    // Step 6: Update canvas boundaries (will be recalculated after positioning)
    nodeXR.value = Math.max(nodeXR.value, x + currentNodeWidth)

    // Step 7: Prepare properties for object detection
    const propsAltered = altObjs
      .map((obj) => obj.propName)
      .filter((value, index, array) => array.indexOf(value) === index) // Remove duplicates
      .join(', ')

    const { adjObjectText, objectText, visibleProps, objOrProp } = await getObjectProperties(
      selectionPayload.value.lassoBoundUrl,
      propsAltered,
    )

    // Validate that we got proper object properties before proceeding
    const objectProps = { objOrProp, objectText, visibleProps, adjObjectText }
    if (!validateObjectProperties(objectProps, ['objOrProp', 'objectText', 'visibleProps'])) {
      console.warn('getObjectProperties returned empty values, aborting addMultAlt:', objectProps)
      return []
    }

    // Step 9: Calculate positions for new alts considering existing ones
    const newAltPositions = calculateNewAltPositions(
      newNode,
      altObjs.length,
      currentNodeHeight,
      x,
      (maxY + minY) / 2 + offsetY.value,
    )

    // Step 10: Generate alts sequentially
    const urls = []
    for (let i = 0; i < altObjs.length; i++) {
      const position = newAltPositions[i]
      altObjs[i].thumbnail = selectionPayload.value.lassoBoundUrl
      altObjs[i].thumbnailSource = selectionPayload.value.type || 'lasso'
      // Set initial historyStateIndex to 1 for new alts (they'll have their first meaningful state at index 1)
      // This aligns with the undo button logic that requires undoStack.length > 1
      altObjs[i].historyStateIndex = 1
      const url = await addAlt(
        altObjs[i],
        nodeBranchId,
        nodeId,
        i,
        prevNode.nextNodeId,
        position.x,
        position.y,
        currentAltId,
        propsAltered,
        adjObjectText,
        objectText,
        visibleProps,
        objOrProp,
      )
      urls.push(url)
    }

    // Step 11: Update canvas boundaries based on final positions
    const allAlts = newNode.alts.filter((alt) => alt.expand !== false)
    if (allAlts.length > 0) {
      const topY = Math.min(...allAlts.map((alt) => alt.position.y))
      const bottomY = Math.max(...allAlts.map((alt) => alt.position.y + currentNodeHeight))

      nodeYT.value = Math.min(nodeYT.value, topY)
      nodeYB.value = Math.max(nodeYB.value, bottomY)
    }

    return urls
  }

  function switchStepLock(altIed) {
    const alt = findAlt(altIed)
    if (alt) {
      alt.isStepLock = !alt.isStepLock
    }
  }

  // ===== MANUAL EDGE MANAGEMENT =====

  /**
   * Add an edge connection between two alts
   * @param {string} fromAltId - Source alt ID
   * @param {string} toAltId - Target alt ID
   * @returns {boolean} Success status
   */
  function addEdgeConnection(fromAltId, toAltId) {
    const fromAlt = findAlt(fromAltId)
    const toAlt = findAlt(toAltId)

    if (!fromAlt || !toAlt) {
      console.warn(`Alt not found: fromAltId=${fromAltId}, toAltId=${toAltId}`)
      return false
    }

    // Check if edge already exists
    const existingEdge = fromAlt.visibleEdges.find(
      (edge) => edge.fromAltId === fromAltId && edge.toAltId === toAltId,
    )

    if (existingEdge) {
      console.log('Edge already exists')
      return false
    }

    // Create the edge
    const edge = { fromAltId, toAltId }

    // Add to both edges and visibleEdges arrays
    fromAlt.edges.push(edge)
    fromAlt.visibleEdges.push(edge)

    // Update nextAltId array
    if (!fromAlt.nextAltId.includes(toAltId)) {
      fromAlt.nextAltId.push(toAltId)
    }

    // Update prevAltId for the target alt (if it doesn't already have one)
    if (!toAlt.prevAltId) {
      toAlt.prevAltId = fromAltId
    }
    nextTick(() => {
      // DOM re-render completed
    })

    return true
  }

  /**
   * Remove an edge connection between two alts
   * @param {string} fromAltId - Source alt ID
   * @param {string} toAltId - Target alt ID
   * @returns {boolean} Success status
   */
  function removeEdgeConnection(fromAltId, toAltId) {
    const fromAlt = findAlt(fromAltId)
    const toAlt = findAlt(toAltId)

    if (!fromAlt || !toAlt) {
      console.warn(`Alt not found: fromAltId=${fromAltId}, toAltId=${toAltId}`)
      return false
    }

    // Remove from edges array
    fromAlt.edges = fromAlt.edges.filter(
      (edge) => !(edge.fromAltId === fromAltId && edge.toAltId === toAltId),
    )

    // Remove from visibleEdges array
    fromAlt.visibleEdges = fromAlt.visibleEdges.filter(
      (edge) => !(edge.fromAltId === fromAltId && edge.toAltId === toAltId),
    )

    // Remove from nextAltId array
    fromAlt.nextAltId = fromAlt.nextAltId.filter((id) => id !== toAltId)

    // Clear prevAltId for target alt if it was the only connection
    if (toAlt.prevAltId === fromAltId) {
      // Check if there are other connections to this alt
      const hasOtherConnections = nodeBranchList.value
        .flatMap((branch) => branch.nodes.flatMap((node) => node.alts))
        .some((alt) =>
          alt.visibleEdges.some((edge) => edge.toAltId === toAltId && edge.fromAltId !== fromAltId),
        )

      if (!hasOtherConnections) {
        toAlt.prevAltId = null
      }
    }

    console.log(`Removed edge: ${fromAltId} -> ${toAltId}`)
    return true
  }

  /**
   * Get all edges for a specific alt
   * @param {string} altId - Alt ID to get edges for
   * @returns {Object} Object containing incoming and outgoing edges
   */
  function getAltEdges(altId) {
    const allAlts = nodeBranchList.value.flatMap((branch) =>
      branch.nodes.flatMap((node) => node.alts),
    )

    const outgoingEdges = allAlts.find((alt) => alt.id === altId)?.visibleEdges || []

    const incomingEdges = allAlts
      .flatMap((alt) => alt.visibleEdges)
      .filter((edge) => edge.toAltId === altId)

    return {
      outgoing: outgoingEdges,
      incoming: incomingEdges,
    }
  }
  function mergeCanvasPrompt() {
    return 'Rerender this image to make it visually consistent. Blend in any foreign or out-of-place objects so that the entire scene looks coherent and naturally composed.'
  }

  async function mergeWholeCanvas(dataUrl, altId) {
    try {
      let imgUrl = null
      // Generate appropriate prompt and image based on payload type
      const prompt = mergeCanvasPrompt()
      imgUrl = await generationStore.generateOpenAIImg({
        original_image: dataUrl,
        prompt: prompt,
        altId: altId,
      })
      if (imgUrl) {
        addAltImgPayload.value = { url: imgUrl, altId: altId }
      }
      return imgUrl
    } catch (error) {
      console.error('Image generation failed:', error)
      return null
    }
  }

  function exportAltToFreeCanv(base64CanvasUrl, unique_id, x, y) {
    exportAlt.value = {
      flag: true,
      base64CanvasUrl,
      unique_id,
      x,
      y,
    }
  }

  // ===== EXPORTED VALUES AND FUNCTIONS =====
  return {
    // Constants and Reactive Sizing
    nodeXR,
    nodeYB,
    nodeYT,
    nodeW: defaultNodeWidth,
    nodeH: defaultNodeHeight,
    canvasW: defaultCanvasWidth,
    defaultCanvasWidth,
    defaultNodeWidth,
    defaultNodeHeight,

    // State Management
    layerPayload,
    nodeBranchList,
    currentNodeId,
    currentBranchId,
    addAltImgPayload,
    requestCanvasData,
    selectedIndices,
    selectedBranchId,
    lastSelectedIndex,
    ctrlPressed,
    hoveredParentAltId,

    // Layout Functions
    setNodeXR,
    setNodeYB,

    // Branch Management
    addNodeBranch,

    // Node Management
    addNode,

    // Alt Management
    addAlt,
    addMultAlt,
    addOnExistingAlt,

    // Canvas Data Management
    canvasDataPromise,
    receiveCanvasData,

    // Parent Management
    updateParents,

    // History Management
    saveState,
    undo,
    redo,
    navigateToHistoryState,

    // Lasso and Color Pen
    setCurrentLassoInfo,
    applyColorPen,
    switchStepLock,

    // Edge Management
    addEdgeConnection,
    removeEdgeConnection,
    getAltEdges,

    // Alt Sizing Management
    updateAltSizing,
    exportAltToFreeCanv,
    exportAlt,
    mergeWholeCanvas,
  }
})
