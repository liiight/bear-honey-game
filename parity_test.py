"""Confirm the JS and Python parsers agree.

check_questions.py is only trustworthy if it accepts and rejects exactly
what game.js does. This feeds the same inputs to both and compares.

Run: python3 parity_test.py
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from check_questions import parse as py_parse

HERE = Path(__file__).parent

JS_HARNESS = r"""
const fs = require("fs");
function makeEl(){const e={className:"",textContent:"",innerHTML:"",children:[],
offsetWidth:0,style:{_props:{},setProperty(){}},
classList:{add(){},remove(){},contains(){return false}},
appendChild(c){this.children.push(c);return c},replaceChildren(){this.children=[]}};
return e;}
const ids={maze:makeEl(),"coin-count":makeEl(),"score-count":makeEl(),status:makeEl()};
global.document={getElementById:(i)=>ids[i]||null,createElement:makeEl,
createDocumentFragment:makeEl,addEventListener(){}};
global.window={addEventListener(){}};
global.fetch=async()=>{throw new Error("none")};
eval(fs.readFileSync(process.argv[2],"utf8"));
const src=fs.readFileSync(process.argv[3],"utf8");
const r=parseQuestions(src);
console.log(JSON.stringify({
  count:r.questions.length,
  errors:r.errors.length,
  texts:r.questions.map(q=>q.text),
  correct:r.questions.map(q=>(q.answers.find(a=>a.correct)||{}).text||null),
  answers:r.questions.map(q=>q.answers.map(a=>a.text)),
  hints:r.questions.map(q=>q.hint),
}));
"""

CASES = {
    "real questions.md": (HERE / "questions.md").read_text(encoding="utf-8"),
    "valid minimal": "## ש\n- [x] נכון\n- [ ] לא",
    "no correct answer": "## ש\n- [ ] א\n- [ ] ב",
    "two correct answers": "## ש\n- [x] א\n- [x] ב",
    "single answer": "## ש\n- [x] א",
    "orphan answer": "- [x] תשובה בלי שאלה",
    "no questions at all": "# כותרת\n\nסתם טקסט",
    "one good one bad": "## טובה\n- [ ] א\n- [x] ב\n\n## רעה\n- [ ] א\n- [ ] ב",
    "uppercase X": "## ש\n- [X] נכון\n- [ ] לא",
    "asterisk bullets": "## ש\n* [x] נכון\n* [ ] לא",
    "with hint": "## ש\n- [x] נכון\n- [ ] לא\nרמז: זה רמז",
    "hint before answers": "## ש\nרמז: מוקדם\n- [x] נכון\n- [ ] לא",
    "crlf endings": "## ש\r\n- [x] נכון\r\n- [ ] לא",
    "blank lines": "## ש\n\n- [x] נכון\n\n- [ ] לא\n",
    "html comment skipped": "<!--\n## מוסתרת\n- [x] א\n-->\n## אמיתית\n- [x] כן\n- [ ] לא",
    "inline comment": "<!-- הערה -->\n## ש\n- [x] כן\n- [ ] לא",
    "trailing spaces": "## ש   \n- [x] נכון   \n- [ ] לא  ",
    "empty file": "",
}


def run_js(markdown):
    with tempfile.NamedTemporaryFile(
        "w", suffix=".md", delete=False, encoding="utf-8"
    ) as fh:
        fh.write(markdown)
        md_path = fh.name
    with tempfile.NamedTemporaryFile(
        "w", suffix=".js", delete=False, encoding="utf-8"
    ) as fh:
        fh.write(JS_HARNESS)
        js_path = fh.name
    try:
        out = subprocess.run(
            ["node", js_path, str(HERE / "game.js"), md_path],
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(out.stdout)
    finally:
        Path(md_path).unlink(missing_ok=True)
        Path(js_path).unlink(missing_ok=True)


def main():
    failures = 0

    for name, markdown in CASES.items():
        js = run_js(markdown)
        questions, errors = py_parse(markdown)

        py_view = {
            "count": len(questions),
            "errors": len(errors),
            "texts": [q["text"] for q in questions],
            "correct": [
                next((a["text"] for a in q["answers"] if a["correct"]), None)
                for q in questions
            ],
            "answers": [[a["text"] for a in q["answers"]] for q in questions],
            "hints": [q["hint"] for q in questions],
        }

        # Both must agree on accept vs reject, and on the parsed content.
        same_verdict = (js["count"] == py_view["count"]) and (
            (js["errors"] > 0) == (py_view["errors"] > 0)
        )
        same_content = all(js[k] == py_view[k] for k in ("texts", "correct", "answers", "hints"))

        if same_verdict and same_content:
            print(f"PASS  {name}: {js['count']} questions, {js['errors']} errors")
        else:
            failures += 1
            print(f"FAIL  {name}")
            print(f"        js: {js}")
            print(f"        py: {py_view}")

    print()
    if failures:
        print(f"{failures} case(s) disagree between game.js and check_questions.py")
        return 1
    print("Both parsers agree on every case")
    return 0


if __name__ == "__main__":
    sys.exit(main())
