/* Bear & Honey - Rosh HaShana maze game

   The maze is generated fresh on every load, so no two games are alike.

   Maze legend:
     #  wall
     .  floor
     S  bear start
     H  honey pot
     ?  question trigger

   To change the size or difficulty, edit MAZE_CONFIG below.
   To check the generator still behaves, run:
       python3 check_maze.py   (validates many generated mazes)
*/

const MAZE_CONFIG = {
  /*
    Size in "cells". The rendered grid is always odd-sized because walls
    sit between cells, so the board works out at (cells * 2 + 1).
    10 x 7 cells -> a 21 x 15 board.
  */
  cellCols: 10,
  cellRows: 7,

  /** Question tiles placed along the route. */
  triggers: 5,

  /*
    Higher means twistier. On each step the generator keeps going in the
    same direction with this probability; lower values produce more
    junctions and a more confusing maze.
  */
  straightness: 0.35,

  /*
    Fraction of dead ends to reconnect into loops. A perfect maze (0) has
    exactly one route anywhere, which makes wrong turns tedious to undo.
    A few loops keep it interesting without making it trivial.
  */
  loopiness: 0.12,
};

const TILE = {
  WALL: "#",
  FLOOR: ".",
  START: "S",
  HONEY: "H",
  TRIGGER: "?",
};

const EMOJI = {
  WALL: "🌲",
  BEAR: "🐻",
  HONEY: "🍯",
  TRIGGER: "❓",
};

const COINS_TO_OPEN_POT = 3;

/** Answers left standing after a 50:50 clue. */
const FIFTY_FIFTY_REMAINING = 2;

const CLUE_COST = {
  HINT: 1,
  FIFTY_FIFTY: 2,
};

const COIN_PER_CORRECT = 1;

/* ---------- maze generation ---------- */

/*
  Randomised depth-first search ("recursive backtracker").

  The grid is (cells * 2 + 1) so that every other row and column is a wall
  that can be carved through. Carving from cell to cell two steps at a time
  guarantees the result is always fully connected, so the honey pot can
  never be sealed off.
*/

let MAZE = [];
let ROWS = 0;
let COLS = 0;

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function pick(items) {
  return items[randInt(items.length)];
}

/** Build a maze and place the bear, the honey pot and the question tiles. */
function generateMaze(config = MAZE_CONFIG) {
  const { cellCols, cellRows, straightness, loopiness } = config;

  const rows = cellRows * 2 + 1;
  const cols = cellCols * 2 + 1;

  // Start solid, then carve corridors out of it.
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(TILE.WALL));

  const seen = Array.from({ length: cellRows }, () =>
    new Array(cellCols).fill(false),
  );

  const toGrid = (cr, cc) => [cr * 2 + 1, cc * 2 + 1];
  const DIRS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  const startCell = [randInt(cellRows), randInt(cellCols)];
  const stack = [startCell];
  seen[startCell[0]][startCell[1]] = true;
  {
    const [gr, gc] = toGrid(startCell[0], startCell[1]);
    grid[gr][gc] = TILE.FLOOR;
  }

  let lastDir = null;

  while (stack.length > 0) {
    const [cr, cc] = stack[stack.length - 1];

    const options = DIRS.filter(([dr, dc]) => {
      const nr = cr + dr;
      const nc = cc + dc;
      return (
        nr >= 0 && nr < cellRows && nc >= 0 && nc < cellCols && !seen[nr][nc]
      );
    });

    if (options.length === 0) {
      stack.pop();
      lastDir = null;
      continue;
    }

    // Prefer carrying straight on sometimes, which produces long corridors
    // broken by junctions rather than a uniform mush.
    let dir = null;
    if (lastDir && Math.random() < straightness) {
      dir = options.find(([dr, dc]) => dr === lastDir[0] && dc === lastDir[1]);
    }
    if (!dir) dir = pick(options);

    const [dr, dc] = dir;
    const nr = cr + dr;
    const nc = cc + dc;

    // Knock out the wall between the two cells.
    const [gr, gc] = toGrid(cr, cc);
    grid[gr + dr][gc + dc] = TILE.FLOOR;
    const [ngr, ngc] = toGrid(nr, nc);
    grid[ngr][ngc] = TILE.FLOOR;

    seen[nr][nc] = true;
    stack.push([nr, nc]);
    lastDir = dir;
  }

  addLoops(grid, rows, cols, loopiness);

  return placeFeatures(grid, rows, cols, config);
}

/**
 * Punch a few extra openings so the maze is not a perfect tree.
 * Without this every wrong turn has to be retraced step for step.
 */
function addLoops(grid, rows, cols, loopiness) {
  if (loopiness <= 0) return;

  const candidates = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (grid[r][c] !== TILE.WALL) continue;
      // Only remove a wall that separates two corridors, never a corner.
      const horizontal =
        grid[r][c - 1] === TILE.FLOOR && grid[r][c + 1] === TILE.FLOOR;
      const vertical =
        grid[r - 1][c] === TILE.FLOOR && grid[r + 1][c] === TILE.FLOOR;
      if (horizontal !== vertical) candidates.push([r, c]);
    }
  }

  const count = Math.floor(candidates.length * loopiness);
  shuffle(candidates)
    .slice(0, count)
    .forEach(([r, c]) => {
      grid[r][c] = TILE.FLOOR;
    });
}

/**
 * Put the bear and the honey pot far apart, then scatter question tiles
 * along the route between them.
 */
function placeFeatures(grid, rows, cols, config) {
  const floors = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === TILE.FLOOR) floors.push([r, c]);
    }
  }

  /*
    Double sweep to find the two furthest apart tiles in the maze (the
    graph diameter): walk from anywhere to find one extreme, then from
    that extreme to find the other. Placing the bear and the pot on those
    two tiles guarantees a long route instead of relying on luck.
  */
  const farthestFrom = (origin) => {
    const dist = floodFill(grid, rows, cols, origin);
    let best = origin;
    let bestDist = -1;
    dist.forEach((d, k) => {
      if (d > bestDist) {
        bestDist = d;
        best = k.split(",").map(Number);
      }
    });
    return { cell: best, dist: bestDist };
  };

  const firstEnd = farthestFrom(pick(floors)).cell;
  const other = farthestFrom(firstEnd);

  const start = firstEnd;
  const honey = other.cell;

  const path = shortestPath(grid, rows, cols, start, honey);

  // Spread the triggers evenly along the solution path, skipping the two
  // end tiles so they never sit on top of the bear or the pot.
  const inner = path.slice(1, -1);
  const wanted = Math.min(config.triggers, inner.length);
  const triggers = [];
  for (let i = 0; i < wanted; i++) {
    const at = Math.round(((i + 1) * inner.length) / (wanted + 1));
    const cell = inner[Math.min(at, inner.length - 1)];
    if (cell && !triggers.some(([r, c]) => r === cell[0] && c === cell[1])) {
      triggers.push(cell);
    }
  }

  triggers.forEach(([r, c]) => {
    grid[r][c] = TILE.TRIGGER;
  });
  grid[honey[0]][honey[1]] = TILE.HONEY;
  grid[start[0]][start[1]] = TILE.START;

  return grid.map((row) => row.join(""));
}

/** Distance from one tile to every reachable tile. */
function floodFill(grid, rows, cols, from) {
  const dist = new Map([[`${from[0]},${from[1]}`, 0]]);
  const queue = [from];

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const d = dist.get(`${r},${c}`);
    [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ].forEach(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;
      const k = `${nr},${nc}`;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return;
      if (grid[nr][nc] === TILE.WALL || dist.has(k)) return;
      dist.set(k, d + 1);
      queue.push([nr, nc]);
    });
  }

  return dist;
}

function shortestPath(grid, rows, cols, from, to) {
  const prev = new Map([[`${from[0]},${from[1]}`, null]]);
  const queue = [from];

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    if (r === to[0] && c === to[1]) break;
    [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ].forEach(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;
      const k = `${nr},${nc}`;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return;
      if (grid[nr][nc] === TILE.WALL || prev.has(k)) return;
      prev.set(k, [r, c]);
      queue.push([nr, nc]);
    });
  }

  const path = [];
  let node = to;
  while (node) {
    path.push(node);
    node = prev.get(`${node[0]},${node[1]}`);
  }
  return path.reverse();
}

/**
 * Arrow key directions leading from the bear to the honey pot.
 * Used by the tests to play a generated maze without knowing its shape.
 */
function routeToHoney() {
  const honey = findTile(TILE.HONEY);
  if (!honey || !state.bear) return [];

  const grid = MAZE.map((row) => row.split(""));
  const cells = shortestPath(
    grid,
    ROWS,
    COLS,
    [state.bear.row, state.bear.col],
    [honey.row, honey.col],
  );

  const names = {
    "-1,0": "ArrowUp",
    "1,0": "ArrowDown",
    "0,-1": "ArrowLeft",
    "0,1": "ArrowRight",
  };

  const moves = [];
  for (let i = 1; i < cells.length; i++) {
    const dr = cells[i][0] - cells[i - 1][0];
    const dc = cells[i][1] - cells[i - 1][1];
    moves.push(names[`${dr},${dc}`]);
  }
  return moves;
}

/** Generate a maze and point the module level MAZE/ROWS/COLS at it. */
function installMaze(config = MAZE_CONFIG) {
  MAZE = generateMaze(config);
  ROWS = MAZE.length;
  COLS = MAZE[0].length;
  return MAZE;
}

/* ---------- game state ---------- */

const state = {
  bear: null,
  coins: 0,
  score: 0,
  steps: 0,
  /** Blocks movement while a question popup is open (used from step 4). */
  paused: false,
  /** Trigger cells already used, keyed by "row,col", so each fires once. */
  usedTriggers: new Set(),
  /** Questions loaded from questions.md. */
  questions: [],
  /** Indices not asked yet this run, so a run never repeats a question. */
  unasked: [],
  /** Bonus questions asked at the pot when coins ran short. */
  bonusAsked: 0,
  /** Set once the pot is open, so the win screen fires only once. */
  won: false,
};

/* ---------- element refs ---------- */

const els = {
  maze: document.getElementById("maze"),
  coinCount: document.getElementById("coin-count"),
  scoreCount: document.getElementById("score-count"),
  status: document.getElementById("status"),
  overlay: document.getElementById("overlay"),
  questionTag: document.getElementById("question-tag"),
  intro: document.getElementById("question-intro"),
  questionText: document.getElementById("question-text"),
  answers: document.getElementById("answers"),
  feedback: document.getElementById("feedback"),
  clues: document.getElementById("clues"),
  hintBtn: document.getElementById("hint-btn"),
  fiftyBtn: document.getElementById("fifty-btn"),
  continueBtn: document.getElementById("continue-btn"),
  winOverlay: document.getElementById("win-overlay"),
  winScore: document.getElementById("win-score"),
  winCoins: document.getElementById("win-coins"),
  winSteps: document.getElementById("win-steps"),
  restartBtn: document.getElementById("restart-btn"),
};

/** Cell divs indexed by "row,col" so redraws touch only what changed. */
const cellEls = new Map();

/* ---------- helpers ---------- */

function findTile(char) {
  for (let r = 0; r < ROWS; r++) {
    const col = MAZE[r].indexOf(char);
    if (col !== -1) return { row: r, col };
  }
  return null;
}

function tileAt(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return TILE.WALL;
  return MAZE[row][col];
}

function isWall(row, col) {
  return tileAt(row, col) === TILE.WALL;
}

function key(row, col) {
  return `${row},${col}`;
}

/** How many question tiles this maze has. */
function countTriggers() {
  return MAZE.reduce(
    (sum, row) => sum + row.split(TILE.TRIGGER).length - 1,
    0,
  );
}

/**
 * Sanity check a generated maze before it is rendered.
 * A generator bug that sealed off the honey pot would otherwise produce a
 * board that simply cannot be finished, so this refuses to draw it.
 */
function validateMaze() {
  const problems = [];

  MAZE.forEach((row, i) => {
    if (row.length !== COLS) {
      problems.push(`שורה ${i} באורך ${row.length} במקום ${COLS}`);
    }
  });

  const start = findTile(TILE.START);
  const honey = findTile(TILE.HONEY);

  if (!start) problems.push("חסרה נקודת התחלה");
  if (!honey) problems.push("חסר סיר דבש");

  // The outer ring must be solid or the bear can walk off the board.
  for (let c = 0; c < COLS; c++) {
    if (MAZE[0][c] !== TILE.WALL || MAZE[ROWS - 1][c] !== TILE.WALL) {
      problems.push("גבול המבוך פרוץ");
      break;
    }
  }
  for (let r = 0; r < ROWS; r++) {
    if (MAZE[r][0] !== TILE.WALL || MAZE[r][COLS - 1] !== TILE.WALL) {
      problems.push("גבול המבוך פרוץ");
      break;
    }
  }

  if (start && honey) {
    const grid = MAZE.map((row) => row.split(""));
    const reach = floodFill(grid, ROWS, COLS, [start.row, start.col]);

    if (!reach.has(key(honey.row, honey.col))) {
      problems.push("אי אפשר להגיע לסיר הדבש");
    }

    const unreachableTriggers = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (MAZE[r][c] === TILE.TRIGGER && !reach.has(key(r, c))) {
          unreachableTriggers.push(key(r, c));
        }
      }
    }
    if (unreachableTriggers.length > 0) {
      problems.push(`יש שאלות שאי אפשר להגיע אליהן: ${unreachableTriggers.length}`);
    }
  }

  return problems;
}

/* ---------- questions.md parsing ---------- */

/*
  Expected shape of each block in questions.md:

      ## the question text
      - [ ] a wrong answer
      - [x] the correct answer
      רמז: an optional hint

  Anything else (headings, blank lines, HTML comments) is ignored.
*/

const RE = {
  question: /^##\s+(.*\S)\s*$/,
  answer: /^\s*[-*]\s*\[([ xX])\]\s*(.*\S)\s*$/,
  hint: /^\s*רמז\s*:\s*(.*\S)\s*$/,
  commentOpen: /<!--/,
  commentClose: /-->/,
};

/**
 * Turn the Markdown source into question objects.
 * Returns { questions, errors } - errors are human readable Hebrew strings.
 */
function parseQuestions(markdown) {
  const questions = [];
  const errors = [];
  const lines = markdown.split(/\r?\n/);

  let current = null;
  let inComment = false;

  const finish = () => {
    if (!current) return;

    const correctCount = current.answers.filter((a) => a.correct).length;
    if (current.answers.length < 2) {
      errors.push(`לשאלה "${current.text}" יש פחות משתי תשובות`);
    } else if (correctCount === 0) {
      errors.push(`לשאלה "${current.text}" אין תשובה נכונה מסומנת [x]`);
    } else if (correctCount > 1) {
      errors.push(`לשאלה "${current.text}" יש ${correctCount} תשובות נכונות`);
    } else {
      questions.push(current);
    }
    current = null;
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    // Skip HTML comment blocks (the editing instructions at the top).
    if (inComment) {
      if (RE.commentClose.test(line)) inComment = false;
      return;
    }
    if (RE.commentOpen.test(line)) {
      if (!RE.commentClose.test(line)) inComment = true;
      return;
    }

    if (!line) return;

    const question = line.match(RE.question);
    if (question) {
      finish();
      current = { text: question[1], answers: [], hint: "" };
      return;
    }

    const answer = line.match(RE.answer);
    if (answer) {
      if (!current) {
        errors.push(`שורה ${index + 1}: תשובה שמופיעה לפני שאלה`);
        return;
      }
      current.answers.push({
        text: answer[2],
        correct: answer[1].toLowerCase() === "x",
      });
      return;
    }

    const hint = line.match(RE.hint);
    if (hint && current) {
      current.hint = hint[1];
    }
  });

  finish();

  if (questions.length === 0 && errors.length === 0) {
    errors.push("לא נמצאו שאלות בקובץ questions.md");
  }

  return { questions, errors };
}

/** Fetch and parse questions.md. Throws with a Hebrew message on failure. */
async function loadQuestions() {
  let response;
  try {
    response = await fetch("questions.md");
  } catch (cause) {
    throw new Error("FETCH_FAILED", { cause });
  }

  if (!response.ok) {
    throw new Error(`שגיאה בטעינת questions.md (קוד ${response.status})`);
  }

  const { questions, errors } = parseQuestions(await response.text());
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return questions;
}

/** Draw a question that has not been asked yet in this run. */
function drawQuestion() {
  if (state.unasked.length === 0) {
    // Every question has been used; reshuffle so play can continue.
    state.unasked = shuffle(state.questions.map((_, i) => i));
  }
  return state.questions[state.unasked.pop()];
}

function shuffle(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ---------- rendering ---------- */

function buildBoard() {
  els.maze.style.setProperty("--cols", COLS);
  els.maze.style.setProperty("--rows", ROWS);
  els.maze.replaceChildren();
  cellEls.clear();

  const fragment = document.createDocumentFragment();

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      if ((row + col) % 2 === 1) cell.classList.add("alt");
      fragment.appendChild(cell);
      cellEls.set(key(row, col), cell);
    }
  }

  els.maze.appendChild(fragment);
  drawBoard();
}

function drawBoard() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      paintCell(row, col);
    }
  }
}

function paintCell(row, col) {
  const cell = cellEls.get(key(row, col));
  if (!cell) return;

  const tile = tileAt(row, col);
  const isBear = state.bear.row === row && state.bear.col === col;
  const alt = (row + col) % 2 === 1;

  cell.className = "cell" + (alt ? " alt" : "");

  if (tile === TILE.WALL) {
    cell.classList.add("wall");
    cell.textContent = EMOJI.WALL;
    return;
  }

  cell.classList.add("floor");

  if (isBear) {
    cell.classList.add("bear");
    cell.textContent = EMOJI.BEAR;
  } else if (tile === TILE.HONEY) {
    cell.classList.add("honey");
    cell.textContent = EMOJI.HONEY;
  } else if (tile === TILE.TRIGGER && !state.usedTriggers.has(key(row, col))) {
    // A used trigger leaves an ordinary floor tile behind, so the board
    // shows at a glance which questions are still waiting.
    cell.classList.add("trigger");
    cell.textContent = EMOJI.TRIGGER;
  } else {
    cell.textContent = "";
  }
}

function updateStats() {
  els.coinCount.textContent = state.coins;
  els.scoreCount.textContent = state.score;
}

/* ---------- question popup ---------- */

/** The question currently on screen, or null when the popup is closed. */
let activeQuestion = null;

/**
 * Open the popup for one question.
 * onDone is called after the player dismisses it, with true if they
 * answered correctly.
 */
function askQuestion(
  question,
  { tag = "שאלה", intro = "", allowClues = true, onDone = () => {} } = {},
) {
  activeQuestion = {
    question,
    onDone,
    answered: false,
    correct: false,
    hintUsed: false,
    fiftyUsed: false,
    allowClues,
    buttons: [],
  };

  state.paused = true;

  els.questionTag.textContent = tag;
  els.questionText.textContent = question.text;

  els.intro.textContent = intro;
  els.intro.hidden = !intro;

  els.feedback.hidden = true;
  els.feedback.textContent = "";
  els.feedback.className = "feedback";

  els.continueBtn.hidden = true;
  els.clues.hidden = !allowClues;

  renderAnswers(question);
  refreshClueButtons();

  els.overlay.hidden = false;
  // Focus the first answer so the keyboard works without a mouse.
  if (activeQuestion.buttons[0]) activeQuestion.buttons[0].focus();
}

function renderAnswers(question) {
  els.answers.replaceChildren();
  activeQuestion.buttons = [];

  // Shuffle so the correct answer is not always in the same position.
  const order = shuffle(question.answers.map((_, i) => i));

  order.forEach((index) => {
    const answer = question.answers[index];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "answer-btn";
    btn.textContent = answer.text;
    btn.addEventListener("click", () => pickAnswer(answer, btn));
    els.answers.appendChild(btn);
    activeQuestion.buttons.push(btn);
    // Remember which button holds the correct answer for the reveal.
    if (answer.correct) activeQuestion.correctBtn = btn;
  });
}

function pickAnswer(answer, btn) {
  if (!activeQuestion || activeQuestion.answered) return;
  if (btn.classList.contains("eliminated")) return;

  activeQuestion.answered = true;
  activeQuestion.correct = answer.correct;

  // Lock every answer and dim the ones that were not chosen.
  activeQuestion.buttons.forEach((b) => {
    b.disabled = true;
    b.classList.add("faded");
  });

  if (answer.correct) {
    btn.classList.remove("faded");
    btn.classList.add("correct");
    addCoins(COIN_PER_CORRECT);
    state.score++;
    updateStats();
    showFeedback("good", `כל הכבוד! תשובה נכונה. קיבלת מטבע 🪙`);
  } else {
    btn.classList.remove("faded");
    btn.classList.add("wrong");
    const correct = activeQuestion.correctBtn;
    if (correct) {
      correct.classList.remove("faded", "eliminated");
      correct.classList.add("correct");
    }
    const correctText = activeQuestion.question.answers.find((a) => a.correct);
    showFeedback(
      "bad",
      `לא נורא. התשובה הנכונה היא: ${correctText ? correctText.text : ""}`,
    );
  }

  els.clues.hidden = true;
  els.continueBtn.hidden = false;
  els.continueBtn.focus();
}

function showFeedback(kind, text) {
  els.feedback.className = `feedback ${kind}`;
  els.feedback.textContent = text;
  els.feedback.hidden = false;
}

function useHint() {
  if (!activeQuestion || activeQuestion.answered) return;
  if (!activeQuestion.allowClues) return;
  if (activeQuestion.hintUsed) return;
  if (state.coins < CLUE_COST.HINT) return;

  const hint = activeQuestion.question.hint;
  if (!hint) {
    showFeedback("hint", "לשאלה הזאת אין רמז.");
    activeQuestion.hintUsed = true;
    refreshClueButtons();
    return;
  }

  addCoins(-CLUE_COST.HINT);
  activeQuestion.hintUsed = true;
  updateStats();
  showFeedback("hint", `💡 ${hint}`);
  refreshClueButtons();
}

function useFiftyFifty() {
  if (!activeQuestion || activeQuestion.answered) return;
  if (!activeQuestion.allowClues) return;
  if (activeQuestion.fiftyUsed) return;
  if (state.coins < CLUE_COST.FIFTY_FIFTY) return;

  const wrong = activeQuestion.buttons.filter(
    (b) => b !== activeQuestion.correctBtn && !b.classList.contains("eliminated"),
  );

  // Keep the correct answer plus enough wrong ones to reach the target.
  const removeCount = Math.max(0, wrong.length - (FIFTY_FIFTY_REMAINING - 1));
  if (removeCount === 0) {
    showFeedback("hint", "אין מספיק תשובות כדי להשתמש בחצי חצי.");
    activeQuestion.fiftyUsed = true;
    refreshClueButtons();
    return;
  }

  addCoins(-CLUE_COST.FIFTY_FIFTY);
  activeQuestion.fiftyUsed = true;
  updateStats();

  shuffle(wrong)
    .slice(0, removeCount)
    .forEach((b) => {
      b.classList.add("eliminated");
      b.disabled = true;
    });

  showFeedback("hint", "✂️ הורדנו תשובות שגויות.");
  refreshClueButtons();
}

/** Enable or disable clue buttons based on coins and what was already used. */
function refreshClueButtons() {
  const canHint =
    activeQuestion &&
    activeQuestion.allowClues &&
    !activeQuestion.answered &&
    !activeQuestion.hintUsed &&
    state.coins >= CLUE_COST.HINT;

  const canFifty =
    activeQuestion &&
    activeQuestion.allowClues &&
    !activeQuestion.answered &&
    !activeQuestion.fiftyUsed &&
    state.coins >= CLUE_COST.FIFTY_FIFTY;

  els.hintBtn.disabled = !canHint;
  els.fiftyBtn.disabled = !canFifty;
}

function closeQuestion() {
  if (!activeQuestion) return;

  const { onDone, correct } = activeQuestion;

  activeQuestion = null;
  els.overlay.hidden = true;
  state.paused = false;

  onDone(correct);
}

function addCoins(delta) {
  state.coins = Math.max(0, state.coins + delta);
  bumpCoinCounter();
}

function bumpCoinCounter() {
  const stat = els.coinCount.parentElement;
  if (!stat || !stat.classList) return;
  stat.classList.remove("bump");
  void stat.offsetWidth;
  stat.classList.add("bump");
}

/* ---------- movement ---------- */

/*
  Keyed by KeyboardEvent.code, not event.key, on purpose.

  event.key returns the produced character, so on a Hebrew keyboard layout
  W A S D produce ' ש ד ג and the WASD controls silently stop working.
  event.code is the physical key position and is layout independent.
*/
const MOVE_KEYS = {
  ArrowUp: { dr: -1, dc: 0 },
  ArrowDown: { dr: 1, dc: 0 },
  ArrowLeft: { dr: 0, dc: -1 },
  ArrowRight: { dr: 0, dc: 1 },
  KeyW: { dr: -1, dc: 0 },
  KeyS: { dr: 1, dc: 0 },
  KeyA: { dr: 0, dc: -1 },
  KeyD: { dr: 0, dc: 1 },
};

/**
 * Try to move the bear by one tile.
 * Returns true if the bear actually moved.
 */
function moveBear(dr, dc) {
  if (state.paused) return false;

  const from = state.bear;
  const row = from.row + dr;
  const col = from.col + dc;

  if (isWall(row, col)) {
    nudge(from.row, from.col);
    return false;
  }

  state.bear = { row, col };
  state.steps++;

  // Repaint only the two affected tiles.
  paintCell(from.row, from.col);
  paintCell(row, col);

  onBearEntered(row, col);
  return true;
}

/** Runs after every successful move. Question logic hooks in here later. */
function onBearEntered(row, col) {
  const tile = tileAt(row, col);

  if (tile === TILE.HONEY) {
    reachedHoney();
    return;
  }

  if (tile === TILE.TRIGGER && !state.usedTriggers.has(key(row, col))) {
    state.usedTriggers.add(key(row, col));
    paintCell(row, col);

    const asked = state.usedTriggers.size;
    const total = countTriggers();
    askQuestion(drawQuestion(), {
      tag: `שאלה ${asked} מתוך ${total}`,
      onDone: () => {
        const left = COINS_TO_OPEN_POT - state.coins;
        setStatus(
          left > 0
            ? `עוד ${left} מטבעות כדי לפתוח את סיר הדבש`
            : "יש מספיק מטבעות! אפשר לגשת לסיר הדבש",
        );
      },
    });
  }
}

/**
 * The bear stepped on the honey pot.
 *
 * If there are not enough coins the pot asks bonus questions, one coin per
 * correct answer, until the player can afford it. This is what stops a
 * player who spent coins on clues from being stranded at the finish with
 * no way left to earn.
 */
function reachedHoney() {
  if (state.won) return;

  if (state.coins >= COINS_TO_OPEN_POT) {
    openHoneyPot();
    return;
  }

  askBonusQuestion();
}

function askBonusQuestion() {
  const missing = COINS_TO_OPEN_POT - state.coins;
  state.bonusAsked++;

  setStatus(`סיר הדבש נעול. חסרים עוד ${missing} מטבעות`);

  askQuestion(drawQuestion(), {
    tag: missing === 1 ? "שאלת בונוס אחרונה" : "שאלת בונוס",
    intro:
      state.bonusAsked === 1
        ? `הדוב הגיע לסיר הדבש אבל הוא נעול. חסרים ${missing} מטבעות. ענו נכון כדי להרוויח אותם.`
        : `נשארו עוד ${missing} מטבעות. ממשיכים!`,
    /*
      No clues on bonus questions. A hint costs exactly what a correct
      answer pays, so allowing purchases here lets the coin balance stall
      forever and the player can never reach the pot.
    */
    allowClues: false,
    onDone: () => {
      if (state.coins >= COINS_TO_OPEN_POT) {
        openHoneyPot();
      } else {
        // Still short, so ask another one. The pool reshuffles when it
        // runs out, so this always terminates with a win eventually.
        askBonusQuestion();
      }
    },
  });
}

function openHoneyPot() {
  state.won = true;
  setStatus("🎉 כל הכבוד! הדוב פתח את סיר הדבש!");
  showWinScreen();
}

/* ---------- win screen ---------- */

function showWinScreen() {
  els.winScore.textContent = state.score;
  els.winCoins.textContent = state.coins;
  els.winSteps.textContent = state.steps;

  state.paused = true;
  els.winOverlay.hidden = false;
  els.restartBtn.focus();
}

/** Reset everything, build a brand new maze and deal fresh questions. */
function restartGame() {
  const problems = buildNewMaze();
  if (problems.length > 0) return;

  state.coins = 0;
  state.score = 0;
  state.steps = 0;
  state.bonusAsked = 0;
  state.won = false;
  state.paused = false;
  state.unasked = shuffle(state.questions.map((_, i) => i));

  activeQuestion = null;
  els.overlay.hidden = true;
  els.winOverlay.hidden = true;

  updateStats();
  setStatus(`כדי לפתוח את סיר הדבש דרושים ${COINS_TO_OPEN_POT} מטבעות`);
}

/**
 * Generate a fresh maze and rebuild the board.
 * Retries a few times if the generator produces something unusable, then
 * gives up and reports the problems rather than drawing a broken board.
 */
function buildNewMaze(attempts = 5) {
  let problems = [];

  for (let i = 0; i < attempts; i++) {
    installMaze();
    problems = validateMaze();
    if (problems.length === 0) {
      state.bear = findTile(TILE.START);
      state.usedTriggers = new Set();
      buildBoard();
      return [];
    }
    console.warn("Discarded an invalid maze:", problems);
  }

  showFatalError(
    "לא הצלחנו לבנות מבוך תקין.",
    problems,
    "רעננו את הדף כדי לנסות שוב.",
  );
  return problems;
}

/** Brief shake so bumping a tree reads as blocked, not as a broken key. */
function nudge(row, col) {
  const cell = cellEls.get(key(row, col));
  if (!cell) return;
  cell.classList.remove("bump-wall");
  // Force reflow so the animation can restart on rapid repeat bumps.
  void cell.offsetWidth;
  cell.classList.add("bump-wall");
}

function setStatus(text) {
  els.status.textContent = text;
}

function handleKeydown(event) {
  // Enter restarts from the win screen.
  if (!els.winOverlay.hidden) {
    if (event.key === "Enter") {
      event.preventDefault();
      restartGame();
    }
    return;
  }

  // While the popup is open the arrow keys belong to the dialog, not
  // the bear. Enter dismisses a resolved question.
  if (activeQuestion) {
    if (event.key === "Enter" && !els.continueBtn.hidden) {
      event.preventDefault();
      closeQuestion();
    }
    return;
  }

  const move = MOVE_KEYS[event.code];
  if (!move) return;

  // Stop arrow keys from scrolling the page.
  event.preventDefault();
  moveBear(move.dr, move.dc);
}

/**
 * Replace the board with a readable Hebrew error.
 * Text is inserted as text nodes, never as HTML, so a broken question
 * cannot inject markup into the page.
 */
function showFatalError(title, problems, footer) {
  els.maze.replaceChildren();

  const panel = document.createElement("div");
  panel.className = "error-panel";

  const heading = document.createElement("strong");
  heading.textContent = title;
  panel.appendChild(heading);

  const list = document.createElement("ul");
  problems.forEach((problem) => {
    const item = document.createElement("li");
    item.textContent = problem;
    list.appendChild(item);
  });
  panel.appendChild(list);

  if (footer) {
    const note = document.createElement("p");
    note.className = "error-footer";
    note.textContent = footer;
    panel.appendChild(note);
  }

  els.maze.appendChild(panel);
  els.status.textContent = "המשחק לא נטען";
}

/** The most common failure: opening index.html directly from the disk. */
function showFileProtocolError() {
  els.maze.replaceChildren();

  const panel = document.createElement("div");
  panel.className = "error-panel";

  const heading = document.createElement("strong");
  heading.textContent = "לא הצלחנו לטעון את קובץ השאלות";
  panel.appendChild(heading);

  const explain = document.createElement("p");
  explain.textContent =
    "הדפדפן חוסם קריאת קבצים כשפותחים את index.html ישירות מהמחשב. " +
    "כדי לשחק במחשב, יש לפתוח חלון טרמינל בתיקיית המשחק ולהריץ:";
  panel.appendChild(explain);

  const cmd = document.createElement("code");
  cmd.textContent = "python3 -m http.server 8000";
  panel.appendChild(cmd);

  const then = document.createElement("p");
  then.textContent = "ואז להיכנס בדפדפן לכתובת:";
  panel.appendChild(then);

  const url = document.createElement("code");
  url.textContent = "http://localhost:8000";
  panel.appendChild(url);

  const note = document.createElement("p");
  note.className = "error-footer";
  note.textContent = "באתר המתפרסם באינטרנט הבעיה הזאת לא קיימת.";
  panel.appendChild(note);

  els.maze.appendChild(panel);
  els.status.textContent = "המשחק לא נטען";
}

/* ---------- init ---------- */

async function init() {
  try {
    state.questions = await loadQuestions();
  } catch (error) {
    if (error.message === "FETCH_FAILED") {
      showFileProtocolError();
    } else {
      showFatalError(
        "יש בעיה בקובץ השאלות questions.md",
        error.message.split("\n"),
        "יש לתקן את הקובץ ולרענן את הדף. לבדיקה: python3 check_questions.py",
      );
    }
    console.error("Failed to load questions:", error);
    return;
  }

  state.unasked = shuffle(state.questions.map((_, i) => i));

  if (buildNewMaze().length > 0) return;

  updateStats();
  setStatus(`כדי לפתוח את סיר הדבש דרושים ${COINS_TO_OPEN_POT} מטבעות`);

  document.addEventListener("keydown", handleKeydown);
  els.hintBtn.addEventListener("click", useHint);
  els.fiftyBtn.addEventListener("click", useFiftyFifty);
  els.continueBtn.addEventListener("click", closeQuestion);
  els.restartBtn.addEventListener("click", restartGame);

  console.info(`נטענו ${state.questions.length} שאלות`);
}

/** Resolves once questions are loaded and the board is interactive. */
const ready = init();
