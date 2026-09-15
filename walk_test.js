/* End-to-end walk on generated mazes.

   Solves each maze, walks it, answers every question, and confirms the run
   ends at the honey pot. Repeated across many mazes because the layout is
   random, so a bug might only appear on some of them.

   Run: node walk_test.js [runs] */

const { freshDom, stubFetch, loadGame, makeChecker } = require("./test_dom");

const RUNS = Number(process.argv[2]) || 40;

const { ids, listeners } = freshDom();
stubFetch();
const game = loadGame();
const { state } = game;
const checker = makeChecker();

game.ready.then(run);

const press = (code) =>
  listeners.keydown.forEach((fn) => fn({ code, preventDefault() {} }));

/** Answer whatever question is open, then dismiss it. */
function answerOpenQuestion(correctly) {
  const shown = state.questions.find(
    (q) => q.text === ids["question-text"].textContent,
  );
  const correctText = shown.answers.find((a) => a.correct).text;
  const btn = ids.answers.children.find((b) =>
    correctly ? b.textContent === correctText : b.textContent !== correctText,
  );
  btn.click();
  game.closeQuestion();
}

function run() {
  const check = checker.check;

  let totalQuestions = 0;
  let totalSteps = 0;
  let shortest = Infinity;
  let longest = 0;
  const problems = [];

  for (let i = 0; i < RUNS; i++) {
    game.restartGame();

    const maze = game.getMaze();
    const cols = maze[0].length;
    const triggers = maze.reduce((n, row) => n + row.split("?").length - 1, 0);

    let asked = 0;
    let guard = 0;

    // Walk toward the pot, recomputing after each question so the route
    // is always taken from wherever the bear currently stands.
    while (!state.won && guard < 400) {
      const route = game.solveFromBear();
      if (route.length === 0) break;

      for (const step of route) {
        press(step);
        guard++;
        if (!ids.overlay.hidden) {
          answerOpenQuestion(true);
          asked++;
          break;
        }
        if (state.won) break;
      }
    }

    const honeyRow = maze.findIndex((row) => row.includes("H"));
    const honeyCol = maze[honeyRow].indexOf("H");

    if (!state.won) problems.push(`run ${i}: never reached the pot`);
    if (state.bear.row !== honeyRow || state.bear.col !== honeyCol) {
      problems.push(`run ${i}: bear ended off the pot`);
    }
    if (asked < triggers) {
      problems.push(`run ${i}: answered ${asked} of ${triggers} questions`);
    }

    // The bear must never be standing inside a wall.
    if (maze[state.bear.row][state.bear.col] === "#") {
      problems.push(`run ${i}: bear ended inside a wall`);
    }

    totalQuestions += asked;
    totalSteps += state.steps;
    shortest = Math.min(shortest, state.steps);
    longest = Math.max(longest, state.steps);
  }

  check(`${RUNS} generated mazes all completed`, problems.length, 0);
  if (problems.length > 0) problems.slice(0, 5).forEach((p) => console.log("   ", p));

  console.log(
    `      steps: min ${shortest}, avg ${Math.round(totalSteps / RUNS)}, max ${longest}`,
  );
  console.log(`      questions answered: ${totalQuestions}`);

  /* ---------- fuzz ---------- */

  console.log("\n-- fuzz --");

  game.restartGame();
  const codes = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"];
  let illegal = 0;

  for (let i = 0; i < 4000; i++) {
    press(codes[Math.floor(Math.random() * codes.length)]);

    // Random walking can reach the pot or a question; clear them so the
    // fuzz keeps moving instead of stalling behind a modal.
    if (!ids.overlay.hidden) answerOpenQuestion(Math.random() < 0.5);
    if (state.won) game.restartGame();

    const maze = game.getMaze();
    const { row, col } = state.bear;
    const inside = row >= 0 && row < maze.length && col >= 0 && col < maze[0].length;
    if (!inside || maze[row][col] === "#") illegal++;
  }

  check("bear never enters a wall (4000 random moves)", illegal, 0);

  checker.done();
}
