#!/usr/bin/env bash
# Project No Refs, as checks:
#   * the browser gets HTML, one script file and one stylesheet
#   * that script holds no wording of its own: every label comes from data/messages.json
#   * the pages carry no words of their own either
#   * the two file endings are explained in one place
#   * no name or phrase is repeated until it grates
set -u
cd "$(dirname "$0")/.."

PASS=0
FAILED=0
ok()  { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
bad() { FAILED=$((FAILED + 1)); printf '  FAIL %s\n' "$1"; }

echo "one script, and no wording inside it"
front=$(find web -name '*.js' -o -name '*.mjs' | sort | tr '\n' ' ')
if [ "$front" = "web/app.js " ]; then
  ok "the browser gets exactly one script: web/app.js"
else
  bad "the front end is not a single script: ${front:-none}"
fi
stray=$(find . -path ./build -prune -o -path ./workspace -prune -o -path ./node_modules -prune -o \
        -path ./tests -prune -o -path ./web -prune -o \
        \( -name '*.js' -o -name '*.mjs' \) -print | tr '\n' ' ')
if [ -z "$stray" ]; then
  ok "no javascript hides outside web/ and tests/"
else
  bad "javascript outside web/ and tests/: $stray"
fi

if grep -rIl "<script" web data src Makefile README.md LANGUAGE.md 2>/dev/null | grep -v '^web/layout.html$' | grep -q .; then
  bad "something other than the shell loads a script"
else
  ok "only the shell loads a script"
fi

if grep -q '<script' web/partials/*.html 2>/dev/null; then
  bad "a partial carries a script tag"
else
  ok "no partial carries a script tag"
fi
if grep -qE '<script[^>]*>[^<]' web/layout.html; then
  bad "the shell carries javascript inline"
else
  ok "the shell carries no javascript inline"
fi

python3 - <<'FRONT' || exit_status=$?
import json, re, sys

messages = json.load(open('data/messages.json'))
front = open('web/app.js').read()

# Every sentence the front end can show has to be catalogued under a key.
wanted = set(re.findall(r"say\('([\w.]+)'", front))
missing = sorted(k for k in wanted if k not in messages)
if missing:
    print("  FAIL web/app.js asks for labels that are not in data/messages.json:",
          ", ".join(missing))
    sys.exit(1)
print(f"  ok   all {len(wanted)} labels the front end asks for come from data/messages.json")

# And it must not carry a sentence of its own in a string literal.
prose = []
for literal in re.findall(r"'([^'\\\n]{25,})'", front) + re.findall(r'"([^"\\\n]{25,})"', front):
    if re.search(r'[=<>\[\]{}()/;:]', literal):
        continue                      # selectors, routes, hand-built markup
    if len(re.findall(r'[A-Za-z]{2,}', literal)) < 4:
        continue                      # a couple of joined keys is not a sentence
    prose.append(literal)
if prose:
    print("  FAIL prose is hardbaked in web/app.js:", "; ".join(sorted(set(prose))[:5]))
    sys.exit(1)
print("  ok   web/app.js holds no sentences of its own")
sys.exit(0)
FRONT
if [ "${exit_status:-0}" -eq 0 ]; then PASS=$((PASS + 2)); else FAILED=$((FAILED + 1)); fi
unset exit_status

echo
echo "the pages carry no words of their own"
python3 - <<'PY' || exit_status=$?
import glob, json, re, sys

messages = json.load(open('data/messages.json'))
failed = 0

# 1. every label a template asks for has to exist in the catalogue
used = {}
for path in glob.glob('web/**/*.html', recursive=True):
    for key in re.findall(r'\{\{t:([^}]+)\}\}', open(path).read()):
        used.setdefault(key, []).append(path)
missing = {k: v for k, v in used.items() if k not in messages}
if missing:
    print("  FAIL templates ask for labels that are not in data/messages.json:",
          ", ".join(sorted(missing)))
    failed += 1
else:
    print(f"  ok   all {len(used)} labels used by the templates come from data/messages.json")

# 2. markup may hold structure, not sentences: anything longer than a short
#    label has to have come from the catalogue, not from the file
noisy = []
for path in glob.glob('web/**/*.html', recursive=True):
    body = open(path).read()
    body = re.sub(r'<[^>]*>', ' ', body)           # tags and their attributes
    body = re.sub(r'\{\{[^}]*\}\}', ' ', body)     # placeholders the server fills in
    for run in re.split(r'\s+', body):
        words = run.strip('.,:;!?"\'()[]')
        if len(words) > 24:
            noisy.append(f"{path} ({words})")
if noisy:
    print("  FAIL wording is hardbaked in the markup:", ", ".join(sorted(set(noisy))[:6]))
    failed += 1
else:
    print("  ok   the templates hold structure, not sentences")

sys.exit(1 if failed else 0)
PY
if [ "${exit_status:-0}" -eq 0 ]; then PASS=$((PASS + 2)); else FAILED=$((FAILED + 1)); fi
unset exit_status

echo
echo "the endings are explained once"
python3 - <<'PY' || exit_status=$?
import json, sys

messages = json.load(open('data/messages.json'))
import re
teaching = [k for k, v in messages.items()
            if re.search(r'\.eppl(?![a-z])', v) and re.search(r'\.eppla(?![a-z])', v)]
lessons = json.load(open('data/tutorial.json'))
teaching_lessons = [l['id'] for l in lessons
                    if '.eppl' in l['explanation'] and '.eppla' in l['explanation']]
failed = 0
if len(teaching) == 1:
    print(f"  ok   one line of copy explains the two endings ({teaching[0]})")
else:
    print(f"  FAIL {len(teaching)} entries explain the two endings: {teaching}")
    failed += 1
if len(teaching_lessons) <= 1:
    print("  ok   at most one lesson explains the two endings")
else:
    print(f"  FAIL {len(teaching_lessons)} lessons explain the two endings: {teaching_lessons}")
    failed += 1
sys.exit(1 if failed else 0)
PY
if [ "${exit_status:-0}" -eq 0 ]; then PASS=$((PASS + 2)); else FAILED=$((FAILED + 1)); fi
unset exit_status

echo
echo "nothing is repeated until it grates"
python3 - <<'PY' || exit_status=$?
import glob, json, sys

failed = 0
files = sorted(set(glob.glob('*.md') + glob.glob('web/**/*.*', recursive=True) +
                   glob.glob('data/**/*.*', recursive=True) + glob.glob('src/**/*.*', recursive=True) +
                   glob.glob('tests/**/*.*', recursive=True)))
files = [f for f in files if f != 'tests/no_refs.sh']  # this list is not part of the copy
# A name that shows up in example after example reads as filler.
repeats = {'WeeklyHow': 1, 'Lorem ipsum': 0, 'for example, consider': 0}  # once is a credit, more is filler
found = {name: 0 for name in repeats}
for path in files:
    if path.endswith(('.eppla', '.eppl')):
        continue
    try:
        body = open(path, encoding='utf-8').read()
    except (UnicodeDecodeError, IsADirectoryError):
        continue
    for name in repeats:
        found[name] += body.count(name)
for name, limit in repeats.items():
    if found[name] > limit:
        print(f"  FAIL \"{name}\" appears {found[name]} times (limit {limit})")
        failed += 1
if not failed:
    print("  ok   no example name or filler phrase is repeated")

# The copy the reader meets must not sound like a template.
phrases = ['delve into', 'dive into', 'unlock the power', 'seamless', 'game-changer', 'game changer',
           'cutting-edge', 'in conclusion', 'let us dive', "let's dive", 'look no further',
           'elevate your', 'blazing fast', 'revolutionary', 'whether you are a beginner',
           "whether you're a beginner", 'embark on', 'harness the power', 'effortlessly']
hits = []
for path in files:
    if path.endswith(('.eppla', '.eppl')):
        continue
    try:
        body = open(path, encoding='utf-8').read().lower()
    except (UnicodeDecodeError, IsADirectoryError):
        continue
    for phrase in phrases:
        if phrase in body:
            hits.append(f"{phrase} in {path}")
if hits:
    print("  FAIL stock phrases:", "; ".join(hits))
    failed += 1
else:
    print("  ok   no stock phrases in the copy")
sys.exit(1 if failed else 0)
PY
if [ "${exit_status:-0}" -eq 0 ]; then PASS=$((PASS + 2)); else FAILED=$((FAILED + 1)); fi
unset exit_status

echo
echo "the documentation tells the truth"
python3 - <<'CHECK' || exit_status=$?
import os, re, subprocess, sys

blocks = 0
broken = []
for doc in ('README.md', 'LANGUAGE.md'):
    for i, (ending, code) in enumerate(re.findall(r'```(eppl|eppla)\n(.*?)```', open(doc).read(), re.S)):
        blocks += 1
        path = f'/tmp/epp-doc-{os.path.basename(doc)}-{i}.{ending}'
        open(path, 'w').write(code)
        if subprocess.run(['./build/epp', 'check', path], capture_output=True).returncode != 0:
            broken.append(f'{doc} block {i + 1}')
if broken:
    print("  FAIL examples that do not parse:", ", ".join(broken))
    sys.exit(1)
print(f"  ok   all {blocks} examples in the documentation parse")
CHECK
if [ "${exit_status:-0}" -eq 0 ]; then PASS=$((PASS + 1)); else FAILED=$((FAILED + 1)); fi
unset exit_status

printf '\n%s checks passed' "$PASS"
if [ "$FAILED" -gt 0 ]; then printf ', %s failed.\n' "$FAILED"; exit 1; fi
printf '.\n'
