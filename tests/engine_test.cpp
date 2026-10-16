// Every part of E++ that does not need a browser: the language, the libraries,
// the Python runner, the JSON reader, the text catalogue and the file store.
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#include "engine.hpp"
#include "json.hpp"
#include "store.hpp"
#include "text.hpp"

namespace fs = std::filesystem;

namespace {

int passed = 0;
int failed = 0;
std::string group;

void startGroup(const std::string& name) {
    group = name;
    std::cout << "\n" << name << "\n";
}

void check(bool condition, const std::string& what) {
    if (condition) {
        ++passed;
        std::cout << "  ok   " << what << "\n";
    } else {
        ++failed;
        std::cout << "  FAIL " << what << " [" << group << "]\n";
    }
}

void checkText(const std::string& found, const std::string& wanted, const std::string& what) {
    check(found == wanted, what + "  (got \"" + found + "\", wanted \"" + wanted + "\")");
}

// The output lines only, so tests read like the program's own output.
std::string output(const epp::Result& result) {
    std::string text;
    for (const epp::LineOut& line : result.lines) {
        if (line.kind == epp::Line::Output) {
            if (!text.empty()) text += "\n";
            text += line.text;
        }
    }
    return text;
}

std::string errors(const epp::Result& result) {
    std::string text;
    for (const epp::LineOut& line : result.lines) {
        if (line.kind == epp::Line::Error) text += line.text;
    }
    return text;
}

// output of at most `first` lines joined with " | "
std::string outLine(const epp::Result& result, size_t index) {
    size_t seen = 0;
    for (const epp::LineOut& line : result.lines) {
        if (line.kind != epp::Line::Output) continue;
        if (seen == index) return line.text;
        ++seen;
    }
    return "<missing>";
}

epp::Result runSource(const std::string& source, const std::string& fileName = "test.eppla",
                      const std::vector<std::string>& answers = {}) {
    epp::Options options;
    options.fileName = fileName;
    options.answers = answers;
    options.librariesAllowed = fileName.size() > 6 && fileName.compare(fileName.size() - 6, 6, ".eppla") == 0;
    return epp::run(source, options);
}

std::string readFile(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return std::string();
    return std::string((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
}

void testLanguage() {
    startGroup("language: saying and naming");
    epp::Result r = runSource("say \"Hello, world!\"\n");
    check(r.ok, "a plain say runs");
    checkText(output(r), "Hello, world!", "say prints its text");

    r = runSource("Define who as \"Ada\".\nsay \"Hi \" plus 'who' plus \".\"\n");
    checkText(output(r), "Hi Ada.", "define and plus join text");

    r = runSource("define score as 10\nincrease score by 5\ndecrease score by 2\nsay 'score'\n");
    checkText(output(r), "13", "increase and decrease work in order");

    r = runSource("define what as \"north\"\nset what to \"south\"\nsay 'what'\n");
    checkText(output(r), "south", "set replaces a value");

    r = runSource("Define title as Northwind.\nsay 'title'\n");
    checkText(output(r), "Northwind", "a bare word value is allowed once");

    r = runSource("say \"a\" plus 1 plus \"b\"\n");
    checkText(output(r), "a1b", "plus joins text and numbers");

    r = runSource("say 2 plus 3 times 4\n");
    checkText(output(r), "14", "times binds tighter than plus");

    startGroup("language: asking");
    r = runSource("ask \"Your name?\" and save answer as name\nsay 'name'\n", "test.eppla", {"Ada"});
    check(r.ok, "ask runs when an answer is waiting");
    checkText(output(r), "Ada", "the answer becomes the variable");
    bool sawPrompt = false, sawAnswer = false;
    for (const epp::LineOut& line : r.lines) {
        if (line.kind == epp::Line::Prompt && line.text == "Your name?") sawPrompt = true;
        if (line.kind == epp::Line::Answer && line.text == "Ada") sawAnswer = true;
    }
    check(sawPrompt, "the question is marked as a prompt");
    check(sawAnswer, "the answer is echoed in the console");

    r = runSource("ask \"Age?\" and save answer as age\nsay 'age'\n");
    check(!r.ok, "ask without answers stops the program");
    check(errors(r).find("Answers box") != std::string::npos, "the error explains where answers come from");

    startGroup("language: decisions");
    r = runSource("define n as 7\nif 'n' is greater than 5 then say \"big\" otherwise say \"small\"\n");
    checkText(output(r), "big", "if ... then ... otherwise on one line");

    r = runSource("define n as 1\nif 'n' is greater than 5 then\n  say \"big\"\notherwise if 'n' is greater than 0 then\n  say \"small\"\notherwise\n  say \"none\"\nend if\n");
    checkText(output(r), "small", "otherwise if chains a second test");

    r = runSource("say \"about\" contains \"bou\"\n");
    check(!r.ok && r.error.message.find("contains") != std::string::npos,
          "contains outside a condition is refused with the word named");

    r = runSource("define word as \"moon\"\nif 'word' contains \"oo\" then say \"yes\" otherwise say \"no\"\n");
    checkText(output(r), "yes", "contains matches inside text");

    r = runSource("define v as 0\nif not 'v' is exactly equal to 1 then say \"different\"\n");
    checkText(output(r), "different", "is not exactly equal to");

    r = runSource("define t as \"12\"\nif 't' is equal to 12 then say \"numbers match\"\n");
    checkText(output(r), "numbers match", "equal compares numbers written as text");

    r = runSource("define t as \"12.0\"\nif 't' is exactly equal to \"12.0\" then say \"exact\"\n");
    checkText(output(r), "exact", "exactly equal compares the text as written");

    r = runSource("define n as 4\nif 'n' is less than or equal to 4 then say \"fits\"\n");
    checkText(output(r), "fits", "less than or equal to");

    startGroup("language: loops");
    r = runSource("repeat 3 times\n  say \"round\"\nend repeat\n");
    checkText(output(r), "round\nround\nround", "repeat runs its block");

    r = runSource("define n as 0\nwhile 'n' is less than 3 do\n  increase n by 1\nend while\nsay 'n'\n");
    checkText(output(r), "3", "while keeps going until the test fails");

    r = runSource("define n as 0\nrepeat 4 times\n  increase n by 1\n  if 'n' is exactly equal to 2 then\n    say \"skip\"\n    loopback\n  end if\n  say 'n'\nend repeat\n");
    check(r.ok, "loopback is allowed inside a loop");
    checkText(output(r), "1\nskip\n3\n4", "loopback starts the next round");

    r = runSource("define n as 0\nloopback\n");
    check(!r.ok, "loopback outside a loop is an error");
    check(errors(r).find("inside a loop") != std::string::npos, "the error says where loopback belongs");

    r = runSource("repeat 2 times\n  repeat 2 times\n    say \"inner\"\n  end repeat\nend repeat\n");
    checkText(output(r), "inner\ninner\ninner\ninner", "loops nest");

    startGroup("language: errors");
    r = runSource("say \"unterminated\n");
    check(!r.ok && r.error.category == "LexError", "unterminated text is a LexError");
    check(r.error.line == 1 && r.error.column > 1, "lex errors carry a position");
    check(r.error.format().find("LexError (line 1") == 0, "errors format as category and position");

    r = runSource("say\n");
    check(!r.ok && r.error.category == "ParseError", "a missing value is a ParseError");
    check(!r.error.hint.empty(), "parse errors come with a hint");

    r = runSource("say 'nothing'\n");
    check(!r.ok && r.error.message.find("no variable called") != std::string::npos, "unknown variables are explained");
    check(r.error.hint.find("Define nothing as") != std::string::npos, "the hint shows how to define it");

    r = runSource("dance\n");
    check(!r.ok && r.error.message.find("does not know the word") != std::string::npos, "unknown commands are explained");

    r = runSource("add library \"Math\"\nsay 1 divided by 0\n", "test.eppla");
    check(!r.ok && r.error.message.find("Dividing by zero") != std::string::npos, "dividing by zero is caught");

    r = runSource("wait 30 seconds\n");
    check(r.ok, "a long wait is cut short instead of hanging");

    epp::Error good = epp::check("say \"fine\"\n", "test.eppl");
    check(good.empty(), "check() passes valid source");
    epp::Error bad = epp::check("if then\n", "test.eppl");
    check(!bad.empty() && bad.line == 1, "check() reports the line it failed on");

    startGroup("libraries: the .eppl and .eppla rule");
    r = runSource("say square root of 9\n", "test.eppl");
    check(!r.ok && r.error.category == "LibraryError", "a .eppl file cannot use library words");
    check(r.error.message.find("test.eppl") != std::string::npos, "the error names the file");
    check(r.error.hint.find(".eppla") != std::string::npos, "the hint says which ending to use");

    r = runSource("say square root of 9\n", "test.eppla");
    check(!r.ok && r.error.category == "LibraryError", "library words need the library loaded");

    r = runSource("add library \"Math\"\nsay square root of 9\n", "test.eppla");
    check(r.ok, "add library turns the words on");
    checkText(output(r), "3", "square root of works");
    check(errors(r).empty(), "no error once the library is loaded");

    r = runSource("add library \"Math\"\nsay square root of 9\n", "test.eppl");
    check(!r.ok && r.error.category == "LibraryError", "a .eppl file may not load libraries");

    r = runSource("add library \"Cooking\"\n", "test.eppla");
    check(!r.ok && r.error.message.find("not a library") != std::string::npos, "unknown libraries are refused");
    check(r.error.hint.find("Math, Text, Random, Image, Draw and Python") != std::string::npos,
          "the hint lists the libraries");

    r = runSource("add library \"Math\"\nsay power of 2 and 3\n", "test.eppla");
    check(!r.ok, "a library word used the wrong way is still an error");

    check(epp::usesLibrary("say 1\n") == false, "plain source uses no libraries");
    check(epp::usesLibrary("say square root of 4\n"), "square root of counts as a library word");
    check(epp::usesLibrary("add library \"Python\"\n"), "add library counts as library use");
    std::set<std::string> used = epp::librariesUsed("add library \"Text\"\nsay uppercase of \"a\"\nsay length of \"bb\"\n");
    check(used.size() == 1 && used.count("Text") == 1, "librariesUsed reports one library per set of words");

    std::vector<epp::LibraryInfo> library = epp::libraryCatalogue();
    check(library.size() == 6, "six libraries are offered");
    check(library[0].name == "Math" && library[5].name == "Python", "the catalogue is in a fixed order");
    check(!library[0].description.empty() && !library[0].words.empty(), "each library has words and a description");

    startGroup("libraries: Math, Text, Random");
    r = runSource("add library \"Math\"\ndisplay 7 divided by 8 as fraction\ndisplay 7 divided by 8 as decimal\n", "t.eppla");
    checkText(output(r), "7/8\n0.875", "fraction and decimal division");

    r = runSource("add library \"Math\"\ndisplay 15 percent of 240\nsay 2 power of 10\nsay absolute value of -37\n", "t.eppla");
    checkText(output(r), "36\n1024\n37", "percent, power and absolute value");

    r = runSource("add library \"Math\"\nif 12 is in the range of 10 to 20 then say \"inside\"\nif 30 is not in the range of 10 to 20 then say \"outside\"\n", "t.eppla");
    checkText(output(r), "inside\noutside", "range checks, both ways round");

    r = runSource("add library \"Math\"\nif -4 is a negative number then say \"negative\"\nif 4 is a positive number then say \"positive\"\n", "t.eppla");
    checkText(output(r), "negative\npositive", "positive and negative checks");

    r = runSource("add library \"Text\"\nsay uppercase of \"quiet\"\nsay lowercase of \"LOUD\"\nsay length of \"four\"\n", "t.eppla");
    checkText(output(r), "QUIET\nloud\n4", "text words");

    bool randomOk = true;
    for (int i = 0; i < 12; ++i) {
        epp::Result pick = runSource("add library \"Random\"\nsay random number between 3 and 6\n", "t.eppla");
        double value = std::atof(outLine(pick, 0).c_str());
        if (!(value >= 3 && value <= 6) || value != std::floor(value)) randomOk = false;
    }
    check(randomOk, "random numbers stay whole and inside the range");

    startGroup("libraries: Draw, Image, Python");
    r = runSource("add library \"Draw\"\ndefine rover as drawing sprite\n'rover' move right \"50 px\"\n'rover' move down \"20 px\"\n", "t.eppla");
    check(r.ok && r.sprites.size() == 1, "a sprite is reported to the page");
    check(r.sprites.size() == 1 && r.sprites[0].name == "rover", "the sprite keeps its name");
    check(r.sprites.size() == 1 && r.sprites[0].x == 50 && r.sprites[0].y == 20, "moves change the position");

    r = runSource("add library \"Draw\"\n'scout' move up \"10 px\"\n", "t.eppla");
    check(!r.ok && r.error.message.find("no sprite called") != std::string::npos, "moving an unknown sprite is caught");

    const std::string pixel =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    r = runSource("add library \"Image\"\ndefine dot as image \"" + pixel + "\"\ncheck if \"dot\" exists\ndisplay image\n", "t.eppla");
    check(r.ok && r.pictures.size() == 1, "a picture is reported to the page");
    check(!r.pictures.empty() && r.pictures[0].dataUri.find("data:image/png;base64,") == 0, "base64 becomes a data: URI");
    check(output(r).find("dot exists") != std::string::npos, "check if ... exists answers");
    check(output(r).find("[[image:data:image/png;base64,") != std::string::npos, "display image sends the picture as output");

    r = runSource("add library \"Image\"\ndisplay image\n", "t.eppla");
    check(!r.ok && r.error.message.find("no image called") != std::string::npos, "displaying an undefined picture is caught");

    r = runSource("add library \"Python\"\npython code \"print(1 + 2)\"\n", "t.eppla");
    check(r.ok, "python code runs");
    checkText(output(r), "3", "print writes to the same console");

    startGroup("python runner");
    r = runSource("add library \"Python\"\npython code\n  total = 0\n  for n in range(1, 6):\n    total += n\n  print(total)\nend python\n", "t.eppla");
    check(r.ok, "a python block runs");
    checkText(output(r), "15", "for loops with range and +=");

    r = runSource("add library \"Python\"\npython code\n  for name in [\"Ada\", \"Alan\"]:\n    print(name, len(name))\nend python\n", "t.eppla");
    checkText(output(r), "Ada 3\nAlan 4", "lists and len");

    r = runSource("add library \"Python\"\npython code\n  n = 3\n  while n > 0:\n    print(n)\n    n -= 1\nend python\n", "t.eppla");
    checkText(output(r), "3\n2\n1", "while loops");

    r = runSource("add library \"Python\"\npython code\n  if 2 > 3:\n    print(\"no\")\n  elif 3 > 2:\n    print(\"yes\")\n  else:\n    print(\"maybe\")\nend python\n", "t.eppla");
    checkText(output(r), "yes", "if, elif and else");

    r = runSource("add library \"Python\"\npython code\n  for n in range(1, 6):\n    if n == 3:\n      continue\n    if n == 5:\n      break\n    print(n)\nend python\n", "t.eppla");
    checkText(output(r), "1\n2\n4", "break and continue inside a loop");

    r = runSource("add library \"Python\"\npython code\n  break\nend python\n", "t.eppla");
    check(!r.ok && r.error.message.find("outside loop") != std::string::npos, "break outside a loop is refused");

    r = runSource("add library \"Python\"\npython code\n  print(7 // 2, 7 % 2, 2 ** 3)\nend python\n", "t.eppla");
    checkText(output(r), "3 1 8", "integer division, remainder and powers");

    r = runSource("add library \"Python\"\npython code\n  print(round(7 / 2.0))\n  print(str(12) + \"!\")\n  print(sum([1, 2, 3]))\n  print(abs(-4), int(3.9))\nend python\n", "t.eppla");
    checkText(output(r), "4\n12!\n6\n4 3", "the built-in functions");

    r = runSource("add library \"Python\"\npython code \"print(unknown_name)\"\n", "t.eppla");
    check(!r.ok && r.error.category == "python", "python errors are reported as python errors");
    check(r.error.message.find("NameError") != std::string::npos, "python keeps its own error names");

    r = runSource("add library \"Python\"\npython code \"print(1/0)\"\n", "t.eppla");
    check(!r.ok && r.error.message.find("ZeroDivisionError") != std::string::npos, "dividing by zero in python");

    r = runSource("add library \"Python\"\npython code\n  print(\"open\nend python\n", "t.eppla");
    check(!r.ok && r.error.category == "python", "a broken python block is caught");

    r = runSource("python code \"print(1)\"\n", "t.eppla");
    check(!r.ok && r.error.category == "LibraryError", "python needs its library first");

    r = runSource("print(1)\n", "test.eppl");
    check(!r.ok && r.error.message.find("Python, not E++") != std::string::npos, "print outside a python block is explained");
}

void testJson() {
    startGroup("json");
    std::string error;
    epp::Json parsed = epp::jsonParse("{\"name\": \"Ada\", \"n\": 3, \"flag\": true, \"list\": [1, 2], \"none\": null}", &error);
    check(error.empty() && parsed.isObject(), "objects parse");
    checkText(parsed.at("name").string(), "Ada", "strings keep their text");
    check(parsed.at("n").number() == 3, "numbers keep their value");
    check(parsed.at("flag").flag(false), "booleans are read as flags");
    check(parsed.at("list").items().size() == 2, "arrays keep their items");
    check(parsed.at("none").isNull(), "null is kept as null");
    checkText(parsed.at("missing").string(), "", "a missing key reads as empty");
    check(parsed.at("missing").numeric(7) == 7, "a missing key falls back to the default number");
    checkText(parsed.at("n").string(), "3", "numbers read as text too");
    check(parsed.at("name").numeric(0) == 0, "text that is not a number falls back");

    epp::Json made = epp::Json::object();
    made.set("text", epp::Json("a \"quoted\" value"));
    made.set("count", epp::Json(2.0));
    epp::Json list = epp::Json::array();
    list.push(epp::Json(std::string("one")));
    made.set("items", list);
    std::string dumped = made.dump(2);
    error.clear();
    epp::Json again = epp::jsonParse(dumped, &error);
    check(error.empty(), "what dump writes can be read back");
    checkText(again.at("text").string(), "a \"quoted\" value", "quotes survive a round trip");
    checkText(again.at("count").string(), "2", "whole numbers dump without a decimal point");
    check(again.at("items").items().size() == 1, "arrays survive a round trip");
    check(made.dump(2).find("\n") != std::string::npos, "indented output has line breaks");

    epp::jsonParse("{\"a\": }", &error);
    check(!error.empty(), "broken json reports an error");
    error.clear();
    epp::Json numbers = epp::jsonParse("{\"two\": 2, \"text\": \"3.5\"}", &error);
    check(numbers.at("two").numeric() == 2, "plain numbers read as numbers");
    check(numbers.at("text").numeric() == 3.5, "numbers written as text still count");
}

void testText() {
    startGroup("text catalogue");
    epp::Text text;
    check(text.load("data/messages.json"), "data/messages.json loads");
    check(text.size() > 50, "the catalogue has the interface words");
    check(text.get("ui.run") != "ui.run", "known keys return their words");
    checkText(text.get("does.not.exist"), "does.not.exist", "unknown keys show up as the key");
    checkText(text.get("files.saved", {{"name", "dice.eppla"}}), "Saved dice.eppla.", "{name} placeholders are filled");
    checkText(epp::Text::fill("a {x} b {y}", {{"x", "1"}, {"y", "2"}}), "a 1 b 2", "fill replaces several placeholders");

    epp::Text::install(&text);
    std::string page = epp::renderTemplate("web/partials/footer.html", {{"build", text.get("build")}});
    check(page.find(text.get("build")) != std::string::npos, "templates read labels with {{t:key}}");
    check(page.find("{{t:") == std::string::npos, "no {{t:...}} is left behind");
    check(page.find("{{build}}") == std::string::npos, "named placeholders are replaced");

    std::string missing = epp::renderTemplate("web/partials/not-a-file.html", {});
    check(missing.find("missing") != std::string::npos, "a missing template says so instead of vanishing");

    startGroup("highlighting");
    std::string html = epp::highlightToHtml("note: a note\nsay \"<b>\" plus 'name'\n");
    check(html.find("t-key") != std::string::npos, "command words are highlighted");
    check(html.find("t-note") != std::string::npos, "notes are highlighted");
    check(html.find("t-str") != std::string::npos, "text is highlighted");
    check(html.find("&lt;b&gt;") != std::string::npos, "angle brackets are escaped");
    check(html.find("<b>") == std::string::npos, "no raw tag survives from the source");
    check(html.find("ln") != std::string::npos, "line numbers are added");
    check(epp::highlightToHtml("").find("</span>") != std::string::npos, "empty source still renders");
}

void testStore() {
    startGroup("file store");
    fs::path temp = fs::temp_directory_path() / ("epp-test-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    epp::Store store(temp.string());
    check(store.ensure(), "the folder is created");
    check(store.list().empty(), "a new folder has no files");

    check(store.create("hello.eppl", "say \"hi\"\n"), "a file is created");
    check(!store.create("hello.eppl", "say \"again\"\n"), "the same name is not created twice");
    check(store.exists("hello.eppl"), "the file is there");
    checkText(store.read("hello.eppl"), "say \"hi\"\n", "the file keeps what it was given");

    store.create("dice.eppla", "add library \"Random\"\n");
    check(store.list().size() == 2, "both files are listed");
    std::vector<epp::FileInfo> found = store.list("dice");
    check(found.size() == 1 && found[0].name == "dice.eppla", "list filters by name");
    check(!found.empty() && found[0].size > 0, "the size is reported");
    check(!found.empty() && !found[0].updated.empty(), "the change time is reported");

    check(store.rename("hello.eppl", "greeting.eppl"), "a file is renamed");
    check(!store.exists("hello.eppl") && store.exists("greeting.eppl"), "the old name is gone");
    check(!store.rename("greeting.eppl", "dice.eppla"), "an existing name is not overwritten");
    check(store.remove("greeting.eppl"), "a file is removed");
    check(store.list().size() == 1, "only the other file is left");

    check(store.write("../escape.eppl", "say 1\n") == false, "names with .. are refused");
    check(store.exists("../escape.eppl") == false, "nothing was written outside the folder");

    int added = store.restoreExamples("data/examples");
    check(added >= 5, "the example programs are copied in");
    check(store.exists("demo.eppla"), "the tour is one of them");
    check(store.restoreExamples("data/examples") == 0, "copying again adds nothing new");

    startGroup("file naming");
    checkText(epp::Store::nameFor("score", "say 1\n"), "score.eppl", "a plain program becomes .eppl");
    checkText(epp::Store::nameFor("score", "add library \"Math\"\n"), "score.eppla", "library code becomes .eppla");
    checkText(epp::Store::nameFor("score.eppla", "say 1\n"), "score.eppla", "a name that is already right is kept");
    checkText(epp::Store::nameFor("score.txt", "say 1\n"), "", "other endings are refused");
    checkText(epp::Store::nameFor("", "say 1\n"), "", "an empty name is refused");
    checkText(epp::Store::upgradedFor("score.eppl", "add library \"Math\"\n"), "score.eppla", "a file with libraries is upgraded");
    checkText(epp::Store::upgradedFor("score.eppl", "say 1\n"), "score.eppl", "a file without libraries is left alone");
    checkText(epp::Store::upgradedFor("score.eppla", "say 1\n"), "score.eppla", "a .eppla file is never downgraded");
    check(epp::Store::errorForName("score.txt", "").find(".eppl or .eppla") != std::string::npos, "the refusal explains the endings");
    check(!epp::Store::errorForName("score", "").empty() == false, "a good name has no complaint");

    startGroup("settings and custom lessons");
    epp::Json defaults = epp::jsonParse(readFile("data/settings.json")).at("defaults");
    check(defaults.isObject(), "the settings file has defaults");
    epp::Json loaded = store.loadSettings(defaults);
    checkText(loaded.at("theme").string(), "dark", "defaults are used when nothing is saved");
    epp::Json changed = loaded;
    changed.set("theme", epp::Json(std::string("light")));
    store.saveSettings(changed);
    epp::Json reloaded = store.loadSettings(defaults);
    checkText(reloaded.at("theme").string(), "light", "a saved value comes back");
    checkText(reloaded.at("consoleLines").string(), "400", "values that were not saved stay at their default");

    check(store.loadCustomLessons().items().empty(), "no custom lessons to start with");
    epp::Json lessons = epp::Json::array();
    epp::Json lesson = epp::Json::object();
    lesson.set("id", epp::Json(std::string("mine")));
    lesson.set("title", epp::Json(std::string("My lesson")));
    lessons.push(lesson);
    store.saveCustomLessons(lessons);
    check(store.loadCustomLessons().items().size() == 1, "a custom lesson is kept");
    checkText(store.loadCustomLessons().items()[0].at("title").string(), "My lesson", "its words are kept");

    std::error_code ignored;
    fs::remove_all(temp, ignored);
}

void testDataFiles() {
    startGroup("data files");
    std::string error;
    epp::Json messages = epp::jsonParse(readFile("data/messages.json"), &error);
    check(error.empty() && messages.isObject(), "data/messages.json is valid json");
    checkText(messages.at("build").string(), "Dev Build 6.3", "the build label is in one place");

    epp::Json schema = epp::jsonParse(readFile("data/settings.json"), &error);
    check(error.empty() && schema.isObject(), "data/settings.json is valid json");
    int controls = 0;
    bool everyControlHasAKey = true;
    for (const epp::Json& g : schema.at("groups").items()) {
        for (const epp::Json& c : g.at("controls").items()) {
            ++controls;
            if (c.at("key").string().empty() || c.at("label").string().empty()) everyControlHasAKey = false;
            if (!schema.at("defaults").has(c.at("key").string())) everyControlHasAKey = false;
        }
    }
    check(controls >= 9, "the settings page still has a full set of controls");
    check(everyControlHasAKey, "every control has a key, a label and a default");

    epp::Json lessons = epp::jsonParse(readFile("data/tutorial.json"), &error);
    check(error.empty() && lessons.isArray() && lessons.items().size() >= 8, "data/tutorial.json holds the lessons");
    bool everyLessonIsUsable = true;
    bool everyLessonCompiles = true;
    for (const epp::Json& l : lessons.items()) {
        if (l.at("id").string().empty() || l.at("title").string().empty() || l.at("code").string().empty() ||
            l.at("explanation").string().empty()) {
            everyLessonIsUsable = false;
        }
        std::string name = l.at("code").string().find("add library") != std::string::npos ? "lesson.eppla" : "lesson.eppl";
        std::string code = l.at("code").string();
        if (!epp::check(code, name).empty()) {
            everyLessonCompiles = false;
            std::cout << "       lesson " << l.at("id").string() << " does not parse: "
                      << epp::check(code, name).format() << "\n";
        }
    }
    check(everyLessonIsUsable, "every lesson has a title, an explanation and code");
    check(everyLessonCompiles, "every lesson in the tutorial parses");
}

void testPages() {
    startGroup("templates");
    epp::Text text;
    text.load("data/messages.json");
    epp::Text::install(&text);

    const std::vector<std::string> templates = {
        "layout.html", "ide.html", "tutorial.html", "settings.html", "about.html",
        "new.html", "rename.html", "delete.html", "error.html",
        "partials/topbar.html", "partials/footer.html", "partials/file_row.html", "partials/empty_files.html",
        "partials/library_card.html", "partials/console_empty.html", "partials/grid.html",
        "partials/lesson_item.html", "partials/lesson_remove.html",
        "partials/setting_group.html", "partials/setting_select.html", "partials/setting_checkbox.html",
        "partials/setting_text.html", "partials/setting_option.html"};
    bool allThere = true;
    for (const std::string& name : templates) {
        if (readFile("web/" + name).empty()) {
            allThere = false;
            std::cout << "       missing template: " << name << "\n";
        }
    }
    check(allThere, "every template exists");

    // The front end is allowed one script file, loaded from the shell. What no
    // template may do is carry logic of its own or point at a second script.
    std::string inlineScript;
    std::string externalScripts;
    for (const std::string& name : templates) {
        std::string body = readFile("web/" + name);
        size_t at = body.find("<script");
        while (at != std::string::npos) {
            size_t end = body.find('>', at);
            std::string tag = end == std::string::npos ? body.substr(at) : body.substr(at, end - at);
            if (tag.find("src=") != std::string::npos) {
                if (tag.find("/app.js") == std::string::npos || name != "layout.html") externalScripts += name + " ";
            } else {
                inlineScript += name + " ";
            }
            at = body.find("<script", at + 1);
        }
    }
    check(inlineScript.empty(), "no template carries javascript of its own" + (inlineScript.empty() ? "" : " (" + inlineScript + ")"));
    check(externalScripts.empty(), "the only script a page loads is /app.js" + (externalScripts.empty() ? "" : " (" + externalScripts + ")"));
    check(readFile("web/app.js").find("say('") != std::string::npos,
          "the front end asks the catalogue for its wording");

    std::string markup = readFile("web/ide.html");
    check(markup.find("{{t:ui.run}}") != std::string::npos, "pages take their words from the catalogue");
    check(markup.find("{{files}}") != std::string::npos, "pages take their lists from the data");
}

}  // namespace

int main() {
    std::cout << "E++ engine tests\n";
    testLanguage();
    testJson();
    testText();
    testStore();
    testDataFiles();
    testPages();

    std::cout << "\n" << passed << " checks passed";
    if (failed) std::cout << ", " << failed << " failed";
    std::cout << ".\n";
    return failed == 0 ? 0 : 1;
}
