import BPMNModdle from 'bpmn-moddle';
import {
  isBoundaryEvent,
  isStartIntermediate,
  bindBoundaryEventsWithHosts,
  setExpandedProcesses, getAllProcesses,
} from './utils/elementUtils.js';

import {
  DEFAULT_CELL_HEIGHT,
  DEFAULT_CELL_WIDTH,
  DEFAULT_POOL_MARGIN,
  sortByType,
  sortElementsTopLeftBottomRight
} from './utils/layoutUtils.js';
import { DiFactory } from './di/DiFactory.js';
import { is, getDefaultSize } from './di/DiUtil.js';
import { handlers } from './handler/index.js';
import { isFunction } from 'min-dash';
import { GridWithEdges } from './GridWithEdges.js';
import { addToEnd, getLast, Graph } from 'graph-by-ivan-tulaev';

/**
 * @typedef {Object} BPMNElement
 * @property {boolean} isExpanded - is expanded or collapsed
 * @property {Array<BPMNElement>} attachers - prop for host element
 */


export class Layouter {
  constructor(debuggerCounter) {
    this.moddle = new BPMNModdle();
    this.diFactory = new DiFactory(this.moddle);
    this._handlers = handlers;
    this.maxDebugStep = debuggerCounter;
    this.currentDebugStep = 0;

  }


  async layoutProcess(xml) {
    const moddleObj = await this.moddle.fromXML(xml);

    const { rootElement } = moddleObj;

    // init important properties
    this.diagram = rootElement;

    setExpandedProcesses(moddleObj);

    // init process trees as nested sets
    // add nested set properties to process (left, right, level)
    this.processTrees = this.createNestedSets(moddleObj);

    // create and add grids for each process
    // root processes should be processed last for element expanding
    this.createGridsForProcesses();

    // get all process from root
    const rootProcesses = this.getRootProcesses();
    const collaboration = this.getCollaboration();

    if (rootProcesses.length > 0) {
      this.cleanDi();
      this.createRootDi(rootProcesses, collaboration);
      this.drawParticipants();
      this.drawProcesses();
      this.drawCollaborationMessageFlows(collaboration);
    }

    return (await this.moddle.toXML(this.diagram, { format: true })).xml;
  }

  handle(operation, options) {
    return this._handlers
      .filter(handler => isFunction(handler[operation]))
      .map(handler => handler[operation](options));
  }

  createGridsForProcesses() {

    const processes = this.processTrees.map(graph => [ ...graph.nodes ]).flat();
    processes.sort((a, b) => b.level - a.level);

    // create and add grids for each process
    // root processes should be processed last for element expanding
    for (const process of processes) {

      // add base grid with collapsed elements
      process.grid = this.createGridLayout(process);

      // separate base grid to independent grids
      const tempGridCollection = process.grid._separateGrid();

      // for each independent grid:
      // - remove empty rows and cols
      // - shake elements by vertical and horizontal
      for (const grid of tempGridCollection) {
        grid.shrinkRows();
        grid.shrinkCols();
        grid.shakeItVertical();
        grid.shakeItHorizontal();
        grid.shrinkRows();
        grid.shrinkCols();
        grid.toRectangle();

        expandGridHorizontally(grid);
        expandGridVertically(grid);
      }

      // merge separated grids and set new grid to the process
      process.grid = process.grid._mergeGrids(tempGridCollection);
      process.grid.toRectangle();

      if (process.isExpanded) {
        const { colCount, rowCount } = process.grid;
        if (rowCount === 0) process.grid.createRow();
        if (colCount == 0) process.grid.createCol();
      }

    }
  }

  /**
   * draw participants pools at root
   */
  drawParticipants() {
    const collaboration = this.getCollaboration();

    if (!collaboration || !collaboration[0]) return;
    const participants = collaboration[0].participants;

    const x = 0;
    let y = 0;

    for (const participant of participants) {
      y = this.createParticipantDi(participant, { x, y }) + DEFAULT_POOL_MARGIN;
    }
  }

  /**
   * Draw processes.
   * Root processes should be processed first for element expanding
   */
  drawProcesses() {

    for (const procTree of this.processTrees) {
      const sortedProcesses = procTree.nodes.sort((a, b) => a.level - b.level);

      for (const process of sortedProcesses) {

        // draw root processes in participants
        const participant = this.getParticipantForProcess(process);

        if (participant) {
          const participantDi = this.getElementDi(participant);
          const diagram = this.getProcDi(participantDi);

          let { x, y } = participantDi.bounds;
          x += DEFAULT_CELL_WIDTH / 2;
          y += DEFAULT_CELL_HEIGHT / 2;
          this.generateDi(process.grid, { x, y }, diagram);
          continue;
        }

        // draw processes in expanded elements
        if (process.isExpanded) {
          const baseProcDi = this.getElementDi(process);
          const diagram = this.getProcDi(baseProcDi);
          let { x, y } = baseProcDi.bounds;
          const { width, height } = getDefaultSize(process);
          x += DEFAULT_CELL_WIDTH / 2 - width / 4;
          y += DEFAULT_CELL_HEIGHT - height - height / 4;
          this.generateDi(process.grid, { x, y }, diagram);
          continue;
        }

        // draw other processes
        const diagram = this.diagram.diagrams.find(diagram => diagram.plane.bpmnElement === process);
        this.generateDi(process.grid, { x: 0, y: 0 }, diagram);
      }
    }
  }

  drawCollaborationMessageFlows(collaboration) {
    const messageFlows = collaboration[0] ? collaboration[0].messageFlows : null;
    if (messageFlows) {
      for (const message of messageFlows) {
        const { sourceRef, targetRef } = message;
        const sourceBounds = sourceRef.di.bounds;
        const targetBounds = targetRef.di.bounds;
        const dY = targetBounds.y - sourceBounds.y;
        const waypoints = [
          { x: sourceBounds.x + sourceBounds.width / 2 },
          { x: targetBounds.x + targetBounds.width / 2 }
        ];

        if (dY > 0) {
          waypoints[0].y = sourceBounds.y + sourceBounds.height;
          waypoints[1].y = targetBounds.y;
        } else {
          waypoints[0].y = sourceBounds.y;
          waypoints[1].y = targetBounds.y + targetBounds.height;
        }

        const edge = this.diFactory.createDiEdge(message, waypoints);
        this.diagram.diagrams[0].plane.get('planeElement').push(edge);
      }
    }
  }

  getParticipantForProcess(process) {
    const collaboration = this.getCollaboration();
    if (!collaboration || !collaboration[0]) return;
    const participants = this.getCollaboration()[0].participants;

    if (!participants) return;

    return participants.find(participant => participant.processRef === process);
  }

  getElementDi(element) {
    return this.diagram.diagrams
      .map(diagram => diagram.plane.planeElement).flat()
      .find(item => item.bpmnElement === element);
  }

  getProcDi(element) {
    return this.diagram.diagrams.find(diagram => diagram.plane.planeElement.includes(element));
  }

  createNestedSets(bpmnModel) {
    const processGraph = new Graph();

    const allProcesses = getAllProcesses(bpmnModel);

    // add nodes to graph
    for (const process of allProcesses) {
      processGraph.addNode(process);
    }

    // add edges
    for (const process of allProcesses) {
      const children = this.getSubProcesses(process);
      for (const child of children) {
        processGraph.addEdge({ source: process, target: child });
      }
    }

    const separatedGraphs = processGraph.getSeparatedGraphs();

    // set root process to tree
    for (const graph of separatedGraphs) {
      const rootProcesses = graph.nodes.filter(node => graph.getIncomingEdgesFor(node).size === 0);

      // must have 1 root process
      if (rootProcesses.length > 1) throw new Error('Process tree has more than 1 root elements');
      if (rootProcesses.length === 0) throw new Error('Process tree has more than 0 root elements');

      graph.rootProcess = rootProcesses[0];
    }

    // set nested sets attributes
    for (const graph of separatedGraphs) {

      // callback that get start node from process tree
      // it's root process
      const getStartElement = (visited, initialGraph) => {
        const root = initialGraph.rootProcess;

        root.left = 0;
        root.level = 0;

        return root;
      };

      // callback that get next executed nodes
      // it's first node without left prop if we go from root,
      // or without right prop if we go to root
      const getNextNodes = (node, graph, visited) => {

        const { left, level } = node;

        // get first node without left prop
        const outgoingNode = [ ...graph.getOutgoingEdgesFor(node) ]
          .map(edge => edge.target)
          .find(node => node.left === undefined);

        if (outgoingNode) {
          outgoingNode.level = level + 1;
          outgoingNode.left = left + 1;
          return [ outgoingNode ];
        }

        // if no outgoingNode get max right
        const maxRight = [ ...graph.getOutgoingEdgesFor(node) ]
          .map(edge => edge.target)
          .reduce((prev, cur) => {
            if (prev === undefined || cur.right > prev.right) return cur.right;
          } , undefined);

        if (maxRight) {
          node.right = maxRight + 1;
        } else {
          node.right = node.left + 1;
        }

        // get incoming
        const incoming = [ ...graph.getIncomingEdgesFor(node) ]
          .map(edge => edge.source)
          .find(node => node.right === undefined);

        if (incoming) return [ incoming ];
      };
      graph.genericTraversing(getStartElement, getLast, getNextNodes, addToEnd);
    }

    return separatedGraphs;
  }

  getSubProcesses(processes) {
    return processes.flowElements ? processes.flowElements.filter(process => process.$type === 'bpmn:SubProcess') : [];
  }

  createRootDi(processes, collaboration) {

    const mainElement = collaboration && collaboration.length > 0 ? collaboration[0] : processes[0];
    this.createProcessDi(mainElement);
  }

  createProcessDi(element) {
    const diFactory = this.diFactory;

    const planeDi = diFactory.createDiPlane({
      id: 'BPMNPlane_' + element.id,
      bpmnElement: element
    });
    const diagramDi = diFactory.createDiDiagram({
      id: 'BPMNDiagram_' + element.id,
      plane: planeDi
    });

    const diagram = this.diagram;

    diagram.diagrams.push(diagramDi);

    return diagramDi;
  }

  /**
   * Create participant diagram
   * @param participant
   * @param {{x: number, y: number}} origin
   * @returns {number} bottom Y coordinate of created shape
   */
  createParticipantDi(participant, origin) {

    // get size of child process element
    const { colCount, rowCount } = participant.processRef.grid;

    const { width: defaultWidth, height: defaultHeight } = getDefaultSize(participant);

    // Result size is children grid size + paddings ( 1/2 of width or height)
    const width = colCount > 0 ? colCount * DEFAULT_CELL_WIDTH + DEFAULT_CELL_WIDTH : defaultWidth;
    const height = rowCount > 0 ? rowCount * DEFAULT_CELL_HEIGHT + DEFAULT_CELL_HEIGHT : defaultHeight;

    const participantDi = this.diFactory.createDiShape(participant, { width, height, ...origin }, { id: participant.id + '_di' });

    const planeDi = this.diagram.diagrams[0].plane.get('planeElement');

    planeDi.push(...[ participantDi ]);

    return participantDi.bounds.y + participantDi.bounds.height;
  }

  cleanDi() {
    this.diagram.diagrams = [];
  }

  createGridLayout(process) {
    const grid = new GridWithEdges();

    const flowElements = process.flowElements || [];
    const hostElements = flowElements
      .filter(element => !is(element,'bpmn:SequenceFlow') && !isBoundaryEvent(element));

    // check for empty process/subprocess
    if (!flowElements) {
      return grid;
    }

    bindBoundaryEventsWithHosts (flowElements);

    while (grid.elementsCount < hostElements.length && (this.maxDebugStep === undefined || (this.maxDebugStep > 0 && this.currentDebugStep < this.maxDebugStep))) {

      const stack = getInitialStack(hostElements, grid);

      // Depth-first-search with reverse
      this.handleGrid(grid , stack);
    }

    // flip grid on end
    if (grid.isFlipped) {
      grid.flipHorizontally();
    }

    return grid;
  }

  generateDi(layoutGrid , shift, procDi) {

    const diFactory = this.diFactory;

    const prePlaneElement = procDi ? procDi : this.diagram.diagrams[0];

    const planeElement = prePlaneElement.plane.get('planeElement');

    // Step 1: Create DI for all elements
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this
        .handle('createElementDi', { element, row, col, layoutGrid, diFactory, shift })
        .flat();

      planeElement.push(...dis);
    });

    // Step 2: Create DI for all connections
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this
        .handle('createConnectionDi', { element, row, col, layoutGrid, diFactory, shift })
        .flat();

      planeElement.push(...dis);
    });
  }

  handleGrid(grid, stack) {
    while (stack.length > 0 && (this.maxDebugStep === undefined || (this.maxDebugStep > 0 && this.currentDebugStep < this.maxDebugStep))) {

      const currentElement = stack.pop();
      const nextElements = this.handle('addToGrid', { element: currentElement, grid, stack });

      nextElements.flat().forEach(el => {
        stack.push(el);
      });

      this.currentDebugStep += 1;
    }
  }

  getRootProcesses() {
    return this.diagram.get('rootElements').filter(el => el.$type === 'bpmn:Process');
  }

  getCollaboration() {
    return this.diagram.get('rootElements').filter(el => el.$type === 'bpmn:Collaboration');
  }
}

function getPrimaryStartElements(elements, grid) {
  return elements.filter(element => {

    // not edge or boundary or start intermediate
    if (isStartIntermediate(element)) return false;
    if (element.incoming && element.incoming.length > 0) return false;

    // work with elements are not in the grid
    return !grid.hasElement(element);
  });
}

function getSourceElementInGridTargetNotExist(grid) {
  return [ ...grid.elements ].filter(element => {

    // get outgoing
    // if at least one element is not in visited, then return the element
    const outgoing = grid.getOutgoingElementsFor(element);

    for (const outgoingElement of outgoing) {
      if (!grid.hasElement(outgoingElement)) return true;
    }
  });
}

/**
 * get elements in the grid that have incoming that are not in grid
 * @param elements
 * @param grid
 */
function getTargetElementInGridSourceNotExist(grid) {
  return [ ...grid.elements ].filter(element => {
    const incoming = grid.getIncomingElementsFor(element);

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
    const outgoingFromHost = [ ...grid.getOutgoingFromHost(element) ]
      .filter(item => item !== element);

    // without loop
    const outgoingFromBoundary = [ ...grid.getOutgoingFromBoundary(element) ]
      .filter(item => item !== element);

    return outgoingFromHost.length === 0 && outgoingFromBoundary.length === 0;
  });
}

function getTargetElementsFromGrid(elements, grid) {
  return elements.filter(element => {
    if (grid.hasElement(element)) return false;
    const incoming = grid.getIncomingElementsFor(element);
    for (const incomingElement of incoming) {
      if (grid.hasElement(incomingElement)) {
        return true;
      }
    }
  });
}

function getOtherStartElements(elements, grid) {
  return elements.filter(element => {
    if (grid.hasElement(element)) return false;

    // incoming without Loops
    const incoming = [ ...grid.getIncomingElementsFor(element) ].filter(item => item !== element);

    return incoming.length === 0;
  });
}

function getInitialStack(hostElements, grid) {

  // maybe need boundaryEvents processing here
  const primaryStartElements = getPrimaryStartElements(hostElements, grid);

  const sourceElementsInGrid = getSourceElementInGridTargetNotExist(grid);

  // get elements in the grid that have incoming that are not in grid
  const targetElementsInGrid = getTargetElementInGridSourceNotExist (grid);

  const flippedStartElements = getFlippedStartElements(hostElements, grid);

  // not traversed elements exiting from grid
  const targetElementsFromGrid = getTargetElementsFromGrid (hostElements, grid);

  // All elements without incoming from other elements
  // this case as the very last one
  const otherStartingElements = getOtherStartElements (hostElements, grid);

  let stack = [];

  if (targetElementsInGrid.length > 0) {
    const topLeftElement = targetElementsInGrid.sort(sortElementsTopLeftBottomRight(grid))[0];

    // Todo: убрать костыль
    // Пока делаем костыль в виде проброшенного флага на уровне элемента, который потом удаляем
    // Выставляем флаг при помещении элемента в стек
    // Убираем после того как выбрали массив next elements
    topLeftElement.notMoveForvard = true;
    stack = [ topLeftElement ];

    grid.flipHorizontally();
  } else if (primaryStartElements.length > 0) {

    stack = [ sortByType(primaryStartElements, 'bpmn:StartEvent')[0] ];
    for (const element of stack) {
      grid.add(element);
    }

  } else if (sourceElementsInGrid.length > 0) {
    const topLeftElement = sourceElementsInGrid.sort(sortElementsTopLeftBottomRight(grid))[0];

    // Todo: убрать костыль
    // Пока делаем костыль в виде проброшенного флага на уровне элемента, который потом удаляем
    // Выставляем флаг при помещении элемента в стек
    // Убираем после того как выбрали массив next elements
    topLeftElement.notMoveForvard = true;
    stack = [ topLeftElement ];
  } else if (targetElementsFromGrid.length > 0) {
    stack = [ ...targetElementsFromGrid ];
  } else if (otherStartingElements.length > 0) {

    // TODO: Добавляем первый?
    const firstOtherStartingElement = otherStartingElements[0];
    grid.add(firstOtherStartingElement);
    stack.push(firstOtherStartingElement);
  } else if (flippedStartElements.length > 0) {
    stack = [ flippedStartElements[0] ];
    grid.add(flippedStartElements[0]);
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

/**
 * Check grid by columns.
 * If column has elements with isExpanded === true,
 * find the maximum size of elements grids and expand the parent grid horizontally.
 * @param grid
 */
function expandGridHorizontally(grid) {
  for (let i = grid.colCount - 1 ; i >= 0; i--) {
    const elementsInCol = [];
    for (let j = 0; j < grid.rowCount; j++) {
      const candidate = grid.get(j, i);
      if (candidate && candidate.isExpanded) elementsInCol.push(candidate);
    }

    if (elementsInCol.length === 0) continue;

    const maxColCount = elementsInCol.reduce((acc,cur) => {
      if (acc === undefined || cur.grid.colCount > acc) return cur.grid.colCount;
    }, undefined);

    const shift = !maxColCount ? 2 : maxColCount;
    grid.createCol(i, shift);
  }
}

/**
 * Check grid by rows.
 * If row has elements with isExpanded === true,
 * find the maximum size of elements grids and expand the parent grid vertically.
 * @param grid
 */
function expandGridVertically(grid) {

  for (let i = grid.rowCount - 1 ; i >= 0; i--) {
    const elementsInRow = [];
    for (let j = 0; j < grid.colCount; j++) {
      const candidate = grid.get(i, j);
      if (candidate && candidate.isExpanded) elementsInRow.push(candidate);
    }

    if (elementsInRow.length === 0) continue;

    const maxRowCount = elementsInRow.reduce((acc,cur) => {
      if (acc === undefined || cur.grid.rowCount > acc) return cur.grid.rowCount;
    }, undefined);

    const shift = !maxRowCount ? 1 : maxRowCount;

    // expand the parent grid vertically
    for (let index = 0; index < shift; index++) {
      grid.createRow(i);
    }
  }
}
