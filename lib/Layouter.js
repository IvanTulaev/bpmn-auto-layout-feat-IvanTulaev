import BPMNModdle from 'bpmn-moddle';
import {
  isBoundaryEvent,
  isStartIntermediate,
  bindBoundaryEventsWithHosts,
} from './utils/elementUtils.js';

import {DEFAULT_CELL_HEIGHT, DEFAULT_CELL_WIDTH, DEFAULT_POOL_MARGIN, connectElements, sortByType} from './utils/layoutUtils.js'
import { DiFactory } from './di/DiFactory.js';
import { is, getDefaultSize } from './di/DiUtil.js';
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
    const {rootElement} = await this.moddle.fromXML(xml);

    this.diagram = rootElement;

    // get all process from root
    // const root = this.getProcess();
    const processes = this.getProcess();
    const collaboration = this.getCollaboration();

    // TODO: Пока просто заглушка
    this.fixCollaboration(processes, collaboration)

    // если больше одного процесса, то проверяем наличие participant в collaboration
    // если для какого-то процесса не создана, то создаем

    // Бежим по всем процессам и создаем для них диаграммы
    // Если процесс 1 то начальное смещение 0
    // если > 1 то начальное смещение 1/2 от высоты ячейки грида для верхнего отступа от края Пула
    // в конце обработки добавляем еще половину для нижнего отступа
    // Итоговое смещение для построения следующей диаграммы будет кол-во строк в диаграмме + отступы от верхнего и нижнего края
    // его возвращаем для расчета в следующий
    // для саб процессов смещение в handlePlane всегда 0, так как там не должно быть пулов
    if (processes && processes.length > 0) {
      this.cleanDi();
      // TODO: его надо куда-то воткнуть?
      this.createRootDi(processes, collaboration)

      // здесь начинаем цикл и каждый раз прирастаем по Y
      let currentShift = 0
      for (const proc of processes) {

        // if (processes.length > 0) currentShift = currentShift + DEFAULT_CELL_HEIGHT
        currentShift = this.handlePlane(proc, currentShift, processes.length > 1); // must return Y shift for next process
      }
    }

    //соединяем процессы
    const messageFlows = collaboration[0]?.messageFlows;
    if (messageFlows){
      for (const message of messageFlows) {
        const {sourceRef, targetRef, id} = message
        const waypoints = connectElements(sourceRef, targetRef)
        const edge = this.diFactory.createDiEdge(message, waypoints)
        this.diagram.diagrams[0].plane.get('planeElement').push(edge)

      }
    }




    return (await this.moddle.toXML(this.diagram, {format: true})).xml;
  }

  fixCollaboration(processes, collaboration) {
    // пока считаем что все в норме
  }


  createRootDi(processes, collaboration) {
    // TODO: вопрос по parent для корневой DI
    const mainProc = processes.length > 1 ? collaboration[0] : processes[0]

    this.createProcessDi(mainProc)

    // //create new di
    // const diFactory = this.diFactory;
    // // Step 0: Create Root element
    //
    // const planeDi = diFactory.createDiPlane({
    //   id: 'BPMNPlane_' + mainProc.id,
    //   bpmnElement: mainProc
    // });
    // const diagramDi = diFactory.createDiDiagram({
    //   id: 'BPMNDiagram_' + mainProc.id,
    //   plane: planeDi
    // });
    //
    // const diagram = this.diagram;
    // diagram.diagrams.unshift(diagramDi);
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
    // diagram.diagrams.unshift(diagramDi);
    diagram.diagrams.push(diagramDi);

    return diagramDi;
  }



  //TODO: add BPMN tree traversal
  /**
   * @param {ModdleElement} planeElement
   * @param {number=} currentShift
   * @param {boolean} needParticipantShape
   * @returns {number}
   */
  handlePlane(planeElement, currentShift= 0, needParticipantShape) {

    const procDi = this.diagram.diagrams.find(item => item.plane.bpmnElement === planeElement)

    let layout = this.createGridLayout(planeElement);
    layout = layout.getResultGrid()

    let nextShift = currentShift

    if (needParticipantShape) {
      const participant = this.getCollaboration()[0].participants.find(participant => participant.processRef === planeElement);
      //TODO: если participant undefined то создаем для процесса

      // x="131" y="81" width="1360" height="650"
      const x = 0
      const y = currentShift
      // Пока отступы DEFAULT_CELL_WIDTH /2 и DEFAULT_CELL_HEIGHT /2
      const { width: defaultWidth, height: defaultHeight} = getDefaultSize(participant)
      const width = layout.colCount > 0 ? layout.colCount * DEFAULT_CELL_WIDTH + DEFAULT_CELL_WIDTH : defaultWidth
      const height = layout.rowCount > 0 ? layout.rowCount * DEFAULT_CELL_HEIGHT +  DEFAULT_CELL_HEIGHT: defaultHeight

      const participantDi = this.diFactory.createDiShape(participant, {width, height, x, y}, {id: participant.id + '_di'})

      const planeDi = this.diagram.diagrams[0].plane.get('planeElement')

      planeDi.push(...[participantDi]);

      nextShift += height

    }

    this.generateDi(layout, currentShift, procDi);

    // return currentShift + layout.rowCount * DEFAULT_CELL_HEIGHT + DEFAULT_CELL_HEIGHT
    return needParticipantShape ? nextShift + DEFAULT_POOL_MARGIN : 0
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

  generateDi(layoutGrid , shift, procDi) {

    const diFactory = this.diFactory;

    const prePlaneElement = procDi ? procDi : this.diagram.diagrams[0]

    const planeElement = prePlaneElement.plane.get('planeElement')

    // deepest subprocess is added first - insert at the front
    // const planeElement = this.diagram.diagrams[0].plane.get('planeElement')

    // Step 1: Create DI for all elements
    layoutGrid.elementsByPosition().forEach(({ element, row, col }) => {
      const dis = this
        .handle('createElementDi', { element, row, col, layoutGrid,  diFactory, shift })
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
    while (stack.length > 0) {

      const currentElement = stack.pop();

      if (is(currentElement, 'bpmn:SubProcess')) {

        const procDi = this.createProcessDi(currentElement)
        this.handlePlane(currentElement, null, null, procDi);
      }

      const nextElements = this.handle('addToGrid', { element: currentElement, grid, stack});

      nextElements.flat().forEach(el => {
        stack.push(el);
      });
    }
  }

  getProcess() {
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
    // TODO: Добавляем первый?
    const firstOtherStartingElement = otherStartingElements[0];
    grid.add(firstOtherStartingElement);
    stack = stack.push(firstOtherStartingElement);
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
