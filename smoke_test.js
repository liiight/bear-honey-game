/* Render and movement checks for game.js.
   Run: node smoke_test.js */

const { freshDom, stubFetch, loadGame, mazeCells } = require("./test_dom");

const { ids, listeners } = freshDom();
stubFetch();
const game = loadGame();
const state = game.state;

// init() is async; run the checks once loading has finished.
game.ready.then(runChecks);

function runChecks() {

/* ---------- assertions ---------- */

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

const cells = ids.maze.children.flatMap((c) =>
  c.tagName === "fragment" ? c.children : [c],
);

check("cells rendered", cells.length, 165); // 15 x 11

const count = (cls) => cells.filter((c) => c.classList.contains(cls)).length;
const withText = (t) => cells.filter((c) => c.textContent === t).length;

check("bear drawn", withText("🐻"), 1);
check("honey drawn", withText("🍯"), 1);
check("question triggers drawn", withText("❓"), 5);
check("wall cells", count("wall"), 95);
check("floor cells", count("floor"), 70);
check("walls + floors = total", count("wall") + count("floor"), 165);
check("coin counter initial", ids["coin-count"].textContent, 0);
check("score counter initial", ids["score-count"].textContent, 0);
check("no fatal error panel", ids.maze.children.some((c) => c.className === "error-panel"), false);
check("grid cols set", ids.maze.style._props["--cols"], 15);
check("grid rows set", ids.maze.style._props["--rows"], 11);

/* ---------- movement ---------- */

console.log("\n-- movement --");

check("keydown listener registered", (listeners.keydown || []).length, 1);

let prevented = 0;
function press(code) {
  listeners.keydown.forEach((fn) =>
    fn({ code, preventDefault: () => prevented++ }),
  );
}

const bear = () => `${state.bear.row},${state.bear.col}`;

check("bear starts at S", bear(), "1,1");

// (1,1) sits against the top and left walls.
press("ArrowUp");
check("blocked by wall above", bear(), "1,1");
press("ArrowLeft");
check("blocked by wall to the left", bear(), "1,1");
check("blocked moves still preventDefault", prevented, 2);

// Critical RTL check: the page is dir="rtl", but the maze must not mirror.
// ArrowRight must increase the column index.
press("ArrowRight");
check("ArrowRight increases column (not mirrored)", bear(), "1,2");
press("ArrowLeft");
check("ArrowLeft decreases column", bear(), "1,1");

press("ArrowDown");
check("ArrowDown increases row", bear(), "2,1");
press("ArrowUp");
check("ArrowUp decreases row", bear(), "1,1");

// WASD by physical code, so a Hebrew layout still works.
press("KeyD");
check("KeyD moves right", bear(), "1,2");
press("KeyA");
check("KeyA moves left", bear(), "1,1");
press("KeyS");
check("KeyS moves down", bear(), "2,1");
press("KeyW");
check("KeyW moves up", bear(), "1,1");

const stepsBefore = state.steps;
press("KeyQ");
check("unmapped key ignored", state.steps, stepsBefore);

// Walk right onto the first trigger at (1,4).
press("ArrowRight");
press("ArrowRight");
press("ArrowRight");
check("reached first trigger", bear(), "1,4");
check("trigger consumed once", state.usedTriggers.has("1,4"), true);

// Stepping on a trigger opens the popup and freezes the bear.
check("popup opened at the trigger", ids.overlay.hidden, false);
check("game paused while the popup is open", state.paused, true);
press("ArrowRight");
check("bear cannot move during a question", bear(), "1,4");

// Dismiss it so the rest of the walk can continue.
game.closeQuestion();
check("popup closed", ids.overlay.hidden, true);
check("movement resumes after closing", state.paused, false);

// Bear glyph follows the bear; exactly one bear on the board at all times.
const cellsNow = ids.maze.children.flatMap((c) =>
  c.tagName === "fragment" ? c.children : [c],
);
check("still exactly one bear", cellsNow.filter((c) => c.textContent === "🐻").length, 1);
check(
  "bear is at the current tile",
  cellsNow[state.bear.row * 15 + state.bear.col].textContent,
  "🐻",
);

/* ---------- honey pot gate ---------- */

console.log("\n-- honey pot --");

// Too few coins: the pot stays shut and a bonus question opens instead.
state.bear = { row: 9, col: 12 };
state.coins = 0;
press("ArrowRight");
check("bear reaches honey", bear(), "9,13");
check("pot locked without coins", ids.status.textContent.includes("נעול"), true);
check("bonus question offered", ids.overlay.hidden, false);
check("not won yet", state.won, false);
game.closeQuestion();

// Enough coins: the pot opens and the win screen appears.
game.restartGame();
state.bear = { row: 9, col: 12 };
state.coins = 3;
press("ArrowRight");
check("pot opens with 3 coins", ids.status.textContent.includes("כל הכבוד"), true);
check("win screen shown", ids["win-overlay"].hidden, false);
check("game marked as won", state.won, true);

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
}
