import {isValidPosition} from "./utils/layoutUtils.js";

export class Edge {
  constructor(source, target, grid, sourceIsBoundary) {
    // TODO: упасть с ошибкой если их нет в гриде?
    this._source = source;
    this._target = target;
    this._grid = grid;
    this._sourceIsBoundary = sourceIsBoundary;
  }

  get source(){
    return this._source;
  }

  get target(){
    return this._target;
  }

  get sourcePosition() {
    return this._grid.find(this._source)
  }

  get targetPosition() {
    return this._grid.find(this._target)
  }

  get direction() {
    return  getDirection(this.sourcePosition, this.targetPosition);
  }

  get path () {
    /**
     * @type {PathSegment[]}
     */
    const pathSegments = []
    if (this.direction === 'NO_DIRECTION') return pathSegments

    const [sourceRow, sourceCol] = this.sourcePosition
    const [targetRow, targetCol] = this.targetPosition

    if (this.direction === 'S_N') {

      //если sourceIsBoundary, то сразу идем в обход
      if (this._sourceIsBoundary) return pathSegments

      // проверяем есть ли элементы между sourcePosition, targetPosition
      // если есть, то ребро пойдет в обход
      // так же оно пойдет в обход если элементы на соседних клетках и есть обратное ребро targetPosition-sourcePosition
      let hasIntermediateElements =  this._grid.hasIntermediateElements(this.sourcePosition, this.targetPosition, true)
      // идем между ячейками грида
      if (hasIntermediateElements) return pathSegments


      let targetElementOutgoing = this._grid.outgoing.get(this.target) ?? []
      targetElementOutgoing = [...targetElementOutgoing].map(item => item.target)
      // идем в обход если есть ребро в противоположном направлении
      if (targetElementOutgoing.includes(this.source)) return pathSegments

      for (let rowIndex = sourceRow - 1; rowIndex > targetRow; rowIndex--) {
        pathSegments.push({position: [rowIndex, sourceCol], vCross: true})
      }
      return pathSegments
    }

    if (this.direction === 'SW_NE') {

      //если sourceIsBoundary то пропускаем горизонтальную часть
      if (!this._sourceIsBoundary) {
        //move right then up
        for (let colIndex = sourceCol + 1; colIndex < targetCol; colIndex++) {
          pathSegments.push({position: [sourceRow, colIndex], hCross: true})
        }
      }

      //TODO: implement four corners for easy add rows and cols
      // add corner segment
      pathSegments.push({position: [sourceRow, targetCol], hCross: true, vCross: true})

      for (let rowIndex = sourceRow - 1; rowIndex > targetRow; rowIndex--) {
        pathSegments.push({position: [rowIndex, targetCol], vCross: true})
      }
      return pathSegments
    }

    if (this.direction === 'W_E') {
      // всегда идем вперед
      // пропускаем если sourceIsBoundary
      if (this._sourceIsBoundary) return pathSegments

      for (let colIndex = sourceCol + 1; colIndex < targetCol; colIndex++) {
        pathSegments.push({position: [sourceRow, colIndex], hCross: true})
      }
      return pathSegments
    }

    if (this.direction === 'NW_SE') {
      // идем сначала вниз, потом вправо так же и для sourceIsBoundary
      for (let rowIndex = sourceRow + 1; rowIndex < targetRow; rowIndex++) {
        pathSegments.push({position: [rowIndex, sourceCol], vCross: true})
      }
      pathSegments.push({position: [targetRow, sourceCol], vCross: true, hCross: true})

      for (let colIndex = sourceCol + 1; colIndex < targetCol; colIndex++) {
        pathSegments.push({position: [targetRow, colIndex], hCross: true})
      }
      return pathSegments
    }

    if (this.direction === 'N_S') {
      // всегда идем вниз так же и для sourceIsBoundary
      for (let rowIndex = sourceRow + 1; rowIndex < targetRow; rowIndex++) {
        pathSegments.push({position: [rowIndex, sourceCol], vCross: true})
      }
      return pathSegments
    }

    if (this.direction === 'NE_SW') {
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

    if (this.direction === 'E_W') {

      // здесь аналогично движению вверх
      // проверяем есть ли элементы между sourcePosition, targetPosition
      // если есть, то ребро пойдет в обход
      // так же оно пойдет в обход если элементы на соседних клетках и есть обратное ребро targetPosition-sourcePosition
      //для sourceIsBoundary всегда пропускаем
      if (this._sourceIsBoundary) return pathSegments

      let hasIntermediateElements =  this._grid.hasIntermediateElements(this.sourcePosition, this.targetPosition, true)
      // идем между ячейками грида
      if (hasIntermediateElements) return pathSegments

      let targetElementOutgoing = this._grid.outgoing.get(this.target) ?? []
      targetElementOutgoing = [...targetElementOutgoing].map(item => item.target)
      // идем в обход если есть ребро в противоположном направлении
      if (targetElementOutgoing.includes(this.source)) return pathSegments

      for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
        pathSegments.push({position: [sourceRow, colIndex], hCross: true})
      }

      return pathSegments
    }

    if (this.direction === 'SE_NW') {

      // для sourceIsBoundary пропускаем горизонталь
      if (!this._sourceIsBoundary) {
        // пробуем новую схему для хост-хост без обхода
        for (let colIndex = sourceCol - 1; colIndex > targetCol; colIndex--) {
          pathSegments.push({position: [sourceRow, colIndex], hCross: true})
        }
      }

      // угловой сегмент
      if (!this._sourceIsBoundary) {
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
   * @param {boolean} byVertical
   */
  crossedElements (byVertical) {
    const crossedElements = []
    for (const segment of this.path) {
      const [row, col ] = segment.position
      const element = this._grid.get(row, col)
      if (element && ((byVertical && segment.vCross) || (!byVertical && segment.hCross))) crossedElements.push(element)
    }
    return crossedElements
  }

  /**
   *
   * @param {boolean} byVertical
   */
  crossedElementsPositions (byVertical) {
    const crossedPositions = []
    for (const segment of this.path) {
      const [row, col ] = segment.position
      const element = this._grid.get(row, col)
      if (element && ((byVertical && segment.vCross) || (!byVertical && segment.hCross))) crossedPositions.push([row, col ])
    }
    return crossedPositions
  }
}

// handlers

/**
 * @typedef {('S_N' | 'SW_NE' | 'W_E' | 'NW_SE' | 'N_S' | 'NE_SW' | 'E_W' | 'SE_NW' | 'NO_DIRECTION')} Direction
 * - **S_N** - south to north
 * - **SW_NE** - south-west to north-east
 * - **W_E** - west to east
 * - **NW_SE** - north-west to south-east
 * - **N_S** - north to south
 * - **NE_SW** - north-east to south-west
 * - **E_W** - east to west
 * - **SE_NW** - south-east to north-west
 * - **NO_DIRECTION** - if it's not a vector but a point
 */

/**
 * Return 1 of 8 directions for 'vector' or 'POINT'
 * @param {Position} sourcePosition
 * @param {Position} targetPosition
 * @returns {Direction}
 */
export function getDirection(sourcePosition, targetPosition) {
  if (!isValidPosition(sourcePosition) || !isValidPosition(targetPosition)) return 'NO_DIRECTION';

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
}

