import {Grid} from "./Grid.js";
import {
  getIncomingElements as utilsGetIncomingElements,
  getOutgoingElements as utilsGetOutgoingElements,
  getOutgoingElements,
  getHostIncoming,
  getAttachedOutgoingElements,
  getBoundaryIncomingHosts,
} from './utils/elementUtils.js'

import {
  sortColsLeftRightRowsBottomTop,
  sortElementsTopLeftBottomRight
} from './controllers/layoutController/utils.js'

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

export class GridWithEdges extends Grid{
  constructor(){
    super();
    this.outgoing = new Map()
    this.incoming = new Map()
  }

  /**
   *
   * @param element
   * @param {[number, number]} position - numbers are integer
   */
  add(element, position) {
    super.add(element, position);
    this.addEdgesFor(element)
  }

  move(element, toPosition) {
    super.move(element, toPosition);
    this.updateEdgesFor(element)
  }

  removeElement(element) {
    this.removeEdgesFor(element);
    super.removeElement(element);
  }

  // Todo: бустануть производительность
  createRow(afterIndex) {
    super.createRow(afterIndex);
    this.updateAllEdges()
  }

  createCol(afterIndex) {
    super.createCol(afterIndex);
    this.updateAllEdges()
  }

  shrinkCols(){
    super.shrinkCols();
    this.updateAllEdges()
  }

  shrinkRows() {
    super.shrinkRows();
    this.updateAllEdges()
  }

  //todo: add js consistent
  removeElementAt(position) {
    if (!position) return;
    const [row, col] = position;
    const element = this.get(row, col);
    super.removeElementAt(position);
    this.removeEdgesFor(element)
  }

  addEdgesFor(element){
    if (!this.hasElement(element)) return;
    const newEdges = this.getExistElementEdges(element);
    for (const edge of newEdges) {
      if (edge.source === element) {
        this.outgoing.set(element, [...this.outgoing.get(element) || [], edge] )
      }else {
        this.incoming.set(element, [...this.incoming.get(element)  || [], edge])
      }
    }
  }

  removeEdgesFor(element){
    if (!this.hasElement(element)) return;
    this.outgoing.delete(element);
    this.incoming.delete(element);
  }

  updateEdgesFor(element) {
    if (!this.hasElement(element)) return;
    this.removeEdgesFor(element)
    this.addEdgesFor(element)
  }

  updateAllEdges() {
    for (const element of [...this.elements]) {
      this.updateEdgesFor(element)
    }
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
  getExistElementEdges(element) {
    const edges = []

    const elementPosition = this.find(element)
    if (!elementPosition) return edges

    //получаем исходящие из хоста
    // Todo: сделать сортировку?
    const outgoingFromHost = [...this.getOutgoingFromHost (element)]
        .filter(item => this.hasElement(item))
    for (const outgoing of outgoingFromHost) {
      const sourcePosition = this.find(element)
      const targetPosition = this.find(outgoing)
      const edge = {source: element,sourcePosition, target: outgoing, targetPosition}
      const outgoingPosition = this.find(outgoing)
      if (!outgoingPosition) continue;
      const direction = getDirection(elementPosition, outgoingPosition)
      edge.direction = direction

      // Todo: объект пути это направление, путь и возможно тип
      const path = this.getPathSegments(element, outgoing)
      edge.path = path
      edges.push(edge)
    }

    // получаем исходящие из boundary
    const outgoingFromBoundary = [...this.getOutgoingFromBoundary (element)]
        .filter(item => this.hasElement(item))
    for (const outgoing of outgoingFromBoundary) {
      const sourcePosition = this.find(element)
      const targetPosition = this.find(outgoing)
      const edge = {source: element, sourcePosition, target: outgoing, targetPosition, sourceIsBoundary: true}
      const outgoingPosition = this.find(outgoing)
      if (!outgoingPosition) continue;
      const direction = getDirection(elementPosition, outgoingPosition)
      edge.direction = direction

      // Todo: объект пути это направление, путь и возможно тип
      const path = this.getPathSegments(element, outgoing, true)
      edge.path = path
      edges.push(edge)
    }

    // входящие из host
    const incomingFromHost = [...this.getIncomingFromHost (element)]
        .filter(item => this.hasElement(item))
    for (const incoming of incomingFromHost) {
      const sourcePosition = this.find(incoming)
      const targetPosition = this.find(element)
      const edge = {source: incoming, sourcePosition, target: element, targetPosition}
      const incomingPosition = this.find(incoming)
      if (!incomingPosition) continue;
      const direction = getDirection(incomingPosition, elementPosition)
      edge.direction = direction

      // Todo: объект пути это направление, путь и возможно тип
      const path = this.getPathSegments(incoming, element)
      edge.path = path
      edges.push(edge)
    }

    // входящие из boundary
    const incomingFromBoundaryHost = [...this.getIncomingFromBoundaryHost(element)]
        .filter(item => this.hasElement(item))
    for (const incoming of incomingFromBoundaryHost) {
      const sourcePosition = this.find(incoming)
      const targetPosition = this.find(element)
      const edge = {source: incoming, sourcePosition, target: element, targetPosition, sourceIsBoundary: true}
      // const edge = {source: incoming, target: element, sourceIsBoundary: true}
      const incomingPosition = this.find(incoming)
      if (!incomingPosition) continue;
      const direction = getDirection(incomingPosition, elementPosition)
      edge.direction = direction

      // Todo: объект пути это направление, путь и возможно тип
      const path = this.getPathSegments(incoming, element, true)
      edge.path = path
      edges.push(edge)
    }
    return edges
  }

  // Возвращает исходящие только из элемента
  getOutgoingFromHost (element) {
    return !this.isFlipped ? new Set(getOutgoingElements(element)) : new Set(getHostIncoming (element))
  }

  // Возвращает исходящие только из boundary элемента
  getOutgoingFromBoundary (element) {
    return !this.isFlipped ? new Set (getAttachedOutgoingElements(element)) : new Set()
  }

  // Возвращает входящие только в элемент
  getIncomingFromHost (element) {
    return !this.isFlipped ? new Set(getHostIncoming (element)) : new Set(getOutgoingElements(element))
  }

  // Возвращает входящие только в boundary
  getIncomingFromBoundaryHost(element) {
    return !this.isFlipped ? new Set (getBoundaryIncomingHosts (element)) : new Set ()
  }

  getOutgoingElementsFor(element) {
    if(!element) return []
    const outgoingFromHost = this.getOutgoingFromHost (element)
    const outgoingFromBoundary = this.getOutgoingFromBoundary (element)

    return new Set ([...outgoingFromHost, ...outgoingFromBoundary])
  }

  getIncomingElementsFor(element) {
    if(!element) return []
    const incomingFromHost = this.getIncomingFromHost (element)
    const incomingFromBoundaryHost = this.getIncomingFromBoundaryHost (element)

    return new Set ([...incomingFromHost, ...incomingFromBoundaryHost])
  }

  /**
   * TODO: !!!!ADD REVERSE
   * @param sourceElement
   * @param targetElement
   * @param grid
   * @returns {PathSegment[]}
   */
  getPathSegments(sourceElement, targetElement, sourceIsBoundary) {
    /**
     * @type {PathSegment[]}
     */
    const pathSegments = []

    // если одного из элементов нет в гриде, то прекращаем обработку
    if (!sourceElement || !targetElement || !this.hasElement(sourceElement) || !this.hasElement(targetElement)) return pathSegments;

    const sourcePosition = this.find(sourceElement)
    const targetPosition = this.find(targetElement)
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
        const middleElement = this.get(rowIndex, sourceCol)
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
        const middleElement = this.get(sourceRow, colIndex)
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
        const middleElement = this.get(sourceRow, colIndex)
        if (middleElement) {
          middleElements.add(middleElement)
        }
      }

      // для sourceIsBoundary пропускаем горизонталь
      if (!sourceIsBoundary) {
        // пробуем новую схему для хост-хост без обхода
        for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
          pathSegments.push({position: [sourceRow, colIndex], hCross: true})
        }
      }

      // угловой сегмент
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
   * @typedef {{occupied: boolean, vCross: boolean, hCross: boolean}} CrossMapElement
   */

  /**
   * TODO!!!!: REMOVE AFTER REFACTOR
   * @param grid
   * @returns {Array<Array<CrossMapElement>>}
   */
  getCrossGrid() {
    const rowCount = this.rowCount
    const colCount = this.colCount

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
    for (const gridElement of this.elements) {
      // получаем исходящие маршруты
      const outgoingPaths = [...getOutgoingElements(gridElement, this.isFlipped)].map(outgoingElement => {
        return this.getPathSegments(gridElement, outgoingElement)
      })

      // заполняем матрицу пересечений
      // сначала свойством занятости для текущего элемента
      const position = this.find(gridElement)
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

  getPositionVerticalCrossedBy(sourceElement, targetElement) {
    const path = this.getPathSegments(sourceElement, targetElement)
    const verticalCrossed = path.filter(segment => {
      const [segmentRow, segmentCol] = segment.position
      const gridElement = this.get(segmentRow, segmentCol)
      return (gridElement && segment.vCross)
    })
    return verticalCrossed.map(item => item.position)
  }

  getPositionsHorizontalCrossedBy(sourceElement, targetElement) {
    const path = this.getPathSegments(sourceElement, targetElement)
    const horizontalCrossed = path.filter(segment => {
      const [segmentRow, segmentCol] = segment.position
      const gridElement = this.get(segmentRow, segmentCol)
      return (gridElement && segment.hCross)
    })
    return horizontalCrossed.map(item => item.position)
  }

  /**
   * Экспериментальная функция с херовой производительностью
   * @param grid
   */
  shakeItHorizontal(){

    let baseCrossGrid = this.getCrossGrid()

    const sortedElements = [...this.elements].sort(sortColsLeftRightRowsBottomTop (this))

    while (sortedElements.length > 0) {
      // работаем по первому элементу
      const element = sortedElements.shift()
      // получаем вертикальную цепочку
      // удаляем из стека sortedElements все элементы из цепочки
      const verticalChain = this.getVerticalChain(element)
      for (const chainElement of verticalChain) {
        const deleteIndex = sortedElements.indexOf(chainElement)
        if (deleteIndex >= 0) {
          sortedElements.splice(sortedElements.indexOf(chainElement), 1)
        }
      }
      // проверяем можно ли двинуть цепочку влево
      // не одна из позиций не должна быть занята или иметь вертикального пересечения
      // - цепочка не должна удлиниться
      const [, baseCol] = this.find([...verticalChain][0])
      const rows =  [...verticalChain].map(item => {
        const itemPosition = this.find(item)
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
          const chainElementPosition = this.find(chainElement)
          this.move(chainElement, [chainElementPosition[0], col])
        }

        // проверяем не образовалось ли новых пересечений пока по старинке
        const newCrossGrid = this.getCrossGrid()
        const crossed = newCrossGrid.flat()
            .filter(crossGridEl => crossGridEl.occupied && (crossGridEl.vCross || crossGridEl.hCross) )
        const newVerticalChain = this.getVerticalChain(element)
        if (crossed.length > 0 || newVerticalChain.size > verticalChain.size){
          // вертаем все элементы взад
          for (const chainElement of verticalChain) {
            const chainElementPosition = this.find(chainElement)
            this.move(chainElement, [chainElementPosition[0], col + 1])
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
  shakeItVertical(){

    let baseCrossGrid = this.getCrossGrid()

    const sortedElements = [...this.elements].sort(sortElementsTopLeftBottomRight (this))

    while (sortedElements.length > 0) {
      // работаем по первому элементу
      const element = sortedElements.shift()
      // получаем вертикальную цепочку
      // удаляем из стека sortedElements все элементы из цепочки
      const horizontalChain = this.getHorizontalChain(element)
      for (const chainElement of horizontalChain) {
        const deleteIndex = sortedElements.indexOf(chainElement)
        if (deleteIndex >= 0) {
          sortedElements.splice(sortedElements.indexOf(chainElement), 1)
        }
      }

      // проверяем можно ли двинуть цепочку вверх
      // не одна из позиций не должна быть занята или иметь вертикального пересечения
      // - цепочка не должна удлиниться
      const [baseRow] = this.find([...horizontalChain][0])
      const cols =  [...horizontalChain].map(item => {
        const itemPosition = this.find(item)
        return  itemPosition[1]
      })

      // двигаться вверх не вариант если цепочка в первой строке
      if (baseRow <= 0 ) continue;

      for (let row = baseRow - 1; row >= 0; row--) {
        const allPositionsAreFine = cols.every(col => {
          return !positionIsCrossedOrOccupied([row, col], baseCrossGrid, false)
        })

        if (!allPositionsAreFine) break;

        // пробно перемещаем все элементы из цепочки на новые места
        for (const chainElement of horizontalChain) {
          const chainElementPosition = this.find(chainElement)
          this.move(chainElement, [row, chainElementPosition[1]])
        }

        // проверяем не образовалось ли новых пересечений пока по старинке
        // и не удлинилась ли цепочка
        // Надо отдельно проверять не цепочку а положение, кейс с boundary scenario.issue-80-1.bpmn
        const newCrossGrid = this.getCrossGrid()
        const crossed = newCrossGrid.flat()
            .filter(crossGridEl => crossGridEl.occupied && (crossGridEl.vCross || crossGridEl.hCross) )
        const newHorizontalChain = this.getHorizontalChain(element)
        if (crossed.length > 0 || newHorizontalChain.size > horizontalChain.size){

          // вертаем все элементы взад
          for (const chainElement of horizontalChain) {
            const chainElementPosition = this.find(chainElement)
            this.move(chainElement, [row + 1 , chainElementPosition[1]])
          }
          break;
        }else{
          baseCrossGrid = newCrossGrid
        }
      }
    }
  }

  getVerticalChain(element, oldChain) {
    const chain = !oldChain ? new Set() : oldChain
    if (!element) return chain;

    const elementPosition = this.find(element)
    if (!elementPosition) return chain;

    chain.add(element)

    // схема подразумевает только связи с направлением N_S или S_N если path.length > 0
    const edges = this.getExistElementEdges(element)
        .filter(edge => {
          const {direction, path, sourceIsBoundary, sourcePosition, targetPosition} = edge
          // для всех случаем N_S
          if (direction === 'N_S') return true;
          // S_N только если не идем в обход
          if (direction === 'S_N' && sourcePosition[0] === targetPosition[0] + 1  ) return true;
          if (direction === 'S_N') {
            // проверяем наличие элементов в диапазоне
            const inRange = []
            for (let rowIndex = sourcePosition[0] - 1; rowIndex > targetPosition; rowIndex--) {
              const candidate = this.get(rowIndex, sourcePosition[1])
              if (candidate) inRange.push(candidate)
            }
            return inRange.length === 0
          }
          return false;
        })

    for (const edge of edges){
      const nextElement = edge.source === element ? edge.target : edge.source
      if (!chain.has(nextElement)) {
        const nextChain = this.getVerticalChain(nextElement, chain)
        for (const nextChainEl of nextChain) {
          chain.add(nextChainEl)
        }
      }
    }
    return chain
  }

  getHorizontalChain(element, oldChain) {
    const chain = !oldChain ? new Set() : oldChain
    if (!element) return chain;

    const elementPosition = this.find(element)
    if (!elementPosition) return chain;

    chain.add(element)

    // схема подразумевает только связи с направлением N_S или S_N если path.length > 0
    const edges = this.getExistElementEdges(element)
        .filter(edge => {
          const {direction, path, sourceIsBoundary, sourcePosition, targetPosition} = edge
          // Для случаев W_E
          if (direction === 'W_E') return true;
          // E_W только если не идем в обход
          if (direction === 'E_W' && path.length > 0) return true;

          return false;
        })

    for (const edge of edges){
      const nextElement = edge.source === element ? edge.target : edge.source
      if (!chain.has(nextElement)) {
        const nextChain = this.getHorizontalChain(nextElement, chain)
        for (const nextChainEl of nextChain) {
          chain.add(nextChainEl)
        }
      }
    }
    return chain
  }
}


// pathUtils

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

  // self loop
  return  'POINT'
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
