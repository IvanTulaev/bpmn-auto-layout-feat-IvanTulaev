import {
  connectElements,
} from '../utils/layoutUtils.js';

export default {
  'createConnectionDi': ({ element, row, col, layoutGrid, diFactory, shift }) => {
    const outgoing = (element.outgoing || [])
      .filter(item => layoutGrid.elements.has(item.targetRef));

    return outgoing.map(out => {
      const target = out.targetRef;
      const waypoints = connectElements(element, target, layoutGrid, false, shift);

      return diFactory.createDiEdge(out, waypoints, {
        id: out.id + '_di'
      });
    });
  }
};

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
