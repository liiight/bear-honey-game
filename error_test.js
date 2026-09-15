/* Verify the load-failure paths render a readable panel.
   Run: node error_test.js */

const fs = require("fs");
const { freshDom, loadGame } = require("./test_dom");

/** Collect all text in a panel subtree. */
function textOf(el) {
  let out = el.textContent || "";
  el.children.forEach((c) => {
    out += " " + textOf(c);
  });
  return out;
}

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : ` (expected ${expected})`}`,
  );
}

// Reloaded per case so each gets a clean module state.
const { loadGame: load } = require("./test_dom");

async function run() {
  /* --- case 1: fetch rejects, as it does on file:// --- */
  console.log("-- file:// (fetch rejects) --");
  let ids = freshDom().ids;
  global.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await load().ready;

  let panel = ids.maze.children[0];
  check("a panel was rendered", !!panel, true);
  check("panel has error styling", panel ? panel.className : "", "error-panel");
  let text = panel ? textOf(panel) : "";
  check("explains the file cannot load", text.includes("לא הצלחנו לטעון"), true);
  check("gives the server command", text.includes("python3 -m http.server"), true);
  check("gives the localhost url", text.includes("http://localhost:8000"), true);
  check("status line updated", ids.status.textContent, "המשחק לא נטען");

  /* --- case 2: 404 --- */
  console.log("\n-- questions.md missing (404) --");
  ids = freshDom().ids;
  global.fetch = async () => ({ ok: false, status: 404, text: async () => "" });
  await load().ready;

  panel = ids.maze.children[0];
  check("a panel was rendered", !!panel, true);
  text = panel ? textOf(panel) : "";
  check("mentions the status code", text.includes("404"), true);

  /* --- case 3: malformed questions --- */
  console.log("\n-- malformed questions.md --");
  ids = freshDom().ids;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "## שאלה בלי תשובה נכונה\n- [ ] א\n- [ ] ב",
  });
  await load().ready;

  panel = ids.maze.children[0];
  check("a panel was rendered", !!panel, true);
  text = panel ? textOf(panel) : "";
  check("names the broken question", text.includes("שאלה בלי תשובה נכונה"), true);
  check("says what is wrong", text.includes("[x]"), true);
  check("points at the checker", text.includes("check_questions.py"), true);

  /* --- case 4: happy path renders a board, not a panel --- */
  console.log("\n-- valid questions.md --");
  ids = freshDom().ids;
  global.fetch = async (url) => ({
    ok: true,
    status: 200,
    text: async () => fs.readFileSync(url, "utf8"),
  });
  await load().ready;

  const cells = ids.maze.children.flatMap((c) =>
    c.tagName === "fragment" ? c.children : [c],
  );
  check("board rendered", cells.length, 165);
  check(
    "no error panel",
    ids.maze.children.some((c) => c.className === "error-panel"),
    false,
  );

  console.log(
    failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

run();
