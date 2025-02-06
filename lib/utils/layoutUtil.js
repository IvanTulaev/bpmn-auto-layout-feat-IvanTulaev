import {getDefaultSize, is} from '../di/DiUtil.js';
import {getOutgoingElements} from './elementUtils.js'
import {getOutgoingFromHost, getExistElementEdges} from '../handler/outgoingHandler.js'

export const DEFAULT_CELL_WIDTH = 150;
export const DEFAULT_CELL_HEIGHT = 140;
const DEFAULT_VERTICAL_SHIFT = 30;

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
      const hasReversEdge = getOutgoingElements(target).includes(source)

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
