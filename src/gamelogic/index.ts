/**
 * Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Cell, GridChanges, State, Tag } from "./types.js";

function newCell(id: number): Cell {
  return {
    hasMine: false,
    id,
    revealed: false,
    tag: Tag.None,
    touchingFlags: 0,
    touchingMines: 0
  };
}

export type ChangeCallback = (changes: GridChanges) => void;

export default class MinesweeperGame {
  get state() {
    return this._state;
  }

  get flags() {
    return this._flags;
  }
  static EMIT_THRESHOLD = 10;
  grid: Cell[][];
  startTime = 0;
  endTime = 0;
  private _state = State.Pending;
  private _toReveal = 0;
  private _flags = 0;
  private _gridChanges: Array<[number, number]> = [];
  private _changeCallback?: ChangeCallback;

  constructor(
    private _width: number,
    private _height: number,
    private _mines: number
  ) {
    if (_mines < 1) {
      throw Error("Invalid number of mines");
    }
    if (_width < 1 || _height < 1) {
      throw Error("Invalid dimensions");
    }
    if (_mines >= _width * _height) {
      throw Error("Number of mines cannot fit in grid");
    }

    this._toReveal = _width * _height - _mines;

    this.grid = Array(_height)
      .fill(undefined)
      .map((_, rowIdx) =>
        Array(_width)
          .fill(undefined)
          .map((_, cellIdx) => newCell(rowIdx * _width + cellIdx))
      );
  }

  subscribe(callback: ChangeCallback) {
    this._changeCallback = callback;
  }

  reveal(x: number, y: number) {
    if (this._state === State.Pending) {
      this._placeMines(x, y);
      this.startTime = Date.now();
    } else if (this._state !== State.Playing) {
      throw Error("Game is not in a playable state");
    }

    const cell = this.grid[y][x];

    if (cell.tag === Tag.Flag) {
      throw Error("Cell flagged");
    }

    this._reveal(x, y);
    this._emit();
  }

  tag(x: number, y: number, tag: Tag) {
    const cell = this.grid[y][x];
    if (cell.revealed) {
      throw Error("Revealed cell cannot be tagged");
    }
    if (cell.tag === tag) {
      return;
    }

    const oldTag = cell.tag;
    cell.tag = tag;
    this._pushGridChange(x, y);

    if (tag === Tag.Flag) {
      this._flags++;
      for (const [nextX, nextY] of this._getSurrounding(x, y)) {
        const nextCell = this.grid[nextY][nextX];
        nextCell.touchingFlags++;
        // Emit this if it's just matched the number of mines
        if (
          nextCell.revealed &&
          nextCell.touchingFlags === nextCell.touchingMines
        ) {
          this._pushGridChange(nextX, nextY);
        }
      }
    } else if (oldTag === Tag.Flag) {
      this._flags--;
      for (const [nextX, nextY] of this._getSurrounding(x, y)) {
        const nextCell = this.grid[nextY][nextX];
        nextCell.touchingFlags--;
        // Emit this if it's just un-matched the number of mines
        if (
          nextCell.revealed &&
          nextCell.touchingFlags === nextCell.touchingMines - 1
        ) {
          this._pushGridChange(nextX, nextY);
        }
      }
    }
    this._emit();
  }

  /**
   * Reveal squares around the point. Returns true if successful.
   */
  attemptSurroundingReveal(x: number, y: number): boolean {
    const cell = this.grid[y][x];

    if (
      !cell.revealed ||
      cell.touchingMines === 0 ||
      cell.touchingMines > cell.touchingFlags
    ) {
      return false;
    }

    let revealedSomething = false;

    for (const [nextX, nextY] of this._getSurrounding(x, y)) {
      const nextCell = this.grid[nextY][nextX];
      if (nextCell.tag === Tag.Flag || nextCell.revealed) {
        continue;
      }
      revealedSomething = true;
      this._reveal(nextX, nextY);
    }

    if (!revealedSomething) {
      return false;
    }

    this._emit();
    return true;
  }

  private _emit() {
    if (this._gridChanges.length <= 0) {
      return;
    }
    if (!this._changeCallback) {
      throw Error("No function present to emit with");
    }
    this._changeCallback(
      this._gridChanges.map(([x, y]) => [x, y, this.grid[y][x]] as any)
    );
    this._gridChanges = [];
  }

  private _pushGridChange(x: number, y: number) {
    this._gridChanges.push([x, y]);
  }

  private _endGame(state: State.Won | State.Lost) {
    this._state = state;
    this.endTime = Date.now();
  }

  private _placeMines(avoidX: number, avoidY: number) {
    const flatCellIndexes: number[] = new Array(this._width * this._height)
      .fill(undefined)
      .map((_, i) => i);

    // Remove the cell played.
    flatCellIndexes.splice(avoidY * this._width + avoidX, 1);

    // Place mines in remaining squares
    let minesToPlace = this._mines;

    while (minesToPlace) {
      const index = flatCellIndexes.splice(
        Math.floor(Math.random() * flatCellIndexes.length),
        1
      )[0];

      const x = index % this._width;
      const y = (index - x) / this._width;

      this.grid[y][x].hasMine = true;
      minesToPlace -= 1;

      for (const [nextX, nextY] of this._getSurrounding(x, y)) {
        this.grid[nextY][nextX].touchingMines++;
      }
    }

    this._state = State.Playing;
  }

  private _getSurrounding(x: number, y: number): Array<[number, number]> {
    const surrounding: Array<[number, number]> = [];

    for (const nextY of [y - 1, y, y + 1]) {
      if (nextY < 0) {
        continue;
      }
      if (nextY >= this._height) {
        continue;
      }

      for (const nextX of [x - 1, x, x + 1]) {
        if (nextX < 0) {
          continue;
        }
        if (nextX >= this._width) {
          continue;
        }
        if (x === nextX && y === nextY) {
          continue;
        }

        surrounding.push([nextX, nextY]);
      }
    }

    return surrounding;
  }

  /**
   * @param x
   * @param y
   * @param objsCloned A weakmap to track which objects have already been cloned.
   */
  private _reveal(x: number, y: number) {
    // The set contains the cell position as if it were a single flat array.
    const revealSet = new Set<number>([x + y * this._width]);

    for (const value of revealSet) {
      const x = value % this._width;
      const y = (value - x) / this._width;

      const cell = this.grid[y][x];

      if (cell.revealed) {
        throw Error("Cell already revealed");
      }
      cell.revealed = true;
      this._pushGridChange(x, y);

      if (cell.hasMine) {
        this._endGame(State.Lost);
        return;
      }

      this._toReveal -= 1;

      if (this._toReveal === 0) {
        this._endGame(State.Won);
        return;
      }

      // Don't reveal the surrounding squares if this is touching a mine.
      if (cell.touchingMines) {
        continue;
      }

      for (const [nextX, nextY] of this._getSurrounding(x, y)) {
        const nextCell = this.grid[nextY][nextX];
        const isCorner = nextX !== x && nextY !== y;
        if (isCorner && nextCell.touchingMines === 0) {
          // Don't allow corner to expand (but revealing numbers is fine)
          continue;
        }
        if (!nextCell.revealed && nextCell.tag !== Tag.Flag) {
          revealSet.add(nextX + nextY * this._width);
        }
      }
    }
    this._emit();
  }
}
