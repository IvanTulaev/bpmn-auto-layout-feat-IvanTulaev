import BPMNModdle from 'bpmn-moddle';
import {
  isBoundaryEvent,
  isStartIntermediate,
  bindBoundaryEventsWithHosts,
} from './utils/elementUtils.js';

import { sortByType } from './utils/layoutUtils.js'
import { DiFactory } from './di/DiFactory.js';
import { is } from './di/DiUtil.js';
import { handlers } from './handler/index.js';
import { isFunction } from 'min-dash';
import {GridWithEdges} from "./GridWithEdges.js";

export class Layouter {
  constructor() {
    this.moddle = new BPMNModdle();
    this.diFactory = new DiFactory(this.moddle);
    this._handlers = handlers;
  }

  handle(operation, options) {
    return this._handlers
      .filter(handler => isFunction(handler[operation]))
      .map(handler => handler[operation](options));
  }

  async layoutProcess(xml) {
    const { rootElement } = await this.moddle.fromXML(xml);

    this.diagram = rootElement;

    const root = this.getProcess();

    if (root) {
      this.cleanDi();
      this.handlePlane(root);
    }

    return (await this.moddle.toXML(this.diagram, { format: true })).xml;
  }

  //TODO: add BPMN tree traversal
  handlePlane(planeElement) {
    let layout = this.createGridLayout(planeElement);
    layout = layout.getResultGrid()
    this.generateDi(planeElement, layout);
  }

  cleanDi() {
    this.diagram.diagrams = [];
  }

  createGridLayout(root) {
    const grid = new GridWithEdges();

    const flowElements = root.flowElements || [];
    const hostElements = flowElements
        .filter(element => !is(element,'bpmn:SequenceFlow') && !isBoundaryEvent(element));

    // check for empty process/subprocess
    if (!flowElements) {
      return grid;
    }

    bindBoundaryEventsWithHosts (flowElements)

    while (grid.elementsCount < hostElements.length) {

      const stack = getInitialStack(hostElements, grid)

      // Depth-first-search with reverse
      this.handleGrid(grid , stack);
    }

    // flip grid on end
    if (grid.isFlipped) {
      grid.flipHorizontally();
    }

    return grid;
  }

  generateDi(root, layoutGrid) {
    const diFactory = this.diFactory;

    // Step 0: Create Root element
    const diagram = this.diagram;

    var planeDi = diFactory.createDiPlane({
      id: 'BPMNPlane_' + root.id,
      bpmnElement: root
    });
    var diagramDi = diFactory.createDiDiagram({
      id: 'BPMNDiagram_' + root.id,
      plane: planeDi
    });

    // deepest subprocess is added first - insert at the front
    diagram.diagrams.unshift(diagramDi);

    const planeElement = planeDi.get('planeElement');

    // Step 1: Create DI for all elements
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this
        .handle('createElementDi', { element, row, col, layoutGrid, diFactory })
        .flat();

      planeElement.push(...dis);
    });

    // Step 2: Create DI for all connections
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this
        .handle('createConnectionDi', { element, row, col, layoutGrid, diFactory })
        .flat();

      planeElement.push(...dis);
    });
  }

  handleGrid(grid, stack) {
    while (stack.length > 0) {
      const currentElement = stack.pop();

      if (is(currentElement, 'bpmn:SubProcess')) {
        this.handlePlane(currentElement);
      }

      const nextElements = this.handle('addToGrid', { element: currentElement, grid, stack});

      nextElements.flat().forEach(el => {
        stack.push(el);
      });
    }
  }

  getProcess() {
    return this.diagram.get('rootElements').find(el => el.$type === 'bpmn:Process');
  }
}

function getPrimaryStartElements(elements, grid) {
  return elements.filter(element => {
    // not edge or boundary or start intermediate
    if (isStartIntermediate(element)) return false;
    if (element.incoming?.length > 0) return false;

    // work with elements are not in the grid
    return !grid.hasElement(element);
  });
}

function getSourceElementInGridTargetNotExist(grid) {
  return [...grid.elements].filter(element => {
    // get outgoing
    // if at least one element is not in visited, then return the element
    const outgoing = grid.getOutgoingElementsFor(element);

    for (const outgoingElement of outgoing) {
      if (!grid.hasElement(outgoingElement)) return true
    }
  });
}

/**
 * get elements in the grid that have incoming that are not in grid
 * @param elements
 * @param grid
 */
function getTargetElementInGridSourceNotExist (grid) {
  return [...grid.elements].filter(element => {
    const incoming = grid.getIncomingElementsFor(element)

    for (const incomingElement of incoming) {
      if (!grid.hasElement(incomingElement)) return true;
    }
  });
}

/**
 * Стартовые элементы для обратного прохода
 * @param elements
 * @param grid
 */
function getFlippedStartElements(elements, grid) {

  return elements.filter(element => {
    if (grid.hasElement(element)) return false;

    // without loop
    const outgoingFromHost = [...grid.getOutgoingFromHost(element)]
        .filter(item => item !== element);
    // without loop
    const outgoingFromBoundary = [...grid.getOutgoingFromBoundary(element)]
        .filter(item => item !== element);

    return outgoingFromHost.length === 0 && outgoingFromBoundary.length === 0;
  })
}

function getTargetElementsFromGrid (elements, grid) {
  return elements.filter(element => {
    if (grid.hasElement(element)) return false;
    const incoming = grid.getIncomingElementsFor(element)
    for (const incomingElement of incoming) {
      if (grid.hasElement(incomingElement)) {
        return true;
      }
    }
  });
}

function getOtherStartElements (elements, grid) {
  return elements.filter(element => {
    if (grid.hasElement(element)) return false;
    // incoming without Loops
    const incoming = [...grid.getIncomingElementsFor(element)].filter(item => item !== element);

    return incoming.length === 0;
  });
}

function getInitialStack(hostElements, grid){
  // maybe need boundaryEvents processing here
  const primaryStartElements = getPrimaryStartElements(hostElements, grid);

  const sourceElementsInGrid = getSourceElementInGridTargetNotExist(grid);

  // get elements in the grid that have incoming that are not in grid
  const targetElementsInGrid = getTargetElementInGridSourceNotExist (grid);

  const flippedStartElements = getFlippedStartElements(hostElements, grid)

  // not traversed elements exiting from grid
  const targetElementsFromGrid = getTargetElementsFromGrid (hostElements, grid)

  // All elements without incoming from other elements
  // this case as the very last one
  const otherStartingElements = getOtherStartElements (hostElements, grid)

  let stack = [];

  if (primaryStartElements.length > 0) {

    stack = sortByType(primaryStartElements, 'bpmn:StartEvent').reverse();
    for (const element of primaryStartElements){
      grid.add(element);
    }

  } else if (sourceElementsInGrid.length > 0) {
    stack = [ ...sourceElementsInGrid ];
  } else if (targetElementsInGrid.length > 0) {
    stack = [ ...targetElementsInGrid ];
    grid.flipHorizontally();
  } else if (targetElementsFromGrid.length > 0) {
    stack = [ ...targetElementsFromGrid ];
  } else if (otherStartingElements.length > 0) {
    stack = [ ...otherStartingElements ];
  } else if (flippedStartElements.length > 0) {
    stack = [ flippedStartElements[0] ];
    grid.add(flippedStartElements[0])
    grid.flipHorizontally();
  } else {
    // not traversed elements
    const restElements = hostElements.filter(element => {
      return (!grid.hasElement(element));
    });
    // push first
    stack.push(restElements[0]);
    grid.add(restElements[0]);
  }

  return stack;
}
