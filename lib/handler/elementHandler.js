import { is } from '../di/DiUtil.js';
import { DEFAULT_CELL_HEIGHT, DEFAULT_CELL_WIDTH, getBounds } from '../utils/layoutUtils.js';

export default {
  'createElementDi': ({ element, row, col, diFactory, shift, xShift }) => {

    const bounds = getBounds(element, row, col, false, shift, xShift);

    // Todo: костыль для проверки работоспособности
    if (element.isExpanded && element.grid) {
      const { rowCount = 1, colCount = 2 } = element.grid;
      bounds.width = colCount * DEFAULT_CELL_WIDTH + DEFAULT_CELL_WIDTH;
      bounds.height = rowCount === 0 ? 1 * DEFAULT_CELL_HEIGHT + DEFAULT_CELL_HEIGHT : rowCount * DEFAULT_CELL_HEIGHT + DEFAULT_CELL_HEIGHT;
    }

    const options = {
      id: element.id + '_di'
    };

    // Todo: костыль для проверки работоспособности
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