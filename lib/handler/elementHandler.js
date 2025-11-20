import { is, getDefaultSize } from '../di/DiUtil.js';
import { DEFAULT_CELL_HEIGHT, DEFAULT_CELL_WIDTH, getBounds } from '../utils/layoutUtils.js';

export default {
  'createElementDi': ({ element, row, col, diFactory, shift }) => {
    if (element.di) return;

    if (element.$type === 'bpmn:BoundaryEvent') {
      return createBEl({ element, row, col, diFactory, shift });
    }

    const bounds = getBounds(element, row, col, shift);

    // Todo: костыль для проверки работоспособности
    if (element.isExpanded && element.grid) {
      const { width, height } = getDefaultSize(element);
      const { rowCount, colCount } = element.grid;
      bounds.width = colCount * DEFAULT_CELL_WIDTH + width;
      bounds.height = rowCount * DEFAULT_CELL_HEIGHT + height;
    }

    const options = {
      id: element.id + '_di'
    };

    if (element.isExpanded) {
      options.isExpanded = true;
    }

    if (is(element, 'bpmn:ExclusiveGateway')) {
      options.isMarkerVisible = true;
    }

    const shapeDi = diFactory.createDiShape(element, bounds, options);
    element.di = shapeDi;
    element.gridPosition = { row, col };
    return shapeDi;
  }
};

function createBEl({ element, row, col, diFactory, shift }) {
  const hostBounds = element.attachedToRef.di.bounds;
  if (!hostBounds) throw new Error(`Create DI for ${element.id}. Nо hostBounds`);
  const DIs = [];

  // получаем соседние boundary
  const executedElements = element.$parent.flowElements.filter(item => item.attachedToRef === element.attachedToRef);

  executedElements.sort((a, b) => {
    const aOutCount = a.outgoing ? a.outgoing.length : 0;
    const bOutCount = b.outgoing ? b.outgoing.length : 0;
    return aOutCount - bOutCount;
  }).forEach((att, i, arr) => {
    att.gridPosition = { row, col };
    const bounds = getBounds(att, row, col, shift, element.attachedToRef);

    // distribute along lower edge
    bounds.x = hostBounds.x + (i + 1) * (hostBounds.width / (arr.length + 1)) - bounds.width / 2;

    const attacherDi = diFactory.createDiShape(att, bounds, {
      id: att.id + '_di'
    });
    att.di = attacherDi;
    att.gridPosition = { row, col };

    DIs.push(attacherDi);
  });
  return DIs;
}