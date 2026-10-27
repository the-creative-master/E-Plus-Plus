#!/usr/bin/env python3
"""Cross-engine Project No Wrongs checks. Run from the repo or extracted zip."""
import os
import pathlib
import random
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINES = ([str(ROOT / "epp")], [sys.executable, str(ROOT / "epp.py")])


def run(engine, source):
    return subprocess.run([*engine, "-e", source], cwd=ROOT, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)


errors = [
    ("fheneir", "E101"), ("say hello", "E402"), ("say hello world", "E402"),
    ("say \"text\", hello", "E402"), ("say \"unclosed", "E102"),
    ("say 'unclosed", "E102"), ("say ''", "E202"),
    ("let \"name\" be 1", "E202"), ("let name be 1", "E202"),
    ("say", "E105"), ("say 1 plus", "E105"), ("say 'missing'", "E201"),
    ("say 1 divided by 0", "E403"), ("otherwise say \"no\"", "E104"),
    ("note [unclosed", "E101"),
    ("if 1 is 2 then say hello", "E402"),
    ("if 1 is 2 then say \"x\", hello", "E402"),
    ("if 1 is 2 then let name be 1", "E202"),
    ("if 1 is 2 then let 'x' be", "E105"),
    ("if 1 is 2 then ask hello and save the output as 'x'", "E402"),
    ("repeat 0 times\n  repeat hello times\n  end repeat\nend repeat", "E402"),
    ("if 1 is 2 then:\n  say hello\nend if", "E402"),
    ("repeat 0 times\n  fheneir\nend repeat", "E101"),
    ("repeat 0 times\n  say hello\nend repeat", "E402"),
    ("repeat 0 times\n  if 1 is 1 then:\n    say \"x\"\nend repeat", "E106"),
    ("add library \"Draw\"", "E302"),
    ("define 'pencil' as drawing sprite", "E302"),
    ("add library \"Nonexistent\"", "E303"),
    ("say the square root of 4", "E301"),
]

valid = [
    ("say \"Hello\"\nsay 1 plus 2", "Hello\n3\n"),
    ("let 'n' be 0\nrepeat 2 times\n repeat 2 times\n  let 'n' be 'n' plus 1\n end repeat\nend repeat\nsay 'n'", "4\n"),
    ("if 1 is 1 then:\n if 1 is 2 then say \"wrong\"\n otherwise say \"right\"\nelse:\n say \"wrong\"\nend if", "right\n"),
    ("add library \"Math\"\nsay the absolute value of 0 minus 42", "42\n"),
    ("add library \"Strings\"\nsay the uppercase of \"hello\"", "HELLO\n"),
]

for engine in ENGINES:
    for source, code in errors:
        result = run(engine, source)
        text = result.stdout + result.stderr
        assert result.returncode != 0, (engine, source, text)
        assert re.search(r"\b" + code + r"\b", text), (engine, source, code, text)
        assert "<cli>:" in text and "^" in text and "Help:" in text, (engine, source, text)
    for source, expected in valid:
        result = run(engine, source)
        assert result.returncode == 0, (engine, source, result.stdout, result.stderr)
        assert result.stdout == expected, (engine, source, result.stdout, expected)

# Generated names and values demonstrate that neither CLI is replaying example
# output. A fixed seed makes failures reproducible, not tied to bundled demos.
rng = random.Random(0x136442)
for _ in range(32):
    a, b, c = rng.randrange(10000), rng.randrange(1, 40), rng.randrange(1000)
    name = "generated_" + str(rng.randrange(10**9))
    source = f"let '{name}' be {a}\nsay '{name}' times {b} plus {c}"
    expected = f"{a * b + c}\n"
    for engine in ENGINES:
        result = run(engine, source)
        assert result.returncode == 0 and result.stdout == expected, (engine, source, result.stdout, result.stderr)

# Math library expressions must not pass source to Python eval().
with tempfile.TemporaryDirectory() as temp:
    marker = pathlib.Path(temp) / "executed"
    source = 'add library "Math"\nsay the absolute value of __import__("pathlib").Path("' + str(marker) + '").touch()'
    result = run(ENGINES[1], source)
    assert result.returncode != 0 and not marker.exists(), "a library expression executed Python code"

print("E++ 1.3 C++ and Python diagnostic, nested-block, and safety tests passed.")
