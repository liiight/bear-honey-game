/* Bear & Honey - Rosh HaShana maze game
   Step 1: draw the board. Movement, questions and coins come next.

   Maze legend:
     #  wall
     .  floor
     S  bear start
     H  honey pot
     ?  question trigger

   If you edit MAZE, keep check_maze.py in sync and run:
       python3 check_maze.py
   It verifies the board is the right size and still solvable. */

const MAZE = [
  "###############",
  "#S..?.#.......#",
  "#.###.#.#####.#",
  "#.#...#.#..?#.#",
  "#.#.###.#.#.#.#",
  "#...#.?.#.#...#",
  "#.###.###.###.#",
  "#.#...#...#..?#",
  "#.#.#####.#.###",
  "#..?#.....#..H#",
  "###############",
];

const ROWS = MAZE.length;
const COLS = MAZE[0].length;

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

/* ---------- game state ---------- */

const state = {
  bear: findTile(TILE.START),
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

/**
 * Fail loudly at load time rather than rendering a broken board.
 * check_maze.py does the same checks; this guards the copy in this file.
 */
function validateMaze() {
  const problems = [];

  MAZE.forEach((row, i) => {
    if (row.length !== COLS) {
      problems.push(`שורה ${i} באורך ${row.length} במקום ${COLS}`);
    }
  });

  if (!findTile(TILE.START)) problems.push("חסרה נקודת התחלה (S)");
  if (!findTile(TILE.HONEY)) problems.push("חסר סיר דבש (H)");

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
  } else if (tile === TILE.TRIGGER) {
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
    askQuestion(drawQuestion(), {
      tag: `שאלה ${asked}`,
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

/** Reset everything and deal a fresh set of questions. */
function restartGame() {
  state.bear = findTile(TILE.START);
  state.coins = 0;
  state.score = 0;
  state.steps = 0;
  state.bonusAsked = 0;
  state.won = false;
  state.paused = false;
  state.usedTriggers = new Set();
  state.unasked = shuffle(state.questions.map((_, i) => i));

  activeQuestion = null;
  els.overlay.hidden = true;
  els.winOverlay.hidden = true;

  drawBoard();
  updateStats();
  setStatus(`כדי לפתוח את סיר הדבש דרושים ${COINS_TO_OPEN_POT} מטבעות`);
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
  const problems = validateMaze();
  if (problems.length > 0) {
    showFatalError(
      "המבוך לא תקין ולכן המשחק לא נטען.",
      problems,
      "יש לתקן את המשתנה MAZE בקובץ game.js ולהריץ: python3 check_maze.py",
    );
    console.error("Maze validation failed:", problems);
    return;
  }

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

  buildBoard();
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
