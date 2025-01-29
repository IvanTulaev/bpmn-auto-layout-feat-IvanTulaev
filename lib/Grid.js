export class Grid {
  constructor() {
    this._grid = [];
    this.isFlipped = false;
    this.elements = new Set()
  }

  get rowCount() {
    return this._grid.length;
  }

  add(element, position) {
    if (!this.isValidPosition(position)) {
      this._addStart(element);
      return
    }

    const [ row, col ] = position;

    if (!this._grid[row]) {
      this._grid[row] = [];
    }

    if (this._grid[row][col]) {
      throw new Error('Grid is occupied please ensure the place you insert at is not occupied');
    }

    this._grid[row][col] = element;
    this.elements.add(element);
  }

  createRow(afterIndex) {
    if (!afterIndex && !Number.isInteger(afterIndex)) {
      this._grid.push([]);
    }

    this._grid.splice(afterIndex + 1, 0, []);
  }

  _addStart(element) {
    this._grid.push([ element ]);
    this.elements.add(element);
  }

  /**
   * return position of element:
   * - [row: integer, col: integer] if element exist
   * - else undefined
   * @param element
   * @returns {number[] | undefined}
   */
  find(element) {
    let row, col;
    row = this._grid.findIndex((row) => {
      col = row.findIndex((el) => {
        return el === element;
      });
      return col !== -1;
    });

    if (this.isValidPosition([ row, col ])) {
      return [ row, col ];
    }
  }

  get(row, col) {
    return (this._grid[row] || [])[col];
  }

  getElementsInRange({ row: startRow, col: startCol }, { row: endRow, col: endCol }) {
    const elements = [];

    if (startRow > endRow) {
      [ startRow, endRow ] = [ endRow, startRow ];
    }

    if (startCol > endCol) {
      [ startCol, endCol ] = [ endCol, startCol ];
    }

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const element = this.get(row, col);

        if (element) {
          elements.push(element);
        }
      }
    }

    return elements;
  }

  adjustGridPosition(element) {
    let [ row, col ] = this.find(element) || [];
    const [ , maxCol ] = this.getGridDimensions();

    if (col < maxCol - 1) {

      // add element in next column
      this._grid[row].length = maxCol;
      this._grid[row][maxCol] = element;
      this._grid[row][col] = null;

    }
  }

  adjustRowForMultipleIncoming(elements, currentElement) {

    // filter only rows that currently exist, excluding any future or non-existent rows
    const lowestRow = this.getLowestRow(elements);

    const [ row , col ] = this.find(currentElement) || [];

    this._grid[lowestRow][col] = currentElement;
    this._grid[row][col] = null;
  }

  adjustColumnForMultipleIncoming(elements, currentElement) {
    const results = elements.map(element => this.find(element) || []);

    // filter only col that currently exist, excluding any future or non-existent col
    const maxCol = Math.max(...results
      .map(result => result[1])
      .filter(col => col >= 0));

    const [ row , col ] = this.find(currentElement) || [];

    // add to the next column
    if (maxCol + 1 > col) {
      this._grid[row][maxCol + 1] = currentElement;
      this._grid[row][col] = null;
    }
  }

  getGridDimensions() {
    const numRows = this._grid.length;
    let maxCols = 0;

    for (let i = 0; i < numRows; i++) {
      const currentRowLength = this._grid[i].length;
      if (currentRowLength > maxCols) {
        maxCols = currentRowLength;
      }
    }

    return [ numRows , maxCols ];
  }

  elementsByPosition() {
    const elements = [];

    this._grid.forEach((row, rowIndex) => {
      row.forEach((element, colIndex) => {
        if (!element) {
          return;
        }
        elements.push({
          element,
          row: rowIndex,
          col: colIndex
        });
      });
    });

    return elements;
  }

  shrinkCols() {
    const [ rowCount, colCount ] = this.getGridDimensions();

    for (let iCol = colCount - 1; iCol >= 0; iCol--) {
      const rowsToShrink = [];
      this._grid.forEach((row, rowIndex) => {
        if (row[iCol] == null) rowsToShrink.push(rowIndex);
      });

      if (rowsToShrink.length === rowCount) {
        this._grid.forEach(row => {
          row.splice(iCol, 1);
        });
      }
    }
  }

  shrinkRows() {
    this._grid = this._grid.filter(row => !row.every(col => ((col == null))));
  }

  getLowestRow(elements) {
    const results = elements.map(element => this.find(element) || []);

    // filter only rows that currently exist, excluding any future or non-existent rows
    return Math.min(...results
      .map(result => result[0])
      .filter(row => row >= 0));
  }

  getLowestCol(elements) {
    const results = elements.map(element => this.find(element) || []);

    return Math.min(...results
      .map(result => result[1])
      .filter(col => col >= 0));
  }

  removeElementAt(position) {
    const [ row, col ] = position;
    this._grid[row][col] = null;
  }

  createRowAndShift(position, firstCol) {
    const [ positionRow, positionCol ] = position;

    this.createRow(positionRow);

    this._grid.forEach((row, rowIndex) => {
      if (rowIndex <= positionRow + 1) return;
      row.forEach((element, colIndex) => {

        // do not shift before firstCol
        if (colIndex >= positionCol || (Number.isInteger(firstCol) && colIndex !== firstCol)) {
          this._grid[rowIndex - 1][colIndex] = element;
          this._grid[rowIndex][colIndex] = null;
        }
      });
    });
  }

  toRectangle() {
    const [ , colCount ] = this.getGridDimensions();
    this._grid.forEach((row) => {
      if (row.length < colCount) {
        const difference = colCount - row.length;
        for (let i = 0; i < difference; i++) {
          row.splice(row.length, 0, null);
        }
      }
    });
  }

  flipHorizontally() {
    this._grid.forEach((row) => {
      row.reverse();
    });
    this.isFlipped = !this.isFlipped;
  }

  /**
   * ## Expand grid XAxis
   * Add new column after position if bypass is false for not flipped grid
   * - if isFlipped === false && bypass === true
   * ```
   * ..|..
   * .|x..
   * ..|..
   * ```
   * - if isFlipped === true && bypass === true
   * ```
   * .|...
   * .x|..
   * .|...
   * ```
   * row and col must be positive integer or 0
   * @param {[row: number, col: number]} position
   * @param {boolean=} bypass
   * @param {boolean=} onRight
   */
  expandXAxisWith(position, bypass, onRight) {
    const [ row, col ] = position;
    if (!this.isValidPosition(position)) return;
    // not flipped grid
    this._grid.forEach((gridRow, rowIndex) => {

      if (!this.isFlipped && !bypass){
        gridRow.splice(col + 1, 0, null);
        return
      }

      if (this.isFlipped && !bypass) {
        gridRow.splice(col, 0, null)
        return;
      }

      if (!this.isFlipped && bypass && !onRight) {
        if (rowIndex === row) {
          gridRow.splice(col, 0, null);
        } else {
          gridRow.splice(col + 1, 0, null);
        }
        return;
      }

      if (!this.isFlipped && bypass && onRight) {
        if (rowIndex === row) {
          gridRow.splice(col + 1, 0, null);
        } else {
          gridRow.splice(col, 0, null);
        }
        return;
      }

      if (this.isFlipped && bypass && onRight) {
        if (rowIndex === row) {
          gridRow.splice(col + 1, 0, null);
        } else {
          gridRow.splice(col, 0, null);
        }
        return;
      }

      if (this.isFlipped && bypass && !onRight) {
        if (rowIndex === row) {
          gridRow.splice(col, 0, null);
        } else {
          gridRow.splice(col + 1, 0, null);
        }
        return;
      }
    });
  }

  getAbove(position) {
    const [ row, col ] = position;
    const elements = new Set();
    if (!this.isValidPosition(position)) return elements;
    for (let i = 0; i < row; i++) {
      const candidate = this.get(i, col);
      if (candidate) {
        elements.add(candidate);
      }
    }
    return elements;
  }

  hasElement(element){
    return this.elements.has(element);
  }

  isValidPosition(position) {
    if (!position || !Array.isArray(position) || position.length !== 2) return false;
    const [row, col] = position;
    return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0
  }

  //Get elements on top row
  getTopElements(elements) {

    const topElements = new Set()

    for (const el of elements) {
      const elPosition = this.find(el)
      if (elPosition) {
        if (topElements.size === 0) {
          topElements.add(el)
        } else {
          const [ row ] = elPosition;
          const [topRow] = this.find([...topElements][0]);
          if (row === topRow) {
            topElements.add(el);
          } else if (row < topRow) {
            topElements.clear()
            topElements.add(el)
          }
        }
      }
    }

    return topElements;
  }

  /**
   * Direction is enum TOP,TOP_RIGHT, RIGHT,BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT
   * @param firstElement
   * @param secondElement
   * @param direction
   * @returns {Set<any>}
   */
  getOnDirectionElementsBetween (firstElement, secondElement, direction) {
    let resultElements = new Set();
    if (!firstElement || !secondElement || !this.elements.has(firstElement) || !this.elements.has(secondElement)) return resultElements;

    const topElements = this.getTopElements([firstElement, secondElement])
    if (topElements.size !== 1) return resultElements;

    const topElement = [...topElements][0]
    const bottomElement = topElement === firstElement ? secondElement : firstElement;

    const [topElementRow, topElementCol] = this.find(topElement);
    const [bottomElementRow, bottomElementCol] = this.find(bottomElement);

    // if in one row or column
    if (topElementRow === bottomElementRow) return resultElements;
    if (topElementCol === bottomElementCol) return resultElements;

    if (direction === 'TOP') {
      if (topElementCol > bottomElementCol) {
        this._grid[topElementRow]
            .slice(bottomElementCol, topElementCol)
            .forEach(element => {
              if (element) resultElements.add(element);
            });
        return resultElements;
      }

      if (topElementCol < bottomElementCol) {
        this._grid[topElementRow]
          .slice(topElementCol + 1, bottomElementCol + 1)
          .forEach(element => {
            if (element) resultElements.add(element);
          });
        return resultElements;
      }
    } else

    if (direction === 'BOTTOM') {
      if (topElementCol > bottomElementCol) {
        this._grid[bottomElementRow]
          .slice(bottomElementCol + 1, topElementCol + 1)
          .forEach(element => {
            if (element) resultElements.add(element);
          });
        return resultElements;
      }

      if (topElementCol < bottomElementCol) {
        this._grid[bottomElementRow]
          .slice(topElementCol, bottomElementCol)
          .forEach(element => {
            if (element) resultElements.add(element);
          });
        return resultElements;
      }
    } else

    if (direction === 'LEFT') {
      if (topElementCol > bottomElementCol) {
        for (let i = topElementRow; i < bottomElementRow; i++ ){
          const element = this.get(i, bottomElementCol)
          if (element) {
            resultElements.add(element)
          }
        }
        return resultElements;
      }

      if (topElementCol < bottomElementCol) {
        for (let i = topElementRow + 1; i <= bottomElementRow; i++ ){
          const element = this.get(i, topElementCol)
          if (element) {
            resultElements.add(element)
          }
        }
        return resultElements;
      }
    } else

    if (direction === 'RIGHT') {
      if (topElementCol > bottomElementCol) {
        for (let i = topElementRow + 1; i <= bottomElementRow; i++ ){
          const element = this.get(i, topElementCol)
          if (element) {
            resultElements.add(element)
          }
        }
        return resultElements;
      }

      if (topElementCol < bottomElementCol) {
        for (let i = topElementRow; i < bottomElementRow; i++ ){
          const element = this.get(i, bottomElementCol)
          if (element) {
            resultElements.add(element)
          }
        }
        return resultElements;
      }
    } else

    if (direction === 'TOP_RIGHT') {
      if (topElementCol > bottomElementCol) {
        return new Set();
      }

      if (topElementCol < bottomElementCol) {
          const element = this.get(topElementRow, bottomElementCol)
          if (element) {
            resultElements.add(element)
          }
        return resultElements;
      }
    } else

    if (direction === 'BOTTOM_RIGHT') {
      if (topElementCol > bottomElementCol) {
        const element = this.get(bottomElementRow, topElementCol)
        if (element) {
          resultElements.add(element)
        }
        return resultElements;

      }

      if (topElementCol < bottomElementCol) {
        return new Set();
      }
    } else

    if (direction === 'BOTTOM_LEFT') {
      if (topElementCol > bottomElementCol) {
        return new Set();


      }

      if (topElementCol < bottomElementCol) {
        const element = this.get(bottomElementRow, topElementCol)
        if (element) {
          resultElements.add(element)
        }
        return resultElements;
      }
    } else

    if (direction === 'TOP_LEFT') {
      if (topElementCol > bottomElementCol) {
        const element = this.get(topElementRow, bottomElementCol)
        if (element) {
          resultElements.add(element)
        }
        return resultElements;

      }

      if (topElementCol < bottomElementCol) {
        return new Set();
      }
    }
    return new Set();
  }

}