import BPMNModdle from 'bpmn-moddle';
import {
  isBoundaryEvent,
  isStartIntermediate,
  bindBoundaryEventsWithHosts,
  getAllUnexpandedSubProcesses, getAllProcesses,
} from './utils/elementUtils.js';

import {
  DEFAULT_CELL_HEIGHT,
  DEFAULT_CELL_WIDTH,
  DEFAULT_POOL_MARGIN,
  connectElements,
  sortByType,
  sortElementsTopLeftBottomRight
} from './utils/layoutUtils.js';
import { DiFactory } from './di/DiFactory.js';
import { is, getDefaultSize } from './di/DiUtil.js';
import { handlers } from './handler/index.js';
import { isFunction } from 'min-dash';
import { GridWithEdges } from './GridWithEdges.js';
import { addToEnd, getLast, Graph } from 'graph-by-ivan-tulaev';

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

  createGridsForAllProcesses(processes) {
    for (const process of this.processes) {

      // добавляем процессам базове гриды
      process.grid = this.createGridLayout(process);

      // разделяем грид на отдельные независимые
      const tempGridCollection = process.grid._separateGrid();

      // для каждого независимого грида удаляем пустые строки и столицы + шейкаем
      for (const grid of tempGridCollection) {
        grid.shrinkRows();
        grid.shrinkCols();
        grid.shakeItVertical();
        grid.shakeItHorizontal();
        grid.shrinkRows();
        grid.shrinkCols();
        grid.toRectangle();

        const colCount = grid.colCount;

        // Проверяем по столбцам есть ли элементы в this.expandedElements
        // если есть, то находим максимальный размер colCount и расширяем грид по горизонтали
        for (let i = colCount - 1 ; i >= 0; i--) {
          const elementsInCol = [];
          for (let j = 0; j < grid.rowCount; j++) {
            const candidate = grid.get(j, i);
            if (candidate && this.expandedElements.includes(candidate)) elementsInCol.push(candidate);
          }

          if (elementsInCol.length === 0) continue;

          const maxColCount = elementsInCol.reduce((acc,cur) => {
            if (acc === undefined || cur.grid.colCount > acc) return cur.grid.colCount;
          }, undefined);

          const shift = !maxColCount ? 2 : maxColCount;
          grid.createCol(i, shift + 1);
        }

        // проверяем по строкам есть ли элементы в this.expandedElements
        // если есть, то находим максимальный rowCount и расширяем грид по вертикали
        for (let i = grid.rowCount - 1 ; i >= 0; i--) {
          const elementsInRow = [];
          for (let j = 0; j < grid.colCount; j++) {
            const candidate = grid.get(i, j);
            if (candidate && this.expandedElements.includes(candidate)) elementsInRow.push(candidate);
          }

          if (elementsInRow.length === 0) continue;

          const maxRowCount = elementsInRow.reduce((acc,cur) => {
            if (acc === undefined || cur.grid.rowCount > acc) return cur.grid.rowCount;
          }, undefined);

          const shift = !maxRowCount ? 1 : maxRowCount;

          // расширяем грид по вертикали
          for (let index = 0; index < shift + 1; index++) {
            grid.createRow(i);
          }
        }
      }

      // мержим гриды
      // присваиваем новое значение процессу
      process.grid = process.grid._mergeGrids(tempGridCollection);

      // оквадрачиваем
      process.grid.toRectangle();

    }
  }

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

  async layoutProcess(xml) {
    const moddleObj = await this.moddle.fromXML(xml);

    const { rootElement } = moddleObj;
    this.diagram = rootElement;
    this.expandedElements = getAllUnexpandedSubProcesses(moddleObj);

    this.processTrees = this.createNestedSets(moddleObj);

    // получаем все процессы для построения грида
    this.processes = getAllProcesses(moddleObj).sort((a, b) => b.level - a.level);

    // создаем гриды для каждого из процессов
    this.createGridsForAllProcesses(this.processes);

    // get all process from root
    const rootProcesses = this.getRootProcesses();
    const collaboration = this.getCollaboration();

    if (rootProcesses.length > 0) {
      this.cleanDi();
      this.createRootDi(rootProcesses, collaboration);

      // рисуем пулы для партисипантов
      this.drawParticipants();

      // бежим по деревьям процесса и отрисовываем
      for (const procTree of this.processTrees) {
        const sortedProcesses = procTree.nodes.sort((a, b) => a.level - b.level);

        for (const process of sortedProcesses) {

          // отрисовываем корневые
          // если есть партисипант
          const participant = this.getParticipantForProcess(process);

          if (participant) {
            const participantDi = this.getElementDi(participant);
            const diagram = this.getProcDi(participantDi);

            const { x, y } = participantDi.bounds;

            this.generateDi(process.grid, { originalXShift: x, originalYShift: y }, diagram, true);

            continue;
          }

          // отрисовываем вложенные
          if (process.isExpanded) {
            const baseProcDi = this.getElementDi(process);
            const diagram = this.getProcDi(baseProcDi);
            const { x, y } = baseProcDi.bounds;
            this.generateDi(process.grid, { originalXShift: x, originalYShift: y }, diagram, true);
            continue;
          }

          const diagram = this.diagram.diagrams.find(diagram => diagram.plane.bpmnElement === process);
          this.generateDi(process.grid, { originalXShift: 0, originalYShift: 0 }, diagram, true);
        }
      }

      // соединяем процессы
      const messageFlows = collaboration[0] ? collaboration[0].messageFlows : null;
      if (messageFlows) {
        for (const message of messageFlows) {
          const { sourceRef, targetRef } = message;
          const waypoints = connectElements(sourceRef, targetRef);
          const edge = this.diFactory.createDiEdge(message, waypoints);
          this.diagram.diagrams[0].plane.get('planeElement').push(edge);
        }
      }
    }

    return (await this.moddle.toXML(this.diagram, { format: true })).xml;
  }

  createNestedSets(bpmnModel) {
    const processGraph = new Graph();

    const allProcesses = getAllProcesses(bpmnModel);
    const rootProcesses = this.getRootProcesses();

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

    // validation
    for (const graph of separatedGraphs) {
      let rootCount = 0;
      for (const node of graph.nodes) {
        if (rootProcesses.includes(node)) {
          rootCount += 1;
        }

        if (rootCount > 1) break;
      }

      // must has 1 root process
      if (rootCount > 1) throw new Error('Process tree has more than 1 root elements');
      if (rootCount === 0) throw new Error('Process tree has more than 0 root elements');
    }

    // set nested sets attributes
    for (const graph of separatedGraphs) {
      const getStartElement = (visited, initialGraph) => {
        const root = initialGraph.nodes.filter(node => rootProcesses.includes(node))[0];

        const { left, right, level } = root;

        if (left !== undefined && right !== undefined && level !== undefined) return;

        root.left = 0;
        root.level = 0;

        return root;
      };

      // забираем первую ноду у которой не определен один из параметров
      const getNextNodes = (node, graph, visited) => {

        const { left, level } = node;

        // получаем получаем первую исходящую ноду без атрибутов
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

    // TODO: вопрос по parent для корневой DI
    const mainProc = processes.length > 1 ? collaboration[0] : processes[0];

    this.createProcessDi(mainProc);
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

  createParticipantDi(participant, origin) {

    const { x, y } = origin;

    // получаем размер грида процесса
    const { colCount, rowCount } = participant.processRef.grid;

    // Пока отступы DEFAULT_CELL_WIDTH /2 и DEFAULT_CELL_HEIGHT /2
    const { width: defaultWidth, height: defaultHeight } = getDefaultSize(participant);
    const width = colCount > 0 ? colCount * DEFAULT_CELL_WIDTH + DEFAULT_CELL_WIDTH : defaultWidth;
    const height = rowCount > 0 ? rowCount * DEFAULT_CELL_HEIGHT + DEFAULT_CELL_HEIGHT : defaultHeight;

    const participantDi = this.diFactory.createDiShape(participant, { width, height, x, y }, { id: participant.id + '_di' });

    const planeDi = this.diagram.diagrams[0].plane.get('planeElement');

    planeDi.push(...[ participantDi ]);

    return participantDi.bounds.y + participantDi.bounds.height;
  }

  // TODO: add BPMN tree traversal
  /**
   * @param {ModdleElement} planeElement
   * @param {number=} currentShift
   * @param {boolean} needParticipantShape
   * @returns {number}
   */
  handlePlane(planeElement, currentShift = 0, needParticipantShape) {

    const procDi = this.diagram.diagrams.find(item => item.plane.bpmnElement === planeElement);

    let layout = this.createGridLayout(planeElement);

    // Todo: подумать куда воткнуть
    layout = layout.getResultGrid();

    let nextShift = currentShift;

    if (needParticipantShape) {
      const participant = this.getCollaboration()[0].participants.find(participant => participant.processRef === planeElement);

      // TODO: если participant undefined то создаем для процесса
      const x = 0;
      const y = currentShift;

      // Пока отступы DEFAULT_CELL_WIDTH /2 и DEFAULT_CELL_HEIGHT /2
      const { width: defaultWidth, height: defaultHeight } = getDefaultSize(participant);
      const width = layout.colCount > 0 ? layout.colCount * DEFAULT_CELL_WIDTH + DEFAULT_CELL_WIDTH : defaultWidth;
      const height = layout.rowCount > 0 ? layout.rowCount * DEFAULT_CELL_HEIGHT + DEFAULT_CELL_HEIGHT : defaultHeight;

      const participantDi = this.diFactory.createDiShape(participant, { width, height, x, y }, { id: participant.id + '_di' });

      const planeDi = this.diagram.diagrams[0].plane.get('planeElement');

      planeDi.push(...[ participantDi ]);

      nextShift += height;
    }

    this.generateDi(layout, currentShift, procDi, needParticipantShape);

    return needParticipantShape ? nextShift + DEFAULT_POOL_MARGIN : 0;
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

    while (grid.elementsCount < hostElements.length) {

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

  generateDi(layoutGrid , shift, procDi, inPool = false) {

    const { originalXShift, originalYShift } = shift || {};

    const diFactory = this.diFactory;

    const prePlaneElement = procDi ? procDi : this.diagram.diagrams[0];

    const planeElement = prePlaneElement.plane.get('planeElement');

    const currentYShift = inPool ? originalYShift + DEFAULT_CELL_HEIGHT / 2 : (originalYShift || 0);
    const xShift = inPool ? originalXShift + DEFAULT_CELL_WIDTH / 2 : (originalXShift || 0);

    // Step 1: Create DI for all elements
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this
        .handle('createElementDi', { element, row, col, layoutGrid, diFactory, shift: currentYShift, xShift })
        .flat();

      planeElement.push(...dis);
    });

    // Step 2: Create DI for all connections
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this
        .handle('createConnectionDi', { element, row, col, layoutGrid, diFactory, shift: currentYShift, xShift })
        .flat();

      planeElement.push(...dis);
    });
  }

  handleGrid(grid, stack) {
    while (stack.length > 0) {

      const currentElement = stack.pop();
      const nextElements = this.handle('addToGrid', { element: currentElement, grid, stack });

      nextElements.flat().forEach(el => {
        stack.push(el);
      });
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
    stack = [ topLeftElement ];

    grid.flipHorizontally();
  } else if (primaryStartElements.length > 0) {

    stack = [ sortByType(primaryStartElements, 'bpmn:StartEvent')[0] ];
    for (const element of stack) {
      grid.add(element);
    }

  } else if (sourceElementsInGrid.length > 0) {
    stack = [ ...sourceElementsInGrid ];
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
