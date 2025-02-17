import {getDefaultSize, is} from '../../di/DiUtil.js';

import {
  getAttachedOutgoingElements,
  getIncomingElements as utilsGetIncomingElements,
  getOutgoingElements as utilsGetOutgoingElements,
  isBoundaryEvent,
  isConnection,
  isStartIntermediate,
  getHostIncoming,
  getBoundaryIncomingHosts
} from '../../utils/elementUtils.js';

export const DEFAULT_CELL_WIDTH = 150;
export const DEFAULT_CELL_HEIGHT = 140;
// const DEFAULT_VERTICAL_SHIFT = 30;


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

export function getOutgoingElements(element, isFlipped) {
  return  !isFlipped ? new Set (utilsGetOutgoingElements(element).concat(getAttachedOutgoingElements(element))) : new Set (utilsGetIncomingElements(element));
}

/**
 * Экспериментальная функция с херовой производительностью
 * @param grid
 */
export function shakeItHorizontal(grid){
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
 * Экспериментальная функция с херовой производительностью
 * @param grid
 */
export function shakeItVertical(grid){
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

/**
 *
 * @param {[number, number]} position
 * @param crossGrid
 * @param {boolean} byVertical
 */
export function positionIsCrossedOrOccupied(position, crossGrid, byVertical) {
  // если высота crossGrid меньше индекс строки позиции
  if (crossGrid.length - 1 < position[0]) return false;
  const crossGridElement = crossGrid[position[0]][position[1]]
  if (!crossGridElement) return false;

  const crossed = !byVertical ? crossGridElement.hCross : crossGridElement.vCross
  const occupied = crossGridElement.occupied

  return occupied || crossed
}

/**
 * Modified Manhattan layout: Uses space between grid columns to route connections
 * if direct connection is not possible.
 * @param {*} source
 * @param {*} target
 * @returns waypoints
 */
export function connectElements(source, target, layoutGrid, isBoundary) {
  // todo: применить новую схему
  const sourceDi = source.di;
  const targetDi = target.di;

  const sourceBounds = sourceDi.get('bounds');
  const targetBounds = targetDi.get('bounds');

  const sourceMid = getMid(sourceBounds);
  const targetMid = getMid(targetBounds);

  const dX = target.gridPosition.col - source.gridPosition.col;
  const dY = target.gridPosition.row - source.gridPosition.row;

  const dockingSource = `${(dY > 0 ? 'bottom' : 'top')}-${dX > 0 ? 'right' : 'left'}`;
  const dockingTarget = `${(dY > 0 ? 'top' : 'bottom')}-${dX > 0 ? 'left' : 'right'}`;

  const { x: sourceX, y: sourceY } = coordinatesToPosition(source.gridPosition.row, source.gridPosition.col);
  const { x: targetX, y: targetY } = coordinatesToPosition(target.gridPosition.row, target.gridPosition.col);

  if (isBoundary) {
    //self loop
    if (dX === 0 && dY === 0) {
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
        { x: sourceMid.x, y: sourceY + DEFAULT_CELL_HEIGHT },
        { x: sourceX, y: sourceY + DEFAULT_CELL_HEIGHT },
        { x: sourceX, y: targetMid.y },
        getDockingPoint(targetMid, targetBounds, 'l', dockingTarget)
      ];
    }
    //12
    if (dX === 0 && dY < 0){
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
        { x: sourceMid.x, y: sourceY + DEFAULT_CELL_HEIGHT },
        { x: sourceX, y: sourceY + DEFAULT_CELL_HEIGHT },
        {x: targetX, y: targetMid.y},
        getDockingPoint(targetMid, targetBounds, 'l', dockingTarget)
      ]
    }

    //1
    if (dX > 0 && dY < 0){
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
        { x: sourceMid.x, y: sourceY + DEFAULT_CELL_HEIGHT },
        {x: targetMid.x, y: sourceY + DEFAULT_CELL_HEIGHT},
        getDockingPoint(targetMid, targetBounds, 'b', dockingTarget)
      ]
    }

    //3
    if (dX > 0 && dY === 0){
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
        { x: sourceMid.x, y: sourceY + DEFAULT_CELL_HEIGHT },
        {x: targetMid.x, y: sourceY + DEFAULT_CELL_HEIGHT},
        getDockingPoint(targetMid, targetBounds, 'b', dockingTarget)
      ]
    }

    //4
    if (dX > 0 && dY > 0){
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b'),
        { x: sourceMid.x, y: targetMid.y },
        getDockingPoint(targetMid, targetBounds, 'l')
      ];
    }

    //6
    if (dX === 0 && dY > 0){
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
        getDockingPoint(targetMid, targetBounds, 't', dockingTarget)
      ]
    }

    //7
    if (dX < 0 && dY > 0){
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b'),
        { x: sourceMid.x, y: targetMid.y },
        getDockingPoint(targetMid, targetBounds, 'r')
      ];
    }

    //9
    if (dX < 0 && dY === 0){
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
        { x: sourceMid.x, y: sourceY + DEFAULT_CELL_HEIGHT },
        {x: targetMid.x, y: sourceY + DEFAULT_CELL_HEIGHT},
        getDockingPoint(targetMid, targetBounds, 'b', dockingTarget)
      ]
    }

    //10
    if (dX < 0 && dY < 0){
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
        {x: sourceMid.x, y: sourceY + DEFAULT_CELL_HEIGHT},
        {x: targetMid.x, y: sourceY + DEFAULT_CELL_HEIGHT},
        getDockingPoint(targetMid, targetBounds, 'b', dockingTarget)
      ]
    }


  } else {
    // Source === Target ==> Build loop
    if (dX === 0 && dY === 0) {
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
        { x: sourceMid.x, y: sourceY + DEFAULT_CELL_HEIGHT },
        { x: sourceX, y: sourceY + DEFAULT_CELL_HEIGHT },
        { x: sourceX, y: targetMid.y },
        getDockingPoint(targetMid, targetBounds, 'l', dockingTarget)
      ];
    }

    // 12 часов
    if (dX === 0 && dY < 0){
      // проверяем есть ли в гриде элементы между, если есть, то пускаем в обход
      const elementsInMiddle = []
      for (let row = source.gridPosition.row -1; row > target.gridPosition.row; row--) {
        const candidate = layoutGrid.get(row, source.gridPosition.col)
        if (candidate) elementsInMiddle.push(candidate)
      }

      // пока так по колхозному
      const hasReversEdge = getOutgoingElements(target).includes(source)

      if (elementsInMiddle.length > 0 || hasReversEdge){
        // идем в обход
        return [
          getDockingPoint(sourceMid, sourceBounds, 'l', dockingSource),
          {x: sourceX, y: sourceMid.y},
          {x: targetX, y: targetMid.y},
          getDockingPoint(targetMid, targetBounds, 'l', dockingTarget)
        ]
      } else {
        return [
          getDockingPoint(sourceMid, sourceBounds, 't', dockingSource),
          getDockingPoint(targetMid, targetBounds, 'b', dockingTarget)
        ]
      }
    }

    // 1 час
    if (dX > 0 && dY < 0) {
      return [
        getDockingPoint(sourceMid, sourceBounds, 'r'),
        { x: targetMid.x, y: sourceMid.y },
        getDockingPoint(targetMid, targetBounds, 'b')
      ];
    }

    //3
    if (dX > 0 && dY === 0){
      return [
        getDockingPoint(sourceMid, sourceBounds, 'r', dockingSource),
        getDockingPoint(targetMid, targetBounds, 'l', dockingTarget)
      ]
    }

    // 4 час
    if (dX > 0 && dY > 0) {
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b'),
        { x: sourceMid.x, y: targetMid.y },
        getDockingPoint(targetMid, targetBounds, 'l')
      ];
    }

    //6
    if (dX === 0 && dY > 0){
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
        getDockingPoint(targetMid, targetBounds, 't', dockingTarget)
      ]
    }

    // 7 часов
    if (dX < 0 && dY > 0) {
      return [
        getDockingPoint(sourceMid, sourceBounds, 'b'),
        { x: sourceMid.x, y: targetMid.y },
        getDockingPoint(targetMid, targetBounds, 'r')
      ];
    }

    //9 часов
    if (dX < 0 && dY === 0){
      // здесь аналогично вертикали
      // проверяем есть ли в гриде элементы между, если есть, то пускаем в обход - уже не актуально
      const elementsInMiddle = []
      for (let col = source.gridPosition.col -1; col > target.gridPosition.col; col--) {
        const candidate = layoutGrid.get(source.gridPosition.row, col)
        if (candidate) elementsInMiddle.push(candidate)
      }

      // пока так по колхозному
      const hasReversEdge = utilsGetOutgoingElements(target).includes(source)

      // еще один колхоз для эксперимента: есть ли в таргете SW_NE из хоста
      const hasSW_NEOut = getExistElementEdges(target, layoutGrid).some(item => item.source === target && item.direction === 'SW_NE')


      if (elementsInMiddle.length > 0 || hasReversEdge || hasSW_NEOut){
        // идем в обход
        return [
          getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
          {x: sourceMid.x, y: sourceY + DEFAULT_CELL_HEIGHT},
          {x: targetMid.x, y: targetY + DEFAULT_CELL_HEIGHT},
          getDockingPoint(targetMid, targetBounds, 'b', dockingTarget)
        ]
      } else {
        return [
          getDockingPoint(sourceMid, sourceBounds, 'l', dockingSource),
          getDockingPoint(targetMid, targetBounds, 'r', dockingTarget)
        ]
      }
    }

    // negative dX indicates connection from future to past
    // 10 часов
    if (dX < 0 && dY < 0) {
      // колхоз
      const elementsInHorizontal = []
      for (let col = source.gridPosition.col -1; col >= target.gridPosition.col; col--) {
        const candidate = layoutGrid.get(source.gridPosition.row, col)
        if (candidate) elementsInHorizontal.push(candidate)
      }

      if (elementsInHorizontal.length > 0){
        // идем в обход
        return [
          getDockingPoint(sourceMid, sourceBounds, 'b', dockingSource),
          {x: sourceMid.x, y: sourceY + DEFAULT_CELL_HEIGHT},
          {x: targetMid.x, y: sourceY + DEFAULT_CELL_HEIGHT},
          getDockingPoint(targetMid, targetBounds, 'b', dockingTarget)
        ]
      } else {
        return [
          getDockingPoint(sourceMid, sourceBounds, 'l'),
          { x: targetMid.x, y: sourceMid.y },
          getDockingPoint(targetMid, targetBounds, 'b')
        ];
      }



    }
  }

  // на будущее если не сработает что-то сверху
  const directManhattan = directManhattanConnect(source, target, layoutGrid);

  if (directManhattan) {
    const startPoint = getDockingPoint(sourceMid, sourceBounds, directManhattan[0], dockingSource);
    const endPoint = getDockingPoint(targetMid, targetBounds, directManhattan[1], dockingTarget);

    const midPoint = directManhattan[0] === 'h' ? { x: endPoint.x, y: startPoint.y } : { x: startPoint.x, y: endPoint.y };

    return [
      startPoint,
      midPoint,
      endPoint
    ];
  }
  const yOffset = -Math.sign(dY) * DEFAULT_CELL_HEIGHT / 2;

  return [
    getDockingPoint(sourceMid, sourceBounds, 'r', dockingSource),
    { x: sourceMid.x + DEFAULT_CELL_WIDTH / 2, y: sourceMid.y }, // out right
    { x: sourceMid.x + DEFAULT_CELL_WIDTH / 2, y: targetMid.y + yOffset }, // to target row
    { x: targetMid.x - DEFAULT_CELL_WIDTH / 2, y: targetMid.y + yOffset }, // to target column
    { x: targetMid.x - DEFAULT_CELL_WIDTH / 2, y: targetMid.y }, // to mid
    getDockingPoint(targetMid, targetBounds, 'l', dockingTarget)
  ];
}

export function getMid(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}



export function getDockingPoint(point, rectangle, dockingDirection = 'r', targetOrientation = 'top-left') {

  // ensure we end up with a specific docking direction
  // based on the targetOrientation, if <h|v> is being passed

  if (dockingDirection === 'h') {
    dockingDirection = /left/.test(targetOrientation) ? 'l' : 'r';
  }

  if (dockingDirection === 'v') {
    dockingDirection = /top/.test(targetOrientation) ? 't' : 'b';
  }

  if (dockingDirection === 't') {
    return { original: point, x: point.x, y: rectangle.y };
  }

  if (dockingDirection === 'r') {
    return { original: point, x: rectangle.x + rectangle.width, y: point.y };
  }

  if (dockingDirection === 'b') {
    return { original: point, x: point.x, y: rectangle.y + rectangle.height };
  }

  if (dockingDirection === 'l') {
    return { original: point, x: rectangle.x, y: point.y };
  }

  throw new Error('unexpected dockingDirection: <' + dockingDirection + '>');
}



// helpers /////
export function coordinatesToPosition(row, col) {
  return {
    width: DEFAULT_CELL_WIDTH,
    height: DEFAULT_CELL_HEIGHT,
    x: col * DEFAULT_CELL_WIDTH,
    y: row * DEFAULT_CELL_HEIGHT
  };
}

export function getBounds(element, row, col, attachedTo) {
  const { width, height } = getDefaultSize(element);

  // Center in cell
  if (!attachedTo) {
    return {
      width, height,
      x: (col * DEFAULT_CELL_WIDTH) + (DEFAULT_CELL_WIDTH - width) / 2,
      y: row * DEFAULT_CELL_HEIGHT + (DEFAULT_CELL_HEIGHT - height) / 2
    };
  }

  const hostBounds = getBounds(attachedTo, row, col);

  return {
    width, height,
    x: Math.round(hostBounds.x + hostBounds.width / 2 - width / 2),
    y: Math.round(hostBounds.y + hostBounds.height - height / 2)
  };
}

function isDirectPathBlocked(source, target, layoutGrid) {
  const { row: sourceRow, col: sourceCol } = source.gridPosition;
  const { row: targetRow, col: targetCol } = target.gridPosition;

  const dX = targetCol - sourceCol;
  const dY = targetRow - sourceRow;

  let totalElements = 0;

  if (dX) {
    totalElements += layoutGrid.getElementsInRange({ row: sourceRow, col: sourceCol }, { row: sourceRow, col: targetCol }).length;
  }

  if (dY) {
    totalElements += layoutGrid.getElementsInRange({ row: sourceRow, col: targetCol }, { row: targetRow, col: targetCol }).length;
  }

  return totalElements > 2;
}

function directManhattanConnect(source, target, layoutGrid) {
  const { row: sourceRow, col: sourceCol } = source.gridPosition;
  const { row: targetRow, col: targetCol } = target.gridPosition;

  const dX = targetCol - sourceCol;
  const dY = targetRow - sourceRow;

  // Only directly connect left-to-right flow
  if (!(dX > 0 && dY !== 0)) {
    return;
  }

  // If below, go down then horizontal
  if (dY > 0) {
    let totalElements = 0;
    const bendPoint = { row: targetRow, col: sourceCol };
    totalElements += layoutGrid.getElementsInRange({ row: sourceRow, col: sourceCol }, bendPoint).length;
    totalElements += layoutGrid.getElementsInRange(bendPoint, { row: targetRow, col: targetCol }).length;

    return totalElements > 2 ? false : [ 'v', 'h' ];
  } else {

    // If above, go horizontal than vertical
    let totalElements = 0;
    const bendPoint = { row: sourceRow, col: targetCol };

    totalElements += layoutGrid.getElementsInRange({ row: sourceRow, col: sourceCol }, bendPoint).length;
    totalElements += layoutGrid.getElementsInRange(bendPoint, { row: targetRow, col: targetCol }).length;

    return totalElements > 2 ? false : [ 'h', 'v' ];
  }
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

export function sortByType(arr, type) {
  const nonMatching = arr.filter(item => !is(item, type));
  const matching = arr.filter(item => is(item, type));

  return [ ...matching, ...nonMatching ];
  // return [ ...nonMatching, ...matching ];
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

//Todo: use layout controller utils
/**
 * Get incoming elements
 * @param element
 * @param {boolean=} isFlipped
 */
export function getIncomingElements(element, isFlipped) {
  return  !isFlipped ? new Set (utilsGetIncomingElements(element)) : new Set (utilsGetOutgoingElements(element).concat(getAttachedOutgoingElements(element)));
}

