/* Shared DOM stub for the Node test files.
   Implements just enough of the browser API for game.js to run headless.
   Not part of the game. */

const fs = require("fs");

function makeEl(tag = "div") {
  const el = {
    tagName: tag,
    type: "",
    className: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    children: [],
    offsetWidth: 0,
    parentElement: null,
    _listeners: {},

    style: {
      _props: {},
      setProperty(k, v) {
        this._props[k] = v;
      },
    },

    classList: {
      _owner: null,
      add(...names) {
        const cur = this._owner.className.split(" ").filter(Boolean);
        names.forEach((n) => {
          if (!cur.includes(n)) cur.push(n);
        });
        this._owner.className = cur.join(" ");
      },
      remove(...names) {
        this._owner.className = this._owner.className
          .split(" ")
          .filter((c) => c && !names.includes(c))
          .join(" ");
      },
      contains(n) {
        return this._owner.className.split(" ").includes(n);
      },
    },

    appendChild(child) {
      child.parentElement = el;
      this.children.push(child);
      return child;
    },
    replaceChildren(...kids) {
      kids.forEach((k) => {
        k.parentElement = el;
      });
      this.children = kids;
    },
    addEventListener(type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    /** Fire listeners registered for an event type. */
    click() {
      (this._listeners.click || []).forEach((fn) => fn({}));
    },
    focus() {
      el.focused = true;
    },
  };
  el.classList._owner = el;
  return el;
}

/**
 * Build a fresh document containing every element id index.html defines,
 * so game.js can wire itself up without null checks.
 */
function freshDom() {
  const ids = {};
  [
    "maze",
    "coin-count",
    "score-count",
    "status",
    "overlay",
    "question-tag",
    "question-text",
    "answers",
    "feedback",
    "clues",
    "hint-btn",
    "fifty-btn",
    "continue-btn",
    "question-intro",
    "win-overlay",
    "win-score",
    "win-coins",
    "win-steps",
    "restart-btn",
  ].forEach((id) => {
    ids[id] = makeEl();
  });

  // The coin counter sits inside a .stat wrapper that gets the bump class.
  const statWrap = makeEl();
  statWrap.appendChild(ids["coin-count"]);

  // index.html ships these hidden; mirror that so tests see the real
  // starting state instead of an overlay that is already open.
  ids.overlay.hidden = true;
  ids.feedback.hidden = true;
  ids["continue-btn"].hidden = true;
  ids["question-intro"].hidden = true;
  ids["win-overlay"].hidden = true;

  const docListeners = {};

  global.document = {
    getElementById: (id) => ids[id] || null,
    createElement: makeEl,
    createDocumentFragment: () => makeEl("fragment"),
    addEventListener: (type, fn) => {
      (docListeners[type] = docListeners[type] || []).push(fn);
    },
  };
  global.window = { addEventListener: global.document.addEventListener };

  return { ids, listeners: docListeners };
}

/** Serve questions.md (or supplied text) the way the browser would. */
function stubFetch(body) {
  global.fetch = async (url) => ({
    ok: true,
    status: 200,
    text: async () => (body === undefined ? fs.readFileSync(url, "utf8") : body),
  });
}

/**
 * Evaluate game.js and return the bindings tests need.
 * Function declarations do not escape this scope, so they are handed back
 * explicitly alongside the const bindings.
 */
function loadGame() {
  return eval(
    fs.readFileSync(`${__dirname}/game.js`, "utf8") +
      `\n;({
        state, MAZE, COINS_TO_OPEN_POT, CLUE_COST, FIFTY_FIFTY_REMAINING, ready,
        parseQuestions, drawQuestion, shuffle, showFatalError,
        askQuestion, closeQuestion, useHint, useFiftyFifty,
        restartGame, reachedHoney,
      });`,
  );
}

/** Flatten the maze children (a fragment wraps them on first render). */
function mazeCells(maze) {
  return maze.children.flatMap((c) =>
    c.tagName === "fragment" ? c.children : [c],
  );
}

/** Simple assertion helper shared by the suites. */
function makeChecker() {
  const api = {
    failures: 0,
    check(label, actual, expected) {
      const ok = actual === expected;
      if (!ok) api.failures++;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${
          ok ? "" : ` (expected ${expected})`
        }`,
      );
    },
    done() {
      console.log(
        api.failures === 0
          ? "\nAll checks passed"
          : `\n${api.failures} check(s) failed`,
      );
      process.exit(api.failures === 0 ? 0 : 1);
    },
  };
  return api;
}

module.exports = { makeEl, freshDom, stubFetch, loadGame, mazeCells, makeChecker };
