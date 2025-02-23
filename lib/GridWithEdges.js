import {Grid} from "./Grid.js";
import {Edge} from "./Edge.js";
import {
  getOutgoingElements,
  getHostIncoming,
  getAttachedOutgoingElements,
  getBoundaryIncomingHosts,
} from './utils/elementUtils.js'

import {
  sortColsLeftRightRowsBottomTop,
  sortElementsTopLeftBottomRight,
  sortElementsTopRightBottomLeft
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
    this._originalOutgoing = new Map()
    this._originalIncoming = new Map()
  }

  get incoming(){
    return !this.isFlipped ? this._originalIncoming : this._originalOutgoing
  }

  get outgoing(){
    return !this.isFlipped ? this._originalOutgoing : this._originalIncoming
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

    this._originalOutgoing.delete(element);
    this._originalIncoming.delete(element);

    // удаляем из списка исходящих других вершин
    for (const [keyElement, edges] of this._originalOutgoing) {

      const hasAsTarget = edges.some(edge => edge.target === element)
      if (!hasAsTarget) continue;
      const newEdges = edges.filter(edge => edge.target !== element)
      // для оптимизации чтобы не шарашило по всем
      if (newEdges.length === edges.length) continue;
      this._originalOutgoing.set(keyElement, newEdges)
    }

    // удаляем из списка входящих других вершин
    for (const [keyElement, edges] of this._originalIncoming) {
      const hasAsSource = edges.some(edge => edge.source === element)
      if (!hasAsSource) continue;

      const newEdges = edges.filter(edge => edge.source !== element)
      // для оптимизации чтобы не шарашило по всем
      if (newEdges.length === edges.length) continue;
      this._originalIncoming.set(keyElement, newEdges)
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
    // TODO: Need tests for reverse
    const existingSource = this._originalOutgoing.get(source);
    if (existingSource) {
      existingSource.push(edge)
    }else {
      this._originalOutgoing.set(source, [edge])
    }

    // добавляем в incoming
    const existingTarget = this._originalIncoming.get(target);
    if (existingTarget) {
      existingTarget.push(edge)
    }else {
      this._originalIncoming.set(target, [edge])
    }
  }

  /**
   *
   * @param element
   * @private
   */
  _createNewEdgesFor(element) {

    //получаем исходящие из хоста
    // TODO: сделать сортировку?
    const outgoingFromHost = [...this.getOutgoingFromHost(element)]
        .filter(item => this.hasElement(item))
    for (const outgoing of outgoingFromHost) {
      const edge = new Edge(element, outgoing, this)
      this._addEdgeToGrid(edge)
    }

    // получаем исходящие из boundary
    const outgoingFromBoundary = [...this.getOutgoingFromBoundary(element)]
        .filter(item => this.hasElement(item))
    for (const outgoing of outgoingFromBoundary) {
      const edge = new Edge(element, outgoing, this, true)
      this._addEdgeToGrid(edge)
    }

    // входящие из host
    const incomingFromHost = [...this.getIncomingFromHost(element)]
        .filter(item => this.hasElement(item))
    for (const incoming of incomingFromHost) {
      const edge = new Edge(incoming, element, this)
      this._addEdgeToGrid(edge)
    }

    // входящие из boundary
    const incomingFromBoundaryHost = [...this.getIncomingFromBoundaryHost(element)]
        .filter(item => this.hasElement(item))
    for (const incoming of incomingFromBoundaryHost) {
      const edge = new Edge(incoming,element, this, true)
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
    for (const edge of this._allEdges) {
      for (const segment of edge.path) {
        const {position: [segmentRow, segmentCol], hCross, vCross} = segment
        if (segmentRow === row && segmentCol === col && ((byVertical && vCross)||(hCross && !byVertical))) return true
      }
    }
  }

  get _allEdges () {
    return new Set ( [...this._originalOutgoing.values()].flat())
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
    for (const edge of this._allEdges) {
      for (const segment of edge.path) {
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

    const sortedElements = [...this.elements].sort(sortElementsTopRightBottomLeft(this))

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
    const edges = [...this.getAllExistingEdgesFor(element)]
        .filter(edge => edge.direction === 'N_S' || edge.direction === 'S_N')

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
    const edges = [...this.getAllExistingEdgesFor(element)]
        .filter(edge => edge.direction === 'W_E' || edge.direction === 'E_W')

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

  getExistingOutgoingEdgesFor(element) {
    return this.outgoing.get(element) ?? []
  }

  getExistingIncomingEdgesFor(element) {
    return this.incoming.get(element) ?? []
  }

  getAllExistingEdgesFor(element) {
    const outgoingEdges = this.getExistingOutgoingEdgesFor(element)
    const incomingEdges = this.getExistingIncomingEdgesFor(element)
    return new Set([...outgoingEdges, ...incomingEdges])
  }

}
