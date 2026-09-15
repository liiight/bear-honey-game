/* Question popup: answering, coins, hints and 50:50.
   Run: node popup_test.js */

const { freshDom, stubFetch, loadGame, makeChecker } = require("./test_dom");

const { ids, listeners } = freshDom();
stubFetch();
const game = loadGame();
const { state, CLUE_COST } = game;
const checker = makeChecker();

game.ready.then(run);

/* helpers */
const answerButtons = () => ids.answers.children;
const correctBtn = () => {
  const q = state.questions.find((x) => x.text === ids["question-text"].textContent);
  const text = q.answers.find((a) => a.correct).text;
  return answerButtons().find((b) => b.textContent === text);
};
const wrongBtn = () => {
  const q = state.questions.find((x) => x.text === ids["question-text"].textContent);
  const text = q.answers.find((a) => a.correct).text;
  return answerButtons().find((b) => b.textContent !== text);
};
const ask = (q) => game.askQuestion(q || state.questions[0]);

function run() {
  const check = checker.check;

  /* ---------- opening ---------- */
  console.log("-- opening --");

  ask(state.questions[0]);
  check("overlay visible", ids.overlay.hidden, false);
  check("game paused", state.paused, true);
  check("question text shown", ids["question-text"].textContent, state.questions[0].text);
  check("four answer buttons", answerButtons().length, 4);
  check("feedback hidden initially", ids.feedback.hidden, true);
  check("continue hidden initially", ids["continue-btn"].hidden, true);
  check("clues visible", ids.clues.hidden, false);

  /* ---------- correct answer ---------- */
  console.log("\n-- correct answer --");

  const coinsBefore = state.coins;
  correctBtn().click();
  check("coin awarded", state.coins, coinsBefore + 1);
  check("score incremented", state.score, 1);
  check("coin counter updated", ids["coin-count"].textContent, state.coins);
  check("positive feedback shown", ids.feedback.hidden, false);
  check("feedback styled good", ids.feedback.className.includes("good"), true);
  check("chosen answer marked correct", correctBtn().className.includes("correct"), true);
  check("continue button appears", ids["continue-btn"].hidden, false);
  check("clues hidden after answering", ids.clues.hidden, true);
  check("all answers disabled", answerButtons().every((b) => b.disabled), true);

  // Clicking again must not award a second coin.
  const afterAnswer = state.coins;
  correctBtn().click();
  wrongBtn().click();
  check("cannot answer twice", state.coins, afterAnswer);

  game.closeQuestion();
  check("overlay hidden after continue", ids.overlay.hidden, true);
  check("unpaused after continue", state.paused, false);

  /* ---------- wrong answer ---------- */
  console.log("\n-- wrong answer --");

  const coinsBeforeWrong = state.coins;
  const scoreBeforeWrong = state.score;
  ask(state.questions[1]);
  wrongBtn().click();
  check("no coin for a wrong answer", state.coins, coinsBeforeWrong);
  check("score unchanged", state.score, scoreBeforeWrong);
  check("feedback styled bad", ids.feedback.className.includes("bad"), true);
  check(
    "correct answer revealed",
    correctBtn().className.includes("correct"),
    true,
  );
  check(
    "feedback names the right answer",
    ids.feedback.textContent.includes(
      state.questions[1].answers.find((a) => a.correct).text,
    ),
    true,
  );
  game.closeQuestion();

  /* ---------- hint ---------- */
  console.log("\n-- hint --");

  state.coins = 0;
  ask(state.questions[2]);
  check("hint disabled with no coins", ids["hint-btn"].disabled, true);
  game.useHint();
  check("hint does nothing when broke", ids.feedback.hidden, true);

  state.coins = 5;
  ask(state.questions[2]);
  check("hint enabled with coins", ids["hint-btn"].disabled, false);
  game.useHint();
  check("hint costs one coin", state.coins, 5 - CLUE_COST.HINT);
  check("hint text displayed", ids.feedback.hidden, false);
  check(
    "hint matches the question",
    ids.feedback.textContent.includes(state.questions[2].hint),
    true,
  );
  check("hint cannot be bought twice", ids["hint-btn"].disabled, true);
  const afterHint = state.coins;
  game.useHint();
  check("second hint is free of charge", state.coins, afterHint);
  game.closeQuestion();

  /* ---------- 50:50 ---------- */
  console.log("\n-- 50:50 --");

  state.coins = 1;
  ask(state.questions[3]);
  check("50:50 disabled with 1 coin", ids["fifty-btn"].disabled, true);

  state.coins = 4;
  ask(state.questions[3]);
  check("50:50 enabled with 4 coins", ids["fifty-btn"].disabled, false);
  game.useFiftyFifty();
  check("50:50 costs two coins", state.coins, 4 - CLUE_COST.FIFTY_FIFTY);

  const live = answerButtons().filter((b) => !b.className.includes("eliminated"));
  check("two answers remain", live.length, 2);
  check(
    "correct answer survives",
    live.some((b) => b === correctBtn()),
    true,
  );
  check(
    "eliminated answers are disabled",
    answerButtons()
      .filter((b) => b.className.includes("eliminated"))
      .every((b) => b.disabled),
    true,
  );
  check("50:50 cannot be bought twice", ids["fifty-btn"].disabled, true);

  // A surviving wrong answer is still clickable and still wrong.
  const coinsNow = state.coins;
  live.find((b) => b !== correctBtn()).click();
  check("surviving wrong answer gives no coin", state.coins, coinsNow);
  game.closeQuestion();

  /* ---------- eliminated answers are unclickable ---------- */
  console.log("\n-- eliminated answers --");

  state.coins = 4;
  ask(state.questions[4]);
  game.useFiftyFifty();
  const dead = answerButtons().find((b) => b.className.includes("eliminated"));
  const coinsBeforeDead = state.coins;
  dead.click();
  check("clicking an eliminated answer does nothing", state.coins, coinsBeforeDead);
  check("question still unanswered", ids["continue-btn"].hidden, true);
  game.closeQuestion();

  /* ---------- coins never go negative ---------- */
  console.log("\n-- coin floor --");

  state.coins = 0;
  ask(state.questions[5]);
  game.useHint();
  game.useFiftyFifty();
  check("coins cannot go negative", state.coins >= 0, true);
  check("coins still zero", state.coins, 0);
  game.closeQuestion();

  /* ---------- answer order varies ---------- */
  console.log("\n-- answer shuffling --");

  const positions = new Set();
  for (let i = 0; i < 40; i++) {
    ask(state.questions[0]);
    positions.add(answerButtons().findIndex((b) => b === correctBtn()));
    game.closeQuestion();
  }
  check("correct answer is not always first", positions.size > 1, true);

  checker.done();
}
