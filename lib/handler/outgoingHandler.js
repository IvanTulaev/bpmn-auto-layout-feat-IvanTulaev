import {
  connectElements,
  sortElementsTopLeftBottomRight,
  sortByType,
} from '../utils/layoutUtils.js';

export default {
  'addToGrid': ({ element, grid, stack }) => {

    // Todo: это условие-костыль убрать его позже (см. добавление в stack)
    if (!element.notMoveForvard) {

      // выворачиваем
      // Верхние левые сдвигаем вперед и проверяем пересечения начиная с левого.
      // В идеале сдвигать только если у сдвигаемого элемента и сорса есть общий предок на его линии, чтобы не получился разрыв!
      // Вопрос по поводу переходов на другие линии выше для сорса...
      moveTopLeftOutgoingForward(element, grid, stack);
    }
    element.notMoveForvard = false;

    // получаем новые которых нет в гриде
    const newOutgoing = getNewOutgoing(element, grid);

    // получаем вершины из стека с удалением их из грида
    // грохнем для теста так как их уже вытянули вперед
    const outgoingFromStack = getOutgoingFromStack(element, grid, stack, newOutgoing && newOutgoing.length > 0);

    // Handle outgoing paths without boundaryEvents
    // Maybe later it will merge (Добавить сортировку по типу исходящих?)
    let outgoing = [ ...outgoingFromStack, ...newOutgoing ]

      .sort((a,b) => {
        const aFromHost = isFromHost(element, a, grid.isFlipped);
        const bFromHost = isFromHost(element, b, grid.isFlipped);
        if (aFromHost && bFromHost) return 0;
        if (aFromHost && !bFromHost) return -1;
      });

    let nextElements = [];
    let previousElement = null;

    outgoing.forEach(nextElement => {

      // подготавливаем место пока без учета boundary
      // пока без учета boundary
      const fromHost = isFromHost(element, nextElement, grid.isFlipped);
      const nextPosition = getInsertPosition (element, previousElement, grid, !fromHost);

      // вставляем элемент
      grid.add(nextElement, nextPosition);

      fixNewCrosses(nextElement, grid, stack, nextElements, true);

      // обновляем previous
      previousElement = nextElement;

      nextElements.unshift(nextElement);
    });

    // TODO: sort by priority
    return nextElements;
  },

  'createConnectionDi': ({ element, row, col, layoutGrid, diFactory, shift }) => {
    const outgoing = element.outgoing || [];

    return outgoing.map(out => {
      const target = out.targetRef;
      const waypoints = connectElements(element, target, layoutGrid, false, shift);

      return diFactory.createDiEdge(out, waypoints, {
        id: out.id + '_di'
      });
    });
  }
};

function isFromHost(hostElement, targetElement, reverse) {
  const incoming = !reverse ? targetElement.incoming : targetElement.outgoing;
  const fromHost = incoming.map(element => !reverse ? element.sourceRef : element.targetRef).filter(item => !item.attachedToRef);
  return fromHost.includes(hostElement);
}

// только для тех что впереди
/**
 * @param element
 * @param grid
 * @param {[Element]=} stack
 * @param {[Element]=} nextElements
 * @param {boolean} skipTopLeftOutgoing
 * @param {boolean} forwardOnlyOutgoing
 */
function fixNewCrosses(element, grid, stack, nextElements, skipTopLeftOutgoing, forwardOnlyOutgoing) {

  // реверс логики переноса вперед для исходящих
  // исправляем пересечения образованные исходящими и входящими ребрами новой вершины
  // получаем исходящие
  const outgoingEdges = [ ...grid.getExistingOutgoingEdgesFor(element) ]
    .sort((a, b) => {
      const [ aRow, aCol ] = a.targetPosition;
      const [ bRow, bCol ] = b.targetPosition;
      return aRow - bRow || aCol - bCol;
    });
  const incomingEdges = [ ...grid.getExistingIncomingEdgesFor(element) ]
    .sort((a, b) => {
      const [ aRow, aCol ] = a.sourcePosition;
      const [ bRow, bCol ] = b.sourcePosition;
      return aRow - bRow || aCol - bCol;
    });

  const edges = [ ...outgoingEdges, ...incomingEdges ]
    .filter(edge => {
      const { target, source, direction } = edge;

      // не обрабатываем следующие случаи
      // если self loop
      if (target === source) return false;

      // если в обработке текущей очереди исходящих
      if (nextElements && nextElements.includes(target)) return false;

      // если таргет в стеке и у него нет существующих исходящих если передали стек
      if (stack) {

        if (inStackWithoutOutgoing(target, grid, stack)) return false;
      }
      if (skipTopLeftOutgoing) {

        // TODO: Пока непонятно надо ли как то обрабатывать стек?
        if (source === element && (direction === 'SE_NW' || direction === 'S_N')) return false;
      }

      return true;
    });

  for (const edge of edges) {

    // исправляем вертикали
    fixNewVerticalCrosses(edge, grid);

    // не исправляем гризонтали если E_W из boundary
    if (edge.direction === 'E_W' && edge._originalSourceIsBoundary) continue;
    fixNewHorizontalCrosses(edge, grid);
  }
}

/**
 *  - Выдергивает исходящие элементы из стека обработки
 *  - Так же удаляет их из графа
 *  - Для дальнейшей обработки воспринимаем их как абсолютно новые вершины
 * @param element - элемент для которого ищем исходящие
 * @param grid
 * @param {Array<Element>}stack
 * @returns {any[]} - массив элементов
 */
function getOutgoingFromStack(element, grid, stack, hasNewOutgoings) {

  // получаем все исходящие базового элемента
  const outgoing = grid.getExistingOutgoingEdgesFor(element);
  const incoming = grid.getExistingIncomingEdgesFor(element).map(edge => edge.source);

  const [ , elementCol ] = grid.find(element);
  const processingElements = [ ...outgoing ].filter(edge => {

    // оставляем только те, что идут в стек и не имеют исходящих
    const { target, targetPosition: [ , targetCol ] } = edge;
    if (!inStackWithoutOutgoing(target, grid, stack)) return false;

    // исключаем если общий родитель,  так как уже расставили их правильно
    // пробуем нет входящих кроме element
    // если есть общий родитель и есть новые исходящие то выкидываем
    const targetIncoming = grid.getExistingIncomingEdgesFor(target)
      .map(targetEdge => targetEdge.source);
    const commonParent = targetIncoming.find(targetParent => incoming.includes(targetParent));
    if (commonParent && hasNewOutgoings) return false;

    // пробуем оставлять только те, что слева
    return targetCol <= elementCol;
  }).map(item => item.target).sort(sortElementsTopLeftBottomRight (grid));

  // обрабатываем элементы
  // Удаляем их из стека и из грида
  for (const processingElement of processingElements) {
    stack.splice(stack.indexOf(processingElement), 1);
    grid.removeElement(processingElement);
  }

  // после удаления из грида удаляем лишние колонки
  grid.shrinkRows();
  grid.shrinkCols();

  // обрабатываем их как новые исходящие
  return processingElements;
}

// TODO: Не стек, а крайние
function getNewOutgoing(element, grid) {

  // элементы
  let fromHost = grid.getOutgoingFromHost (element);
  fromHost = [ ...fromHost ].filter(item => !grid.hasElement(item));
  fromHost = sortByType(fromHost, 'bpmn:ExclusiveGateway');

  let fromBoundary = grid.getOutgoingFromBoundary (element);
  fromBoundary = [ ...fromBoundary ].filter(item => !grid.hasElement(item) && !fromHost.includes(item));
  fromBoundary = sortByType(fromBoundary, 'bpmn:ExclusiveGateway');

  // добавить сортировку по кол-ву исходящих?
  return [ ...fromHost, ...fromBoundary ];
}

function getInsertPosition(element, previousElement, grid, isBoundarySource) {

  const sourcePosition = grid.find(element);
  if (!sourcePosition) return;

  // по умолчанию располагаем справа от element
  const position = [ sourcePosition[0],sourcePosition[1] + 1 ];

  // первый элемент из обычного
  // целимся в следующую колонку на той же строке
  // Если там вершина или вертикальное пересечение то добавляем колонку
  // После добавления колонки проверяем горизонтальные пересечения
  if (!previousElement && !isBoundarySource) {

    // здесь добавить условие, что если в занятой позиции лежит target ребра element-target,
    // то добавляем строку
    // по-хорошему, надо найти самый нижний target для element, и под него добавить строку

    // Логика в основном для вставки элементов после флиппа
    // получаем все ребра из элемента
    // и выбираем те, у которых есть таргет в колонке позиции
    const edgesWithTargetInCol = grid.getExistingOutgoingEdgesFor(element)
      .filter(edge => {
        const targetPosition = edge.targetPosition;
        const targetCol = targetPosition ? targetPosition[1] : undefined;
        return targetCol === position[1];
      }).sort((first, second) => {

        // сортируем по возрастанию строки
        const [ firstRow ] = first.targetPosition;
        const [ secondRow ] = second.targetPosition;

        return firstRow - secondRow;
      });

    if (edgesWithTargetInCol.length > 0) {

      // находим самую нижнюю позицию после подряд идущих исходящих
      // бежим по ребрам пока не найдем дырку
      for (const edge of edgesWithTargetInCol) {
        const [ targetRow ] = edge.targetPosition;

        // TODO: Ad optimisation
        if (targetRow === position[0]) position[0] = position[0] + 1;
      }
    }

    // дальше по старому алгоритму
    if (grid.hasElementAt(position) || grid.isCrossed(position, true)) {
      grid.createCol(position[1] - 1);
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

      // если через позицию идет ребро
      if (edge.path.some(segment => segment.position[0] === position[0] && segment.position[1] === position[1])) {

        // добавляем ячейку под element
        grid.createRow(sourcePosition[0]);
        position[0] = position[0] + 1;
        return position;
      }
    }

    const incomingEdges = grid.getExistingIncomingEdgesFor(element);

    for (const edge of incomingEdges) {
      const direction = edge.direction;
      if (direction !== 'NE_SW') continue;

      // добавляем ячейку под element
      grid.createRow(sourcePosition[0]);
      position[0] = position[0] + 1;
      return position;
    }

    return position;
  }

  // первый элемент из boundary
  if (!previousElement && isBoundarySource) {

    // вставка первого элемента по диагонали
    position[0] = position[0] + 1;

    let isOccupied = grid.get(position[0], position[1]);
    let isVCrossed = grid.isCrossed([ position[0], position[1] ], true);

    if (isOccupied || isVCrossed) {
      grid.createCol(position[1] - 1);
    }

    isOccupied = grid.get(position[0], position[1]);
    let isHCrossed = grid.isCrossed([ position[0], position[1] ]);

    if (isOccupied || isHCrossed) {
      grid.createCol(position[1] - 1);
    }

    return position;
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
    const previousPosition = grid.find(previousElement);
    if (!previousPosition) return;
    position[0] = previousPosition[0] + 1;
    position[1] = previousPosition[1];

    const isOccupiedElement = grid.get(position[0], position[1]);
    const isCrossedHorizontal = grid.isCrossed([ position[0], position[1] ]);

    if (isOccupiedElement || isCrossedHorizontal) {
      grid.createRow(previousPosition[0]);
    }

    // проверяем вертикали
    const outgoing = grid.getExistingOutgoingEdgesFor(previousElement);

    for (const outgoingEdge of outgoing) {
      const { direction } = outgoingEdge;

      // TODO: вот здесь надо выпрямить?
      if (direction !== 'NW_SE' && direction !== 'N_S' && direction !== 'NE_SW') continue;

      // добавляем колонку перед предполагаемой позицией
      grid.createCol(position[1] - 1);
      return position;
    }

    const incomingEdges = grid.getExistingIncomingEdgesFor(previousElement);

    for (const edge of incomingEdges) {
      const direction = edge.direction;
      if (direction !== 'SW_NE' && direction !== 'SE_NW') continue;

      // добавляем ячейку под element
      grid.createCol(position[1] - 1);
      return position;
    }

    return position;
  }
}

function moveTopLeftOutgoingForward(element, grid, stack) {

  // получаем ребра ведущие назад из элемента
  const existingEdges = grid.getExistingOutgoingEdgesFor(element);
  if (!existingEdges || existingEdges.length === 0) return;

  const processingElements = existingEdges.filter(edge => {
    const { target, source, targetPosition, sourcePosition } = edge;
    if (source === target) return false; // self loop
    if (targetPosition[0] >= sourcePosition[0]) return false; // ниже или на той же строке, что элемент
    if (targetPosition[1] > sourcePosition[1]) return false; // правее чем элемент
    if (inStackWithoutOutgoing(target, grid, stack)) return false;// не двигаем крайние на ветках
    if (isTracingForTopLeftMove(target, source, grid, edge , true)) return false;// не двигаем если таргет трейсится по обратному пути
    return true;
  }).map(item => item.target)
    .sort(sortElementsTopLeftBottomRight(grid));

  if (processingElements.length === 0) return;

  while (processingElements.length > 0) {

    // TODO: подумать над удалением из стека... скорее всего не надо

    const nextElement = processingElements.shift();
    const [ nextElementRow, nextElementCol ] = grid.find(nextElement);

    const elementsToDelete = processingElements.filter(item => {
      const [ itemRow ] = grid.find(item);
      return itemRow === nextElementRow;
    });

    for (const elementToDelete of elementsToDelete) {
      const deleteIndex = elementsToDelete.indexOf(elementToDelete);
      if (deleteIndex < 0) continue;
      processingElements.splice(deleteIndex, 1);
    }

    // сдвигаем строку, а точнее ее и все что выше, чтобы сохранить диагональный рост графа?
    const [ elementRow, elementCol ] = grid.find(element);

    const shiftCount = elementCol - nextElementCol + 1;
    for (let rowIndex = grid.rowCount - 1; rowIndex >= 0; rowIndex--) {
      if (rowIndex === elementRow) {
        grid.expandRow(rowIndex, elementCol, shiftCount);
        continue;
      }
      grid.expandRow(rowIndex, nextElementCol - 1, shiftCount);
    }

    // устраняем пересечения
    // Проверяем пересечения для всех сдвинутых элементов
    // строки от 0 до nextElementRow включительно
    // колонки от elementCol + 1 включительно до конца строки
    const topLeftPosition = [ 0, elementCol + 1 ];
    const bottomRightPosition = [ grid.rowCount - 1, grid.colCount - 1 ];
    fixCrossesInGridPart (grid, topLeftPosition, bottomRightPosition);

  }
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

  const { direction } = edge;

  if (direction === 'W_E' || direction === 'E_W') return;

  const vCrossed = edge.crossedElements(true);

  if (vCrossed.length <= 0) return;

  if (direction === 'S_N') {
    moveElementsRighterCrossLine(vCrossed, grid);
    return;
  }

  if (direction === 'SW_NE') {

    // требуется дополнительное условие?
    // пока сдвигаем вертикаль
    pushVerticalEdgeBy(vCrossed, grid);
    return;
  }

  if (direction === 'NW_SE') {
    pushVerticalEdgeBy(vCrossed, grid);
    return;
  }

  if (direction === 'N_S') {
    moveElementsRighterCrossLine(vCrossed, grid);
    return;
  }

  if (direction === 'NE_SW') {
    pushVerticalEdgeBy(vCrossed, grid);
    return;
  }

  if (direction === 'SE_NW') {
    pushVerticalEdgeBy(vCrossed, grid);
    return;
  }

}

// TODO: Add tests for boundary edges
// возможно добавить потом наличие ребер
function fixNewHorizontalCrosses(edge, grid) {

  // заготовка по направлениям

  const { direction } = edge;

  // по этим направлениям не предполагается горизонтальных пересечений
  if (direction === 'S_N' || direction === 'N_S') return;

  const hCrossed = edge.crossedElements(false);

  if (hCrossed.length === 0) return;

  if (direction === 'SW_NE') {

    // поднимаем элементы выше пересечения
    const maxDown = getMaxDown(edge);

    const [ baseSourceRow ] = edge.sourcePosition;

    for (let i = maxDown; i > 0; i--) {
      grid.createRow(baseSourceRow - 1);
    }

    const elements = edge._grid.getElementsInRange({ row: edge.sourcePosition[0], col: edge.sourcePosition[1] + 1 }, { row: edge._grid.rowCount - 1, col: edge._grid.colCount - 1 });

    for (const element of elements) {
      const [ row, col ] = edge._grid.find(element);
      edge._grid.move(element, [ row - maxDown, col ]);
    }
    return;
  }

  if (direction === 'W_E') {

    // опускаем элементы
    moveElementsUnderCrossLine(hCrossed, grid);
    return;
  }

  if (direction === 'NW_SE') {
    moveElementsUpperCrossLine(hCrossed, grid);
    return;
  }

  if (direction === 'NE_SW') {
    moveElementsUpperCrossLine(hCrossed, grid);
    return;
  }

  if (direction === 'E_W') {

    // опускаем элементы
    moveElementsUnderCrossLine(hCrossed, grid);
    return;
  }

  if (direction === 'SE_NW') {
    moveElementsUpperCrossLine(hCrossed, grid);
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
// TODO: for future
// eslint-disable-next-line no-unused-vars
function getCrossedElementsByPath(pathSegments, grid, hasVerticalCross) {
  const crossedElements = [];
  for (const segment of pathSegments) {
    const { position: [ row, col ], vCross, hCross } = segment;
    const crossCandidate = grid.get(row, col);
    if (!crossCandidate) continue;
    if ((hasVerticalCross && vCross) || (!hasVerticalCross && hCross)) {
      crossedElements.push(crossCandidate);
    }
  }

  return crossedElements;
}

/**
 * All crossed on one column
 * @param elements
 * @param grid
 */
function pushVerticalEdgeBy(elements, grid) {
  const [ , col ] = grid.find(elements[0]);
  grid.createCol(col - 1);

  for (const element of elements) {
    const [ row ] = grid.find(element);
    grid.move(element, [ row, col ]);
  }
}

function moveElementsRighterCrossLine(elements, grid) {
  const [ , col ] = grid.find(elements[0]);
  grid.createCol(col);

  for (const element of elements) {
    const [ row ] = grid.find(element);
    grid.move(element, [ row, col + 1 ]);
  }
}


function moveElementsUpperCrossLine(elements, grid) {

  // пробуем поднимать элементы выше пересечения
  const [ row ] = grid.find(elements[0]);
  grid.createRow(row - 1);
  for (const element of elements) {
    const [ , col ] = grid.find(element);
    grid.move(element, [ row , col ]);
  }
}

function moveElementsUnderCrossLine(elements, grid) {

  // пробуем опускать элементы ниже пересечения
  const [ row ] = grid.find(elements[0]);
  grid.createRow(row);
  for (const element of elements) {
    const [ , col ] = grid.find(element);
    grid.move(element, [ row + 1 , col ]);
  }
}

function inStackWithoutOutgoing(element, grid, stack) {
  const inStack = stack.includes(element);
  const outgoing = grid.getExistingOutgoingEdgesFor(element);

  return inStack && (!outgoing || outgoing.length === 0);
}

/**
 * @param grid
 * @param {[number, number]} topLeftPosition
 * @param {[number, number]} bottomRightPosition
 */
function fixCrossesInGridPart(grid, topLeftPosition, bottomRightPosition) {
  if (!grid.isValidPosition(topLeftPosition) || !grid.isValidPosition(bottomRightPosition)) throw new Error('fixCrossesInGridPart: invalid position');

  const [ topLeftRow, topLeftCol ] = topLeftPosition;
  const [ bottomRightRow, bottomRightCol ] = bottomRightPosition;

  for (let rowIndex = topLeftRow; rowIndex <= bottomRightRow; rowIndex++) {
    for (let colIndex = topLeftCol; colIndex <= bottomRightCol; colIndex++) {
      const element = grid.get(rowIndex, colIndex);
      if (!element) continue;
      fixNewCrosses(element, grid);
    }
  }
}

/**
 * Пробуем делать укороченный проход чтобы не грузить проц - посмотрим как будет рисоваться
 * @param {Element} element
 * @param {Element} fromElement
 * @param {boolean} backward
 */
function isTracingForTopLeftMove(toElement, fromElement, grid, unwantedEdge , backward) {


  // для короткого прохода
  const [ toElementRow ] = grid.find(toElement);

  // обходим граф
  const visited = new Set([ fromElement ]);
  const nextElements = [ fromElement ];
  while (nextElements.length > 0) {

    const nextElement = nextElements.pop();

    // получаем существующие ребра в зависимости от выбранного направления проверки
    const edges = !backward ? grid.getExistingOutgoingEdgesFor(nextElement) : grid.getExistingIncomingEdgesFor(nextElement);

    // фильтруем для короткого прохода
    const fastTrackingEdges = edges.filter(edge => {
      const { source, target, sourcePosition: [ sourceRow ], targetPosition: [ targetRow ] } = edge;

      // убираем self-loop
      if (source === target) return false;

      // убираем те что идут выше toElementRow
      if ((!backward && targetRow < toElementRow) || (backward && sourceRow > toElementRow)) return false;

      // исключаем основное ребро
      if (edge === unwantedEdge) return false;

      // не идем если уже посетили
      if ((!backward && visited.has(target)) || visited.has(source)) return false;

      return true;
    });

    for (const edge of fastTrackingEdges) {
      const { source, target } = edge;

      // добавляем в посещенные
      const newElement = !backward ? target : source;
      if (newElement === toElement) return true;

      visited.add(newElement);
      nextElements.push(newElement);
    }
  }
  return false;
}

// Todo: сделать для всех направлений, а не только для SW_NE и сделать методы в гриде
function getMaxDown(edge) {
  const sourcePosition = edge.sourcePosition;
  const targetPosition = edge.targetPosition;

  let maxDown = sourcePosition[0];

  for (let rowIndex = sourcePosition[0]; rowIndex < edge._grid.rowCount; rowIndex++) {
    if (edge._grid.getElementsInRange({ row: rowIndex, col: sourcePosition[1] + 1 }, { row: rowIndex, col: targetPosition[1] }).length > 0) {
      maxDown++;
    } else {
      break;
    }
  }

  return maxDown - sourcePosition[0];
}