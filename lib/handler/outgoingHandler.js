import { connectElements } from '../utils/layoutUtil.js';
import { is } from '../di/DiUtil.js';
import {
  findElementInTree,
  getAdjacentElements,
  getIncomingElements,
  getOutgoingElements
} from '../utils/elementUtils.js';

export default {
  'addToGrid': ({ element, grid, stack }) => {
    let nextElements = [];

    // Handle outgoing paths without boundaryEvents
    // Maybe later it will merge
    const outgoing = !grid.isFlipped ? getOutgoingElements(element) : getIncomingElements(element);

    let previousElement = null;

    if (outgoing.length > 1 && isNextElementTasks(outgoing)) {
      grid.adjustGridPosition(element);
    }

    outgoing.forEach(nextElement => {
      if (grid.hasElement(nextElement)) {

        // Check for crossovers and shift right if necessary
        const nextElementPosition = grid.find(nextElement) || [];
        const crossed = grid.getOnDirectionElementsBetween (element, nextElement, 'LEFT')

        if (crossed.size > 0) {
          grid.expandXAxisWith(nextElementPosition, true, true)
        }
        previousElement = nextElement;
        return;
      }

      // Prevent revisiting future incoming elements and ensure proper traversal without early exit
      // The graph breaks here in isFutureIncoming if there are starting throwEvents hanging in the air
      // need refactoring
      if ((previousElement || stack.length > 0) && isFutureIncoming(nextElement, grid.elements, grid.isFlipped) && !checkForLoop(nextElement, grid.elements)) {
        return;
      }

      if (!previousElement) {
        addAfter(element, nextElement, grid);
      } else {
        const [ , prevCol ] = grid.find(previousElement);
        const [ , elCol ] = grid.find(element);
        if (prevCol <= elCol) {
          addAfter(element, nextElement, grid);
        }
        else {
          addBelow(element, previousElement, nextElement, grid);
        }
      }

      // Avoid self-loops
      if (nextElement !== element) {
        previousElement = nextElement;
      }

      nextElements.unshift(nextElement);
    });

    // Sort elements by priority to ensure proper stack placement
    nextElements = sortByType(nextElements, 'bpmn:ExclusiveGateway'); // TODO: sort by priority
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

function sortByType(arr, type) {
  const nonMatching = arr.filter(item => !is(item, type));
  const matching = arr.filter(item => is(item, type));

  return [ ...matching, ...nonMatching ];
}

function checkForLoop(element, visited) {
  for (const incomingElement of element.incoming) {
    if (!visited.has(incomingElement.sourceRef)) {
      return findElementInTree(element, incomingElement.sourceRef);
    }
  }
}

function isFutureIncoming(element, visited, reverse) {
  const els = !reverse ? element.incoming : element.outgoing;

  if (els.length > 1) {
    for (const incomingElement of els) {
      if (!visited.has(incomingElement.sourceRef)) {
        return true;
      }
    }
  }
  return false;
}

function isNextElementTasks(elements) {
  return elements.every(element => is(element, 'bpmn:Task'));
}

export function addAfter(element, nextElement, grid) {
  const [ elementRow, elementCol ] = grid.find(element) || [];

  const occupiedElement = grid.get(elementRow, elementCol + 1);

  if (occupiedElement) {
    grid.expandXAxisWith([ elementRow, elementCol ]);
  }
  // Todo: add try catch
  grid.add(nextElement, [ elementRow, elementCol + 1 ]);

  // Crossover fix
  const onTopElements = grid.getAbove([ elementRow, elementCol + 1 ]);
  const incomingAndOutgoingElements = [...onTopElements].reduce((acc, cur) => {

    const adjacentElements = getAdjacentElements(cur).filter(el => grid.hasElement(el));
    for (const adjacentElement of adjacentElements) {
      const [ adjacentElementRow ] = grid.find(adjacentElement) || [];
      if (adjacentElementRow >= elementRow) {
        acc.add(adjacentElement);
      }
    }
    return acc;
  }, new Set());

  const nextElementPosition = grid.find(nextElement) || [];
  if (incomingAndOutgoingElements.size > 0) {
    grid.expandXAxisWith(nextElementPosition, true, true)
  }
}

export function addBelow(element, previousElement, nextElement, grid) {
  const [ previousElementRow, previousElementCol ] = grid.find(previousElement) || [];
  const occupiedElement = grid.get(previousElementRow + 1, previousElementCol);
  if (occupiedElement || grid.rowCount === previousElementRow + 1) {
    grid.createRow(previousElementRow);
  }
  // Todo: add try catch
  grid.add(nextElement, [previousElementRow + 1, previousElementCol]);

  // eliminate intersections after placement
  // Does the new element fall within the vertical intersections of the previous element?
  // don't look higher up the grid, as it has already been checked
  const crossed = new Set();
  getAdjacentElements(previousElement).filter(adjacentElement => {
    const [ adjacentElementRow ] = grid.find(adjacentElement) || [];
    return previousElementRow <= adjacentElementRow;
  }).forEach(filteredAdjacentElement => {

    // get intersecting for filteredAdjacentElement - previousElement
    // пересекается ли nextElement
    const leftCrossed = grid.getOnDirectionElementsBetween (filteredAdjacentElement, previousElement, 'LEFT')
    const rightCrossed = grid.getOnDirectionElementsBetween (filteredAdjacentElement, previousElement, 'RIGHT')
    const crossedVertically = new Set([...leftCrossed, ...rightCrossed]);
    if (crossedVertically.has(nextElement)) {
      crossed.add(nextElement)
    }
  });

  const xElements = grid.getOnDirectionElementsBetween (element, nextElement, 'LEFT')

  if (crossed.size > 0 && xElements.size > 0) {
    const [ nextRow, nextCol ] = grid.find(nextElement) || [];
    grid.createRowAndShift([ nextRow - 1, nextCol ]);

    grid.expandXAxisWith([nextRow, nextCol], true, true)
  }

  // for corner edges
  else if (xElements.size > 0) {

    // if there are outgoing ones, then we move it down
    // if there is an intersected element that is on the same line as the next one,
    // and he has outgoing in unplaced, then we add a line
    // raise up everyone if it after next  (also next)
    const [ nRow, nCol ] = grid.find(nextElement);
    const xOut = [...xElements].filter(xEl => {
      const [ xElRow, xElCol ] = grid.find(xEl) || [];
      const sameRow = xElRow === nRow;
      const minusOneCol = xElCol === nCol - 1;

      // not in grid
      const xElOutgoings = !grid.isFlipped ? getOutgoingElements(xEl) : getIncomingElements(xEl)
      const xElOutgoingsInGrid =  [...xElOutgoings].filter(item => !grid.hasElement(item));

      return (sameRow && minusOneCol && xElOutgoingsInGrid.length > 0);
    });

    if (xOut.length > 0) {
      grid.createRowAndShift([ nRow - 1 ]);
    } else {
      const topElement = grid.getTopElements([element, nextElement])

      if (topElement.size === 1) {
        // shift around the top element
        const topPosition = grid.find([...topElement][0]);
        grid.expandXAxisWith(topPosition, true);
      }
    }
  }
}