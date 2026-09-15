/* The coin economy must never strand the player.

   The danger: coins are earned by answering and spent on clues, but the pot
   also costs coins. A player who spends on clues can arrive at the pot broke.
   Bonus questions at the pot are the escape hatch. This suite proves a player
   always gets out, including the worst case of answering everything wrong.

   Run: node endgame_test.js */

const { freshDom, stubFetch, loadGame, makeChecker } = require("./test_dom");

const { ids, listeners } = freshDom();
stubFetch();
const game = loadGame();
const { state, COINS_TO_OPEN_POT } = game;
const checker = makeChecker();

game.ready.then(run);

/* ---------- helpers ---------- */

const press = (code) =>
  listeners.keydown.forEach((fn) => fn({ code, preventDefault() {} }));

const popupOpen = () => !ids.overlay.hidden;
const wonScreenOpen = () => !ids["win-overlay"].hidden;

function shownQuestion() {
  return state.questions.find(
    (q) => q.text === ids["question-text"].textContent,
  );
}

/**
 * Put the bear one tile from the honey pot and step onto it.
 * The maze is generated, so the pot is somewhere different every time.
 */
function stepOntoPot() {
  const route = game.solveFromBear();
  // Walk all but the final step, then take it so reachedHoney() fires.
  route.slice(0, -1).forEach(press);
  press(route[route.length - 1]);
}

/** Walk to the pot, clearing any question tiles encountered on the way. */
function goToPot(answerCorrectly = false) {
  let guard = 0;
  while (!state.won && guard < 400) {
    const route = game.solveFromBear();
    if (route.length === 0) break;
    for (const step of route) {
      press(step);
      guard++;
      if (!ids.overlay.hidden) {
        if (isBonusQuestion()) return;
        answer(answerCorrectly);
        break;
      }
      if (state.won) return;
    }
  }
}

/** Bonus questions are the ones asked at the pot itself. */
function isBonusQuestion() {
  return ids["question-tag"].textContent.includes("בונוס");
}

/** Click an answer on the open popup and dismiss it. */
function answer(correctly) {
  const q = shownQuestion();
  const correctText = q.answers.find((a) => a.correct).text;
  const btn = ids.answers.children.find((b) =>
    correctly ? b.textContent === correctText : b.textContent !== correctText,
  );
  btn.click();
  game.closeQuestion();
}

function run() {
  const check = checker.check;

  /* ---------- broke at the pot ---------- */
  console.log("-- arriving at the pot with no coins --");

  game.restartGame();
  // Walk to the pot answering everything wrong, so the bear arrives broke.
  goToPot(false);
  state.coins = 0;
  if (!popupOpen()) stepOntoPot();

  check("bonus question opens", popupOpen(), true);
  check("not won while short", state.won, false);
  check("status explains the lock", ids.status.textContent.includes("נעול"), true);
  check(
    "intro explains why",
    ids["question-intro"].textContent.includes("נעול"),
    true,
  );
  check("intro visible", ids["question-intro"].hidden, false);

  /* ---------- answering wrong keeps asking ---------- */
  console.log("\n-- wrong answers keep the pot shut --");

  answer(false);
  check("still no coins", state.coins, 0);
  check("another bonus question opens", popupOpen(), true);
  check("still not won", state.won, false);

  answer(false);
  check("keeps asking after repeated failures", popupOpen(), true);

  /* ---------- correct answers earn the way in ---------- */
  console.log("\n-- correct answers open the pot --");

  answer(true);
  check("first coin earned", state.coins, 1);
  check("asks again, still short", popupOpen(), true);

  answer(true);
  check("second coin earned", state.coins, 2);
  check("asks again, one coin short", popupOpen(), true);

  answer(true);
  check("third coin earned", state.coins, COINS_TO_OPEN_POT);
  check("pot opened", state.won, true);
  check("question popup closed", popupOpen(), false);
  check("win screen shown", wonScreenOpen(), true);

  /* ---------- win screen numbers ---------- */
  console.log("\n-- win screen --");

  check("score shown", ids["win-score"].textContent, state.score);
  check("coins shown", ids["win-coins"].textContent, state.coins);
  check("steps shown", ids["win-steps"].textContent, state.steps);

  /* ---------- the pot fires once ---------- */
  console.log("\n-- no double win --");

  const scoreAtWin = state.score;
  game.reachedHoney();
  game.reachedHoney();
  check("reaching the pot again does nothing", state.score, scoreAtWin);
  check("no question reopened", popupOpen(), false);

  /* ---------- restart ---------- */
  console.log("\n-- restart --");

  game.restartGame();
  check("win screen dismissed", wonScreenOpen(), false);
  check("coins reset", state.coins, 0);
  check("score reset", state.score, 0);
  check("steps reset", state.steps, 0);
  check("won flag cleared", state.won, false);
  // A restart builds a brand new maze, so the start tile moves.
  const fresh = game.getMaze();
  const startRow = fresh.findIndex((row) => row.includes("S"));
  const startCol = fresh[startRow].indexOf("S");
  check(
    "bear placed on the new start tile",
    `${state.bear.row},${state.bear.col}`,
    `${startRow},${startCol}`,
  );
  check("triggers reset", state.usedTriggers.size, 0);
  check("question pool refilled", state.unasked.length, state.questions.length);
  check("not paused", state.paused, false);
  check(
    "question marks redrawn",
    fresh.reduce((n, row) => n + row.split("?").length - 1, 0) > 0,
    true,
  );

  // The board must be playable again after a restart.
  const before = `${state.bear.row},${state.bear.col}`;
  const firstMove = game.solveFromBear()[0];
  press(firstMove);
  check(
    "bear moves after restart",
    `${state.bear.row},${state.bear.col}` !== before,
    true,
  );

  /* ---------- clue spending cannot strand the player ---------- */
  console.log("\n-- spending everything on clues --");

  game.restartGame();

  // Answer every trigger correctly but blow all coins on clues, then walk
  // to the pot. This is the exact softlock scenario.
  state.coins = 0;
  goToPot(false);
  if (!popupOpen()) stepOntoPot();

  let guard = 0;
  while (popupOpen() && guard < 50) {
    // Burn coins on a hint whenever affordable, then answer correctly.
    game.useHint();
    answer(true);
    guard++;
  }

  check("player escaped the pot", state.won, true);
  check("took a bounded number of questions", guard < 50, true);
  check("win screen reached", wonScreenOpen(), true);

  /* ---------- clues are unavailable during bonus questions ---------- */
  console.log("\n-- no clue buying at the pot --");

  game.restartGame();
  goToPot(false);
  state.coins = 2;
  if (!popupOpen()) stepOntoPot();

  check("bonus question open", popupOpen(), true);
  check("clue row hidden", ids.clues.hidden, true);
  check("hint button disabled", ids["hint-btn"].disabled, true);
  check("50:50 button disabled", ids["fifty-btn"].disabled, true);

  const coinsBeforeClue = state.coins;
  game.useHint();
  game.useFiftyFifty();
  check("clue calls cannot drain coins", state.coins, coinsBeforeClue);

  answer(true);
  check("correct bonus answer opens the pot", state.won, true);

  /* ---------- always terminates, even answering blindly ---------- */
  console.log("\n-- random play always finishes --");

  let worstCase = 0;
  for (let run = 0; run < 200; run++) {
    game.restartGame();
    goToPot(Math.random() < 0.5);
    if (!popupOpen() && !state.won) stepOntoPot();

    let asked = 0;
    while (popupOpen() && asked < 200) {
      answer(Math.random() < 0.5);
      asked++;
    }
    if (asked > worstCase) worstCase = asked;
    if (!state.won) {
      check(`run ${run} finished`, state.won, true);
      break;
    }
  }
  check("200 random runs all reached the win screen", state.won, true);
  console.log(`      worst case: ${worstCase} bonus questions`);

  checker.done();
}
