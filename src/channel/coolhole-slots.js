import ChannelModule from "./module";
const LOGGER = require("@calzoneman/jsli")("coolhole-slots");
const util = require("../utilities");
const Flags = require("../flags");

// From Clover Pit

/**
 * Finds horizontal matches in the grid.
 * @param {Array<Array<number>>} grid grid
 * @param {Number} timesToMatch number of times to match
 * @returns array of matched positions or null if no matches
 */
const horizontal = (grid, timesToMatch) => {
  const matches = [];
  for (const [y, row] of grid.entries()) {
    for (let x = 0; x <= row.length - timesToMatch; x++) {
      const slice = row.slice(x, x + timesToMatch); // sliding window of size of the amount of times to match
      if (slice.every((val) => val === slice[0])) {
        matches.push(...slice.map((_, idx) => [y, x + idx])); // recall grid is in draw order, not cartesian
      }
    }
  }
  return matches.length > 0 ? matches : null;
};

/**
 * Finds vertical matches in the grid.
 * @param {Array<Array<number>>} grid grid
 * @returns array of matched positions or null if no matches
 */
const vertical = (grid) => {
  const matches = [];
  for (let x = 0; x <= grid[0].length - 1; x++) {
    const col = grid.map((row, y) => ({ pos: [y, x], val: row[x] })); // recall grid is in draw order, not cartesian
    if (col.every(({ val }) => val === col[0].val)) {
      matches.push(...col.map(({ pos }) => pos));
    }
  }
  return matches.length > 0 ? matches : null;
};

/**
 * Finds ascending diagonal matches in the grid.
 * @param {Array<Array<number>>} grid grid
 * @returns array of matched positions or null if no matches
 */
const diagonalAsc = (grid) => {
  const matches = [];
  // number of diagonals is cols - rows + 1
  for (let x = 0; x <= grid[0].length - grid.length; x++) {
    const diagonal = [];
    for (let y = grid.length - 1; y >= 0; y--) {
      const diagX = x + (grid.length - 1 - y);
      diagonal.push({ pos: [y, diagX], val: grid[y][diagX] });
    }
    if (diagonal.every(({ val }) => val === diagonal[0].val)) {
      matches.push(...diagonal.map(({ pos }) => pos));
    }
  }
  return matches.length > 0 ? matches : null;
};

/**
 * Finds descending diagonal matches in the grid.
 * @param {Array<Array<number>>} grid grid
 * @returns array of matched positions or null if no matches
 */
const diagonalDesc = (grid) => {
  const matches = [];
  // number of diagonals is cols - rows + 1
  for (let x = 0; x <= grid[0].length - grid.length; x++) {
    const diagonal = [];
    for (let y = 0; y < grid.length; y++) {
      const diagX = x + y;
      diagonal.push({ pos: [y, diagX], val: grid[y][diagX] });
    }
    if (diagonal.every(({ val }) => val === diagonal[0].val)) {
      matches.push(...diagonal.map(({ pos }) => pos));
    }
  }
  return matches.length > 0 ? matches : null;
};

// helper to compare grid positions
const arePosEqual = (posArr1, posArr2) =>
  posArr1[0] === posArr2[0] && posArr1[1] === posArr2[1];

/**
 * Finds zig pattern (downward arrow) matches in the grid.
 * @param {Array<number>} diagonalAscRes result from diagonalAsc
 * @param {Array<number} diagonalDescRes result from diagonalDesc
 * @returns array of matched positions or null if no matches
 */
const zig = (diagonalAscRes, diagonalDescRes) => {
  if (!diagonalAscRes || !diagonalDescRes) return null;
  // hardcoded intersection point for 5x3 grid zig pattern
  const inserssectionPoint = [2, 2];
  const ascPattern = diagonalAscRes.find((pos) =>
    arePosEqual(pos, inserssectionPoint)
  );
  const descPattern = diagonalDescRes.find((pos) =>
    arePosEqual(pos, inserssectionPoint)
  );
  if (ascPattern && descPattern) {
    return [...ascPattern, ...descPattern];
  }
  return null;
};

/**
 * Finds zag pattern (upward arrow) matches in the grid.
 * @param {Array<number>} diagonalAscRes result from diagonalAsc
 * @param {Array<number} diagonalDescRes result from diagonalDesc
 * @returns array of matched positions or null if no matches
 */
const zag = (diagonalAscRes, diagonalDescRes) => {
  if (!diagonalAscRes || !diagonalDescRes) return null;
  // hardcoded intersection point for 5x3 grid zag pattern
  const inserssectionPoint = [0, 2];
  const ascPattern = diagonalAscRes.find((pos) =>
    arePosEqual(pos, inserssectionPoint)
  );
  const descPattern = diagonalDescRes.find((pos) =>
    arePosEqual(pos, inserssectionPoint)
  );
  if (ascPattern && descPattern) {
    return [...ascPattern, ...descPattern];
  }
  return null;
};

/**
 * Finds the top row combined with zig pattern matches in the grid.
 * @param {Array<number>} zigRes result from zig
 * @param {Array<number} horizontalXLargeRes result from horizontalXLarge
 * @returns array of matched positions or null if no matches
 */
const above = (zigRes, horizontalXLargeRes) => {
  if (!zigRes || !horizontalXLargeRes) return null;
  const topRow = horizontalXLargeRes.filter((pos) => pos[0] === 0);
  return zigRes && topRow.length === 5 ? [...zigRes, ...topRow] : null;
};

/**
 * Finds the bottom row combined with zag pattern matches in the grid.
 * @param {Array<number>} zagRes result from zag
 * @param {Array<number} horizontalXLargeRes result from horizontalXLarge
 * @returns array of matched positions or null if no matches
 */
const below = (zagRes, horizontalXLargeRes) => {
  if (!zagRes || !horizontalXLargeRes) return null;
  const bottomRow = horizontalXLargeRes.filter((pos) => pos[0] === 2);
  return zagRes && bottomRow.length === 5 ? [...zagRes, ...bottomRow] : null;
};

/**
 * Finds eye pattern match in the grid
 * @param {Array<Array<number>>} grid grid
 * @returns array of matched positions or null if no matches
 */
const eye = (grid) => {
  const eyePattern = [
    { pos: [0, 1], val: grid[0][1] },
    { pos: [0, 2], val: grid[0][2] },
    { pos: [0, 3], val: grid[0][3] },
    { pos: [1, 0], val: grid[1][0] },
    { pos: [1, 1], val: grid[1][1] },
    { pos: [1, 3], val: grid[1][3] },
    { pos: [1, 4], val: grid[1][4] },
    { pos: [2, 1], val: grid[2][1] },
    { pos: [2, 2], val: grid[2][2] },
    { pos: [2, 3], val: grid[2][3] },
  ];
  if (eyePattern.every(({ val }) => val === eyePattern[0].val)) {
    return eyePattern.map(({ pos }) => pos);
  }
  return null;
};

/**
 * Finds jackpot pattern match in the grid
 * @param {Array<number>} horizontalXLargeRes result from horizontalXLarge
 * @returns array of matched positions or null if no matches
 */
const jackpot = (horizontalXLargeRes) =>
  horizontalXLargeRes.length === 15 // all 5 symbols in all 3 rows
    ? horizontalXLargeRes
    : null;

const patterns = [
  { name: "horizontal", fn: (grid) => horizontal(grid, 3), multiplier: 1 },
  { name: "horizontalLarge", fn: (grid) => horizontal(grid, 4), multiplier: 2 },
  {
    name: "horizontalXLarge",
    fn: (grid) => horizontal(grid, 5),
    multiplier: 3,
  },
  { name: "vertical", fn: (grid) => vertical(grid), multiplier: 1 },
  {
    name: "diagonalAsc",
    fn: (grid) => diagonalAsc(grid),
    multiplier: 1.5,
  },
  {
    name: "diagonalDsc",
    fn: (grid) => diagonalDesc(grid),
    multiplier: 1.5,
  },
  { name: "zig", fn: (grid) => zig(grid), multiplier: 4 },
  { name: "zag", fn: (grid) => zag(grid), multiplier: 4 },
  { name: "above", fn: (grid) => above(grid), multiplier: 7 },
  { name: "below", fn: (grid) => below(grid), multiplier: 7 },
  { name: "eye", fn: (grid) => eye(grid), multiplier: 8 },
  { name: "jackpot", fn: (grid) => jackpot(grid), multiplier: 10 },
];

/* Patterns are only scored if any larger Pattern (except Jackpot) does not contain them. 
    All examples:
    - A HorizontalXLarge match negates any Horizontal or HorizontalLarge matches in the same rows.
    - A HorizontalLarge match negates any Horizontal matches in the same rows.
    - An Above match negates any Zig matches, the HorizontalXLarge in that row, and anything it negates.
    - A Below match negates any Zag matches, the HorizontalXLarge in that row, and anything it negates.
    - A Zig match negates the diagonalAsc and disgonalDesc matches that compose it
    - A Zag match negates the diagonalDesc and diagonalAsc matches that compose it.
    - An Eye match negates any Horizontal matches in the center of the row and the vertical matches in the 2nd and 4th columns
    - Jackpot does not negate any patterns.
  */
const removeAlreadyMatched = (hits, pattern, matchedPositions) => {
  const negatedPatterns = {
    horizontalXLarge: ["horizontalLarge", "horizontal"],
    horizontalLarge: ["horizontal"],
    above: ["zig", "horizontalXLarge", "horizontalLarge", "horizontal"],
    below: ["zag", "horizontalXLarge", "horizontalLarge", "horizontal"],
    zig: ["diagonalAsc", "diagonalDsc"],
    zag: ["diagonalDsc", "diagonalAsc"],
    eye: ["horizontal", "vertical"],
    jackpot: [],
  };
  const patternsToNegate = negatedPatterns[pattern.name] || [];
  // todo
};

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

  onUserPostJoin(user) {
    if (!user.channel.is(Flags.C_REGISTERED)) return;

    user.socket.on("coolholeSpinSlot", this.handleSpin.bind(this, user));
    this.init(user);
  }

  /**
   * Initialize slot for a user
   * @param {Object} user User object
   * @emits coolhole slot init response
   */
  init(user) {
    user.socket.emit("coolholeSlotsInitResponse", this.generateGrid());
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

    const res = grid.map((row) => row.map(() => this.getSymbol()));
    return res;
  }

  determineHits(grid, bet) {
    let totalPayout = 0;
    const hits = [];

    for (const pattern of patterns.toSorted(
      (a, b) => a.multiplier - b.multiplier
    )) {
      // fix: sort patterns by fixed rank instead of multiplier since multipliers might change in the future
      const matchedPositions = pattern.fn(grid);
      if (matchedPositions) {
        // get symbol at first matched position
        const [y, x] = matchedPositions[0];
        const symbolId = grid[y][x];
        const payout = this.getPayout(symbolId, pattern, bet);
        totalPayout += payout;
        hits.push({
          pattern: pattern.name,
          positions: matchedPositions,
          symbolId,
          payout,
        });
      }
    }
    totalPayout = Math.round(totalPayout);
    return { totalPayout, hits };
  }

  handleSpin(user, data) {
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

    user.socket.emit("coolholeSpinSlotResponse", {
      grid,
      totalPayout,
      hits,
    });

    LOGGER.info(
      `User ${user.name} spun the slots with bet ${bet} and won ${totalPayout}`
    );

    return {
      grid,
      totalPayout,
      hits,
    };
  }
}

module.exports = CoolholeSlots;
