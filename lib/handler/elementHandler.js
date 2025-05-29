import { is, getDefaultSize } from '../di/DiUtil.js';
import { DEFAULT_CELL_HEIGHT, DEFAULT_CELL_WIDTH, getBounds } from '../utils/layoutUtils.js';

export default {
  'createElementDi': ({ element, row, col, diFactory, shift }) => {

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