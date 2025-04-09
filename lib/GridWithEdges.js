import { Grid } from './Grid.js';
import { Edge } from './Edge.js';
import {
  getOutgoingElements,
  getHostIncoming,
  getAttachedOutgoingElements,
  getBoundaryIncomingHosts,
} from './utils/elementUtils.js';

import {
  sortColsLeftRightRowsBottomTop,
  sortElementsTopRightBottomLeft
} from './utils/layoutUtils.js';


/**
 * @typedef {[number, number]} Position
 * numbers must be integer
 */

/**
 * @typedef {{position: Position, vCross: boolean, hCross: boolean}} PathSegment
 */

export class GridWithEdges extends Grid {
  constructor() {
    super();
    this._originalOutgoing = new Map();
    this._originalIncoming = new Map();
  }

  get incoming() {
    return !this.isFlipped ? this._originalIncoming : this._originalOutgoing;
  }

  get outgoing() {
    return !this.isFlipped ? this._originalOutgoing : this._originalIncoming;
  }


  /**
   *
   * @param element
   * @param {[number, number]} position - numbers are integer
   */
  add(element, position) {
    super.add(element, position);
    this._createNewEdgesFor(element);
  }

  removeElement(element) {
    this._removeEdgesFor(element);
    super.removeElement(element);
  }

  move(element, toPosition) {
    this.removeElement(element);
    this.add(element, toPosition);
  }

  _removeEdgesFor(element) {

    // при удалении элемента надо удалить его ребра, а так же ребра из других вершин где есть эта
    if (!this.hasElement(element)) return;

    // удаляем свои ребра

    this._originalOutgoing.delete(element);
    this._originalIncoming.delete(element);

    // удаляем из списка исходящих других вершин
    for (const [ keyElement, edges ] of this._originalOutgoing) {

      const hasAsTarget = edges.some(edge => edge.target === element);
      if (!hasAsTarget) continue;
      const newEdges = edges.filter(edge => edge.target !== element);

      // для оптимизации чтобы не шарашило по всем
      if (newEdges.length === edges.length) continue;
      this._originalOutgoing.set(keyElement, newEdges);
    }

    // удаляем из списка входящих других вершин
    for (const [ keyElement, edges ] of this._originalIncoming) {
      const hasAsSource = edges.some(edge => edge.source === element);
      if (!hasAsSource) continue;

      const newEdges = edges.filter(edge => edge.source !== element);

      // для оптимизации чтобы не шарашило по всем
      if (newEdges.length === edges.length) continue;
      this._originalIncoming.set(keyElement, newEdges);
    }
  }

  /**
   * Проверка существования для НОВЫХ ребер
   * Со старыми только через мапу
   * @param edge
   * @returns {*}
   * @private
   */
  _edgeIsExist(edge) {
    const { source, sourcePosition, target, targetPosition } = edge;
    return source && sourcePosition && target && targetPosition;
  }

  _addEdgeToGrid(edge) {
    if (!this._edgeIsExist(edge)) return;

    const { _originalSource: source, _originalTarget: target } = edge;

    // добавляем в outgoing
    // TODO: Need tests for reverse
    const existingSource = this._originalOutgoing.get(source);
    if (existingSource) {
      existingSource.push(edge);
    } else {
      this._originalOutgoing.set(source, [ edge ]);
    }

    // добавляем в incoming
    const existingTarget = this._originalIncoming.get(target);
    if (existingTarget) {
      existingTarget.push(edge);
    } else {
      this._originalIncoming.set(target, [ edge ]);
    }
  }

  /**
   *
   * @param element
   * @private
   */
  _createNewEdgesFor(element) {

    // получаем исходящие из хоста
    // TODO: сделать сортировку?
    // Работать только по original при вставке
    const outgoingFromHost = getOutgoingElements(element)
      .filter(item => this.hasElement(item));
    for (const outgoing of outgoingFromHost) {

      // Ребро должно инициализироваться оригинальными сорс и target
      const edge = new Edge(element, outgoing, this);
      this._addEdgeToGrid(edge);
    }

    // получаем исходящие из boundary
    const outgoingFromBoundary = getAttachedOutgoingElements(element)
      .filter(item => this.hasElement(item));
    for (const outgoing of outgoingFromBoundary) {
      const edge = new Edge(element, outgoing, this, true);
      this._addEdgeToGrid(edge);
    }

    // входящие из host
    const incomingFromHost = getHostIncoming (element)
      .filter(item => this.hasElement(item));
    for (const incoming of incomingFromHost) {
      const edge = new Edge(incoming, element, this);
      this._addEdgeToGrid(edge);
    }

    // входящие из boundary
    const incomingFromBoundaryHost = getBoundaryIncomingHosts (element)
      .filter(item => this.hasElement(item));
    for (const incoming of incomingFromBoundaryHost) {
      const edge = new Edge(incoming,element, this, true);
      this._addEdgeToGrid(edge);
    }
  }

  // Возвращает исходящие только из элемента
  getOutgoingFromHost(element) {
    return !this.isFlipped ? new Set(getOutgoingElements(element)) : new Set(getHostIncoming (element));
  }

  // Возвращает исходящие только из boundary элемента
  getOutgoingFromBoundary(element) {
    return !this.isFlipped ? new Set (getAttachedOutgoingElements(element)) : new Set();
  }

  // Возвращает входящие только в элемент
  getIncomingFromHost(element) {
    return !this.isFlipped ? new Set(getHostIncoming (element)) : new Set(getOutgoingElements(element));
  }

  // Возвращает входящие только в boundary
  getIncomingFromBoundaryHost(element) {
    return !this.isFlipped ? new Set (getBoundaryIncomingHosts (element)) : new Set ();
  }

  getOutgoingElementsFor(element) {
    if (!element) return [];
    const outgoingFromHost = this.getOutgoingFromHost (element);
    const outgoingFromBoundary = this.getOutgoingFromBoundary (element);

    return new Set ([ ...outgoingFromHost, ...outgoingFromBoundary ]);
  }

  getIncomingElementsFor(element) {
    if (!element) return [];
    const incomingFromHost = this.getIncomingFromHost (element);
    const incomingFromBoundaryHost = this.getIncomingFromBoundaryHost (element);

    return new Set ([ ...incomingFromHost, ...incomingFromBoundaryHost ]);
  }

  /** @typedef {[number, number]} Position*/

  /**
   * @param {Position} position
   * @param {boolean} byVertical
   * @returns {boolean}
   */
  isCrossed(position, byVertical) {

    for (const edge of this._allEdges) {

      // быстрый вариант
      if (edge.isIntersect(position, byVertical)) return true;
    }
  }

  get _allEdges() {
    return new Set ([ ...this._originalOutgoing.values() ].flat());
  }

  /**
   * Экспериментальная функция с херовой производительностью
   * @param grid
   */
  shakeItHorizontal() {

    const sortedElements = [ ...this.elements ].sort(sortColsLeftRightRowsBottomTop (this)).reverse();

    while (sortedElements.length > 0) {

      // работаем по первому элементу
      const element = sortedElements.pop();

      // получаем вертикальную цепочку
      // удаляем из стека sortedElements все элементы из цепочки
      const verticalChain = this.getVerticalChain(element);
      for (const chainElement of verticalChain) {
        const deleteIndex = sortedElements.indexOf(chainElement);
        if (deleteIndex >= 0) {
          sortedElements.splice(sortedElements.indexOf(chainElement), 1);
        }
      }

      // проверяем можно ли двинуть цепочку влево
      // не одна из позиций не должна быть занята или иметь вертикального пересечения
      // - цепочка не должна удлиниться
      const [ , baseCol ] = this.find([ ...verticalChain ][0]);
      const rows = [ ...verticalChain ].map(item => {
        const itemPosition = this.find(item);
        return itemPosition[0];
      });

      // двигаться назад не вариант если в цепочка в первой колонке
      if (baseCol <= 0) continue;

      for (let col = baseCol - 1; col >= 0; col--) {
        const allPositionsAreFine = rows.every(row => {
          return !this.isCrossed([ row, col ],true) && !this.get(row, col);
        });

        if (!allPositionsAreFine) break;

        // пробно перемещаем все элементы из цепочки на новые места
        for (const chainElement of verticalChain) {
          const chainElementPosition = this.find(chainElement);
          this.move(chainElement, [ chainElementPosition[0], col ]);
        }

        // проверяем не образовалось ли новых пересечений пока по старинке
        // TODO: ПРОБУЕМ ПРОВЕРЯТЬ ТОЛЬКО РЕБРА СДВИНУТЫХ
        const hasNewCrosses = this.hasAnyCross();
        const newVerticalChain = this.getVerticalChain(element);
        if (hasNewCrosses || newVerticalChain.size > verticalChain.size) {

          // вертаем все элементы взад
          for (const chainElement of verticalChain) {
            const chainElementPosition = this.find(chainElement);
            this.move(chainElement, [ chainElementPosition[0], col + 1 ]);
          }
          break;
        }
      }

      // в конце каждого прохода шринкаем чтобы не ходить по пустым местам
      this.shrinkCols();
    }
  }

  /**
   * Экспериментальная функция с херовой производительностью
   * @param grid
   */
  shakeItVertical() {

    const sortedElements = [ ...this.elements ].sort(sortElementsTopRightBottomLeft(this)).reverse();

    while (sortedElements.length > 0) {

      // работаем по первому элементу
      const element = sortedElements.pop();

      // получаем вертикальную цепочку
      // удаляем из стека sortedElements все элементы из цепочки
      const horizontalChain = this.getHorizontalChain(element);
      for (const chainElement of horizontalChain) {
        const deleteIndex = sortedElements.indexOf(chainElement);
        if (deleteIndex >= 0) {
          sortedElements.splice(deleteIndex, 1);
        }
      }

      // проверяем можно ли двинуть цепочку вверх
      // не одна из позиций не должна быть занята или иметь вертикального пересечения
      // - цепочка не должна удлиниться
      const [ baseRow ] = this.find([ ...horizontalChain ][0]);
      const cols = [ ...horizontalChain ].map(item => {
        const itemPosition = this.find(item);
        return itemPosition[1];
      });

      // двигаться вверх не вариант если цепочка в первой строке
      if (baseRow <= 0) continue;

      for (let row = baseRow - 1; row >= 0; row--) {
        const allPositionsAreFine = cols.every(col => {
          return !this.isCrossed([ [ row, col ] ]) && !this.get(row, col);
        });

        if (!allPositionsAreFine) break;

        // пробно перемещаем все элементы из цепочки на новые места
        for (const chainElement of horizontalChain) {
          const chainElementPosition = this.find(chainElement);
          this.move(chainElement, [ row, chainElementPosition[1] ]);
        }

        // проверяем не образовалось ли новых пересечений пока по старинке
        // и не удлинилась ли цепочка
        const hasNewCrosses = this.hasAnyCross();

        const newHorizontalChain = this.getHorizontalChain(element);
        if (hasNewCrosses || newHorizontalChain.size > horizontalChain.size) {

          // вертаем все элементы взад
          for (const chainElement of horizontalChain) {
            const chainElementPosition = this.find(chainElement);
            this.move(chainElement, [ row + 1 , chainElementPosition[1] ]);
          }
          break;
        }
      }

      // после каждого прохода шринкаем строки чтобы не ходить по пустым местам
      this.shrinkRows();
    }

  }

  /**
   * Пока так наличие пересечений определим
   * @param {Edge[]=} edges
   * @returns {boolean}
   */
  hasAnyCross(edges) {
    const executedEdges = edges ? edges : this._allEdges;

    // перебираем все исходящие ребра
    for (const edge of executedEdges) {
      for (const segment of edge.path) {
        const { position: [ segmentRow, segmentCol ], hCross, vCross } = segment;
        if ((hCross || vCross) && this.get(segmentRow, segmentCol)) return [ segmentRow, segmentCol, edge ];
      }
    }

    return false;
  }



  getVerticalChain(element, oldChain) {

    const chain = !oldChain ? new Set() : oldChain;
    if (!element) return chain;

    const elementPosition = this.find(element);
    if (!elementPosition) return chain;

    chain.add(element);

    const edges = [ ...this.getAllExistingEdgesFor(element) ]
      .filter(edge => edge.direction === 'N_S' || edge.direction === 'S_N');

    for (const edge of edges) {
      const nextElement = edge.source === element ? edge.target : edge.source;
      if (!chain.has(nextElement)) {
        const nextChain = this.getVerticalChain(nextElement, chain);
        for (const nextChainEl of nextChain) {
          chain.add(nextChainEl);
        }
      }
    }

    return chain;
  }

  getHorizontalChain(element, oldChain) {
    const chain = !oldChain ? new Set() : oldChain;
    if (!element) return chain;

    const elementPosition = this.find(element);
    if (!elementPosition) return chain;

    chain.add(element);

    const edges = [ ...this.getAllExistingEdgesFor(element) ]
      .filter(edge => edge.direction === 'W_E' || edge.direction === 'E_W');

    for (const edge of edges) {
      const nextElement = edge.source === element ? edge.target : edge.source;
      if (!chain.has(nextElement)) {
        const nextChain = this.getHorizontalChain(nextElement, chain);
        for (const nextChainEl of nextChain) {
          chain.add(nextChainEl);
        }
      }
    }
    return chain;
  }

  getExistingOutgoingEdgesFor(element) {
    return this.outgoing.get(element) || [];
  }

  getExistingIncomingEdgesFor(element) {
    return this.incoming.get(element) || [];
  }

  getAllExistingEdgesFor(element) {
    const outgoingEdges = this.getExistingOutgoingEdgesFor(element);
    const incomingEdges = this.getExistingIncomingEdgesFor(element);
    return new Set([ ...outgoingEdges, ...incomingEdges ]);
  }

  getElementsInRow(rowIndex) {
    return new Set (this._grid[rowIndex].filter(element => element != null));
  }

  _separateGrid() {
    const grids = [];

    let maxRow = 0;
    let nextGrid = this._createGridWith(this.rowCount, this.colCount);
    let nextElements = new Set ();

    const visited = new Set();

    if (this.rowCount > maxRow) {

      const firstElements = this.getElementsInRow(maxRow);
      nextElements = new Set ([ ...nextElements, ...firstElements ]);
    }



    while (nextElements.size > 0) {
      const nextElement = [ ...nextElements ].pop();
      const nextElementPosition = this.find(nextElement);
      nextGrid.add(nextElement, nextElementPosition);

      visited.add(nextElement);
      nextElements.delete(nextElement);

      const allEdges = this.getAllExistingEdgesFor(nextElement);

      if (allEdges.size === 0 && maxRow < nextElementPosition[0]) {
        maxRow = nextElementPosition[0];
      }

      for (const edge of allEdges) {
        const { source, target, sourcePosition, targetPosition } = edge;
        const oppositeElement = source === nextElement ? target : source;
        const oppositePosition = source === nextElement ? targetPosition : sourcePosition;

        // do not add self-loop
        if (oppositeElement !== nextElement && !visited.has(oppositeElement)) {

          nextElements.add(oppositeElement);
          if (oppositePosition[0] !== maxRow) {

            const elementsInRow = this.getElementsInRow(oppositePosition[0]);

            for (const elementInRow of elementsInRow) {
              if (!visited.has(elementInRow)) nextElements.add(elementInRow);
            }
          }

          if (oppositePosition[0] > maxRow) maxRow = oppositePosition[0];
        }
      }

      // дошли до конца графа
      if (nextElements.size === 0) {
        grids.push(nextGrid);
        nextGrid = this._createGridWith(this.rowCount, this.colCount);

        // добавить первый элемент нового графа
        if (this.rowCount - 1 >= maxRow + 1) {
          const firstElements = this.getElementsInRow(maxRow + 1);

          nextElements = new Set ([ ...nextElements, ...firstElements ]);
        }
      }
    }

    // после разделения обрабатываем каждый грид
    for (const grid of grids) {
      grid.shrinkCols();
      grid.shrinkRows();
      grid.shakeItHorizontal();
      grid.shakeItVertical();
    }

    return grids;
  }

  _mergeGrids(grids) {
    const newGrid = new GridWithEdges();

    for (const grid of grids) {
      newGrid._grid = newGrid._grid.concat(grid._grid);
      newGrid._elements = new Set([ ...newGrid._elements, ...grid._elements ]);
      newGrid._originalIncoming = new Map ([ ...newGrid._originalIncoming, ...grid._originalIncoming ]);
      newGrid._originalOutgoing = new Map ([ ...newGrid._originalOutgoing, ...grid._originalOutgoing ]);
    }

    return newGrid;
  }

  getResultGrid() {
    const mergedGrid = this._mergeGrids(this._separateGrid());
    mergedGrid.toRectangle();
    return mergedGrid;
  }


  _createCrossGrid() {

    // создаем заготовку
    const crossGrid = [];
    for (let i = 0 ; i < this.rowCount; i++) {
      crossGrid.push(Array(this.colCount));
    }

    // проходим по всем элементам основного грида и записываем в текущий
    for (const element of this._elements) {

      // элемент
      const [ elementRow, elementCol ] = this.find(element);

      // ребра
      const incoming = this.incoming.get(element) || [];
      const outgoing = this.outgoing.get(element) || [];
      const hasToSouth = [ ...outgoing, ...incoming ].some(edge => {
        const { source, direction } = edge;
        if (source === element && (direction === 'N_S' || direction === 'NW_SE' || direction === 'NE_SW')) return true;
        if (source !== element && (direction === 'S_N' || direction === 'SW_NE' || direction === 'SE_SW')) return true;
      });

      for (const edge of outgoing) {
        for (const segment of edge.path) {
          const { position: [ segmentRow, segmentCol ], vCross, hCross } = segment;
          const crossGridElement = crossGrid[segmentRow][segmentCol] || {};
          if (vCross) crossGridElement.vCross = vCross;
          if (hCross) crossGridElement.hCross = hCross;
          crossGrid[segmentRow][segmentCol] = crossGridElement;
        }
      }

      // размещаем основную инфу
      crossGrid[elementRow][elementCol] = { ...(crossGrid[elementRow][elementCol] || {}), ...{ element, incoming, outgoing, hasToSouth } };
    }

    return crossGrid;

  }

  _createGridWith(rowCount, colCount) {
    const crossGrid = new GridWithEdges();
    for (let i = 0 ; i < rowCount; i++) {
      crossGrid._grid.push(Array(colCount));
    }
    return crossGrid;
  }
}
