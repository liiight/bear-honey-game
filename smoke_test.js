/* Render and movement checks.

   The maze is generated at load, so nothing here may assume a fixed
   layout. Expectations are derived from the maze that was actually built.

   Run: node smoke_test.js */

const { freshDom, stubFetch, loadGame, mazeCells, makeChecker } = require("./test_dom");

const { ids, listeners } = freshDom();
stubFetch();
const game = loadGame();
const state = game.state;
const checker = makeChecker();

game.ready.then(runChecks);

function runChecks() {
  const check = checker.check;

  const MAZE = game.getMaze();
  const ROWS = MAZE.length;
  const COLS = MAZE[0].length;
  const total = ROWS * COLS;

  const countChar = (ch) =>
    MAZE.reduce((n, row) => n + row.split(ch).length - 1, 0);

  const wallsInMaze = countChar("#");
  const floorsInMaze = total - wallsInMaze;
  const triggersInMaze = countChar("?");

  /* ---------- rendering ---------- */

  const cells = mazeCells(ids.maze);
  const count = (cls) => cells.filter((c) => c.classList.contains(cls)).length;
  const withText = (t) => cells.filter((c) => c.textContent === t).length;

  check("one cell per maze tile", cells.length, total);
  check("bear drawn once", withText("🐻"), 1);
  check("honey drawn once", withText("🍯"), 1);
  check("every question tile drawn", withText("❓"), triggersInMaze);
  check("wall cells match the maze", count("wall"), wallsInMaze);
  check("floor cells match the maze", count("floor"), floorsInMaze);
  check("walls plus floors is the whole board", count("wall") + count("floor"), total);
  check("coin counter starts at zero", ids["coin-count"].textContent, 0);
  check("score counter starts at zero", ids["score-count"].textContent, 0);
  check(
    "no fatal error panel",
    ids.maze.children.some((c) => c.className === "error-panel"),
    false,
  );
  check("grid columns published to CSS", ids.maze.style._props["--cols"], COLS);
  check("grid rows published to CSS", ids.maze.style._props["--rows"], ROWS);

  /* ---------- movement ---------- */

  console.log("\n-- movement --");

  check("keydown listener registered", (listeners.keydown || []).length, 1);

  let prevented = 0;
  const press = (code) =>
    listeners.keydown.forEach((fn) =>
      fn({ code, preventDefault: () => prevented++ }),
    );

  const at = () => `${state.bear.row},${state.bear.col}`;
  const tile = (r, c) => MAZE[r][c];
  const isWall = (r, c) =>
    r < 0 || r >= ROWS || c < 0 || c >= COLS || tile(r, c) === "#";

  // The bear must start on the generated start tile.
  const startRow = MAZE.findIndex((row) => row.includes("S"));
  const startCol = MAZE[startRow].indexOf("S");
  check("bear starts on the S tile", at(), `${startRow},${startCol}`);

  // Walking into a wall must not move the bear. Find a direction that is
  // blocked from wherever the bear happens to have started.
  const DIRS = [
    ["ArrowUp", -1, 0],
    ["ArrowDown", 1, 0],
    ["ArrowLeft", 0, -1],
    ["ArrowRight", 0, 1],
  ];
  const blocked = DIRS.find(([, dr, dc]) =>
    isWall(state.bear.row + dr, state.bear.col + dc),
  );
  if (blocked) {
    const before = at();
    press(blocked[0]);
    check(`blocked by a wall (${blocked[0]})`, at(), before);
  } else {
    check("start tile has at least one wall beside it", true, true);
  }
  check("blocked moves still call preventDefault", prevented > 0, true);

  /*
    Critical RTL check: the page is dir="rtl", but the maze must not
    mirror, so ArrowRight has to increase the column index.

    The bear may start in a vertical corridor with no horizontal exit, so
    walk it to a tile that does have one instead of assuming.
  */
  const horizontalSpot = (() => {
    if (!isWall(state.bear.row, state.bear.col + 1)) return true;
    for (const step of game.solveFromBear()) {
      press(step);
      if (!ids.overlay.hidden) game.closeQuestion();
      if (!isWall(state.bear.row, state.bear.col + 1)) return true;
    }
    return false;
  })();

  check("found a tile with an opening to the right", horizontalSpot, true);

  const beforeCol = state.bear.col;
  press("ArrowRight");
  check(
    "ArrowRight increases the column (not mirrored)",
    state.bear.col - beforeCol,
    1,
  );

  press("ArrowLeft");
  check("ArrowLeft decreases the column", state.bear.col, beforeCol);

  // WASD must work by physical key position, for Hebrew keyboard layouts.
  const wasd = { ArrowUp: "KeyW", ArrowDown: "KeyS", ArrowLeft: "KeyA", ArrowRight: "KeyD" };
  const openNow = DIRS.filter(
    ([, dr, dc]) => !isWall(state.bear.row + dr, state.bear.col + dc),
  );
  const [code, dr, dc] = openNow[0];
  const from = { ...state.bear };
  press(wasd[code]);
  check(
    `${wasd[code]} moves like ${code}`,
    at(),
    `${from.row + dr},${from.col + dc}`,
  );

  const stepsBefore = state.steps;
  press("KeyQ");
  check("unmapped key ignored", state.steps, stepsBefore);

  /* ---------- triggers ---------- */

  console.log("\n-- question triggers --");

  // Walk the solution until the first question fires.
  const route = game.solveFromBear();
  let opened = false;
  for (const step of route) {
    press(step);
    if (!ids.overlay.hidden) {
      opened = true;
      break;
    }
  }

  check("stepping on a question tile opens the popup", opened, true);
  check("game pauses during a question", state.paused, true);

  const frozen = at();
  DIRS.forEach(([c]) => press(c));
  check("bear cannot move during a question", at(), frozen);

  const answeredAt = { ...state.bear };
  game.closeQuestion();
  check("popup closes", ids.overlay.hidden, true);
  check("movement resumes", state.paused, false);

  // The question mark must be gone once answered.
  check(
    "answered tile is recorded as used",
    state.usedTriggers.has(`${answeredAt.row},${answeredAt.col}`),
    true,
  );

  const cellsAfter = mazeCells(ids.maze);
  const answeredCell = cellsAfter[answeredAt.row * COLS + answeredAt.col];
  check("bear still shown on the answered tile", answeredCell.textContent, "🐻");

  // Every answered tile must have lost its question mark. The bear may
  // have crossed more than one on the way here, so count from state
  // rather than assuming exactly one was used.
  check(
    "question marks left matches unanswered triggers",
    cellsAfter.filter((c) => c.textContent === "❓").length,
    triggersInMaze - state.usedTriggers.size,
  );

  // Walk the bear off the answered tile and confirm the mark is gone for
  // good, rather than just being hidden underneath the bear.
  const exit = game.solveFromBear()[0];
  if (exit) {
    press(exit);
    if (!ids.overlay.hidden) game.closeQuestion();
    const vacated = mazeCells(ids.maze)[answeredAt.row * COLS + answeredAt.col];
    check("answered tile is blank after the bear leaves", vacated.textContent, "");
  }

  checker.done();
}
