#!/usr/bin/env bash
# Walks through the real server with curl: pages, running programs, files, lessons.
# Everything it looks for comes from the data files, so a hardbaked page would fail here.
set -u
cd "$(dirname "$0")/.."

PORT=${PORT:-8791}
WORK=$(mktemp -d)
LOG=$(mktemp)
PASS=0
FAILED=0

./build/epp serve --port "$PORT" --workspace "$WORK" > "$LOG" 2>&1 &
SERVER=$!
cleanup() { kill "$SERVER" 2>/dev/null; rm -rf "$WORK" "$LOG"; }
trap cleanup EXIT

for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$PORT/api/status" > /dev/null && break
  sleep 0.25
done

ok()   { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
bad()  { FAILED=$((FAILED + 1)); printf '  FAIL %s\n' "$1"; }

check_has() { # label, haystack, needle
  case "$2" in
    *"$3"*) ok "$1" ;;
    *) bad "$1 (looked for: $3)" ;;
  esac
}
check_not() { # label, haystack, needle
  case "$2" in
    *"$3"*) bad "$1 (should not contain: $3)" ;;
    *) ok "$1" ;;
  esac
}

words() { python3 -c "import json,sys;print(json.load(open('data/messages.json')).get(sys.argv[1],''))" "$1"; }
lesson() { python3 -c "import json,sys;print(json.load(open('data/tutorial.json'))[int(sys.argv[1])][sys.argv[2]])" "$1" "$2"; }

get()  { curl -sL "http://127.0.0.1:$PORT$1"; }
post_page() { curl -sL -X POST "$@"; }   # follows the redirect the server sends back
code() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$1"; }
post() { curl -s -X POST "$@"; }
status() { post "$@" -o /dev/null -w '%{http_code}'; }

echo "server pages"
check_has "the status page reports the build from the data" "$(get /api/status)" "$(words build)"
first=$(curl -s -o /dev/null -w '%{redirect_url}' "http://127.0.0.1:$PORT/")
check_has "a first visit opens the tutorial" "$first" "/tutorial"

body=$(get /)
check_has "the IDE page is served" "$body" "E++"
check_has "the console greeting comes from the catalogue" "$body" "$(words ui.consoleEmpty)"
check_has "the example programs were copied in" "$body" "demo.eppla"
check_not "the IDE page carries no javascript" "$body" "<script"

body=$(get /tutorial)
check_has "the tutorial shows the first lesson" "$body" "$(lesson 0 title)"
check_has "the tutorial shows the last lesson" "$body" "$(lesson 7 title)"
check_has "the lessons file is named on the page" "$body" "$(words tutorial.source)"
check_not "the tutorial page carries no javascript" "$body" "<script"

echo
echo "settings come from data/settings.json"
body=$(get /settings)
missing=""
while read -r label; do
  case "$body" in *"$label"*) ;; *) missing="$missing $label" ;; esac
done < <(python3 -c "
import json
schema = json.load(open('data/settings.json'))
for group in schema['groups']:
    for control in group['controls']:
        print(control['label'])
")
if [ -z "$missing" ]; then ok "every control label is on the page"; else bad "missing labels:$missing"; fi

check_has "select controls are built" "$body" "<select"
check_has "checkbox controls are built" "$body" 'type="checkbox"'
check_has "text controls are built" "$body" 'rows="3"'

status -d 'theme=light&density=compact&fontSize=12' "http://127.0.0.1:$PORT/settings" > /dev/null
body=$(get /)
check_has "saved settings change the page class" "$body" 'class="light compact"'
check_has "saved settings change the code size" "$body" '--code-size: 12px'
status -X POST "http://127.0.0.1:$PORT/settings/reset" > /dev/null
check_has "reset brings the defaults back" "$(get /)" '--code-size: 14px'

echo
echo "running programs"
body=$(post -d "file=hello.eppl" --data-urlencode 'code=Define who as "Sharjah".
say "Hello, " plus '"'"'who'"'"' plus "!"' "http://127.0.0.1:$PORT/run")
check_has "output appears in the console" "$body" "Hello, Sharjah!"
check_has "the run is timed" "$body" "Finished in"

body=$(post -d "file=test.eppla" --data-urlencode 'code=add library "Math"
say square root of 144' "http://127.0.0.1:$PORT/run")
check_has "library words run when the library is loaded" "$body" ">12<"

body=$(post -d "file=test.eppl" --data-urlencode 'code=say square root of 144' "http://127.0.0.1:$PORT/run")
check_has "a .eppl file is told to change its name" "$body" "uses libraries"

body=$(post -d "file=test.eppla" --data-urlencode 'code=say lowercase of "LOUD"' "http://127.0.0.1:$PORT/run")
check_has "a missing library is named" "$body" "add library"

body=$(post -d "file=quiz.eppl" --data-urlencode "answers=Sam" --data-urlencode 'code=ask "Name?" and save answer as who
say "Hello " plus '"'"'who'"'"'' "http://127.0.0.1:$PORT/run")
check_has "answers are used in order" "$body" "Hello Sam"

echo
echo "files"
status -d "name=dice" --data-urlencode 'content=add library "Random"
say random number between 1 and 6' "http://127.0.0.1:$PORT/new" > /dev/null
if [ -f "$WORK/dice.eppla" ]; then ok "a new file gets the .eppla ending from its code"; else bad "dice.eppla was not created"; fi

status -d "name=notes" --data-urlencode 'content=say "plain"' "http://127.0.0.1:$PORT/new" > /dev/null
if [ -f "$WORK/notes.eppl" ]; then ok "a new file without libraries gets .eppl"; else bad "notes.eppl was not created"; fi

status -d "file=notes.eppl" --data-urlencode 'code=say "changed"' "http://127.0.0.1:$PORT/save" > /dev/null
check_has "saving writes the new code" "$(cat "$WORK/notes.eppl")" 'say "changed"'

status -d "file=notes.eppl&to=renamed.eppl" "http://127.0.0.1:$PORT/rename" > /dev/null
if [ -f "$WORK/renamed.eppl" ] && [ ! -f "$WORK/notes.eppl" ]; then ok "renaming moves the file"; else bad "rename did not move the file"; fi

status -d "file=renamed.eppl" "http://127.0.0.1:$PORT/delete" > /dev/null
if [ ! -f "$WORK/renamed.eppl" ]; then ok "deleting removes the file"; else bad "delete left the file behind"; fi

body=$(get "/download?file=dice.eppla")
check_has "download sends the file back" "$body" "random number between"

body=$(get /)
check_has "the file list shows the new file" "$body" "dice.eppla"
check_has "the status page counts the same files as the disk" "$(get /api/status)" "\"files\": $(ls "$WORK" | grep -cE '\.eppla?$')"

echo
echo "lessons"
body=$(post_page -d "lesson=python" "http://127.0.0.1:$PORT/tutorial/open")
check_has "opening a lesson writes it into the workspace" "$body" "tutorial-python.eppla"
if [ -f "$WORK/tutorial-python.eppla" ]; then ok "the lesson file is on disk"; else bad "the lesson file is missing"; fi
check_has "the lesson runs" "$(post -d "file=tutorial-python.eppla" --data-urlencode "code=$(cat "$WORK/tutorial-python.eppla")" "http://127.0.0.1:$PORT/run")" "Back in E++."

count=$(python3 -c "import json;print(len(json.load(open('data/tutorial.json'))))")
body=$(get /tutorial/export)
check_has "export writes a pack" "$body" '"lessons"'
check_has "export keeps every lesson" "$body" "\"$(lesson $((count - 1)) id)\""

body=$(post_page --data-urlencode 'pack={"lessons":[{"title":"From a friend","code":"say 1"}]}' "http://127.0.0.1:$PORT/tutorial/import")
check_has "a pasted pack is imported" "$body" "From a friend"
body=$(post_page -d "lesson=from-a-friend" "http://127.0.0.1:$PORT/tutorial/remove")
check_not "an imported lesson can be removed again" "$body" "From a friend"

body=$(get /about)
check_has "the about page lists the libraries from the engine" "$body" "Draw"
note=$(words extensions.note)
check_has "the about page explains the two endings" "$body" "${note:0:40}"

echo
echo "small things"
check_has "the stylesheet is served as css" "$(curl -s -D - -o /dev/null "http://127.0.0.1:$PORT/style.css" | tr -d '\r')" "text/css"
if [ "$(code /nowhere)" = "404" ]; then ok "unknown pages are a 404"; else bad "unknown page did not return 404"; fi
check_not "the 404 page is still styled" "$(get /nowhere)" "<script"

printf '\n%s end-to-end checks passed' "$PASS"
if [ "$FAILED" -gt 0 ]; then printf ', %s failed.\n' "$FAILED"; exit 1; fi
printf '.\n'
