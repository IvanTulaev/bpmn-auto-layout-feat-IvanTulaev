import {Grid} from "./Grid.js";
import {Edge} from "./Edge.js";
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
} from './utils/layoutUtils.js'


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
    this._createNewEdgesFor(element)
  }

  removeElement(element) {
    this._removeEdgesFor(element);
    super.removeElement(element);
  }

  move(element, toPosition) {
    this.removeElement(element)
    this.add(element, toPosition);
  }

  _removeEdgesFor(element){
    // при удалении элемента надо удалить его ребра, а так же ребра из других вершин где есть эта
    if (!this.hasElement(element)) return;
    // удаляем свои ребра

    this.outgoing.delete(element);
    this.incoming.delete(element);

    // удаляем из списка исходящих других вершин
    for (const [keyElement, edges] of this.outgoing) {

      const hasAsTarget = edges.some(edge => edge.target === element)
      if (!hasAsTarget) continue;
      const newEdges = edges.filter(edge => !edge.target === element)
      // для оптимизации чтобы не шарашило по всем
      if (newEdges.length === edges.length) continue;
      this.outgoing.set(keyElement, newEdges)
    }

    // удаляем из списка входящих других вершин
    for (const [keyElement, edges] of this.incoming) {
      const hasAsSource = edges.some(edge => edge.source === element)
      if (!hasAsSource) continue;

      const newEdges = edges.filter(edge => !edge.source === element)
      // для оптимизации чтобы не шарашило по всем
      if (newEdges.length === edges.length) continue;
      this.incoming.set(keyElement, newEdges)
    }
  }

  /**
   * Проверка существования для НОВЫХ ребер
   * Со старыми только через мапу
   * @param edge
   * @returns {*}
   * @private
   */
  _edgeIsExist(edge){
    const {source, sourcePosition, target, targetPosition} = edge
    return source && sourcePosition && target && targetPosition
  }

  _addEdgeToGrid(edge) {
    if (!this._edgeIsExist(edge)) return;

    const {source, target} = edge;

    // добавляем в outgoing
    // TODO: предположим что все в норме
    const existingSource = this.outgoing.get(source);
    if (existingSource) {
      existingSource.push(edge)
    }else {
      this.outgoing.set(source, [edge])
    }

    // добавляем в incoming
    const existingTarget = this.incoming.get(target);
    if (existingTarget) {
      existingTarget.push(edge)
    }else {
      this.incoming.set(target, [edge])
    }
  }

  /**
   *
   * @param element
   * @private
   */
  _createNewEdgesFor(element) {

    const elementPosition = this.find(element)
    if (!elementPosition) return

    //получаем исходящие из хоста
    // Todo: сделать сортировку?
    const outgoingFromHost = [...this.getOutgoingFromHost(element)]
        .filter(item => this.hasElement(item))
    for (const outgoing of outgoingFromHost) {
      const edge = !this.isFlipped ? new Edge(element, outgoing, this) : new Edge(outgoing, element, this)
      this._addEdgeToGrid(edge)
    }

    // получаем исходящие из boundary
    const outgoingFromBoundary = [...this.getOutgoingFromBoundary(element)]
        .filter(item => this.hasElement(item))
    for (const outgoing of outgoingFromBoundary) {
      const edge = !this.isFlipped ? new Edge(element, outgoing, this, true) : new Edge(outgoing, element, this, true)
      this._addEdgeToGrid(edge)
    }

    // входящие из host
    const incomingFromHost = [...this.getIncomingFromHost(element)]
        .filter(item => this.hasElement(item))
    for (const incoming of incomingFromHost) {
      const edge = !this.isFlipped ? new Edge(incoming, element, this) : new Edge(element, incoming, this)
      this._addEdgeToGrid(edge)
    }

    // входящие из boundary
    const incomingFromBoundaryHost = [...this.getIncomingFromBoundaryHost(element)]
        .filter(item => this.hasElement(item))
    for (const incoming of incomingFromBoundaryHost) {
      const edge = !this.isFlipped ? new Edge(incoming,element, this, true) : new Edge(element, incoming, this, true)
      this._addEdgeToGrid(edge)
    }
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

  /** @typedef {[number, number]} Position*/

  isCrossed(position, byVertical){
    const [row, col] = position
    //перебираем все исходящие ребра
    let allEdges  = [...this.outgoing].map(([key, value]) => {
      return value
    })
    allEdges = new Set(allEdges.flat())
    for (const edge of allEdges) {
      const {path} = edge
      for (const segment of path) {
        const {position: [segmentRow, segmentCol], hCross, vCross} = segment
        if (segmentRow === row && segmentCol === col && ((byVertical && vCross)||(hCross && !byVertical))) return true
      }

    }
  }

  /**
   * Экспериментальная функция с херовой производительностью
   * @param grid
   */
  shakeItHorizontal(){

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
          return !this.isCrossed([row, col],true) && !this.get(row, col)
        })

        if (!allPositionsAreFine) break;

        // пробно перемещаем все элементы из цепочки на новые места
        for (const chainElement of verticalChain) {
          const chainElementPosition = this.find(chainElement)
          this.move(chainElement, [chainElementPosition[0], col])
        }

        // проверяем не образовалось ли новых пересечений пока по старинке
        const hasNewCrosses = this.hasAnyCross()
        const newVerticalChain = this.getVerticalChain(element)
        if (hasNewCrosses || newVerticalChain.size > verticalChain.size){
          // вертаем все элементы взад
          for (const chainElement of verticalChain) {
            const chainElementPosition = this.find(chainElement)
            this.move(chainElement, [chainElementPosition[0], col + 1])
          }
          break;
        }
      }
    }
  }

  /**
   * Пока так наличие пересечений определим
   * @returns {boolean}
   */
  hasAnyCross() {
    //перебираем все исходящие ребра
    let allEdges  = [...this.outgoing].map(([key, value]) => {
      return value
    })
    allEdges = new Set(allEdges.flat())
    for (const edge of allEdges) {
      const {path} = edge
      for (const segment of path) {
        const {position: [segmentRow, segmentCol], hCross, vCross} = segment
        if ((hCross || vCross) && this.get(segmentRow, segmentCol)) return true
      }

    }
    return false
  }

  /**
   * Экспериментальная функция с херовой производительностью
   * @param grid
   */
  shakeItVertical(){

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
          sortedElements.splice(deleteIndex, 1)
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
          return !this.isCrossed([[row, col]]) && !this.get(row, col)
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
        const hasNewCrosses = this.hasAnyCross()

        const newHorizontalChain = this.getHorizontalChain(element)
        if (hasNewCrosses || newHorizontalChain.size > horizontalChain.size){

          // вертаем все элементы взад
          for (const chainElement of horizontalChain) {
            const chainElementPosition = this.find(chainElement)
            this.move(chainElement, [row + 1 , chainElementPosition[1]])
          }
          break;
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
    const outgoingEdges = this.outgoing.get(element) ?? []
    const incomingEdges = this.incoming.get(element) ?? []
    const edges = new Set([...outgoingEdges, ...incomingEdges])

    const filteredEdges = [...edges].filter(edge => {
          const {direction, sourcePosition, targetPosition} = edge
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

    for (const edge of filteredEdges){
      const nextElement = edge._source === element ? edge._target : edge._source
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
    const incomingEdges = this.incoming.get(element) ?? []
    const outgoingEdges = this.outgoing.get(element) ?? []
    const edges = new Set([...outgoingEdges, ...incomingEdges])

    const filteredEdges = [...edges]
        .filter(edge => {
          const {direction, path, _sourceIsBoundary, sourcePosition, targetPosition} = edge

          // Для случаев W_E
          if (direction === 'W_E') return true;
          // E_W только если не идем в обход
          if (direction === 'E_W' && path.length > 0) return true;

          return false;
        })

    for (const edge of filteredEdges){
      const nextElement = edge._source === element ? edge._target : edge._source
      if (!chain.has(nextElement)) {
        const nextChain = this.getHorizontalChain(nextElement, chain)
        for (const nextChainEl of nextChain) {
          chain.add(nextChainEl)
        }
      }
    }
    return chain
  }

  getExistingOutgoingEdgesFor(element) {
    return !this.isFlipped ? (this.outgoing.get(element) ?? []) : (this.incoming.get(element) ?? [])
  }

  getExistingIncomingEdgesFor(element) {
    return !this.isFlipped ? (this.incoming.get(element) ?? []) : (this.outgoing.get(element) ?? [])
  }
}
