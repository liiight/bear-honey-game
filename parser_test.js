/* Tests for the questions.md parser in game.js.
   Run: node parser_test.js */

const fs = require("fs");
const { freshDom, loadGame } = require("./test_dom");

const { ids } = freshDom();
// init() calls fetch; reject so loading is driven by each test instead.
global.fetch = async () => {
  throw new Error("no network in tests");
};

const game = loadGame();
const { state, parseQuestions, drawQuestion, shuffle, showFatalError } = game;

/* ---------- harness ---------- */

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`,
  );
}

/* ---------- the real file ---------- */

console.log("-- questions.md --");

const source = fs.readFileSync("questions.md", "utf8");
const real = parseQuestions(source);

check("no parse errors", real.errors.length, 0);
check("10 questions parsed", real.questions.length, 10);
check("every question has text", real.questions.every((q) => q.text.length > 0), true);
check("every question has a hint", real.questions.every((q) => q.hint.length > 0), true);
check(
  "every question has exactly one correct answer",
  real.questions.every((q) => q.answers.filter((a) => a.correct).length === 1),
  true,
);
check(
  "every question has 4 answers",
  real.questions.every((q) => q.answers.length === 4),
  true,
);
check(
  "editing instructions comment was skipped",
  real.questions.some((q) => q.text.includes("איך עורכים")),
  false,
);
check(
  "hint text excludes the label",
  real.questions[0].hint.startsWith("רמז"),
  false,
);

const first = real.questions[0];
check("first question text", first.text, "באיזה חודש עברי חל ראש השנה?");
check("first correct answer", first.answers.find((a) => a.correct).text, "בתשרי");

/* ---------- malformed input is rejected ---------- */

console.log("\n-- malformed input --");

const noCorrect = parseQuestions("## שאלה\n- [ ] א\n- [ ] ב");
check("no correct answer is an error", noCorrect.errors.length, 1);
check("no correct answer yields no question", noCorrect.questions.length, 0);
check(
  "error mentions the missing marker",
  noCorrect.errors[0].includes("[x]"),
  true,
);

const twoCorrect = parseQuestions("## שאלה\n- [x] א\n- [x] ב");
check("two correct answers is an error", twoCorrect.errors.length, 1);

const oneAnswer = parseQuestions("## שאלה\n- [x] א");
check("single answer is an error", oneAnswer.errors.length, 1);

const orphan = parseQuestions("- [x] תשובה בלי שאלה");
check("answer before any question is an error", orphan.errors.length, 1);

const empty = parseQuestions("# כותרת בלבד\n\nסתם טקסט");
check("file with no questions is an error", empty.errors.length, 1);

const mixed = parseQuestions(
  "## טובה\n- [ ] א\n- [x] ב\n\n## רעה\n- [ ] א\n- [ ] ב",
);
check("valid question still parsed alongside a broken one", mixed.questions.length, 1);
check("broken question reported", mixed.errors.length, 1);

/* ---------- format tolerance ---------- */

console.log("\n-- format tolerance --");

check(
  "uppercase [X] accepted",
  parseQuestions("## ש\n- [X] נכון\n- [ ] לא").questions.length,
  1,
);
check(
  "asterisk bullets accepted",
  parseQuestions("## ש\n* [x] נכון\n* [ ] לא").questions.length,
  1,
);
check(
  "extra blank lines tolerated",
  parseQuestions("## ש\n\n- [x] נכון\n\n- [ ] לא\n\n").questions.length,
  1,
);
check(
  "trailing whitespace tolerated",
  parseQuestions("## ש   \n- [x] נכון   \n- [ ] לא").questions.length,
  1,
);
check(
  "windows line endings tolerated",
  parseQuestions("## ש\r\n- [x] נכון\r\n- [ ] לא").questions.length,
  1,
);
check(
  "hint is optional",
  parseQuestions("## ש\n- [x] נכון\n- [ ] לא").questions[0].hint,
  "",
);

/* ---------- question drawing ---------- */

console.log("\n-- drawing --");

state.questions = real.questions;
state.unasked = shuffle(real.questions.map((_, i) => i));

const drawn = [];
for (let i = 0; i < 10; i++) drawn.push(drawQuestion().text);
check("10 draws return 10 questions", drawn.length, 10);
check("no repeats within one run", new Set(drawn).size, 10);

// An 11th draw must reshuffle rather than crash or return undefined.
const extra = drawQuestion();
check("draw past the pool still returns a question", typeof extra.text, "string");

// Shuffle must not lose or duplicate entries.
const shuffled = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
check("shuffle preserves length", shuffled.length, 10);
check("shuffle preserves all items", new Set(shuffled).size, 10);

/* ---------- error panel escapes content ---------- */

console.log("\n-- error panel safety --");

showFatalError("כותרת", ["<img src=x onerror=alert(1)>"], "סיום");
const panel = ids.maze.children[0];
const listItem = panel.children[1].children[0];
check("problem text set as text, not HTML", listItem.innerHTML, "");
check(
  "problem text preserved verbatim",
  listItem.textContent,
  "<img src=x onerror=alert(1)>",
);

console.log(
  failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
