// The E++ language: lexer, parser, interpreter, libraries, Python runner.
#pragma once

#include <functional>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>

#include "json.hpp"

namespace epp {

struct Error {
    std::string category = "RuntimeError";
    std::string message;
    std::string hint;
    int line = 0;
    int column = 0;
    std::string code;  // a short tag the IDE can act on: no-answers, needs-eppla, library-missing

    bool empty() const { return message.empty(); }
    std::string format() const;
};

enum class Line {
    Output,    // program output
    System,    // notices from the IDE
    Library,   // "library loaded" style lines
    Prompt,    // a question from ask
    Answer,    // what the user answered
    Error,     // an error, already formatted
    Divider,   // run separators
};

struct LineOut {
    Line kind = Line::Output;
    std::string text;
};

// The Draw library produces sprites; the IDE draws them, the CLI prints a grid.
struct Sprite {
    std::string name;
    double x = 0;
    double y = 0;
};

// The Image library produces a picture (a data: URI) plus its name.
struct Picture {
    std::string name;
    std::string dataUri;
};

struct Program {
    std::string fileName;
    std::string source;
    int statementCount = 0;
};

struct Options {
    std::string fileName;                 // decides the extension rule
    std::vector<std::string> answers;     // one per ask, in order
    bool librariesAllowed = true;         // false for .eppl files
    bool strictLibraries = true;          // report library use that needs .eppla
    unsigned waitLimitMs = 5000;          // a wait longer than this is cut short
    std::function<void(unsigned)> sleep;  // used by wait; may be empty
};

struct Result {
    std::vector<LineOut> lines;
    Error error;
    std::vector<std::string> libraries;
    std::vector<Sprite> sprites;
    std::vector<Picture> pictures;
    bool ok = true;
    long milliseconds = 0;
};

// Runs E++ source. Never throws: failures come back as Result::error.
Result run(const std::string& source, const Options& options = Options());

// Parses without running: used by the IDE to check a file, and by the tests.
Error check(const std::string& source, const std::string& fileName = "");

// True when the source mentions a library (add library / library-only words).
bool usesLibrary(const std::string& source);
std::set<std::string> librariesUsed(const std::string& source);

// Library names the engine knows, with a one-line description.
struct LibraryInfo {
    std::string name;
    std::string description;
    std::vector<std::string> words;
};
std::vector<LibraryInfo> libraryCatalogue();

// Turns source into syntax-highlighted HTML (used by the read-only code view).
std::string highlightToHtml(const std::string& source);

// Runs the supported Python subset and reports lines through `print`.
// Throws Error (caught by the interpreter) on the first problem.
void runPython(const std::string& code, const std::function<void(const std::string&)>& print);

}  // namespace epp
