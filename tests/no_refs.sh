#!/usr/bin/env bash
# Project No Refs, as checks:
#   * the browser gets HTML and nothing else
#   * the pages carry no words of their own: every label comes from data/messages.json
#   * the two file endings are explained in one place
#   * no name or phrase is repeated until it grates
set -u
cd "$(dirname "$0")/.."

PASS=0
FAILED=0
ok()  { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
bad() { FAILED=$((FAILED + 1)); printf '  FAIL %s\n' "$1"; }

echo "no javascript"
if [ -z "$(find . -path ./build -prune -o -path ./workspace -prune -o \( -name '*.js' -o -name '*.mjs' -o -name 'package.json' \) -print)" ]; then
  ok "there is no javascript in the tree"
else
  bad "javascript files are still here: $(find . -path ./build -prune -o -name '*.js' -print | tr '\n' ' ')"
fi
if grep -rIl "<script" web data src Makefile README.md LANGUAGE.md > /dev/null; then
  bad "a page still loads a script"
else
  ok "no page loads a script"
fi
if [ -z "$(find css js vendor -maxdepth 1 -type d 2>/dev/null)" ]; then
  ok "the old browser front end is gone"
else
  bad "leftovers from the old front end: $(find css js vendor -maxdepth 1 -type d 2>/dev/null | tr '\n' ' ')"
fi

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

# 2. and no template may carry a sentence of its own
noisy = []
for path in glob.glob('web/**/*.html', recursive=True):
    body = open(path).read()
    body = re.sub(r'<[^>]*>', ' ', body)          # tags and their attributes
    body = re.sub(r'\{\{[^}]*\}\}', ' ', body)    # placeholders the server fills in
    visible = re.sub(r'\s+', '', body)
    if len(visible) > 40:
        noisy.append(f"{path} ({len(visible)} characters)")
if noisy:
    print("  FAIL wording is hardbaked in the markup:", ", ".join(noisy))
    failed += 1
else:
    print("  ok   the templates hold no sentences of their own")

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
