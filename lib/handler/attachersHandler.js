import {
  DEFAULT_CELL_HEIGHT,
  DEFAULT_CELL_WIDTH,
  connectElements,
  getMid,
  getDockingPoint,
} from '../utils/layoutUtils.js';


export default {
  'createConnectionDi': ({ element, row, col, layoutGrid, diFactory, shift }) => {
    const attachers = (element.attachers || []).sort((a, b) => {
      const aOutCount = a.outgoing ? a.outgoing.length : 0;
      const bOutCount = b.outgoing ? b.outgoing.length : 0;
      return aOutCount - bOutCount;
    });

    return attachers.flatMap(att => {
      const outgoing = (att.outgoing || [])
        .filter(item => layoutGrid.elements.has(item.targetRef));

      return outgoing.map(out => {
        const target = out.targetRef;
        const waypoints = connectElements(att, target, layoutGrid, true, shift);

        // Correct waypoints if they don't automatically attach to the bottom
        ensureExitBottom(att, waypoints, [ row, col ]);

        return diFactory.createDiEdge(out, waypoints, {
          id: out.id + '_di'
        });
      });
    });
  }
};

function ensureExitBottom(source, waypoints, [ row, col ]) {
  const sourceDi = source.di;
  const sourceBounds = sourceDi.get('bounds');
  const sourceMid = getMid(sourceBounds);
  const dockingPoint = getDockingPoint(sourceMid, sourceBounds, 'b');
  if (waypoints[0].x === dockingPoint.x && waypoints[0].y === dockingPoint.y) {
    return;
  }

  const baseSourceGrid = source.grid || source.attachedToRef?.grid;

  if (waypoints.length === 2) {
    const newStart = [
      dockingPoint,
      { x: dockingPoint.x, y: !baseSourceGrid ? (row + 1) * DEFAULT_CELL_HEIGHT : (row + baseSourceGrid.getGridDimensions()[0] + 1) * DEFAULT_CELL_HEIGHT },
      { x: !baseSourceGrid ? (col + 1) * DEFAULT_CELL_WIDTH : (col + baseSourceGrid.getGridDimensions()[1] + 1) * DEFAULT_CELL_WIDTH, y: !baseSourceGrid ? (row + 1) * DEFAULT_CELL_HEIGHT : (row + baseSourceGrid.getGridDimensions()[0] + 1) * DEFAULT_CELL_HEIGHT },
      { x: !baseSourceGrid ? (col + 1) * DEFAULT_CELL_WIDTH : (col + baseSourceGrid.getGridDimensions()[1] + 1) * DEFAULT_CELL_WIDTH, y: !baseSourceGrid ? (row + 0.5) * DEFAULT_CELL_HEIGHT : row * DEFAULT_CELL_HEIGHT + DEFAULT_CELL_HEIGHT / 2 },
    ];

    waypoints.splice(0, 1, ...newStart);
    return;
  }

  // add waypoints to exit bottom and connect to existing path
  const newStart = [
    dockingPoint,
    { x: dockingPoint.x, y: !baseSourceGrid ? (row + 1) * DEFAULT_CELL_HEIGHT : (row + baseSourceGrid.getGridDimensions()[0] + 1) * DEFAULT_CELL_HEIGHT },
    { x: waypoints[1].x, y: !baseSourceGrid ? (row + 1) * DEFAULT_CELL_HEIGHT : (row + baseSourceGrid.getGridDimensions()[0] + 1) * DEFAULT_CELL_HEIGHT },
  ];

  waypoints.splice(0, 1, ...newStart);
}
