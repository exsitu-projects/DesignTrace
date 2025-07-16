import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useGeneration } from '@/stores/generationStore.js'

export const useNode = defineStore('nodes', () => {
  /* ----------------------------------------------------------
   Data‑structure overview
   ----------------------------------------------------------

   nodeBranchList              (array)  [the whole forest]
   ├── nodeBranch              (object) [a single branch]
   │   ├── node                (object) [a point on the branch]
   │   │   ├── alt             (object) [smallest unit — an “alternative”]
   │   │   └── alt
   │   └── node
   │       └── alt
   └── nodeBranch
       └── node
           └── alt

   Legend
   ──────
   nodeBranchList : collection of *node branches* (like a list of branches)
   nodeBranch     : contains several *nodes* that are connected in order
   node           : can hold several *alts*
   alt            : ≪ smallest / leaf level ≫

*/
  const nodeBranchList = ref([])

  const currentBranchId = ref(null)
  const currentNodeId = ref(null)
  const layerPayload = ref(null)
  // ===== CONSTANTS =====
  const CANVAS_WIDTH = 300
  const NODE_WIDTH = CANVAS_WIDTH + 20
  const NODE_HEIGHT = CANVAS_WIDTH + 120
  const INITIAL_NODE_X = 150
  const INITIAL_NODE_Y = 150
  const NODE_ADJACENCY_SPACING = 100

  // Layout and positioning
  const nodeXR = ref(0) // Right boundary
  const nodeYB = ref(0) // Bottom boundary
  const nodeYT = ref(0) // Top boundary
  const offsetY = ref(0)
  const selectedIndices = ref([])
  const selectedBranchId = ref('')
  const lastSelectedIndex = ref(null)
  const ctrlPressed = ref(false)
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
   * Find an alt by its ID across all branches and nodes
   */
  function findAlt(altId) {
    const allAlts = nodeBranchList.value.flatMap((branch) =>
      branch.nodes.flatMap((node) => node.alts),
    )
    return allAlts.find((alt) => alt.id === altId)
  }

  /**
   * Generate a unique ID with timestamp and optional suffix
   */
  function generateId(prefix, suffix = '') {
    return `${prefix}_${Date.now()}${suffix}`
  }

  /**
   * Calculate layout boundaries and update positioning refs
   */
  function updateLayoutBoundaries(x, y, nodeWidth = NODE_WIDTH, nodeHeight = NODE_HEIGHT) {
    nodeXR.value = Math.max(nodeXR.value, x + nodeWidth)
    nodeYB.value = Math.max(nodeYB.value, y + nodeHeight)
    nodeYT.value = Math.min(nodeYT.value, y)
  }

  // ===== UNDO/REDO HISTORY =====

  /**
   * Save the canvas state for a specific alt
   */
  function saveState(altId, canvasState) {
    const alt = findAlt(altId)
    if (!alt) return

    if (!alt.history) {
      alt.history = {
        undoStack: [],
        redoStack: [],
      }
    }

    alt.history.undoStack.push(canvasState)
    alt.history.redoStack = [] // Clear redo stack on new action

    // Limit undo stack size
    if (alt.history.undoStack.length > 50) {
      alt.history.undoStack.shift()
    }
  }

  /**
   * Undo the last action for a specific alt
   */
  function undo(altId) {
    const alt = findAlt(altId)
    if (!alt || !alt.history || alt.history.undoStack.length <= 1) {
      return null
    }

    const currentState = alt.history.undoStack.pop()
    alt.history.redoStack.push(currentState)

    return alt.history.undoStack[alt.history.undoStack.length - 1]
  }

  /**
   * Redo the last undone action for a specific alt
   */
  function redo(altId) {
    const alt = findAlt(altId)
    if (!alt || !alt.history || alt.history.redoStack.length === 0) {
      return null
    }

    const redoState = alt.history.redoStack.pop()
    alt.history.undoStack.push(redoState)

    return redoState
  }

  // ===== BRANCH MANAGEMENT =====

  /**
   * Add a new node branch to the forest
   */
  function addNodeBranch() {
    const newBranch = {
      id: generateId('branch'),
      nodes: [],
      parents: [],
      steps: [],
    }
    currentBranchId.value = newBranch.id
    nodeBranchList.value.push(newBranch)
    return newBranch
  }

  // ===== LAYOUT AND POSITIONING =====

  /**
   * Set the right boundary position
   */
  function setNodeXR(newVal) {
    nodeXR.value = newVal
  }

  /**
   * Set the bottom boundary position
   */
  function setNodeYB(newVal) {
    nodeYB.value = newVal
  }

  // ===== NODE MANAGEMENT =====

  /**
   * Add a new node to a specific branch
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
   */
  async function applyColorPen(colorPenPayload) {
    currentColorPenInfo.value = colorPenPayload
    let imgUrl = null

    try {
      const output = await generationStore.guessPrompt({
        original_image: colorPenPayload.original_image,
        add_color_image: colorPenPayload.add_color_image,
        add_edge_image: colorPenPayload.add_edge_image,
      })

      currentColorPenInfo.value.prompt = output
      imgUrl = await generationStore.generateMaskedImg(currentColorPenInfo.value)
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
   */
  function updateParents(selectedAltIdArr, branchId) {
    const branch = nodeBranchList.value.find((b) => b.id === branchId)
    if (!branch) {
      console.warn(`Branch with ID ${branchId} not found`)
      return
    }

    const allAlts = branch.nodes.flatMap((n) => n.alts)
    const allAltsInSteps = branch.steps.flatMap((step) => step)

    // Hide alts that are not previously selected (not in steps)
    for (const alt of allAlts) {
      if (!allAltsInSteps.includes(alt.id)) {
        alt.visible = false
        alt.visibleEdges = []
      }
    }

    // Update steps with current parents
    branch.steps.push([...branch.parents])

    const newParents = []

    // Process each selected alt
    for (const altId of selectedAltIdArr) {
      const childAlt = allAlts.find((a) => a.id === altId)
      if (!childAlt) continue

      // Make selected alt visible
      childAlt.visible = true

      // Find the closest parent in branch.parents
      let currentChild = altId
      let currentParent = childAlt.prevAltId

      while (currentParent && !branch.parents.includes(currentParent)) {
        const currentChildAlt = allAlts.find((a) => a.id === currentChild)
        currentChild = currentParent
        currentParent = currentChildAlt?.prevAltId || null
      }

      // Create edge from parent to selected alt
      if (currentParent) {
        const parentAlt = allAlts.find((a) => a.id === currentParent)
        if (parentAlt) {
          parentAlt.visible = true
          parentAlt.visibleEdges.push({
            fromAltId: currentParent,
            toAltId: altId,
          })
        }
      }

      newParents.push(altId)
    }

    branch.parents = newParents
  }

  // ===== ALT MANAGEMENT =====

  /**
   * Create a new alt object with default properties
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
      },
    }
  }

  /**
   * Generate a prompt for alt generation
   */
  function openAIPrompt(propsAltered, adjObjectText, objectText, descriptors) {
    return `Change the ${propsAltered} of the ${adjObjectText} ${objectText} into ${descriptors.join(' and ')} while other visual properties remain the same.`
  }

  function magicQPrompt(propsAltered, guessPrompt, objectText, descriptors) {
    return `${descriptors.join(' and ')}${guessPrompt} ${objectText}`
  }

  function imagenPrompt(propsAltered, adjObjectText, objectText, descriptors, visiblePropsText) {
    return `Change to the ${propsAltered} of ${descriptors.join(' and ')} of ${objectText} while keeping its ${visiblePropsText} in ${adjObjectText} .`
  }

  /**
   * Generate image based on properties and payload
   * This extracted function handles the common image generation logic
   */
  async function generateImage(properties, propsAltered, adjObjectText, objectText, visiblePropsText, altId) {
    try {
      const descriptors = properties.map((p) => `${p.tag} ${p.propName}`);
      const copiedPayload = { ...selectionPayload.value };
      let imgUrl = null;

      // Generate appropriate prompt and image based on payload type
      if (copiedPayload.type === 'full-img') {
        const prompt = openAIPrompt(propsAltered, adjObjectText, objectText, descriptors);
        console.log('Generated prompt:', prompt);

        copiedPayload.prompt = prompt;
        copiedPayload.altId = altId;
        imgUrl = await generationStore.generateOpenAIImg(copiedPayload);
      } else if (copiedPayload.type === 'lasso') {
        const prompt = imagenPrompt(
          propsAltered,
          adjObjectText,
          objectText,
          descriptors,
          visiblePropsText
        );
        console.log('Generated prompt:', prompt);

        copiedPayload.prompt = prompt;
        copiedPayload.altId = altId;
        console.log(copiedPayload);
        imgUrl = await generationStore.generateGoogleImg(copiedPayload);
      }

      if (imgUrl) {
        addAltImgPayload.value = { url: imgUrl, altId: altId };
      }

      return imgUrl;
    } catch (error) {
      console.error('Image generation failed:', error);
      return null;
    }
  }

  /**
   * Get object properties from image
   * This extracted function handles common object detection logic
   */
  async function getObjectProperties(imageUrl, propsAltered) {
    try {
      const result = await generationStore.excludePropObject(imageUrl, propsAltered);
      return {
        adjObjectText: result.adjObjectText,
        objectText: result.objectText,
        visiblePropsText: result.visibleProps
      };
    } catch (error) {
      console.error('Object detection failed:', error);
      return {
        adjObjectText: '',
        objectText: '',
        visiblePropsText: ''
      };
    }
  }

  /**
   * Add a new alt to a node with optional image generation
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
    adjObjectText = '',
    objectText = '',
    propsAltered = '',
    visiblePropsText = '',
  ) {
    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId);
    const prevNode = branch?.nodes.find((n) => n.id === nodeId);
    const newNode = branch?.nodes.find((n) => n.id === nextNodeId);
    let imgUrl = null;

    if (!branch || !prevNode) {
      console.warn('Required branch or node not found');
      return null;
    }

    const newAlt = createAlt([altObj], nodeBranchId, index, posX, posY, prevAltId, nextNodeId);

    // Handle alt with previous connection
    if (prevAltId) {
      if (newNode) {
        newNode.alts.push(newAlt);
        const prevAlt = prevNode.alts.find((alt) => alt.id === prevAltId);

        if (prevAlt) {
          // Create bidirectional links
          const edge = { fromAltId: prevAltId, toAltId: newAlt.id };
          prevAlt.edges.push(edge);
          prevAlt.visibleEdges.push(edge);
          prevAlt.nextAltId.push(newAlt.id);
        }
      }

      // Generate image if properties are specified
      if (propsAltered && adjObjectText && objectText) {
        imgUrl = await generateImage(
          newAlt.properties,
          propsAltered,
          adjObjectText,
          objectText,
          visiblePropsText,
          newAlt.id
        );
      }
    } else {
      // Handle first alt in branch
      const isFirstAltInBranch =
        branch.nodes.length > 0 && branch.nodes[0].id === nodeId && prevNode.alts.length === 0;

      if (isFirstAltInBranch) {
        branch.parents.push(newAlt.id);
      }
      prevNode.alts.push(newAlt);
    }

    return imgUrl;
  }

  // ===== CANVAS DATA MANAGEMENT =====

  /**
   * Create a promise to request canvas data for a specific alt
   */
  const canvasDataPromise = (requestAltId) =>
    new Promise((resolve) => {
      resolveCanvasData = resolve;
      requestCanvasData.value.status = true;
      requestCanvasData.value.altId = requestAltId;
    });

  /**
   * Receive and resolve canvas data
   */
  function receiveCanvasData(data) {
    resolveCanvasData?.(data);
    requestCanvasData.value.status = false;
  }

  // ===== MULTIPLE ALT MANAGEMENT =====

  /**
   * Calculate layout for multiple alts
   */
  function calculateMultiAltLayout(currentNodeX, currentNodeY, numAlts) {
    const maxY = currentNodeY + (NODE_HEIGHT / 2) * (numAlts - 1);
    const minY = currentNodeY - (NODE_HEIGHT / 2) * (numAlts - 1);
    const x = currentNodeX + NODE_WIDTH + NODE_ADJACENCY_SPACING;

    return { maxY, minY, x };
  }

  /**
   * Adjust positions if nodes would go above y=0
   */
  function adjustPositionsForBounds(branch, minY) {
    if (minY < 0) {
      offsetY.value = -minY;
      branch.nodes.forEach((node) => node.alts.forEach((alt) => (alt.position.y += offsetY.value)));
    } else {
      offsetY.value = 0;
    }
  }

  /**
   * Update properties of an existing alt and generate a new image
   */
  async function addOnExistingAlt(
    altObjs,
    nodeBranchId,
    nodeId,
    currentNodeX,
    currentNodeY,
    currentAltId,
  ) {
    // Wait for canvas data
    selectionPayload.value = await canvasDataPromise(currentAltId);
    const alt = findAlt(currentAltId);

    if (!alt) {
      console.warn(`Alt with ID ${currentAltId} not found`);
      return;
    }

    // Update properties array
    if (alt.properties.length && alt.properties[0].length === 0) {
      alt.properties.splice(0, alt.properties.length, ...altObjs); // Replace all elements
    } else {
      alt.properties.push(...altObjs); // Add to existing elements
    }

    // Get unique property names
    const propsAltered = altObjs
      .map((obj) => obj.propName)
      .filter((value, index, array) => array.indexOf(value) === index)
      .join(', ');

    // Get object properties from image
    const { adjObjectText, objectText, visiblePropsText } = await getObjectProperties(
      selectionPayload.value.lassoBoundUrl,
      propsAltered
    );

    if (!adjObjectText || !objectText) {
      return;
    }

    // Generate new image
    await generateImage(
      alt.properties,
      propsAltered,
      adjObjectText,
      objectText,
      visiblePropsText,
      currentAltId
    );
  }
  function updateAltPos(maxY, minY, x, node) {
    const visibleNodeList = node.alts.filter((alt) => alt.visible !== false)
    for (let i = 0; i < visibleNodeList.length; i++) {
      const alt = visibleNodeList[i]
      alt.position.x = x
      alt.position.y = maxY - NODE_HEIGHT * i + offsetY.value
    }
  }
  /**
   * Add multiple alts to a node with automatic layout
   */
  async function addMultAlt(
    altObjs,
    nodeBranchId,
    nodeId,
    currentNodeX,
    currentNodeY,
    currentAltId,
  ) {
    // Wait for canvas data
    selectionPayload.value = await canvasDataPromise(currentAltId)

    const branch = nodeBranchList.value.find((b) => b.id === nodeBranchId)
    const prevNode = branch.nodes.find((n) => n.id === nodeId)

    if (!branch || !prevNode) {
      console.warn('Required branch or node not found')
      return []
    }
    let updatedAltLength
    let newNode
    if (!('nextNodeId' in prevNode)) {
      updatedAltLength = altObjs.length
    } else {
      newNode = branch.nodes.find((n) => n.id === prevNode.nextNodeId)
      updatedAltLength = newNode.alts.filter((alt) => alt.visible !== false).length + altObjs.length
    }

    const { maxY, minY, x } = calculateMultiAltLayout(currentNodeX, currentNodeY, updatedAltLength)

    // Adjust positions if needed
    adjustPositionsForBounds(branch, minY)

    // Create or use existing next node
    if (!('nextNodeId' in prevNode)) {
      newNode = addNode(nodeBranchId, x, (maxY + minY) / 2 + offsetY.value)
      prevNode.nextNodeId = currentNodeId.value
    }

    // Update boundaries
    nodeYT.value = minY + offsetY.value
    nodeYB.value = Math.max(maxY + NODE_HEIGHT, nodeYB.value) + offsetY.value
    nodeXR.value = Math.max(nodeXR.value, x + NODE_WIDTH)

    // Prepare properties string for object detection
    const propsAltered = altObjs
      .map((obj) => obj.propName)
      .filter((value, index, array) => array.indexOf(value) === index) // Remove duplicates
      .join(', ')

    // Object detection (currently disabled)
    let adjObjectText = ''
    let objectText = ''
    let visiblePropsText = ''
    try {
      // Uncomment when object detection is ready
      const result = await generationStore.excludePropObject(
        selectionPayload.value.lassoBoundUrl,
        propsAltered,
      )
      adjObjectText = result.adjObjectText
      objectText = result.objectText
      visiblePropsText = result.visibleProps
    } catch (error) {
      console.error('Object detection failed:', error)
      return []
    }

    // Generate alts sequentially
    const urls = []
    for (let i = 0; i < altObjs.length; i++) {
      const y = maxY - NODE_HEIGHT * i + offsetY.value
      const url = await addAlt(
        altObjs[i],
        nodeBranchId,
        nodeId,
        i,
        prevNode.nextNodeId,
        x,
        y,
        currentAltId,
        adjObjectText,
        objectText,
        propsAltered,
        visiblePropsText,
      )
      urls.push(url)
    }

    updateAltPos(maxY, minY, x, newNode)

    return urls
  }

  // ===== EXPORTED VALUES AND FUNCTIONS =====
  return {
    // Constants
    nodeXR,
    nodeYB,
    nodeYT,
    nodeW: NODE_WIDTH,
    nodeH: NODE_HEIGHT,
    canvasW: CANVAS_WIDTH,

    // State
    layerPayload,
    nodeBranchList,
    currentNodeId,
    currentBranchId,
    addAltImgPayload,
    requestCanvasData,

    // Layout functions
    setNodeXR,
    setNodeYB,

    // Branch management
    addNodeBranch,

    // Node management
    addNode,

    // Alt management
    addAlt,
    addMultAlt,

    // Lasso and color pen
    setCurrentLassoInfo,
    applyColorPen,

    // Canvas data
    canvasDataPromise,
    receiveCanvasData,

    // Parent management
    updateParents,

    // History management
    saveState,
    undo,
    redo,
    addOnExistingAlt,

    selectedIndices,
    selectedBranchId,
    lastSelectedIndex,
    ctrlPressed,
  }
})
