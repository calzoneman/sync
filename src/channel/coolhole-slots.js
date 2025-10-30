import utils from "redis/lib/utils";
import ChannelModule from "./module";
const LOGGER = require("@calzoneman/jsli")("coolhole-slots");
const util = require("../utilities");

const matchExact = (arr, n) =>
  arr.reduce(
    (acc, curr, idx) => (idx === 0 ? 1 : curr === arr[idx - 1] ? acc + 1 : 0),
    0
  ) === n;

const matchDiagonalAsc = (smallGrid) =>
  smallGrid[0][2] === smallGrid[1][1] && smallGrid[1][1] === smallGrid[2][0];

const matchDiagonalDesc = (smallGrid) =>
  smallGrid[0][0] === smallGrid[1][1] && smallGrid[1][1] === smallGrid[2][2];

const toSmallGrid = (grid, startRow, startCol) =>
  grid
    .slice(startRow, startRow + 3)
    .map((row) => row.slice(startCol, startCol + 3));

const horizontal = (row) => matchExact(row, 3);
const horizontalLarge = (row) => matchExact(row, 4);
const horizontalXLarge = (row) => matchExact(row, 5);
const vertical = (col) => matchExact(col, 3);
const diagonalAsc = (smallGrid) => matchDiagonalDesc(smallGrid);
const diagonalDesc = (smallGrid) => matchDiagonalDesc(smallGrid);
const zig = (grid) => {
  const smallGridLeft = toSmallGrid(grid, 0, 0);
  const smallGridRight = toSmallGrid(grid, 0, 2);
  return matchDiagonalAsc(smallGridLeft) && matchDiagonalDesc(smallGridRight);
};
const zag = (grid) => {
  const smallGridLeft = toSmallGrid(grid, 0, 0);
  const smallGridRight = toSmallGrid(grid, 0, 2);
  return matchDiagonalDesc(smallGridLeft) && matchDiagonalAsc(smallGridRight);
};
const above = (grid) => zig(grid) && matchExact(grid[2], 5);
const below = (grid) => zag(grid) && matchExact(grid[0], 5);
const eye = (grid) => {
  const row1Match = grid[0][1] === grid[0][2] && grid[0][2] === grid[0][3];
  const row2Match =
    grid[1][0] === grid[1][1] &&
    grid[1][1] === grid[1][3] &&
    grid[1][3] === grid[1][4];
  const row3Match = grid[2][1] === grid[2][2] && grid[2][2] === grid[2][3];
  return row1Match && row2Match && row3Match;
};
const jackpot = (grid) =>
  matchExact(grid[0], 5) && matchExact(grid[1], 5) && matchExact(grid[2], 5);

// From Clover Pit
const patterns = [
  { name: "horizontal", fn: (row) => horizontal(row), multiplier: 1 },
  { name: "horizontalLarge", fn: (row) => horizontalLarge(row), multiplier: 2 },
  {
    name: "horizontalXLarge",
    fn: (row) => horizontalXLarge(row),
    multiplier: 3,
  },
  { name: "vertical", fn: (col) => vertical(col), multiplier: 1 },
  {
    name: "diagonalAsc",
    fn: (smallGrid) => diagonalAsc(smallGrid),
    multiplier: 1.5,
  },
  {
    name: "diagonalDsc",
    fn: (smallGrid) => diagonalDesc(smallGrid),
    multiplier: 1.5,
  },
  { name: "zig", fn: (grid) => zig(grid), multiplier: 4 },
  { name: "zag", fn: (grid) => zag(grid), multiplier: 4 },
  { name: "above", fn: (grid) => above(grid), multiplier: 7 },
  { name: "below", fn: (grid) => below(grid), multiplier: 7 },
  { name: "eye", fn: (grid) => eye(grid), multiplier: 8 },
  { name: "jackpot", fn: (grid) => jackpot(grid), multiplier: 10 },
];

// dictionary of odds for each symbol; adds up to 100 (based on 2x+1)
const defaultSymbolOdds = {
  0: 1,
  1: 3,
  2: 5,
  3: 7,
  4: 9,
  5: 11,
  6: 13,
  7: 15,
  8: 17,
  9: 19,
};

const defaultSymbolPayouts = {
  0: 100,
  1: 80,
  2: 70,
  3: 55,
  4: 50,
  5: 30,
  6: 25,
  7: 20,
  8: 10,
  9: 5,
};

// just easier in case symbols changes rather than hardcoding 100
const defaultSymbolOddsTotal = Object.values(defaultSymbolOdds).reduce(
  (a, b) => a + b,
  0
);

const baseSymbols = [...Array(10).keys()].map((i) => ({
  id: i,
  odds: defaultSymbolOdds[i],
  payout: defaultSymbolPayouts[i],
}));

/*
 * CoolholeSlots controls the slot machine functionality.
 * @param {Object} _channel
 */
class CoolholeSlots extends ChannelModule {
  constructor(_channel) {
    super(_channel);

    ChannelModule.apply(this, arguments);

    // dont think i want this saved to the channel state; each spin should be independent... for now
    // this.supportsDirtyCheck = true;
  }

  // todo: handle anything that might effect odds temporarily here
  getSymbol() {
    // todo: replace with channel config
    const symbols = baseSymbols;
    const odds = defaultSymbolOddsTotal;

    const rand = util.randomInt(1, odds);
    let cum = 0;

    for (const { id, odds } of symbols) {
      cum += odds;
      if (rand < cum) {
        return id;
      }
    }
    // todo: throw error? should never have odds be greater than 100
    return parseInt(Object.keys(symbols)[0]);
  }

  getPayout(symbolId, pattern, bet) {
    const symbols = baseSymbols;
    const symbol = symbols.find((s) => s.id === symbolId);
    if (!symbol) {
      return 0;
    }
    return symbol.payout * pattern.multiplier * bet;
  }

  generateGrid() {
    const grid = Array.from({ length: 3 }, () => Array(5).fill(0));

    return grid.map((row) => row.map(() => this.getSymbol()));
  }

  determineHits(grid, bet) {
    let totalPayout = 0;
    const hits = [];

    for (const pattern of patterns) {
      if (
        ["horizontal", "horizontalLarge", "horizontalXLarge"].includes(
          pattern.name
        )
      ) {
        for (const [i, row] of grid.entries()) {
          if (pattern.fn(row)) {
            let payout = this.getPayout(row[0], pattern, bet);
            totalPayout += payout;
            hits.push({ pattern: pattern.name, index: i, payout });
          }
        }
      } else if (pattern.name === "vertical") {
        for (let col = 0; col < 5; col++) {
          const column = grid.map((row) => row[col]);
          if (pattern.fn(column)) {
            let payout = this.getPayout(column[0], pattern, bet);
            totalPayout += payout;
            hits.push({ pattern: pattern.name, index: col, payout });
          }
        }
      } else if (["diagonalAsc", "diagonalDsc"].includes(pattern.name)) {
        // check each possible 3x3 small grid in the 5x3 grid
        // there are 3 possible small grids: cols 0-2, 1-3, 2-4
        const smallGridArr = [
          toSmallGrid(grid, 0, 0),
          toSmallGrid(grid, 0, 1),
          toSmallGrid(grid, 0, 2),
        ];
        for (const [i, smallGrid] of smallGridArr.entries()) {
          if (pattern.fn(smallGrid)) {
            let payout = this.getPayout(smallGrid[1][1], pattern, bet); // center symbol
            totalPayout += payout;
            hits.push({ pattern: pattern.name, index: i, payout });
          }
        }
      } else {
        // special patterns that use the whole grid so finding which symbol requires a unique coord for each
        let rowIdx, colIdx;
        switch (pattern.name) {
          case "zig":
            rowIdx = 0;
            colIdx = 2;
            break;
          case "zag":
            rowIdx = 2;
            colIdx = 2;
            break;
          case "above":
            rowIdx = 0;
            colIdx = 2;
            break;
          case "below":
            rowIdx = 2;
            colIdx = 2;
            break;
          case "eye":
            rowIdx = 0;
            colIdx = 2;
            break;
          case "jackpot":
            rowIdx = 0;
            colIdx = 0;
            break;
          default:
            continue;
        }
        if (pattern.fn(grid)) {
          let payout = this.getPayout(grid[rowIdx][colIdx], pattern, bet);
          totalPayout += payout;
          hits.push({ pattern: pattern.name, index: -1, payout });
        }
      }
    }
    totalPayout = Math.round(totalPayout);
    return { totalPayout, hits };
  }

  handleSpin(data, user) {
    LOGGER.debug("Handling slot spin for user " + user.name);

    // TODO: Check CP ops if slots are enabled
    const { bet } = data;

    if (typeof bet !== "number" || bet <= 0 || !Number.isInteger(bet)) {
      LOGGER.warn("Invalid bet from user " + user.name);
      return;
    }

    // TODO:
    this.channel.modules.coolholepoints.handleSlotBet(user.getName(), bet);

    const grid = this.generateGrid();
    const { totalPayout, hits } = this.determineHits(grid, bet);

    if (totalPayout > 0) {
      this.channel.modules.coolholepoints.handleSlotPayout(user.getName(), {
        totalPayout,
        hits,
      });
    }

    return {
      grid,
      totalPayout,
      hits,
    };
  }
}
