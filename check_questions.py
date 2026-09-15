"""Validate questions.md before the game tries to load it.

Run after editing the questions:

    python3 check_questions.py

Mirrors the parser in game.js. If this passes, the game will load the file.
"""

import re
import sys
from pathlib import Path

QUESTION_RE = re.compile(r"^##\s+(.*\S)\s*$")
ANSWER_RE = re.compile(r"^\s*[-*]\s*\[([ xX])\]\s*(.*\S)\s*$")
HINT_RE = re.compile(r"^\s*רמז\s*:\s*(.*\S)\s*$")

FIFTY_FIFTY_MIN_ANSWERS = 3


def parse(text):
    questions = []
    errors = []
    current = None
    in_comment = False

    def finish():
        nonlocal current
        if current is None:
            return
        correct = [a for a in current["answers"] if a["correct"]]
        label = current["text"]
        if len(current["answers"]) < 2:
            errors.append(f'לשאלה "{label}" יש פחות משתי תשובות')
        elif len(correct) == 0:
            errors.append(f'לשאלה "{label}" אין תשובה נכונה מסומנת [x]')
        elif len(correct) > 1:
            errors.append(f'לשאלה "{label}" יש {len(correct)} תשובות נכונות')
        else:
            questions.append(current)
        current = None

    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()

        if in_comment:
            if "-->" in line:
                in_comment = False
            continue
        if "<!--" in line:
            if "-->" not in line:
                in_comment = True
            continue
        if not line:
            continue

        m = QUESTION_RE.match(line)
        if m:
            finish()
            current = {"text": m.group(1), "answers": [], "hint": "", "line": lineno}
            continue

        m = ANSWER_RE.match(line)
        if m:
            if current is None:
                errors.append(f"שורה {lineno}: תשובה שמופיעה לפני שאלה")
                continue
            current["answers"].append(
                {"text": m.group(2), "correct": m.group(1).lower() == "x"}
            )
            continue

        m = HINT_RE.match(line)
        if m and current is not None:
            current["hint"] = m.group(1)

    finish()

    # Matches game.js: a file with no usable questions is itself an error.
    if not questions and not errors:
        errors.append("לא נמצאו שאלות בקובץ questions.md")

    return questions, errors


def main():
    path = Path(__file__).with_name("questions.md")
    if not path.exists():
        print("FAIL: הקובץ questions.md לא נמצא")
        return 1

    questions, errors = parse(path.read_text(encoding="utf-8"))

    if errors:
        print("נמצאו שגיאות בקובץ questions.md:\n")
        for err in errors:
            print(f"  - {err}")
        return 1

    if not questions:
        print("FAIL: לא נמצאו שאלות בקובץ")
        return 1

    warnings = []
    seen = {}
    for q in questions:
        if not q["hint"]:
            warnings.append(f'לשאלה "{q["text"]}" אין רמז, כפתור הרמז לא יעזור בה')
        if len(q["answers"]) < FIFTY_FIFTY_MIN_ANSWERS:
            warnings.append(
                f'לשאלה "{q["text"]}" יש רק {len(q["answers"])} תשובות, '
                "כפתור חצי חצי לא יעבוד בה"
            )
        texts = [a["text"] for a in q["answers"]]
        if len(set(texts)) != len(texts):
            warnings.append(f'לשאלה "{q["text"]}" יש תשובות כפולות')
        if q["text"] in seen:
            warnings.append(f'השאלה "{q["text"]}" מופיעה יותר מפעם אחת')
        seen[q["text"]] = True

    print(f"נטענו {len(questions)} שאלות תקינות\n")
    for i, q in enumerate(questions, start=1):
        correct = next(a["text"] for a in q["answers"] if a["correct"])
        hint = "יש" if q["hint"] else "אין"
        print(f"{i:2}. {q['text']}")
        print(f"    תשובות: {len(q['answers'])} | נכונה: {correct} | רמז: {hint}")

    if warnings:
        print("\nאזהרות:")
        for w in warnings:
            print(f"  - {w}")

    print("\nOK: הקובץ תקין והמשחק יוכל לטעון אותו")
    return 0


if __name__ == "__main__":
    sys.exit(main())
