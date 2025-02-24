import { is } from '../di/DiUtil.js';

import {
  connectElements,
  sortElementsTopLeftBottomRight,
  sortByType,
} from '../utils/layoutUtils.js'

export default {
  'addToGrid': ({ element, grid, stack }) => {

    // выворачиваем
    const leftOutgoing = moveOutgoingForward(element, grid, stack)
    // поменять их местами видимо если выше?
    if (leftOutgoing && leftOutgoing.length > 0) {
      return [ element, ...leftOutgoing.reverse()]
    }

    // получаем новые которых нет в гриде
    const newOutgoing = getNewOutgoing(element, grid)

    // получаем вершины из стека с удалением их из грида
    // грохнем для теста так как их уже вытянули вперед
    const outgoingFromStack = getOutgoingFromStack(element, grid, stack)

    // Handle outgoing paths without boundaryEvents
    // Maybe later it will merge
    const outgoing = [...outgoingFromStack, ...newOutgoing];

    let nextElements = [];
    let previousElement = null;

    outgoing.forEach(nextElement => {

      //подготавливаем место пока без учета boundary
      // пока без учета boundary
      const fromHost = isFromHost(element, nextElement, grid.isFlipped)
      const nextPosition = getInsertPosition (element, previousElement, grid, !fromHost)

      //вставляем элемент
      grid.add(nextElement, nextPosition);

      // здесь надо с тру
      fixNewCrosses(nextElement, grid, stack, true)

      //обновляем previous
      previousElement = nextElement;

      nextElements.unshift(nextElement);
    });

    // TODO: sort by priority
    return nextElements;
  },

  'createConnectionDi': ({ element, row, col, layoutGrid, diFactory }) => {
    const outgoing = element.outgoing || [];

    return outgoing.map(out => {
      const target = out.targetRef;
      const waypoints = connectElements(element, target, layoutGrid);

      return diFactory.createDiEdge(out, waypoints, {
        id: out.id + '_di'
      });
    });
  }
};

function isFromHost (hostElement, targetElement, reverse) {
  const incoming = !reverse ? targetElement.incoming : targetElement.outgoing;
  const fromHost = incoming.map(element => !reverse ? element.sourceRef : element.targetRef).filter(item => !item.attachedToRef)
  return fromHost.includes(hostElement)
}

// только для тех что впереди
function fixNewCrosses(element, grid, stack, forwardOnlyOutgoing) {

  // реверс логики переноса вперед для исходящих
  // исправляем пересечения образованые исходящими и входящими ребрами новой вершины
  // получаем исходящие
  const outgoingEdges = grid.getExistingOutgoingEdgesFor(element);
  const filteredOutgoingEdges = [...outgoingEdges]
      .filter(edge => {
        const itemPosition = edge.targetPosition
        const elementPosition = edge.sourcePosition
        if (edge.target === edge.source) return false;
        if (stack.includes(edge.target)) return false;

        // TODO: Пока выключаем?
        //реверс логики
        if (forwardOnlyOutgoing) {
          if ((itemPosition[0] < elementPosition[0]) && (itemPosition[1] <= elementPosition[1])) return false;
        }

        const [itemRow, itemCol] = itemPosition;
        const [baseRow, baseCol] = elementPosition;
        return true
      })
      .sort((a, b) => {
        const [aRow, aCol] = a.targetPosition;
        const [bRow, bCol] = b.targetPosition;
        return aRow - bRow || aCol - bCol;
      });

  for (const edge of filteredOutgoingEdges) {
    // исправляем вертикали
    fixNewVerticalCrosses(edge, grid)
    fixNewHorizontalCrosses(edge, grid)
  }

  const incomingEdges = [...grid.getExistingIncomingEdgesFor(element)]
      .sort((a, b) => {
        const [aRow, aCol] = a.sourcePosition;
        const [bRow, bCol] = b.sourcePosition;
        return aRow - bRow || aCol - bCol;
      });

  for (const edge of incomingEdges) {
    fixNewVerticalCrosses(edge, grid)
    fixNewHorizontalCrosses(edge, grid)
  }
}

/**
 *  - Выдергивает исходящие элементы из стека обработки
 *  - Так же удаляет их из графа
 *  - Для дальнейшей обработки воспринимаем их как абсолютно новые вершины
 * @param element - элемент для которого ищем исходящие
 * @param grid
 * @param stack
 * @returns {any[]} - массив элементов
 */
function getOutgoingFromStack(element, grid, stack){
  // получаем все исходящие базового элемента
  const outgoing = grid.getOutgoingElementsFor(element)

  // исключаем ребра в себя
  // исключаем те что НЕ в стеке
  // их положение должно быть слева или в той же колонке.
  // правые не берем, так как их расположение норм
  // сортируем их слева направо и сверху вниз
  // исключаем если общий родитель
  let incFromHost = grid.getIncomingFromHost (element)

  const processingElements = [...outgoing].filter(item => {
    if (item === element) return false;
    if (!stack.includes(item)) return false;

    const itemPosition = grid.find(item);
    const elementPosition = grid.find(element);
    if (!itemPosition || !elementPosition) return false;

    // костыль для общих родителей
    let incFromBoundProc = grid.getIncomingFromBoundaryHost(item)

    incFromBoundProc = [...incFromBoundProc].filter(incFromHostProcItem => incFromHost.has(incFromHostProcItem))
    if (incFromBoundProc.length > 0) return false;

    // пробуем исключая те что в строке
    return ((itemPosition[1] <= elementPosition[1]) && (itemPosition[0] !== elementPosition[0]) )
  }).sort(sortElementsTopLeftBottomRight (grid))

  //обрабатываем элементы
  //Удаляем их из стека и из грида
  for (const processingElement of processingElements) {
    stack.splice(stack.indexOf(processingElement), 1)
    grid.removeElement(processingElement)
  }
  //после удаления из грида удаляем лишние колонки
  grid.shrinkRows()
  grid.shrinkCols()

  // обрабатываем их как новые исходящие
  return processingElements
}

//TODO: Не стек, а крайние
function getNewOutgoing(element, grid) {
  // элементы
  let fromHost = grid.getOutgoingFromHost (element)
  fromHost = [...fromHost].filter(item => !grid.hasElement(item))
  fromHost = sortByType(fromHost, 'bpmn:ExclusiveGateway')

  let fromBoundary = grid.getOutgoingFromBoundary (element)
  fromBoundary = [...fromBoundary].filter(item => !grid.hasElement(item) && !fromHost.includes(item))
  fromBoundary = sortByType(fromBoundary, 'bpmn:ExclusiveGateway')

  // добавить сортировку по кол-ву исходящих?
  return [...fromHost, ...fromBoundary]
}

function getInsertPosition (element, previousElement, grid, isBoundarySource) {

  const sourcePosition = grid.find(element)
  if (!sourcePosition) return;
  //по умолчанию располагаем справа от element
  const position = [sourcePosition[0],sourcePosition[1] + 1]

  // первый элемент из обычного
  // целимся в следующую колонку на той же строке
  // Если там вершина или вертикальное пересечение то добавляем колонку
  // После добавления колонки проверяем горизонтальные пересечения
  if (!previousElement && !isBoundarySource){

    // здесь добавить условие, что если в занятой позиции лежит target ребра element-target,
    // то добавляем строку
    // по-хорошему, надо найти самый нижний target для element, и под него добавить строку

    // Логика в основном для вставки элементов после флиппа
    // получаем все ребра из элемента
    // и выбираем те, у которых есть таргет в колонке позиции
    const edgesWithTargetInCol = grid.getExistingOutgoingEdgesFor(element)
        .filter(edge => {
          const [, targetCol] = edge.targetPosition
          return targetCol === position[1]
        }).sort((first, second) => {
          // сортируем по возрастанию строки
          const [firstRow] = first.targetPosition
          const [secondRow] = second.targetPosition

          return firstRow - secondRow
        })

    if (edgesWithTargetInCol.length > 0) {
      // находим самую нижнюю позицию после подряд идущих исходящих
      // бежим по ребрам пока не найдем дырку
      for (const edge of edgesWithTargetInCol) {
        const [targetRow] = edge.targetPosition
        // TODO: Ad optimisation
        if (targetRow === position[0]) position[0] = position[0] + 1
      }
    }

    // дальше по старому алгоритму
    if (grid.hasElementAt(position) || grid.isCrossed(position, true)) {
      grid.createCol(position[1] - 1)
    }

    /**
     * проверяем горизонтальные пересечения позиции по направлениям
     * S_N - не может быть так как это вертикаль
     * SW_NE - возможно только если source этого ребра - вершина - источник
     * W_E - только если source вершина - источник
     * NW_SE - не может быть, так как уже устранили пересечение по вертикали
     * N_S - не может быть так как это вертикаль
     * NE_SW - возможно если target - вершина источник
     * E_W - не предполагается схемой
     * SE_NW - такого быть не может, так как уже устранили вертикальное пересечение
     */
    // обрабатываем исходящие, чтобы закрыть кейсы SW_NE и W_E
    // пока не смотрим на поведение boundary и считаем их поведение как у обычного элемента
    const outgoingEdges = grid.getExistingOutgoingEdgesFor(element);

    for (const edge of outgoingEdges) {
      // TODO: здесь добавить условие на пересечение?
      const direction = edge.direction
      if (direction !== 'SW_NE' && direction !== 'W_E') continue;
      //добавляем ячейку под element
      grid.createRow(sourcePosition[0])
      position[0] = position[0] + 1
      return position
    }

    const incomingEdges = grid.getExistingIncomingEdgesFor(element)

    for (const edge of incomingEdges) {
      const incomingPosition = edge.sourcePosition
      const direction = edge.direction
      if (direction !== 'NE_SW') continue;
      //добавляем ячейку под element
      grid.createRow(sourcePosition[0])
      position[0] = position[0] + 1
      return position
    }

    return position
  }

  //первый элемент из boundary
  if (!previousElement && isBoundarySource){
    // вставка первого элемента по диагонали
    position[0] = position[0] + 1

    let isOccupied = grid.get(position[0], position[1])
    let isVCrossed = grid.isCrossed([position[0], position[1]], true)

    if (isOccupied || isVCrossed) {
      grid.createCol(position[1] - 1)
    }

    isOccupied = grid.get(position[0], position[1])
    let isHCrossed = grid.isCrossed([position[0], position[1]])

    if (isOccupied || isHCrossed) {
      grid.createCol(position[1] - 1)
    }

    return position
  }

  // для всех последующих
  /**
   * Последующие элементы устанавливаются ниже на строку от первого
   * Если ячейка занята или имеет горизонтальное пересечение,
   * то добавляем строку под предыдущий элемент
   * S_N - нет, так как не предполагается схемой
   * SW_NE - если target предыдущая
   * W_E - нет вертикали
   * NW_SE - если source предыдущая
   * N_S - если source предыдущая
   * NE_SW - если source предыдущая
   * E_W- нет, так как не предполагается схемой
   * SE_NW если target предыдущая
   */
  if (previousElement) {
    const previousPosition = grid.find(previousElement)
    if (!previousPosition) return;
    position[0] = previousPosition[0] + 1
    position[1] = previousPosition[1]

    const isOccupiedElement = grid.get(position[0], position[1])
    const isCrossedHorizontal = grid.isCrossed([position[0], position[1]])

    if (isOccupiedElement || isCrossedHorizontal) {
      grid.createRow(previousPosition[0])
    }

    // проверяем вертикали
    const outgoing = grid.getExistingOutgoingEdgesFor(previousElement)

    for (const outgoingEdge of outgoing) {
      const {direction} = outgoingEdge
      // TODO: вот здесь надо выпрямить?
      if (direction !== 'NW_SE' && direction !== 'N_S' && direction !== 'NE_SW') continue;
      //добавляем колонку перед предполагаемой позицией
      grid.createCol(position[1] - 1)
      return position
    }

    const incomingEdges = grid.getExistingIncomingEdgesFor(previousElement)

    for (const edge of incomingEdges) {
      const incomingPosition = edge.sourcePosition
      const direction = edge.direction
      if (direction !== 'SW_NE' && direction !== 'SE_NW') continue;
      //добавляем ячейку под element
      grid.createCol(position[1] - 1)
      return position
    }

    return position
  }
}

function moveOutgoingForward(element, grid, stack) {

  // получаем ребра ведущие назад из элемента
  const existingEdges = grid.getExistingOutgoingEdgesFor(element)
  if (!existingEdges) return []

  const processingElements = existingEdges.filter(edge => {
        const {target, source, targetPosition, sourcePosition} = edge
        if (source === target) return false; // self loop
        if (targetPosition[0] === sourcePosition[0]) return false // на одной строке
        if (targetPosition[1] > sourcePosition[1]) return false; // те, что справа
        if (targetPosition[0] > sourcePosition[0]) return false; // те, что ниже
        if (stack.includes(target)) return false;
        return true
      }).map(item => item.target)
      .sort(sortElementsTopLeftBottomRight(grid))

  if (processingElements.length <= 0) return;

  const nextElements = []
  // формируем пачку
  for (const processingElement of processingElements) {
    // получаем его позицию
    const processingElementPosition = grid.find(processingElement)
    if (!processingElementPosition) continue;
    // в его строке удаляем все после него
    for (let colIndex = processingElementPosition[1] + 1; colIndex < grid.colCount; colIndex++) {
      // все удаляемые элементы должны удалиться из стека
      const deletedElement = grid.get(processingElementPosition[0], colIndex)
      if (deletedElement && stack.includes(deletedElement)){
        stack.splice(stack.indexOf(deletedElement), 1)
      }
      grid.removeElement(deletedElement)
    }

    // перемещаем найденный элемент в колонку перед
    const elementPosition = grid.find(element)
    grid.move(processingElement, [processingElementPosition[0], elementPosition[1] + 1])
    // фиксим пересечения?
    // здесь надо с false
    fixNewCrosses(processingElement, grid, stack, false)

    nextElements.push(processingElement)
  }

  return nextElements
}

// TODO: Add tests for boundary edges
function fixNewVerticalCrosses(edge, grid) {
  // заготовка по направлениям
  // S_N - нет, так как не предполагается схемой
  // SW_NE
  // W_E - нет вертикали
  // NW_SE
  // N_S
  // NE_SW
  // E_W - нет вертикали
  // SE_NW

  const {direction} = edge

  if (direction === 'W_E' || direction === 'E_W') return;



  const vCrossed = edge.crossedElements(true)

  if (vCrossed.length <= 0) return;

  if (direction === 'S_N') {
    moveElementsRighterCrossLine(vCrossed, grid)
    return
  }

  if (direction === 'SW_NE') {
    // требуется дополнительное условие?
    // пока сдвигаем вертикаль
    pushVerticalEdgeBy(vCrossed, grid)
    return;
  }

  if (direction === 'NW_SE') {
    pushVerticalEdgeBy(vCrossed, grid)
    return;
  }

  if (direction === 'N_S') {
    moveElementsRighterCrossLine(vCrossed, grid)
    return;
  }

  if (direction === 'NE_SW') {
    pushVerticalEdgeBy(vCrossed, grid)
    return;
  }

  if (direction === 'SE_NW') {
    pushVerticalEdgeBy(vCrossed, grid)
    return;
  }

}

// TODO: Add tests for boundary edges
// возможно добавить потом наличие ребер
function fixNewHorizontalCrosses(edge, grid) {
  // заготовка по направлениям

  const { direction } = edge

  // по этим направлениям не предполагается горизонтальных пересечений
  if (direction === 'S_N' || direction === 'N_S') return;

  const hCrossed = edge.crossedElements(false)

  if (hCrossed.length === 0) return;

  if (direction === 'SW_NE') {
    // пробуем поднимать элементы выше пересечения
    moveElementsUpperCrossLine(hCrossed, grid)
    return;
  }

  if (direction === 'W_E') {
    // опускаем элементы
    moveElementsUnderCrossLine(hCrossed, grid)
    return;
  }

  if (direction === 'NW_SE') {
    moveElementsUpperCrossLine(hCrossed, grid)
    return;
  }

  if (direction === 'NE_SW') {
    moveElementsUpperCrossLine(hCrossed, grid)
    return;
  }

  if (direction === 'E_W') {
    // опускаем элементы
    moveElementsUnderCrossLine(hCrossed, grid)
    return;
  }

  if (direction === 'SE_NW') {
    moveElementsUpperCrossLine(hCrossed, grid)
    return;
  }

}


/**
 *
 * @param {PathSegment} pathSegments
 * @param grid
 * @param {boolean} hasVerticalCross
 * @returns {*[]} Array of Moddle elements
 */
function getCrossedElementsByPath(pathSegments, grid, hasVerticalCross) {
  const crossedElements = []
  for (const segment of pathSegments) {
    const {position: [row, col], vCross, hCross } = segment
    const crossCandidate = grid.get(row, col)
    if (!crossCandidate) continue;
    if ((hasVerticalCross && vCross) || (!hasVerticalCross && hCross)){
      crossedElements.push(crossCandidate)
    }
  }

  return crossedElements
}

/**
 * All crossed on one column
 * @param elements
 * @param grid
 */
function pushVerticalEdgeBy(elements, grid){
  const [, col] = grid.find(elements[0])
  grid.createCol(col - 1)

  for (const element of elements) {
    const [row] = grid.find(element)
    grid.move(element, [row, col])
  }
}

function moveElementsRighterCrossLine(elements, grid){
  const [, col] = grid.find(elements[0])
  grid.createCol(col)

  for (const element of elements) {
    const [row] = grid.find(element)
    grid.move(element, [row, col + 1])
  }
}


function moveElementsUpperCrossLine(elements, grid) {
  // пробуем поднимать элементы выше пересечения
  const [row] = grid.find(elements[0])
  grid.createRow(row - 1)
  for (const element  of elements){
    const [, col] = grid.find(element)
    grid.move(element, [row , col])
  }
}

function moveElementsUnderCrossLine(elements, grid) {
  // пробуем опускать элементы ниже пересечения
  const [row] = grid.find(elements[0])
  grid.createRow(row)
  for (const element  of elements){
    const [, col] = grid.find(element)
    grid.move(element, [row + 1 , col])
  }
}
