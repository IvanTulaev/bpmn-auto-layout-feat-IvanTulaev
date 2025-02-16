import { connectElements } from '../utils/layoutUtil.js';
import { is } from '../di/DiUtil.js';
import {
  findElementInTree,
  getAttachedOutgoingElements, getHostIncoming,
  getIncomingElements,
  getOutgoingElements, isBoundaryEvent, getBoundaryIncomingHosts
} from '../utils/elementUtils.js';
import {
  getPathSegments,
  getPositionVerticalCrossedBy,
  getPositionsHorizontalCrossedBy,
  getCrossGrid,
  getDirection,
} from "../Layouter.js";

export default {
  'addToGrid': ({ element, grid, stack }) => {

    // выворачиваем пока по одному
    const leftOutgoing = getFirstLeftOutgoingElement(element, grid, stack)
    // поменять их местами видимо если выше?
    if (leftOutgoing && leftOutgoing.length > 0) {
      grid.toRectangle()
      // пробуем так
      // return [ ...leftOutgoing.reverse(), element]
      return [ element, ...leftOutgoing.reverse()]
      // Здесь разрыв !!!!
      // return [element]
    }



    // получаем новые которых нет в гриде
    const newOutgoing = getNewOutgoing(element, grid)

    // получаем вершины из стека с удалением их из грида
    // грохнем для теста так как их уже вытянули вперед
    const outgoingFromStack = getOutgoingFromStack(element, grid, stack)

    // Handle outgoing paths without boundaryEvents
    // Maybe later it will merge
    const outgoing = [...outgoingFromStack, ...newOutgoing];
    // const outgoing = [...newOutgoing];


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

      // как костыль пока оквадрачиваем перед каждой вставкой
      grid.toRectangle()
      nextElements.unshift(nextElement);
    });

    // Sort elements by priority to ensure proper stack placement
    // if (outgoingInStack.length === 0) {
    //   // nextElements = sortByType(nextElements, 'bpmn:ExclusiveGateway'); // TODO: sort by priority
    // }
    grid.toRectangle()
    // shakeItHorizontal(grid)
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


// helpers /////

export function sortByType(arr, type) {
  const nonMatching = arr.filter(item => !is(item, type));
  const matching = arr.filter(item => is(item, type));

  return [ ...matching, ...nonMatching ];
  // return [ ...nonMatching, ...matching ];
}

function checkForLoop(element, visited, reverse) {

  const elementIncomingList = !reverse ? new Set(getIncomingElements(element)) : new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element)));

  for (const incomingElement of elementIncomingList) {
    if (!visited.has(incomingElement)) {
      return findElementInTree(element, incomingElement, reverse);
    }
  }
}

function isFutureIncoming(element, visited, reverse) {
  const elementIncomingList = !reverse ? new Set(getIncomingElements(element)) : new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element)));

  if (elementIncomingList.size > 1) {
    for (const incomingElement of elementIncomingList) {
      if (!visited.has(incomingElement)) {
        return true;
      }
    }
  }
  return false;
}

function isNextElementTasks(elements) {
  return [...elements].every(element => is(element, 'bpmn:Task'));
}

function isFromHost (hostElement, targetElement, reverse) {
  const incoming = !reverse ? targetElement.incoming : targetElement.outgoing;
  const fromHost = incoming.map(element => !reverse ? element.sourceRef : element.targetRef).filter(item => !item.attachedToRef)
  return fromHost.includes(hostElement)
}

// только для тех что впереди
function fixNewCrosses(element, grid, stack, forwardOnlyOutgoing) {
  // ревенрс логики переноса вперед для исходящих

  const elementPosition = grid.find(element)
  // исправляем пересечения образованые исходящими и входящими ребрами новой вершины
  // получаем исходящие
  const nextElementOutgoingElements = !grid.isFlipped ? new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element))) : new Set(getIncomingElements(element)) ;
  const targetElementsInGrid = [...nextElementOutgoingElements]
      .filter(item => {

        const itemPosition = grid.find(item)
        if (!elementPosition || !itemPosition) return false;


        if (item === element) return false;
        if (!grid.hasElement(item)) return false;
        if (stack.includes(item)) return false;

        //реверс логики
        if (forwardOnlyOutgoing) {

          if ((itemPosition[0] < elementPosition[0]) && (itemPosition[1] <= elementPosition[1])) return false;
        }


        // if (!grid.hasElement(item)) return false;
        const [itemRow, itemCol] = itemPosition;
        const [baseRow, baseCol] = elementPosition;
        // return forwardOnlyOutgoing ? (itemRow === baseRow || itemCol > baseCol) : true
        return true
      })
      .sort((a, b) => {
        const [aRow, aCol] = grid.find(a);
        const [bRow, bCol] = grid.find(b);
        return aRow - bRow || aCol - bCol;
      });

  for (const targetElement of targetElementsInGrid) {
    // исправляем вертикали
    fixNewVerticalCrosses(element, targetElement, grid)

    // исправляем пересечения по горизонтали в зависимости от направлений?
    const crossPositions = getPositionsHorizontalCrossedBy(element, targetElement, grid)
    if (crossPositions.length > 0) {
      const crossRow = crossPositions[0][0]
      const crossCols = crossPositions.map(item => item[1])
      // экспериментируем
      // по хорошему надо понять являются ли пересекаемые вершины target для ребра element-target
      // если да то опустить их вниз
      // если нет, то поднять их наверх
      // возможно такую же логику надо провернуть с входящими
      // а еще лучше для последующих изменений прикрутить обработку направлений
      const crossEls = crossCols.map(crossCol => grid.get(crossRow, crossCol)).filter(item => !!item)
      const targets = crossEls.filter(item => targetElementsInGrid.includes(item))
      const notTargets = crossEls.filter(item => !targetElementsInGrid.includes(item))
      // исправляем попутку: targets опускаем вниз
      if (targets.length > 0) {
        grid.createRow(crossRow)
        for (const target of targets) {
          const [, tarCol] = grid.find(target);
          grid.move(target, [crossRow + 1, tarCol])
        }
      }

      // исправляем остальные
      if (notTargets.length > 0) {
        grid.createRow(crossRow -1 )
        for (const notTarget of notTargets) {
          const [, tarCol] = grid.find(notTarget);
          grid.move(notTarget, [crossRow, tarCol])
        }
      }
    }
  }



  const nextElementIncomingElements = !grid.isFlipped ? new Set(getIncomingElements(element)) :  new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element)));
  const sourceElementsInGrid = [...nextElementIncomingElements]
      .filter(item => grid.hasElement(item))
      .sort((a, b) => {
        const [aRow, aCol] = grid.find(a);
        const [bRow, bCol] = grid.find(b);
        return aRow - bRow || aCol - bCol;
      });

  for (const sourceElement of sourceElementsInGrid) {
    // получаем пересекаемые позиции по вертикали
    let crossPositions = getPositionVerticalCrossedBy(sourceElement, element, grid)
    if (crossPositions.length > 0) {
      const crossCol = crossPositions[0][1]
      let crossRows = crossPositions.map(item => item[0])
      grid.createCol(crossCol -1)
      for (const crossRow of crossRows){
        const el = grid.get(crossRow, crossCol + 1)
        if (el) {
          grid.removeElementAt([crossRow, crossCol + 1])
          grid.add(el, [crossRow, crossCol])
        }
      }
    }

    // исправляем пересечения по горизонтали
    // сначала в той же строке
    let elNewPosition = grid.find(element)
    let sourcePosX =  grid.find(sourceElement)

    if (elNewPosition[0] === sourcePosX[0]) {
      crossPositions = getPositionsHorizontalCrossedBy(sourceElement, element, grid).filter(crossPos => crossPos[0] === elNewPosition[0] )
      if (crossPositions.length > 0) {
        // различие в том куда двигаем !!!
        grid.createRow(elNewPosition[0])
        for (const crossPos of crossPositions) {
          const el = grid.get(crossPos[0], crossPos[1])
          if (el) {
            grid.removeElementAt([crossPos[0], crossPos[1]])
            grid.add(el, [crossPos[0] + 1, crossPos[1]] )
          }
        }
      }
    }

    // потом диагонали все остатки
    crossPositions = getPositionsHorizontalCrossedBy(sourceElement, element, grid)
    if (crossPositions.length > 0) {
      const crossRow = crossPositions[0][0]
      const crossCols = crossPositions.map(item => item[1])
      grid.createRow(crossRow - 1)
      for (const crossCol of crossCols) {
        const el = grid.get(crossRow + 1, crossCol)
        if (el) {
          grid.removeElementAt([crossRow + 1, crossCol])
          grid.add(el, [crossRow, crossCol])
        }

      }
    }
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
  const outgoing = !grid.isFlipped ? new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element))) : new Set(getIncomingElements(element))
  // исключаем ребра в себя
  // исключаем те что НЕ в стеке
  // их положение должно быть слева или в той же колонке.
  // правые не берем, так как их расположение норм
  // сортируем их слева направо и сверху вниз
  // исключаем если общий родитель

  let incFromHost = getIncomingFromHost (element, grid.isFlipped)
  // const incFromBound = getIncomingFromBoundaryHost(element, grid.isFlipped)
  // for (const i of incFromBound) {
  //   incFromHost.add(i)
  // }




  const processingElements = [...outgoing].filter(item => {
    if (item === element) return false;
    if (!stack.includes(item)) return false;

    const itemPosition = grid.find(item);
    const elementPosition = grid.find(element);
    if (!itemPosition || !elementPosition) return false;

    // костыль для общих родителей
    // let incFromHostProc = getIncomingFromHost (item, grid.isFlipped)
    let incFromBoundProc = getIncomingFromBoundaryHost(item, grid.isFlipped)
    // for (const i of incFromBoundProc) {
    //   incFromHostProc.add(i)
    // }
    incFromBoundProc = [...incFromBoundProc].filter(incFromHostProcItem => incFromHost.has(incFromHostProcItem))
    if (incFromBoundProc.length > 0) return false;


    // пробуем исключая те что в строке
    return ((itemPosition[1] <= elementPosition[1]) && (itemPosition[0] !== elementPosition[0]) )
    // return (itemPosition[1] <= elementPosition[1])
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

function getNewOutgoing(element, grid) {
  // элементы
  let fromHost = getOutgoingFromHost (element, grid.isFlipped)
  fromHost = [...fromHost].filter(item => !grid.hasElement(item))
  fromHost = sortByType(fromHost, 'bpmn:ExclusiveGateway')

  let fromBoundary = getOutgoingFromBoundary (element, grid.isFlipped)
  fromBoundary = [...fromBoundary].filter(item => !grid.hasElement(item) && !fromHost.includes(item))
  fromBoundary = sortByType(fromBoundary, 'bpmn:ExclusiveGateway')

  // const outgoing = !grid.isFlipped ? new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element))) : new Set(getIncomingElements(element))
  // const processingElements = [...outgoing].filter(item => {
  //   if (item === element) return false;
  //   if (grid.hasElement(item)) return false;
  //   return true
  // })
  // добавить сортировку по кол-ву исходящих?
  return [...fromHost, ...fromBoundary]
  // return sortByType(processingElements, 'bpmn:Task')
}

export function sortElementsTopLeftBottomRight (grid) {
  return function (a, b){
    const aPos = grid.find(a);
    const bPos = grid.find(b);

    if (aPos && !bPos) return -1;
    if (!aPos && bPos) return 1;
    if (!aPos && !bPos) return 0;

    return aPos[0] - bPos[0] || aPos[1] - bPos[1];
  }
}

export function sortElementsTopLeftBottomRightColumn (grid) {
  return function (a, b){
    const aPos = grid.find(a);
    const bPos = grid.find(b);

    if (aPos && !bPos) return -1;
    if (!aPos && bPos) return 1;
    if (!aPos && !bPos) return 0;

    return  aPos[1] - bPos[1] || aPos[0] - bPos[0];
  }
}

export function sortColsLeftRightRowsBottomTop (grid) {
  return function (a, b){
    const aPos = grid.find(a);
    const bPos = grid.find(b);

    if (aPos && !bPos) return -1;
    if (!aPos && bPos) return 1;
    if (!aPos && !bPos) return 0;

    return  aPos[1] - bPos[1] || bPos[0] - aPos[0];
  }
}

function getInsertPosition (element, previousElement, grid, isBoundarySource) {

  const sourcePosition = grid.find(element)
  if (!sourcePosition) return;
  //по умолчанию располагаем в правом нижнем углу :)
  const position = [sourcePosition[0],sourcePosition[1] + 1]

  // первый элемент из обычного
  // целимся в следующую колонку на той же строке
  // Если там вершина или вертикальное пересечение то добавляем колонку
  // После добавления колонки проверяем горизонтальные пересечения
  let crossGrid = getCrossGrid(grid)

  if (!previousElement && !isBoundarySource){
    const [nextRow, nextCol] = position
    let crossPosition = crossGrid[nextRow][nextCol]

    // здесь косяк
    // if (!crossPosition || crossPosition.occupied || crossPosition.vCross) {
    if (crossPosition?.occupied || crossPosition?.vCross) {
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
    const outgoing = !grid.isFlipped ? new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element))) : new Set(getIncomingElements(element))

    for (const outgoingElement of outgoing) {
      if (!grid.hasElement(outgoingElement)) continue;
      const outgoingPosition = grid.find(outgoingElement)
      const direction = getDirection(sourcePosition, outgoingPosition)
      if (direction !== 'SW_NE' && direction !== 'W_E') continue;
      //добавляем ячейку под element
      grid.createRow(sourcePosition[0])
      position[0] = position[0] + 1
      return position
    }

    const incoming = !grid.isFlipped ? new Set(getIncomingElements(element)) : new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element)));

    for (const incomingElement of incoming) {
      if (!grid.hasElement(incomingElement)) continue;
      const incomingPosition = grid.find(incomingElement)
      const direction = getDirection(incomingPosition, sourcePosition)
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

    //костыляем для проверки
    if(crossGrid.length - 1 < position[0]){
      crossGrid.push(Array(crossGrid[0].length))
    }

    let crossPosition = crossGrid[position[0]][position[1]]

    // здесь косяк?
    // if (!crossPosition || crossPosition.occupied || crossPosition.vCross) {
    if (crossPosition?.occupied || crossPosition?.vCross) {
      grid.createCol(position[1] - 1)
    }

    // исправляем горизонтальные пересечения
    crossGrid = getCrossGrid(grid)
    //костыляем для проверки
    if(crossGrid.length - 1 < position[0]){
      crossGrid.push(Array(crossGrid[0].length))
    }
    crossPosition = crossGrid[position[0]][position[1]]
    if (crossPosition?.occupied || crossPosition?.hCross) {
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
  crossGrid = getCrossGrid(grid)
  if (previousElement) {
    const previousPosition = grid.find(previousElement)
    if (!previousPosition) return;
    position[0] = previousPosition[0] + 1
    position[1] = previousPosition[1]

    if (crossGrid.length - 1 <  position[0]){
      crossGrid.push(Array(crossGrid[crossGrid.length - 1]))
    }

    const crossPosition = crossGrid[position[0]][position[1]]
    if (crossPosition?.occupied || crossPosition?.hCross) {
      grid.createRow(previousPosition[0])
    }

    // проверяем вертикали
    const outgoing = !grid.isFlipped ? new Set(getOutgoingElements(previousElement).concat(getAttachedOutgoingElements(previousElement))) : new Set(getIncomingElements(previousElement))

    for (const outgoingElement of outgoing) {
      if (!grid.hasElement(outgoingElement)) continue;
      const outgoingPosition = grid.find(outgoingElement)
      const direction = getDirection(previousPosition, outgoingPosition)
      if (direction !== 'NW_SE' && direction !== 'N_S' && direction !== 'NE_SW') continue;
      //добавляем колонку перед предполагаемой позицией
      grid.createCol(position[1] - 1)
      return position
    }

    const incoming = !grid.isFlipped ? new Set(getIncomingElements(previousElement)) : new Set(getOutgoingElements(previousElement).concat(getAttachedOutgoingElements(previousElement)));

    for (const incomingElement of incoming) {
      if (!grid.hasElement(incomingElement)) continue;
      const incomingPosition = grid.find(incomingElement)
      const direction = getDirection(incomingPosition, previousPosition)
      if (direction !== 'SW_NE' && direction !== 'SE_NW') continue;
      //добавляем ячейку под element
      grid.createCol(position[1] - 1)
      return position
    }

    return position

  }

}

function getFirstLeftOutgoingElement(element, grid, stack) {
  const outgoing = !grid.isFlipped ? new Set(getOutgoingElements(element).concat(getAttachedOutgoingElements(element))) : new Set(getIncomingElements(element))
  const processingElements = [...outgoing].filter(item => {
    if (item === element) return false;
    if (!grid.hasElement(item)) return false;
    const elementPosition = grid.find(element)
    const itemPosition = grid.find(item)
    if (!elementPosition || !itemPosition || itemPosition[0] === elementPosition[0]) return false;
    if (itemPosition[1] > elementPosition[1]) return false;
    // пробуем двигать только те что сверху
    if (itemPosition[0] > elementPosition[0]) return false;
    if (stack.includes(item)) return false;
    return true
  }).sort(sortElementsTopLeftBottomRight(grid))

  //в эксперименте работаем только с первым элементом, так как непонятно как поведут все остальные элементы в очереди
  if (processingElements.length <= 0) return;


  const nextElements = []
  // формируем пачку
  for (const processingElement of processingElements) {
    // получаем его позицию
    const processingElementPosition = grid.find(processingElement)
    if (!processingElementPosition) continue;
    // в его строке удаляем все после него
    // пока напрямую в грид, так как он не прямоугольный
    for (let colIndex = processingElementPosition[1] + 1; colIndex < grid._grid[processingElementPosition[0]].length; colIndex++) {
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
    //фиксим пересечения?
    // здесь надо с false
    fixNewCrosses(processingElement, grid, stack, false)

    nextElements.push(processingElement)

  }

  return nextElements

}

function fixNewVerticalCrosses(source, target, grid) {
  // заготовка по направлениям
  // S_N - нет, так как не предполагается схемой
  // SW_NE
  // W_E - нет вертикали
  // NW_SE
  // N_S
  // NE_SW
  // E_W - нет вертикали
  // SE_NW
  const sourcePosition = grid.find(source)
  const targetPosition = grid.find(target)

  const direction = getDirection(sourcePosition, targetPosition)

  if (direction === 'S_N' || direction === 'W_E' || direction === 'E_W') return;
  const path = getPathSegments(source, target, grid)
  const vCrossed = getCrossedElementsByPath(path, grid, true)

  if (vCrossed.length <= 0) return;

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
    pushVerticalEdgeBy(vCrossed, grid)
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

export function getVerticalChain(element, grid, oldChain) {
  const chain = !oldChain ? new Set() : oldChain
  if (!element) return chain;

  const elementPosition = grid.find(element)
  if (!elementPosition) return chain;

  chain.add(element)

  // схема подразумевает только связи с направлением N_S или S_N если path.length > 0

  // что то здесь!!!!!
  const edges = getExistElementEdges(element, grid)
      .filter(edge => {
        const {direction, path, sourceIsBoundary, sourcePosition, targetPosition} = edge
        // для всех случаем N_S
        if (direction === 'N_S') return true;
        // S_N только если не идем в обход
        // if (direction === 'S_N' && sourcePosition[0] === targetPosition[0] + 1  ) return true;
        if (direction === 'S_N' && sourcePosition[0] === targetPosition[0] + 1  ) return true;
        if (direction === 'S_N') {
          // проверяем наличие элементов в диапазоне
          const inRange = []
          for (let rowIndex = sourcePosition[0] - 1; rowIndex > targetPosition; rowIndex--) {
            const candidate = grid.get(rowIndex, sourcePosition[1])
            if (candidate) inRange.push(candidate)
          }
          return inRange.length === 0
        }
        // if (direction === 'NW_SE' && sourceIsBoundary && sourcePosition[0] === targetPosition[0] - 1 && sourcePosition[1] === targetPosition[1] - 1) return true;
        return false;
      })

  for (const edge of edges){
    const nextElement = edge.source === element ? edge.target : edge.source
    if (!chain.has(nextElement)) {
      const nextChain = getVerticalChain(nextElement, grid, chain)
      for (const nextChainEl of nextChain) {
        chain.add(nextChainEl)
      }
    }
  }
  return chain
}

export function getHorizontalChain(element, grid, oldChain) {
  const chain = !oldChain ? new Set() : oldChain
  if (!element) return chain;

  const elementPosition = grid.find(element)
  if (!elementPosition) return chain;

  chain.add(element)

  // схема подразумевает только связи с направлением N_S или S_N если path.length > 0
  const edges = getExistElementEdges(element, grid)
      .filter(edge => {
        const {direction, path, sourceIsBoundary, sourcePosition, targetPosition} = edge
        // Для случаев W_E только если path.length > 0
        // if (direction === 'W_E' && path.length > 0) return true;
        if (direction === 'W_E') return true;
        // E_W только если не идем в обход
        // Todo: походу косяк в схеме вопрос как двигаться назад по горизонтали если никого нет по середине
        // пока так
        if (direction === 'E_W' && path.length > 0) return true;
        // добавляем boundary ребра в диагонали
        // if (direction === 'NW_SE' && sourceIsBoundary && sourcePosition[0] === targetPosition[0] - 1 && sourcePosition[1] === targetPosition[1] - 1) return true;

        return false;
      })

  for (const edge of edges){
    const nextElement = edge.source === element ? edge.target : edge.source
    if (!chain.has(nextElement)) {
      const nextChain = getHorizontalChain(nextElement, grid, chain)
      for (const nextChainEl of nextChain) {
        chain.add(nextChainEl)
      }
    }
  }
  return chain
}


// Возвращает исходящие только из элемента
export function getOutgoingFromHost (element, isFlipped) {
  return !isFlipped ? new Set(getOutgoingElements(element)) : new Set(getHostIncoming (element))
}

// Возвращает исходящие только из boundary элемента
export function getOutgoingFromBoundary (element, isFlipped) {
  return !isFlipped ? new Set (getAttachedOutgoingElements(element)) : new Set()
}

// Возвращает входящие только в элемент
export function getIncomingFromHost (element, isFlipped) {
  return !isFlipped ? new Set(getHostIncoming (element)) : new Set(getOutgoingElements(element))
}

// Возвращает входящие только в boundary
export function getIncomingFromBoundaryHost(element, isFlipped) {
  return !isFlipped ? new Set (getBoundaryIncomingHosts (element)) : new Set ()
}

/**
 * Возвращает ребро
 * source: Element
 * sourcePosition: [number, number]
 * sourceIsBoundary: boolean
 * target: Element
 * targetPosition: [number, number]
 * targetIsBoundary: boolean
 * direction: Direction
 * path: PathSegment[]

 *
 * @param element
 * @param isFlipped
 */
export function getExistElementEdges(element, grid) {
  const edges = []

  const elementPosition = grid.find(element)
  if (!elementPosition) return edges

  //получаем исходящие из хоста
  // Todo: сделать сортировку?
  const outgoingFromHost = [...getOutgoingFromHost (element, grid.isFlipped)]
      .filter(item => grid.hasElement(item))
  for (const outgoing of outgoingFromHost) {
    const sourcePosition = grid.find(element)
    const targetPosition = grid.find(outgoing)
    const edge = {source: element,sourcePosition, target: outgoing, targetPosition}
    const outgoingPosition = grid.find(outgoing)
    if (!outgoingPosition) continue;
    const direction = getDirection(elementPosition, outgoingPosition)
    edge.direction = direction

    // Todo: объект пути это направление, путь и возможно тип
    const path = getPathSegments(element, outgoing, grid)
    edge.path = path
    edges.push(edge)
  }

  // получаем исходящие из boundary
  const outgoingFromBoundary = [...getOutgoingFromBoundary (element, grid.isFlipped)]
      .filter(item => grid.hasElement(item))
  for (const outgoing of outgoingFromBoundary) {
    const sourcePosition = grid.find(element)
    const targetPosition = grid.find(outgoing)
    const edge = {source: element, sourcePosition, target: outgoing, targetPosition, sourceIsBoundary: true}
    const outgoingPosition = grid.find(outgoing)
    if (!outgoingPosition) continue;
    const direction = getDirection(elementPosition, outgoingPosition)
    edge.direction = direction

    // Todo: объект пути это направление, путь и возможно тип
    const path = getPathSegments(element, outgoing, grid, true)
    edge.path = path
    edges.push(edge)
  }

  // входящие из host
  const incomingFromHost = [...getIncomingFromHost (element, grid.isFlipped)]
      .filter(item => grid.hasElement(item))
  for (const incoming of incomingFromHost) {
    const sourcePosition = grid.find(incoming)
    const targetPosition = grid.find(element)
    const edge = {source: incoming, sourcePosition, target: element, targetPosition}
    const incomingPosition = grid.find(incoming)
    if (!incomingPosition) continue;
    const direction = getDirection(incomingPosition, elementPosition)
    edge.direction = direction

    // Todo: объект пути это направление, путь и возможно тип
    const path = getPathSegments(incoming, element, grid)
    edge.path = path
    edges.push(edge)
  }

  // входящие из boundary
  const incomingFromBoundaryHost = [...getIncomingFromBoundaryHost(element, grid.isFlipped)]
      .filter(item => grid.hasElement(item))
  for (const incoming of incomingFromBoundaryHost) {
    const sourcePosition = grid.find(incoming)
    const targetPosition = grid.find(element)
    const edge = {source: incoming, sourcePosition, target: element, targetPosition, sourceIsBoundary: true}
    // const edge = {source: incoming, target: element, sourceIsBoundary: true}
    const incomingPosition = grid.find(incoming)
    if (!incomingPosition) continue;
    const direction = getDirection(incomingPosition, elementPosition)
    edge.direction = direction

    // Todo: объект пути это направление, путь и возможно тип
    const path = getPathSegments(incoming, element, grid, true)
    edge.path = path
    edges.push(edge)
  }
  return edges
}
