/* End-to-end walk: drive the bear along the real solution path and confirm
   it reaches the honey pot, answering every question on the way.
   Run: node walk_test.js */

const { freshDom, stubFetch, loadGame } = require("./test_dom");

const { ids, listeners } = freshDom();
stubFetch();
const game = loadGame();
const { state, MAZE, COINS_TO_OPEN_POT } = game;

/* ---------- solve the maze with BFS ---------- */

const ROWS = MAZE.length;
const COLS = MAZE[0].length;
const DIRS = [
  [-1, 0, "ArrowUp"],
  [1, 0, "ArrowDown"],
  [0, -1, "ArrowLeft"],
  [0, 1, "ArrowRight"],
];

function locate(ch) {
  for (let r = 0; r < ROWS; r++) {
    const c = MAZE[r].indexOf(ch);
    if (c !== -1) return [r, c];
  }
  return null;
}

function solve(fromCh, toCh) {
  const [sr, sc] = locate(fromCh);
  const [hr, hc] = locate(toCh);
  const prev = new Map([[`${sr},${sc}`, null]]);
  const queue = [[sr, sc]];

  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === hr && c === hc) break;
    for (const [dr, dc, name] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      const k = `${nr},${nc}`;
      const inside = nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS;
      if (inside && MAZE[nr][nc] !== "#" && !prev.has(k)) {
        prev.set(k, { from: `${r},${c}`, name });
        queue.push([nr, nc]);
      }
    }
  }

  const keys = [];
  let node = `${hr},${hc}`;
  while (prev.get(node)) {
    keys.push(prev.get(node).name);
    node = prev.get(node).from;
  }
  return keys.reverse();
}

/* ---------- walk it ---------- */

game.ready.then(runWalk);

function runWalk() {

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`,
  );
}

const press = (code) =>
  listeners.keydown.forEach((fn) => fn({ code, preventDefault() {} }));

const route = solve("S", "H");
console.log(`solution: ${route.length} moves\n`);

/** Answer whatever question is on screen, then dismiss it. */
let answered = 0;
let answeredRight = 0;
function clearPopup(correctly) {
  if (ids.overlay.hidden) return;

  const shownText = ids["question-text"].textContent;
  const shown = state.questions.find((q) => q.text === shownText);
  const correctText = shown.answers.find((a) => a.correct).text;

  const buttons = ids.answers.children;
  const target = correctly
    ? buttons.find((b) => b.textContent === correctText)
    : buttons.find((b) => b.textContent !== correctText);

  target.click();
  answered++;
  if (correctly) answeredRight++;
  game.closeQuestion();
}

// Walk the route, answering every question correctly along the way.
route.forEach((code) => {
  press(code);
  clearPopup(true);
});

const [hr, hc] = locate("H");
check("bear reached the honey pot", `${state.bear.row},${state.bear.col}`, `${hr},${hc}`);
check("every move was legal", state.steps, route.length);
check("questions were asked on the way", answered > 0, true);
check("a coin per correct answer", state.coins, answeredRight);
check("score matches correct answers", state.score, answeredRight);
check("pot opened", ids.status.textContent.includes("כל הכבוד"), true);
check(
  "triggers fired along the way",
  state.usedTriggers.size,
  answered,
);

// Fuzz: hammer random directions and confirm the bear never lands on a
// wall or leaves the grid.
const codes = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"];
let illegal = 0;
for (let i = 0; i < 2000; i++) {
  press(codes[Math.floor(Math.random() * codes.length)]);
  const { row, col } = state.bear;
  const inside = row >= 0 && row < ROWS && col >= 0 && col < COLS;
  if (!inside || MAZE[row][col] === "#") illegal++;
}
check("bear never enters a wall (2000 random moves)", illegal, 0);

console.log(
  failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
}
