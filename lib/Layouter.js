import BPMNModdle from 'bpmn-moddle';
import {
  getAttachedOutgoingElements,
  getIncomingElements as utilsGetIncomingElements,
  getOutgoingElements as utilsGetOutgoingElements,
  isBoundaryEvent,
  isConnection,
  isStartIntermediate
} from './utils/elementUtils.js';
import { Grid } from './Grid.js';
import { DiFactory } from './di/DiFactory.js';
import { is } from './di/DiUtil.js';
import { handlers } from './handler/index.js';
import { isFunction } from 'min-dash';

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

  handlePlane(planeElement) {
    const layout = this.createGridLayout(planeElement);
    this.generateDi(planeElement, layout);
  }

  cleanDi() {
    this.diagram.diagrams = [];
  }

  createGridLayout(root) {
    const grid = new Grid();

    const flowElements = root.flowElements || [];
    const elements = flowElements.filter(el => !is(el,'bpmn:SequenceFlow'));

    // check for empty process/subprocess
    if (!flowElements) {
      return grid;
    }

    const boundaryEvents = flowElements.filter(el => isBoundaryEvent(el));
    boundaryEvents.forEach(boundaryEvent => {
      const attachedTask = boundaryEvent.attachedToRef;
      const attachers = attachedTask.attachers || [];
      attachers.push(boundaryEvent);
      attachedTask.attachers = attachers;
    });

    // Depth-first-search with reverse

    const elementsWithoutBoundary = elements.filter(el => !isBoundaryEvent(el));

    while (grid.elements.size < elementsWithoutBoundary.length) {

      // maybe need boundaryEvents processing here
      const startingElementsOnly = flowElements.filter(el => {

        // work with elements are not in the grid
        if (!grid.hasElement(el)) {
          return !isConnection(el) && !isBoundaryEvent(el) && (!el.incoming || el.length === 0) && !isStartIntermediate(el);
        }
      });

      const outgoingElementsInGrid = elementsWithoutBoundary.filter(el => {
        if (!isBoundaryEvent(el)) {

          // work with elements are in the grid
          if (grid.hasElement(el)) {

            // get outgoing
            // if at least one element is not in visited, then return the element
            const elOutgoingSet = getOutgoingElements(el, grid.isFlipped)
            const elOutgoing = [...elOutgoingSet].filter(elOut => {

              // should not be in grid
              return (!grid.hasElement(elOut));

            });
            return elOutgoing > 0;
          }
        }
      });

      // get elements in the grid that have incoming that are not in grid
      const flippedOutgoingStart = [...grid.elements].filter(el => {
        const incoming = getIncomingElements(el, grid.isFlipped);

        for (const incomingElement of incoming) {
          if (!grid.elements.has(incomingElement)) return true;
        }
      });

      // untraversed elements exiting the grid
      const outgoingFromGrid = elementsWithoutBoundary.filter(el => {

        if (!grid.hasElement(el)) {
          const incoming = getIncomingElements(el, grid.isFlipped);
          for (const incomingElement of incoming) {
            if (grid.hasElement(incomingElement)) {
              return true;
            }
          }
        }

      });

      // All elements without incoming from other elements
      // this case as the very last one
      const otherStartingElements = elementsWithoutBoundary.filter(el => {
        const incoming = getIncomingElements(el, grid.isFlipped);

        const withOutLoops = [ ...incoming ].filter(resEl => resEl !== el);

        return (!grid.hasElement(el) && withOutLoops.length === 0);

      });

      let stack = [];
      let startingElements = [];

      if (startingElementsOnly.length > 0) {
        stack = [ ...startingElementsOnly ];
        startingElements = [ ...startingElementsOnly ];

        startingElements.forEach(el => {
          grid.add(el);
        });

      } else if (outgoingElementsInGrid.length > 0) {
        stack = [ ...outgoingElementsInGrid ];
      } else if (flippedOutgoingStart.length > 0) {

        stack = [ ...flippedOutgoingStart ];
        grid.flipHorizontally();
      } else if (outgoingFromGrid.length > 0) {
        stack = [ ...outgoingFromGrid ];
      } else if (otherStartingElements.length > 0) {
        stack = [ ...otherStartingElements ];
      } else {

        // just push the rest into the stack
        const allInGrid = grid.elements;
        const result = elements.filter(el => {
          return (![...allInGrid].some(item => item === el) && !isBoundaryEvent(el));
        });

        const withGridIncoming = result.filter(el => {
          const incoming = getIncomingElements(el, grid.isFlipped);
          const gridIncoming = [...incoming].filter(el => grid.hasElement(el));
          if (gridIncoming.length > 0) {
            return true;
          }
        });

        if (withGridIncoming.length > 0) {
          stack = [ ...withGridIncoming ];
          startingElements = [ ...withGridIncoming ];
        } else {
          stack.push(result[0]);
        }
      }

      this.handleGrid(grid , stack);

      // square after each pass
      grid.toRectangle();

    }

    // flip grid for reverse
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
      grid.shrinkCols();
    }
  }

  getProcess() {
    return this.diagram.get('rootElements').find(el => el.$type === 'bpmn:Process');
  }

}

// Handlers
/**
 * Get incoming elements
 * @param element
 * @param {boolean=} isFlipped
 */
export function getIncomingElements(element, isFlipped) {
  return  !isFlipped ? new Set (utilsGetIncomingElements(element)) : new Set (utilsGetOutgoingElements(element).concat(getAttachedOutgoingElements(element)));
}

export function getOutgoingElements(element, isFlipped) {
  return  !isFlipped ? new Set (utilsGetOutgoingElements(element).concat(getAttachedOutgoingElements(element))) : new Set (utilsGetIncomingElements(element));
}

