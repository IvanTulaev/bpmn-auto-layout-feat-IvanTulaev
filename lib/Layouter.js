import BPMNModdle from 'bpmn-moddle';
import {
  getAttachedOutgoingElements,
  getIncomingElements as utilsGetIncomingElements,
  getOutgoingElements as utilsGetOutgoingElements,
  isBoundaryEvent,
  isConnection,
  isStartIntermediate,
  getHostIncoming,
  getBoundaryIncomingHosts
} from './utils/elementUtils.js';

import {
  getVerticalChain,
  getHorizontalChain,
  sortElementsTopLeftBottomRight,
  sortElementsTopLeftBottomRightColumn,
  sortColsLeftRightRowsBottomTop,
  sortByType,
  getIncomingFromHost,
  getIncomingFromBoundaryHost,
  getOutgoingFromHost,
  getOutgoingFromBoundary,
} from './handler/outgoingHandler.js'

import { Grid } from './Grid.js';
import { DiFactory } from './di/DiFactory.js';
import { is } from './di/DiUtil.js';
import { handlers } from './handler/index.js';
import { isFunction } from 'min-dash';
import * as grid from "min-dash";
import {createTestGrid} from './createTestGrid.js'

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
    let layout = this.createGridLayout(planeElement);
    shakeItHorizontal(layout)
    shakeItVertical(layout)
    // layout = createTestGrid(layout)
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

      const flippedNoIncoming = elementsWithoutBoundary.filter(el => {
        if (grid.hasElement(el)) return false;
        // getOutgoingFromHost,
        // getOutgoingFromBoundary,
        let outgoingFromHost = getOutgoingFromHost(el, grid.isFlipped);
        // удаляем loop
        outgoingFromHost = [...outgoingFromHost].filter(item => item !== el);

        let outgoingFromBoundary = getOutgoingFromBoundary(el, grid.isFlipped);
        // удаляем loop
        outgoingFromBoundary = [...outgoingFromBoundary].filter(item => item !== el);

        return outgoingFromHost.length === 0 && outgoingFromBoundary.length === 0;
      })

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
        const els = sortByType(startingElementsOnly, 'bpmn:StartEvent').reverse();

        stack = [ ...els ];
        // stack = [ ...startingElementsOnly ];
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
      } else if (flippedNoIncoming.length > 0) {
        stack = [ flippedNoIncoming[0] ];
        grid.flipHorizontally();
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

/**
 * @typedef {('VERTICAL' | 'HORIZONTAL')} CrossDirection
 */
/**
 * @typedef {('S_N' | 'SW_NE' | 'W_E' | 'NW_SE' | 'N_S' | 'NE_SW' | 'E_W' | 'SE_NW' | 'POINT')} Direction
 * - **S_N** - south to north
 * - **SW_NE** - south-west to north-east
 * - **W_E** - west to east
 * - **NW_SE** - north-west to south-east
 * - **N_S** - north to south
 * - **NE_SW** - north-east to south-west
 * - **E_W** - east to west
 * - **SE_NW** - south-east to north-west
 * - **POINT** - if it's not a vector but a point
 */
/**
 * @typedef {[number, number]} Position
 * numbers must be integer
 */

/**
 * @typedef {{position: Position, vCross: boolean, hCross: boolean}} PathSegment
 */

/**
 * TODO: !!!!ADD REVERSE
 * @param sourceElement
 * @param targetElement
 * @param grid
 * @returns {PathSegment[]}
 */
export function getPathSegments(sourceElement, targetElement, grid, sourceIsBoundary) {
  /**
   * @type {PathSegment[]}
   */

  const pathSegments = []

  // если одного из элементов нет в гриде, то прекращаем обработку
  if (!sourceElement || !targetElement || !grid.hasElement(sourceElement) || !grid.hasElement(targetElement)) return pathSegments;

  const sourcePosition = grid.find(sourceElement)
  const targetPosition = grid.find(targetElement)
  const direction  = getDirection(sourcePosition, targetPosition)
  const [sourceRow, sourceCol] = sourcePosition
  const [targetRow, targetCol] = targetPosition



  if (direction === 'S_N') {

    //если sourceIsBoundary то сразу идем в обход
    if (sourceIsBoundary) return pathSegments


    // проверяем есть ли элементы между sourcePosition, targetPosition
    // если есть, то ребро пойдет в обход
    // так же оно пойдет в обход если элементы на соседних клетках и есть обратное ребро targetPosition-sourcePosition
    const middleElements =  new Set()
    for (let rowIndex = sourceRow - 1; rowIndex > targetRow; rowIndex--) {
      const middleElement = grid.get(rowIndex, sourceCol)
      if (middleElement) {
        middleElements.add(middleElement)
      }
    }
    // идем между ячейками грида
    if (middleElements.size > 0) return pathSegments

    const targetElementOutgoing = utilsGetOutgoingElements(targetElement)
    // идем в обход если есть ребро в противоположном направлении
    if (targetElementOutgoing.includes(sourceElement)) return pathSegments


    for (let rowIndex = sourceRow - 1; rowIndex > targetRow; rowIndex--) {
      pathSegments.push({position: [rowIndex, sourceCol], vCross: true, hCross: false})
    }
    return pathSegments
  }

  if (direction === 'SW_NE') {

    //если sourceIsBoundary то пропускаем горизонтальную часть
    if (!sourceIsBoundary) {
      //move right then up
      for (let colIndex = sourceCol + 1; colIndex < targetCol; colIndex++) {
        pathSegments.push({position: [sourceRow, colIndex], hCross: true})
      }
    }

    // add corner segment
    pathSegments.push({position: [sourceRow, targetCol], hCross: true, vCross: true})

    for (let rowIndex = sourceRow - 1; rowIndex > targetRow; rowIndex--) {
      pathSegments.push({position: [rowIndex, targetCol], vCross: true, hCross: false})
    }
    return pathSegments
  }

  if (direction === 'W_E') {
    // всегда идем вперед
    // пропускаем если sourceIsBoundary
    if (sourceIsBoundary) return pathSegments

    for (let colIndex = sourceCol + 1; colIndex < targetCol; colIndex++) {
      pathSegments.push({position: [sourceRow, colIndex], hCross: true})
    }
    return pathSegments
  }

  if (direction === 'NW_SE') {
    // идем сначала вниз, потом вправо так же и для sourceIsBoundary
    for (let rowIndex = sourceRow + 1; rowIndex < targetRow; rowIndex++) {
      pathSegments.push({position: [rowIndex, sourceCol], vCross: true, hCross: false})
    }
    pathSegments.push({position: [targetRow, sourceCol], vCross: true, hCross: true})

    for (let colIndex = sourceCol + 1; colIndex < targetCol; colIndex++) {
      pathSegments.push({position: [targetRow, colIndex], hCross: true})
    }
  }

  if (direction === 'N_S') {
    // всегда идем вниз так же и для sourceIsBoundary
    for (let rowIndex = sourceRow + 1; rowIndex < targetRow; rowIndex++) {
      pathSegments.push({position: [rowIndex, sourceCol], vCross: true})
    }
    return pathSegments
  }

  if (direction === 'NE_SW') {
    // идем вниз потом налево так же и для sourceIsBoundary
    for (let rowIndex = sourceRow + 1; rowIndex < targetRow; rowIndex++) {
      pathSegments.push({position: [rowIndex, sourceCol], vCross: true})
    }
    pathSegments.push({position: [targetRow, sourceCol], vCross: true, hCross: true})
    for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
      pathSegments.push({position: [targetRow, colIndex], hCross: true})
    }
    return pathSegments
  }

  if (direction === 'E_W') {
    // здесь аналогично движению вверх
    // проверяем есть ли элементы между sourcePosition, targetPosition
    // если есть, то ребро пойдет в обход
    // так же оно пойдет в обход если элементы на соседних клетках и есть обратное ребро targetPosition-sourcePosition

    //для sourceIsBoundary всегда пропускаем
    if (sourceIsBoundary) return pathSegments

    const middleElements =  new Set()
    for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
      const middleElement = grid.get(sourceRow, colIndex)
      if (middleElement) {
        middleElements.add(middleElement)
      }
    }
    // идем между ячейками грида
    if (middleElements.size > 0) return pathSegments

    const targetElementOutgoing = utilsGetOutgoingElements(targetElement)
    // идем в обход если есть ребро в противоположном направлении
    if (targetElementOutgoing.includes(sourceElement)) return pathSegments


    for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
      pathSegments.push({position: [sourceRow, colIndex], hCross: true})
    }

    return pathSegments
  }

  if (direction === 'SE_NW') {
    // движение назад должно происходить между клетками если до колонки таргета есть элементы
    // движемся сначала влево потом вверх

    const middleElements =  new Set()
    for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
      const middleElement = grid.get(sourceRow, colIndex)
      if (middleElement) {
        middleElements.add(middleElement)
      }
    }

    // для sourceIsBoundary пропускаем горизонталь
    if (!sourceIsBoundary) {
      // пробуем новую схему для хост-хост без обхода
      //// если элементов нет, то пересекаем прямо
      // if (middleElements.size === 0){
        for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
          pathSegments.push({position: [sourceRow, colIndex], hCross: true})
        }
      // }
    }

    // угловой сегмент
    // if (middleElements.size === 0){
    if (!sourceIsBoundary) {
      pathSegments.push({position: [sourceRow, targetCol], hCross: true, vCross: true})
    } else {
      pathSegments.push({position: [sourceRow, targetCol], vCross: true})
    }

    // идем наверх
    for (let rowIndex = sourceRow - 1; rowIndex > targetRow; rowIndex--) {
      pathSegments.push({position: [rowIndex, targetCol], vCross: true})
    }
    return pathSegments
  }


  return pathSegments
}

/**
 *
 * @param sourceElement
 * @param targetElement
 * @param grid
 * @param sourceIsBoundary
 * @returns {{targetPosition: [number, number], sourcePosition: [number, number], pathSegments: PathSegment[]}}
 */
export function getPath (sourceElement, targetElement, grid, sourceIsBoundary) {
  const sourcePosition = grid.find(sourceElement)
  const targetPosition = grid.find(targetElement)

  const pathSegments = getPathSegments(sourceElement, targetElement, grid, sourceIsBoundary)

  return {sourcePosition, targetPosition, pathSegments}

}
/**
 * @typedef {{occupied: boolean, vCross: boolean, hCross: boolean}} CrossMapElement
 */

/**
 * @param grid
 * @returns {Array<Array<CrossMapElement>>}
 */
export function getCrossGrid(grid) {
  const rowCount = grid.rowCount
  const colCount = grid.colCount
  // создаем болванку
  /**
   *
   * @type {Array<Array<CrossMapElement>>}
   */
  const crossGrid = []
  for (let i = 0 ; i < rowCount; i++){
    crossGrid.push(Array(colCount))
  }

  // бежим по гриду и обрабатываем все занятые ячейки с элементами
  // строим карту существующих ребер по исходящим
  // входящие - это дубликаты исходящих
  for (const gridElement of grid.elements) {
    // получаем исходящие маршруты
    const outgoingPaths = [...getOutgoingElements(gridElement, grid.isFlipped)].map(outgoingElement => {
      return getPathSegments(gridElement, outgoingElement, grid)
    })

    // заполняем матрицу пересечений
    // сначала свойством занятости для текущего элемента
    const position = grid.find(gridElement)
    const crossGridElement = crossGrid[position[0]][position[1]]
    if (!crossGridElement) {
      crossGrid[position[0]][position[1]] = {occupied: true}
    }else {
      crossGridElement.occupied = true
    }

    //вторым заходом ставим свойства пересечений на основании путей
    //TODO: отфильтровать те что >0 чтобы не молотить просто так
    for (const path of outgoingPaths) {
      for (const segment of path){
        const [segmentRow, segmentCol] = segment.position
        const {vCross, hCross} = segment
        const crossGridElement = crossGrid[segmentRow][segmentCol]
        if (!crossGridElement) {
          crossGrid[segmentRow][segmentCol] = {vCross, hCross}
        } else {
          if (vCross){
            crossGridElement.vCross = vCross
          }
          if (hCross){
            crossGridElement.hCross = hCross
          }
        }
      }
    }

  }

  return crossGrid
}


/**
 * Return 1 of 8 directions for 'vector' or 'POINT'
 * @param {Position} sourcePosition
 * @param {Position} targetPosition
 * @returns {Direction}
 */
export function getDirection(sourcePosition, targetPosition) {
  const [sourceRow, sourceCol] = sourcePosition
  const [targetRow, targetCol] = targetPosition

  const vDifference = sourceRow - targetRow;
  const hDifference = sourceCol - targetCol;

  // south to north
  if (vDifference > 0 && hDifference === 0) return 'S_N';

  // south-west to north-east
  if (vDifference > 0 && hDifference < 0) return 'SW_NE'

  // west to east
  if (vDifference === 0 && hDifference < 0) return 'W_E'

  // north-west to south-east
  if (vDifference < 0 && hDifference < 0) return 'NW_SE'

  // north to south
  if (vDifference < 0 && hDifference === 0) return 'N_S'

  // north-east to south-west
  if (sourceRow < targetRow && sourceCol > targetCol) return 'NE_SW'

  // east to west
  if (sourceRow === targetRow && sourceCol > targetCol) return 'E_W'

  // south-east to north-west
  if (sourceRow > targetRow && sourceCol > targetCol) return 'SE_NW'

  return  'POINT'
}

/**
 * @typedef  {(Extract<Direction, 'S_N' | 'N_S'>)} VerticalDirection
 */

/**
 * @typedef  {(Extract<Direction, 'E_W' | 'W_E'>)} HorizontalDirection
 */


export function getPositionVerticalCrossedBy(sourceElement, targetElement, grid) {
  const path = getPathSegments(sourceElement, targetElement, grid)
  const verticalCrossed = path.filter(segment => {
    const [segmentRow, segmentCol] = segment.position
    const gridElement = grid.get(segmentRow, segmentCol)
    return (gridElement && segment.vCross)
  })
  return verticalCrossed.map(item => item.position)
}

export function getPositionsHorizontalCrossedBy(sourceElement, targetElement, grid) {
  const path = getPathSegments(sourceElement, targetElement, grid)
  const horizontalCrossed = path.filter(segment => {
    const [segmentRow, segmentCol] = segment.position
    const gridElement = grid.get(segmentRow, segmentCol)
    return (gridElement && segment.hCross)
  })
  return horizontalCrossed.map(item => item.position)
}


/**
 * Экспериментальная функция с херовой производительностью
 * @param grid
 */
function shakeItHorizontal(grid){
  // на всякий пожарный оквадрачиваем
  grid.toRectangle()

  let baseCrossGrid = getCrossGrid(grid)

  // const sortedElements = [...grid.elements].sort(sortElementsTopLeftBottomRight(grid))
  // sortElementsTopLeftBottomRightColumn
  // const sortedElements = [...grid.elements].sort(sortElementsTopLeftBottomRightColumn(grid))
  const sortedElements = [...grid.elements].sort(sortColsLeftRightRowsBottomTop (grid))


  while (sortedElements.length > 0) {
    // работаем по первому элементу
    const element = sortedElements.shift()
    // получаем вертикальную цепочку
    // удаляем из стека sortedElements все элементы из цепочки
    const verticalChain = getVerticalChain(element, grid)
    for (const chainElement of verticalChain) {
      const deleteIndex = sortedElements.indexOf(chainElement)
      if (deleteIndex >= 0) {
        sortedElements.splice(sortedElements.indexOf(chainElement), 1)
      }
    }
    // проверяем можно ли двинуть цепочку влево
    // не одна из позиций не должна быть занята или иметь вертикального пересечения
    // - цепочка не должна удлиниться
    const [, baseCol] = grid.find([...verticalChain][0])
    const rows =  [...verticalChain].map(item => {
      const itemPosition = grid.find(item)
      return  itemPosition[0]
    })

    // двигаться назад не вариант если в цепочка в первой колонке
    if (baseCol <= 0 ) continue;

    for (let col = baseCol - 1; col >= 0; col--) {
      const allPositionsAreFine = rows.every(row => {
        return !positionIsCrossedOrOccupied([row, col], baseCrossGrid, true)
      })

      if (!allPositionsAreFine) break;

      // пробно перемещаем все элементы из цепочки на новые места
      for (const chainElement of verticalChain) {
        const chainElementPosition = grid.find(chainElement)
        grid.move(chainElement, [chainElementPosition[0], col])
      }

      // проверяем не образовалось ли новых пересечений пока по старинке
      const newCrossGrid = getCrossGrid(grid)
      const crossed = newCrossGrid.flat()
          .filter(crossGridEl => crossGridEl.occupied && (crossGridEl.vCross || crossGridEl.hCross) )
      const newVerticalChain = getVerticalChain(element, grid)
      if (crossed.length > 0 || newVerticalChain.size > verticalChain.size){
        // вертаем все элементы взад
        for (const chainElement of verticalChain) {
          const chainElementPosition = grid.find(chainElement)
          grid.move(chainElement, [chainElementPosition[0], col + 1])
        }
        break;
      }else{
        baseCrossGrid = newCrossGrid
      }
    }
  }
}

/**
 *
 * @param {[number, number]} position
 * @param crossGrid
 * @param {boolean} byVertical
 */
function positionIsCrossedOrOccupied(position, crossGrid, byVertical) {
  // если высота crossGrid меньше индекс строки позиции
  if (crossGrid.length - 1 < position[0]) return false;
  const crossGridElement = crossGrid[position[0]][position[1]]
  if (!crossGridElement) return false;

  const crossed = !byVertical ? crossGridElement.hCross : crossGridElement.vCross
  const occupied = crossGridElement.occupied

  return occupied || crossed
}


/**
 * Экспериментальная функция с херовой производительностью
 * @param grid
 */
function shakeItVertical(grid){
  // на всякий пожарный оквадрачиваем
  grid.toRectangle()

  let baseCrossGrid = getCrossGrid(grid)

  // const sortedElements = [...grid.elements].sort(sortElementsTopLeftBottomRight(grid))
  // sortElementsTopLeftBottomRightColumn
  // const sortedElements = [...grid.elements].sort(sortElementsTopLeftBottomRightColumn(grid))
  const sortedElements = [...grid.elements].sort(sortElementsTopLeftBottomRight (grid))


  while (sortedElements.length > 0) {
    // работаем по первому элементу
    const element = sortedElements.shift()
    // получаем вертикальную цепочку
    // удаляем из стека sortedElements все элементы из цепочки
    const horizontalChain = getHorizontalChain(element, grid)
    for (const chainElement of horizontalChain) {
      const deleteIndex = sortedElements.indexOf(chainElement)
      if (deleteIndex >= 0) {
        sortedElements.splice(sortedElements.indexOf(chainElement), 1)
      }
    }
    // проверяем можно ли двинуть цепочку вверх
    // не одна из позиций не должна быть занята или иметь вертикального пересечения
    // - цепочка не должна удлиниться
    const [baseRow] = grid.find([...horizontalChain][0])
    const cols =  [...horizontalChain].map(item => {
      const itemPosition = grid.find(item)
      return  itemPosition[1]
    })

    // двигаться вверх не вариант если в цепочка в первой строке
    if (baseRow <= 0 ) continue;

    for (let row = baseRow - 1; row >= 0; row--) {
      const allPositionsAreFine = cols.every(col => {
        return !positionIsCrossedOrOccupied([row, col], baseCrossGrid, false)
      })

      if (!allPositionsAreFine) break;

      // пробно перемещаем все элементы из цепочки на новые места
      for (const chainElement of horizontalChain) {
        const chainElementPosition = grid.find(chainElement)
        grid.move(chainElement, [row, chainElementPosition[1]])
      }

      // проверяем не образовалось ли новых пересечений пока по старинке
      // и не удлинилась ли цепочка
      // Надо отдельно проверять не цепочку а положение, кейс с boundary scenario.issue-80-1.bpmn
      const newCrossGrid = getCrossGrid(grid)
      const crossed = newCrossGrid.flat()
          .filter(crossGridEl => crossGridEl.occupied && (crossGridEl.vCross || crossGridEl.hCross) )
      const newHorizontalChain = getHorizontalChain(element, grid)
      if (crossed.length > 0 || newHorizontalChain.size > horizontalChain.size){
        // вертаем все элементы взад
        for (const chainElement of horizontalChain) {
          const chainElementPosition = grid.find(chainElement)
          grid.move(chainElement, [row + 1 , chainElementPosition[1]])
        }
        break;
      }else{
        baseCrossGrid = newCrossGrid
      }
    }
  }
}