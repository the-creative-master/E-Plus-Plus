// Lexer, parser and interpreter for E++. No dependencies beyond the standard library.
#include "engine.hpp"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <random>
#include <set>
#include <sstream>

namespace epp {
namespace {

// ---------------------------------------------------------------- tokens

struct Token {
    enum class Kind { Word, Number, String, Var, Period, Comma, LParen, RParen, Op, Newline, Comment, End };
    Kind kind = Kind::End;
    std::string text;   // as written
    std::string lower;  // lower-case copy, for keyword matching
    double num = 0;
    int line = 1;
    int column = 1;
};

bool isLetter(char c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || (c >= '0' && c <= '9'); }

Error makeError(const char* category, const std::string& message, const Token& token, const std::string& hint = "") {
    Error error;
    error.category = category;
    error.message = message;
    error.hint = hint;
    error.line = token.line;
    error.column = token.column;
    return error;
}

std::string lowerCopy(const std::string& text) {
    std::string out = text;
    for (char& c : out) {
        if (c >= 'A' && c <= 'Z') c = char(c - 'A' + 'a');
    }
    return out;
}

std::string trimCopy(const std::string& text) {
    size_t start = 0;
    size_t end = text.size();
    auto blank = [](char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; };
    while (start < end && blank(text[start])) ++start;
    while (end > start && blank(text[end - 1])) --end;
    return text.substr(start, end - start);
}

class Lexer {
public:
    explicit Lexer(const std::string& source) : source_(source) {}

    std::vector<Token> scan() {
        std::vector<Token> tokens;
        while (pos_ < source_.size()) {
            char c = source_[pos_];
            if (c == '\n') { push(tokens, Token::Kind::Newline); ++pos_; newline(); continue; }
            if (c == ' ' || c == '\t' || c == '\r') { ++pos_; ++column_; continue; }
            if (c == '.' && !isDigit(peek(1))) { push(tokens, Token::Kind::Period); ++pos_; continue; }
            if (c == ',') { push(tokens, Token::Kind::Comma); ++pos_; continue; }
            if (c == '(') { push(tokens, Token::Kind::LParen); ++pos_; continue; }
            if (c == ')') { push(tokens, Token::Kind::RParen); ++pos_; continue; }
            if (c == '"') { string(tokens); continue; }
            if (c == '\'') { variable(tokens); continue; }
            if (isDigit(c)) { number(tokens); continue; }
            if (c == '+' || c == '-' || c == '*' || c == '/') {
                Token token;
                token.kind = Token::Kind::Op;
                token.text = std::string(1, c);
                token.lower = token.text;
                place(token);
                tokens.push_back(token);
                ++pos_;
                ++column_;
                continue;
            }
            if (isLetter(c)) {
                if (pythonBlock(tokens)) continue;
                word(tokens);
                continue;
            }
            Token token;
            token.kind = Token::Kind::Op;
            token.text = std::string(1, c);
            token.lower = token.text;
            place(token);
            throw makeError("LexError", std::string("E++ does not understand the character \"") + c + "\".",
                            token, "Remove it, or put it inside double quotes to use it as text.");
        }
        Token end;
        end.kind = Token::Kind::End;
        place(end);
        tokens.push_back(end);
        return tokens;
    }

private:
    static bool isDigit(char c) { return c >= '0' && c <= '9'; }

    // "python code" followed by a newline opens a block of Python that runs
    // until a line reading "end python". The block is handed to the Python
    // runner as one piece of text, so indentation and symbols inside it are
    // the programmer's business, not the E++ lexer's.
    bool atPythonBlock() const {
        size_t p = pos_;
        auto word = [&](const char* wanted) {
            while (p < source_.size() && (source_[p] == ' ' || source_[p] == '\t')) ++p;
            size_t start = p;
            while (p < source_.size() && isLetter(source_[p])) ++p;
            return lowerCopy(source_.substr(start, p - start)) == wanted;
        };
        if (!word("python")) return false;
        if (!word("code")) return false;
        while (p < source_.size() && (source_[p] == ' ' || source_[p] == '\t')) ++p;
        return p >= source_.size() || source_[p] == '\n';
    }

    bool pythonBlock(std::vector<Token>& tokens) {
        if (!atPythonBlock()) return false;
        int startLine = line_;
        int startColumn = column_;
        size_t openEnd = source_.find('\n', pos_);
        if (openEnd == std::string::npos || openEnd - pos_ > 64) return false;
        pos_ = openEnd + 1;
        ++line_;
        column_ = 1;
        std::string code;
        while (pos_ < source_.size()) {
            size_t end = source_.find('\n', pos_);
            std::string text = source_.substr(pos_, end == std::string::npos ? std::string::npos : end - pos_);
            std::string trimmed = text;
            while (!trimmed.empty() && (trimmed[0] == ' ' || trimmed[0] == '\t')) trimmed.erase(0, 1);
            while (!trimmed.empty() && (trimmed.back() == ' ' || trimmed.back() == '\r')) trimmed.pop_back();
            pos_ = end == std::string::npos ? source_.size() : end + 1;
            ++line_;
            column_ = 1;
            if (lowerCopy(trimmed) == "end python") break;
            code += text + "\n";
        }
        Token open;
        open.kind = Token::Kind::Word;
        open.text = "python";
        open.lower = "python";
        open.line = startLine;
        open.column = startColumn;
        tokens.push_back(open);
        Token codeWord = open;
        codeWord.text = "code";
        codeWord.lower = "code";
        codeWord.column = startColumn + 7;
        tokens.push_back(codeWord);

        Token token;
        token.kind = Token::Kind::String;
        token.text = dedent(code);
        token.lower = token.text;
        token.line = startLine;
        token.column = startColumn;
        tokens.push_back(token);
        push(tokens, Token::Kind::Newline);
        return true;
    }

    // Removes the indentation every line of the block shares.
    static std::string dedent(const std::string& code) {
        std::vector<std::string> lines;
        std::string current;
        for (char c : code) {
            if (c == '\n') { lines.push_back(current); current.clear(); }
            else current.push_back(c);
        }
        if (!current.empty()) lines.push_back(current);
        size_t common = std::string::npos;
        for (const std::string& line : lines) {
            if (trimCopy(line).empty()) continue;
            size_t spaces = 0;
            while (spaces < line.size() && (line[spaces] == ' ' || line[spaces] == '\t')) ++spaces;
            common = common == std::string::npos ? spaces : std::min(common, spaces);
        }
        if (common == std::string::npos || common == 0) return code;
        std::string out;
        for (const std::string& line : lines) out += (line.size() >= common ? line.substr(common) : line) + "\n";
        return out;
    }
    char peek(size_t ahead) const { return pos_ + ahead < source_.size() ? source_[pos_ + ahead] : '\0'; }

    void newline() { ++line_; column_ = 1; }
    void place(Token& token) const { token.line = line_; token.column = column_; }
    void push(std::vector<Token>& tokens, Token::Kind kind) {
        Token token;
        token.kind = kind;
        place(token);
        tokens.push_back(token);
    }

    void word(std::vector<Token>& tokens) {
        size_t start = pos_;
        while (pos_ < source_.size() && isLetter(source_[pos_])) ++pos_;
        std::string text = source_.substr(start, pos_ - start);
        Token token;
        token.kind = Token::Kind::Word;
        token.text = text;
        token.lower = lowerCopy(text);
        place(token);
        column_ += int(text.size());
        if (token.lower == "note" && pos_ < source_.size() && source_[pos_] == ':') {
            // A note runs to the end of the line and is kept for highlighting.
            size_t lineStart = pos_ + 1;
            while (pos_ < source_.size() && source_[pos_] != '\n') ++pos_;
            Token comment = token;
            comment.kind = Token::Kind::Comment;
            comment.text = source_.substr(lineStart, pos_ - lineStart);
            if (!comment.text.empty() && comment.text[0] == ' ') comment.text.erase(0, 1);
            tokens.push_back(comment);
            return;
        }
        tokens.push_back(token);
    }

    void number(std::vector<Token>& tokens) {
        size_t start = pos_;
        while (pos_ < source_.size() && isDigit(source_[pos_])) ++pos_;
        if (pos_ < source_.size() && source_[pos_] == '.' && isDigit(peek(1))) {
            ++pos_;
            while (pos_ < source_.size() && isDigit(source_[pos_])) ++pos_;
        }
        Token token;
        token.kind = Token::Kind::Number;
        token.text = source_.substr(start, pos_ - start);
        token.num = std::strtod(token.text.c_str(), nullptr);
        place(token);
        column_ += int(token.text.size());
        tokens.push_back(token);
    }

    void string(std::vector<Token>& tokens) {
        Token token;
        token.kind = Token::Kind::String;
        place(token);
        size_t start = ++pos_;
        while (pos_ < source_.size() && source_[pos_] != '"' && source_[pos_] != '\n') ++pos_;
        if (pos_ >= source_.size() || source_[pos_] == '\n') {
            throw makeError("LexError", "A piece of text in double quotes never ends.", token,
                            "Add the closing \" before the end of the line.");
        }
        token.text = source_.substr(start, pos_ - start);
        token.lower = token.text;
        ++pos_;
        column_ += int(token.text.size()) + 2;
        tokens.push_back(token);
    }

    void variable(std::vector<Token>& tokens) {
        Token token;
        token.kind = Token::Kind::Var;
        place(token);
        size_t start = ++pos_;
        while (pos_ < source_.size() && source_[pos_] != '\'' && source_[pos_] != '\n') ++pos_;
        if (pos_ >= source_.size() || source_[pos_] == '\n') {
            throw makeError("LexError", "A variable name in single quotes never ends.", token,
                            "Variables are written like 'score' — add the closing '.");
        }
        token.text = source_.substr(start, pos_ - start);
        token.lower = lowerCopy(token.text);
        ++pos_;
        column_ += int(token.text.size()) + 2;
        tokens.push_back(token);
    }

    const std::string& source_;
    size_t pos_ = 0;
    int line_ = 1;
    int column_ = 1;
};

// ---------------------------------------------------------------- syntax tree

struct Expr {
    enum class Kind { Number, Text, Variable, Binary, Negate, Call } kind = Kind::Number;
    double number = 0;
    std::string text;          // text value, variable name, call name or operator
    std::vector<Expr> args;
};

struct Cond {
    bool present = false;
    Expr left;
    Expr right;
    Expr expr2;  // the upper bound of "is in the range of A to B"
    std::string op;  // equal, notEqual, exactlyEqual, notExactlyEqual, greater, less,
                     // greaterOrEqual, lessOrEqual, isNumber, notNumber, contains,
                     // positive, notPositive, negative, notNegative, inRange, notInRange
    bool needsRight = true;
};

struct Stmt {
    enum class Kind {
        Define, SetName, Increase, Decrease, Say, Display, Ask, If, Repeat, While,
        Loopback, AddLibrary, Python, ImageDefine, ImageDisplay, ImageCheck,
        SpriteDefine, SpriteMove, Wait, SaveProject
    };
    Kind kind = Kind::Say;
    std::string name;
    std::string text;
    Expr expr;
    Expr expr2;
    Cond cond;
    std::vector<Stmt> body;
    std::vector<Stmt> otherwiseBody;
    int line = 0;
    int column = 0;
};

class Parser {
public:
    Parser(std::vector<Token> tokens, const std::string& fileName)
        : tokens_(std::move(tokens)), fileName_(fileName) {}

    std::vector<Stmt> parse() {
        std::vector<Stmt> body;
        while (true) {
            skipSeparators();
            if (at(Token::Kind::End)) break;
            body.push_back(statement());
        }
        return body;
    }

private:
    const Token& peek(size_t ahead = 0) const {
        size_t index = pos_ + ahead;
        return index < tokens_.size() ? tokens_[index] : tokens_.back();
    }
    bool at(Token::Kind kind) const { return peek().kind == kind; }
    bool atWord(const char* word) const { return at(Token::Kind::Word) && peek().lower == word; }
    const Token& advance() { return tokens_[pos_ < tokens_.size() - 1 ? pos_++ : pos_]; }

    void skipSeparators() {
        while (at(Token::Kind::Newline) || at(Token::Kind::Period) || at(Token::Kind::Comma) || at(Token::Kind::Comment)) advance();
    }
    void skipInLine() {
        while (at(Token::Kind::Comment)) advance();
    }
    bool endOfStatement() const {
        return at(Token::Kind::Newline) || at(Token::Kind::Period) || at(Token::Kind::End) ||
               at(Token::Kind::Comment);
    }

    [[noreturn]] void fail(const std::string& message, const std::string& hint = "") {
        throw makeError("ParseError", message, peek(), hint);
    }

    void expectWord(const char* word, const std::string& what) {
        if (!atWord(word)) fail("Expected \"" + std::string(word) + "\" " + what + ".");
        advance();
    }

    bool eat(const char* word) {
        if (atWord(word)) { advance(); return true; }
        return false;
    }

    // Reads a variable name: a quoted 'name', or the bare words up to a keyword.
    std::string nameUntil(const std::vector<std::string>& stops) {
        if (at(Token::Kind::Var)) return advance().text;
        if (!at(Token::Kind::Word)) fail("A name was expected here.", "Names can be plain words, or written in single quotes.");
        std::string name;
        while (at(Token::Kind::Word)) {
            const std::string& word = peek().lower;
            if (std::find(stops.begin(), stops.end(), word) != stops.end() && !name.empty()) break;
            if (!name.empty()) name += " ";
            name += advance().text;
        }
        return name;
    }

    Stmt statement() {
        Stmt node;
        node.line = peek().line;
        node.column = peek().column;
        skipInLine();

        if (at(Token::Kind::Var)) {
            // 'hero' move right "60"
            std::string name = advance().text;
            node.kind = Stmt::Kind::SpriteMove;
            node.name = name;
            if (!atWord("move")) fail("After a sprite name, E++ expects the word \"move\".", "Example: 'hero' move right \"60\"");
            advance();
            if (!at(Token::Kind::Word)) fail("Which way should the sprite move?", "Use up, down, left or right.");
            node.text = peek().lower;
            if (node.text != "up" && node.text != "down" && node.text != "left" && node.text != "right") {
                fail("A sprite can move up, down, left or right — not \"" + peek().text + "\".");
            }
            advance();
            node.expr = expression();
            return node;
        }

        if (!at(Token::Kind::Word)) fail("E++ expected a command here.", "Statements start with a word such as say, define or if.");
        std::string keyword = peek().lower;
        advance();

        if (keyword == "say") {
            node.kind = Stmt::Kind::Say;
            node.expr = expression();
        } else if (keyword == "display") {
            bool namedPicture = (at(Token::Kind::String) || at(Token::Kind::Var) || at(Token::Kind::Word)) &&
                                peek(1).kind == Token::Kind::Word && peek(1).lower == "as" &&
                                peek(2).kind == Token::Kind::Word && peek(2).lower == "image";
            if (namedPicture) {
                node.kind = Stmt::Kind::ImageDisplay;
                node.name = advance().text;
                advance();
                advance();
                return node;
            }
            if (atWord("image")) {
                advance();
                node.kind = Stmt::Kind::ImageDisplay;
                // "display image" on its own shows the picture defined last.
                if (at(Token::Kind::Var) || at(Token::Kind::String)) node.name = advance().text;
                else if (!endOfStatement()) node.name = nameUntil({"is", "now"});
                else node.name.clear();
            } else {
                node.kind = Stmt::Kind::Display;
                node.expr = expression();
                if (eat("as")) {
                    if (atWord("fraction") || atWord("decimal")) { node.text = peek().lower; advance(); }
                    else fail("After \"as\", E++ expects fraction or decimal.");
                }
            }
        } else if (keyword == "define") {
            if (atWord("as")) {
                // "Define as value score." — starts at zero, set gives it a value.
                advance();
                expectWord("value", "after \"define as\"");
                node.kind = Stmt::Kind::Define;
                node.name = nameUntil({});
                Expr zero;
                zero.kind = Expr::Kind::Number;
                zero.number = 0;
                node.expr = zero;
                return node;
            }
            std::string name = nameUntil({"as"});
            expectWord("as", "after the variable name");
            node.name = name;
            if (atWord("image")) {
                advance();
                node.kind = Stmt::Kind::ImageDefine;
                node.expr = expression();
            } else if (atWord("drawing")) {
                advance();
                expectWord("sprite", "after \"drawing\"");
                node.kind = Stmt::Kind::SpriteDefine;
            } else {
                node.kind = Stmt::Kind::Define;
                node.expr = defineValue();
            }
        } else if (keyword == "set") {
            node.kind = Stmt::Kind::SetName;
            node.name = nameUntil({"to"});
            expectWord("to", "after the variable name");
            node.expr = expression();
        } else if (keyword == "increase" || keyword == "decrease") {
            node.kind = keyword == "increase" ? Stmt::Kind::Increase : Stmt::Kind::Decrease;
            node.name = nameUntil({"by"});
            if (!eat("by")) fail("This needs the word \"by\".", "Example: Increase score by 5");
            node.expr = expression();
        } else if (keyword == "ask") {
            node.kind = Stmt::Kind::Ask;
            if (!at(Token::Kind::String)) fail("ask needs a question in double quotes.", "Example: ask \"Your name?\" and save answer as name");
            node.text = advance().text;
            if (!eat("and")) fail("After the question, E++ expects \"and save answer as\".");
            expectWord("save", "after \"and\"");
            expectWord("answer", "after \"save\"");
            expectWord("as", "after \"save answer\"");
            if (at(Token::Kind::Var)) node.name = advance().text;
            else node.name = nameUntil({});
        } else if (keyword == "if") {
            node = ifStatement(node);
        } else if (keyword == "repeat") {
            node.kind = Stmt::Kind::Repeat;
            bool wasStopping = stopAtTimes_;
            stopAtTimes_ = true;
            node.expr = expression();
            stopAtTimes_ = wasStopping;
            if (!eat("times")) fail("repeat needs the word \"times\".", "Example: repeat 3 times");
            node.body = branch({"end"});
            closeBlock("repeat");
        } else if (keyword == "while") {
            node.kind = Stmt::Kind::While;
            node.cond = condition();
            eat("do");
            node.body = branch({"end"});
            closeBlock("while");
        } else if (keyword == "loopback") {
            node.kind = Stmt::Kind::Loopback;
            while (atWord("to") || atWord("if") || atWord("the") || atWord("start") || atWord("top")) advance();
        } else if (keyword == "add") {
            node.kind = Stmt::Kind::AddLibrary;
            expectWord("library", "after \"add\"");
            if (!at(Token::Kind::String)) fail("add library needs the library name in double quotes.", "Example: add library \"Math\"");
            node.text = advance().text;
        } else if (keyword == "python") {
            node.kind = Stmt::Kind::Python;
            expectWord("code", "after \"python\"");
            if (!at(Token::Kind::String)) fail("python code needs the code in double quotes.", "Example: python code \"print(1)\"");
            node.text = advance().text;
        } else if (keyword == "wait") {
            node.kind = Stmt::Kind::Wait;
            node.expr = expression();
            if (atWord("seconds") || atWord("second")) advance();
        } else if (keyword == "save") {
            node.kind = Stmt::Kind::SaveProject;
            expectWord("project", "after \"save\"");
            expectWord("as", "after \"save project\"");
            node.text = at(Token::Kind::Word) ? advance().text : nameUntil({});
        } else if (keyword == "print") {
            fail("\"" + peek(0).text + "\" is Python, not E++, so E++ will not run it.",
                 "Use say to print, or put the Python inside python code \"...\" with add library \"Python\".");
        } else if (keyword == "check") {
            if (!atWord("if")) fail("check must be followed by \"if\".", "Example: check if 'cat' exists");
            advance();
            node.kind = Stmt::Kind::ImageCheck;
            if (at(Token::Kind::Var) || at(Token::Kind::String)) node.name = advance().text;
            else node.name = nameUntil({"exists"});
            expectWord("exists", "after the image name");
        } else {
            fail("E++ does not know the word \"" + keyword + "\" as a command.",
                 "Commands are: say, display, define, set, increase, decrease, ask, if, repeat, while, add library, python code, wait.");
        }
        return node;
    }

    Stmt ifStatement(Stmt node) {
        node.kind = Stmt::Kind::If;
        node.cond = condition();
        if (!eat("then")) fail("An if needs the word \"then\".", "Example: if 'score' is equal to 3 then say \"three\"");
        node.body = branch({"otherwise", "end"});
        skipSeparators();
        while (atWord("otherwise")) {
            advance();
            if (atWord("if")) {
                // "otherwise if ..." chains another condition onto this one.
                advance();
                Stmt chained;
                chained.line = peek().line;
                chained.column = peek().column;
                node.otherwiseBody.push_back(ifStatement(chained));
                return node;
            }
            node.otherwiseBody = branch({"end"});
            skipSeparators();
            break;
        }
        if (atWord("end")) { advance(); eat("if"); }
        return node;
    }

    // A branch is either the rest of the line, or a block that runs until one
    // of the given words appears on its own at the start of a line.
    std::vector<Stmt> branch(const std::vector<std::string>& stops) {
        std::vector<Stmt> body;
        if (!endOfStatement()) {
            body.push_back(statement());
            return body;
        }
        while (true) {
            skipSeparators();
            if (at(Token::Kind::End)) return body;
            if (at(Token::Kind::Word)) {
                const std::string& word = peek().lower;
                if (std::find(stops.begin(), stops.end(), word) != stops.end()) return body;
            }
            body.push_back(statement());
        }
    }

    void closeBlock(const char* keyword) {
        skipSeparators();
        if (atWord("end")) {
            advance();
            if (atWord(keyword)) advance();
        }
    }

    Cond condition() {
        skipInLine();
        Cond cond;
        cond.present = true;
        if (at(Token::Kind::Var)) {
            cond.left.kind = Expr::Kind::Variable;
            cond.left.text = advance().text;
        } else if (at(Token::Kind::Word) && (peek().lower == "not")) {
            // "if not a number" is handled by the comparison reading below.
            cond.left = expression();
        } else {
            cond.left = expression();
        }
        skipInLine();
        if (!at(Token::Kind::Word)) return cond;
        std::string word = peek().lower;
        if (word == "then" || word == "do") return cond;

        if (word == "contains") {
            advance();
            cond.op = "contains";
            cond.right = expression();
            return cond;
        }
        if (word != "is") return cond;
        advance();
        bool negated = eat("not");
        std::string neg = negated ? "not" : "";
        if (eat("exactly")) {
            expectWord("equal", "after \"exactly\"");
            expectWord("to", "after \"exactly equal\"");
            cond.op = negated ? "notExactlyEqual" : "exactlyEqual";
            cond.right = expression();
            return cond;
        }
        if (eat("equal")) {
            expectWord("to", "after \"equal\"");
            cond.op = negated ? "notEqual" : "equal";
            cond.right = expression();
            return cond;
        }
        if (eat("greater")) {
            if (eat("than")) {
                if (atWord("or")) {
                    advance();
                    expectWord("equal", "after \"or\"");
                    expectWord("to", "after \"or equal\"");
                    cond.op = negated ? "lessOrEqual" : "greaterOrEqual";
                } else {
                    cond.op = negated ? "lessOrEqual" : "greater";
                }
            } else {
                fail("After \"is greater\", E++ expects \"than\".");
            }
            cond.right = expression();
            return cond;
        }
        if (eat("less")) {
            if (eat("than")) {
                if (atWord("or")) {
                    advance();
                    expectWord("equal", "after \"or\"");
                    expectWord("to", "after \"or equal\"");
                    cond.op = negated ? "greaterOrEqual" : "lessOrEqual";
                } else {
                    cond.op = negated ? "greaterOrEqual" : "less";
                }
            } else {
                fail("After \"is less\", E++ expects \"than\".");
            }
            cond.right = expression();
            return cond;
        }
        if (eat("a") || eat("an")) {
            if (eat("number")) { cond.op = negated ? "notNumber" : "isNumber"; cond.needsRight = false; return cond; }
            if (atWord("positive")) { advance(); expectWord("number", "after \"positive\""); cond.op = negated ? "notPositive" : "positive"; cond.needsRight = false; return cond; }
            if (atWord("negative")) { advance(); expectWord("number", "after \"negative\""); cond.op = negated ? "notNegative" : "negative"; cond.needsRight = false; return cond; }
            fail("After \"is a\", E++ expects number, positive number or negative number.");
        }
        if (eat("number")) { cond.op = negated ? "notNumber" : "isNumber"; cond.needsRight = false; return cond; }
        if (atWord("positive")) { advance(); expectWord("number", "after \"positive\""); cond.op = negated ? "notPositive" : "positive"; cond.needsRight = false; return cond; }
        if (atWord("negative")) { advance(); expectWord("number", "after \"negative\""); cond.op = negated ? "notNegative" : "negative"; cond.needsRight = false; return cond; }
        if (eat("in")) {
            expectWord("the", "after \"in\"");
            expectWord("range", "after \"in the\"");
            expectWord("of", "after \"in the range\"");
            cond.op = negated ? "notInRange" : "inRange";
            cond.right = expression();
            expectWord("to", "between the two ends of the range");
            cond.expr2 = expression();
            return cond;
        }
        fail("E++ does not understand \"is " + neg + (neg.empty() ? "" : " ") + peek().text + "\" as a comparison.",
             "Comparisons include: is equal to, is greater than, is less than, is a number, contains, is in the range of A to B.");
        return cond;
    }

    // A bare word list is stored as literal text, as in "Define name as Northwind".
    Expr defineValue() {
        size_t look = pos_;
        bool literal = true;
        while (look < tokens_.size() && !(tokens_[look].kind == Token::Kind::Newline || tokens_[look].kind == Token::Kind::Period ||
                                          tokens_[look].kind == Token::Kind::End || tokens_[look].kind == Token::Kind::Comment)) {
            const Token& token = tokens_[look];
            if (token.kind == Token::Kind::Op || token.kind == Token::Kind::LParen) { literal = false; break; }
            if (token.kind == Token::Kind::Word) {
                static const std::set<std::string> keywords = {
                    "plus", "minus", "times", "divided", "by", "power", "percent", "of", "square", "root",
                    "uppercase", "lowercase", "length", "random", "number", "between", "and", "absolute"};
                if (keywords.count(token.lower)) { literal = false; break; }
            }
            ++look;
        }
        if (!literal) return expression();
        Expr expr;
        if (at(Token::Kind::String)) { expr.kind = Expr::Kind::Text; expr.text = advance().text; return expr; }
        if (at(Token::Kind::Number)) { expr.kind = Expr::Kind::Number; expr.number = advance().num; return expr; }
        if (at(Token::Kind::Var)) { expr.kind = Expr::Kind::Variable; expr.text = advance().text; return expr; }
        std::string words;
        while (at(Token::Kind::Word)) {
            if (!words.empty()) words += " ";
            words += advance().text;
        }
        if (words.empty()) fail("define needs a value after \"as\".");
        expr.kind = Expr::Kind::Text;
        expr.text = words;
        return expr;
    }

    Expr expression(int minimum = 0) {
        Expr left = unary();
        while (true) {
            int precedence = -1;
            std::string op;
            if (at(Token::Kind::Op)) {
                op = peek().text;
                precedence = (op == "+" || op == "-") ? 1 : (op == "*" || op == "/") ? 2 : -1;
            } else if (at(Token::Kind::Word)) {
                const std::string& word = peek().lower;
                if (word == "plus") { op = "plus"; precedence = 1; }
                else if (word == "minus") { op = "minus"; precedence = 1; }
                else if (word == "times") {
                    if (stopAtTimes_) break;  // "repeat 3 times" is not a multiplication
                    op = "times"; precedence = 2;
                }
                else if (word == "divided") { op = "divided"; precedence = 2; }
                else if (word == "power") { op = "power"; precedence = 2; }
                else if (word == "percent") { op = "percent"; precedence = 2; }
            }
            if (precedence < minimum) break;
            const Token& token = peek();
            advance();
            if (op == "divided") expectWord("by", "after \"divided\"");
            if (op == "power") expectWord("of", "after \"power\"");
            if (op == "percent") expectWord("of", "after \"percent\"");
            Expr right = expression(precedence + 1);
            Expr combined;
            combined.kind = Expr::Kind::Binary;
            combined.text = op;
            combined.args.push_back(left);
            combined.args.push_back(right);
            combined.number = token.line;
            left = combined;
        }
        return left;
    }

    Expr unary() {
        if (at(Token::Kind::Op) && peek().text == "-") { advance(); Expr inner = unary(); Expr node; node.kind = Expr::Kind::Negate; node.args.push_back(inner); return node; }
        return primary();
    }

    Expr primary() {
        skipInLine();
        if (at(Token::Kind::Number)) { Expr node; node.kind = Expr::Kind::Number; node.number = advance().num; return node; }
        if (at(Token::Kind::String)) { Expr node; node.kind = Expr::Kind::Text; node.text = advance().text; return node; }
        if (at(Token::Kind::Var)) { Expr node; node.kind = Expr::Kind::Variable; node.text = advance().text; return node; }
        if (at(Token::Kind::LParen)) {
            advance();
            Expr inner = expression();
            if (at(Token::Kind::RParen)) advance();
            else if (at(Token::Kind::Word) && peek().lower == "times") { /* fallthrough into the loop below */ }
            else if (!endOfStatement()) fail("A bracket was opened with \"(\" but never closed.");
            return inner;
        }
        if (at(Token::Kind::Word)) {
            std::string word = peek().lower;
            if (word == "square") {
                advance();
                expectWord("root", "after \"square\"");
                expectWord("of", "after \"square root\"");
                Expr node; node.kind = Expr::Kind::Call; node.text = "sqrt"; node.args.push_back(expression(3)); return node;
            }
            if (word == "absolute") {
                advance();
                expectWord("value", "after \"absolute\"");
                expectWord("of", "after \"absolute value\"");
                Expr node; node.kind = Expr::Kind::Call; node.text = "abs"; node.args.push_back(expression(3)); return node;
            }
            if (word == "uppercase" || word == "lowercase" || word == "length") {
                advance();
                expectWord("of", "after \"" + word + "\"");
                Expr node; node.kind = Expr::Kind::Call; node.text = word; node.args.push_back(expression(3)); return node;
            }
            if (word == "random") {
                advance();
                expectWord("number", "after \"random\"");
                expectWord("between", "after \"random number\"");
                Expr node; node.kind = Expr::Kind::Call; node.text = "random";
                node.args.push_back(expression(3));
                if (!eat("and")) fail("A random range needs \"and\".", "Example: random number between 1 and 10");
                node.args.push_back(expression(3));
                return node;
            }
            if (word == "not") {
                advance();
                Expr node; node.kind = Expr::Kind::Call; node.text = "not"; node.args.push_back(expression(3)); return node;
            }
            return bareWord();
        }
        fail("E++ expected a value here.", "Values are numbers, \"text in quotes\", or 'variables in single quotes'.");
        return Expr();
    }

    Expr bareWord() {
        std::string words;
        while (at(Token::Kind::Word)) {
            if (!words.empty()) words += " ";
            words += advance().text;
        }
        Expr node;
        node.kind = Expr::Kind::Text;
        node.text = words;
        node.number = NAN;  // marks a bare word, which the interpreter refuses
        return node;
    }

    std::vector<Token> tokens_;
    std::string fileName_;
    size_t pos_ = 0;
    bool stopAtTimes_ = false;  // set while reading "repeat <count> times"
};

// ---------------------------------------------------------------- runtime values

struct Value {
    bool isNumber = true;
    double number = 0;
    std::string text;

    static Value of(double value) { return Value{true, value, ""}; }
    static Value of(const std::string& value) { return Value{false, 0, value}; }
};

std::string formatNumber(double value) {
    if (std::isnan(value)) return "NaN";
    if (std::isinf(value)) return value > 0 ? "Infinity" : "-Infinity";
    if (value == std::floor(value) && std::fabs(value) < 1e15) {
        return std::to_string(static_cast<long long>(value));
    }
    std::ostringstream out;
    out.precision(10);
    out << value;
    std::string text = out.str();
    if (text.find('.') != std::string::npos) {
        while (!text.empty() && text.back() == '0') text.pop_back();
        if (!text.empty() && text.back() == '.') text.pop_back();
    }
    return text;
}

std::string toText(const Value& value) { return value.isNumber ? formatNumber(value.number) : value.text; }

bool isNumericText(const std::string& text, double* out) {
    if (text.empty()) return false;
    try {
        size_t used = 0;
        double value = std::stod(text, &used);
        while (used < text.size() && (text[used] == ' ' || text[used] == '\t')) ++used;
        if (used != text.size()) return false;
        if (out) *out = value;
        return true;
    } catch (...) {
        return false;
    }
}

bool equalLoose(const Value& a, const Value& b, bool exact) {
    double left = 0, right = 0;
    if (isNumericText(toText(a), &left) && isNumericText(toText(b), &right)) return left == right;
    const std::string& x = toText(a);
    const std::string& y = toText(b);
    if (exact) return x == y;
    return lowerCopy(x) == lowerCopy(y);
}

// Thrown by loopback, caught by the loop it belongs to.
struct LoopSignal {
    int line = 0;
    int column = 0;
};

struct Library {
    std::string name;
    std::vector<std::string> words;  // phrases that need it
};

const std::vector<Library>& libraries() {
    static const std::vector<Library> table = {
        {"Math", {"divided by", "as fraction", "as decimal", "percent of", "power of", "square root of",
                  "is a positive number", "is a negative number", "is in the range of"}},
        {"Text", {"uppercase of", "lowercase of", "length of"}},
        {"Random", {"random number between"}},
        {"Image", {"as image", "display image", "check if"}},
        {"Draw", {"drawing sprite", "move right", "move left", "move up", "move down"}},
        {"Python", {"python code"}},
    };
    return table;
}

const Library* libraryNamed(const std::string& name) {
    for (const Library& library : libraries()) {
        if (lowerCopy(library.name) == lowerCopy(name)) return &library;
    }
    return nullptr;
}

}  // namespace

std::string Error::format() const {
    if (category == "python") return message;  // Python errors are already written out
    std::ostringstream out;
    out << category;
    if (line > 0) out << " (line " << line << (column > 0 ? ", column " + std::to_string(column) : "") << ")";
    out << ": " << message;
    if (!hint.empty()) out << "\n  " << hint;
    return out.str();
}

bool usesLibrary(const std::string& source) { return !librariesUsed(source).empty(); }

std::set<std::string> librariesUsed(const std::string& source) {
    std::set<std::string> found;
    std::string lower = lowerCopy(source);
    for (const Library& library : libraries()) {
        for (const std::string& phrase : library.words) {
            if (lower.find(phrase) != std::string::npos) { found.insert(library.name); break; }
        }
    }
    size_t at = lower.find("add library");
    if (at != std::string::npos) {
        size_t quote = lower.find('"', at);
        if (quote != std::string::npos) {
            size_t end = lower.find('"', quote + 1);
            if (end != std::string::npos) {
                std::string name = source.substr(quote + 1, end - quote - 1);
                if (libraryNamed(name)) found.insert(libraryNamed(name)->name);
            }
        }
    }
    return found;
}

std::vector<LibraryInfo> libraryCatalogue() {
    std::vector<LibraryInfo> out;
    for (const Library& library : libraries()) {
        LibraryInfo info;
        info.name = library.name;
        info.words = library.words;
        if (library.name == "Math") info.description = "Fractions, decimals, percentages, powers, roots and number checks.";
        else if (library.name == "Text") info.description = "Uppercase, lowercase and length for words and sentences.";
        else if (library.name == "Random") info.description = "Random numbers between two values.";
        else if (library.name == "Image") info.description = "Pictures written as Base64 text.";
        else if (library.name == "Draw") info.description = "Sprites that move around a grid.";
        else if (library.name == "Python") info.description = "Run a small Python program and see its output.";
        out.push_back(info);
    }
    return out;
}

// ---------------------------------------------------------------- interpreter

namespace {

class Interpreter {
public:
    Interpreter(const Options& options, Result& result) : options_(options), result_(result) {}

    void run(const std::vector<Stmt>& program) {
        execute(program);
        for (auto& entry : sprites_) result_.sprites.push_back(entry.second);
    }

private:
    void emit(Line kind, const std::string& text) { result_.lines.push_back({kind, text}); }

    [[noreturn]] void fail(const Stmt& node, const std::string& message, const std::string& hint = "") {
        Error error;
        error.category = "RuntimeError";
        error.message = message;
        error.hint = hint;
        error.line = node.line;
        error.column = node.column;
        throw error;
    }

    [[noreturn]] void libraryFail(const Stmt& node, const std::string& library, const std::string& feature) {
        Error error;
        error.category = "LibraryError";
        error.message = "\"" + feature + "\" belongs to the " + library + " library, which has not been added yet.";
        error.hint = "Add this line above it: add library \"" + library + "\"";
        error.line = node.line;
        error.column = node.column;
        throw error;
    }

    bool hasLibrary(const std::string& name) const {
        for (const std::string& loaded : loaded_) {
            if (lowerCopy(loaded) == lowerCopy(name)) return true;
        }
        return false;
    }

    void requireLibrary(const Stmt& node, const std::string& library, const std::string& feature) {
        if (!hasLibrary(library)) libraryFail(node, library, feature);
    }

    Value evaluate(const Expr& expr, const Stmt& node) {
        switch (expr.kind) {
            case Expr::Kind::Number: return Value::of(expr.number);
            case Expr::Kind::Text:
                if (std::isnan(expr.number)) {
                    double numeric = 0;
                    if (isNumericText(expr.text, &numeric)) return Value::of(numeric);
                    // A bare word that names a variable is a missing-quotes mistake.
                    if (variables_.count(lowerCopy(expr.text))) {
                        fail(node, "\"" + expr.text + "\" is the name of a variable, but variables must be written inside single quotes.",
                             "Write '" + expr.text + "' instead.");
                    }
                    fail(node, "The word \"" + expr.text + "\" does not mean anything in E++ yet.",
                         "Put text in double quotes to print it, or write a variable in single quotes.");
                }
                return Value::of(expr.text);
            case Expr::Kind::Variable: {
                std::string key = lowerCopy(expr.text);
                auto found = variables_.find(key);
                if (found == variables_.end()) {
                    if (hasLibrary("Image") && pictures_.count(key)) return Value::of(pictures_[key].name);
                    fail(node, "There is no variable called '" + expr.text + "'.", "Define it first, for example: Define " + expr.text + " as 1");
                }
                return found->second;
            }
            case Expr::Kind::Negate: {
                Value inner = evaluate(expr.args[0], node);
                double numeric = 0;
                if (!isNumericText(toText(inner), &numeric)) fail(node, "Only numbers can be negative.");
                return Value::of(-numeric);
            }
            case Expr::Kind::Call: return call(expr, node);
            case Expr::Kind::Binary: break;
        }
        return binary(expr, node);
    }

    Value call(const Expr& expr, const Stmt& node) {
        const std::string& name = expr.text;
        if (name == "not") {
            Value value = evaluate(expr.args[0], node);
            double numeric = 0;
            if (isNumericText(toText(value), &numeric)) return Value::of(numeric == 0 ? 1.0 : 0.0);
            return Value::of(toText(value).empty() ? 1.0 : 0.0);
        }
        if (name == "sqrt") {
            requireLibrary(node, "Math", "square root of");
            double value = number(evaluate(expr.args[0], node), node);
            if (value < 0) fail(node, "A negative number has no square root.");
            return Value::of(std::sqrt(value));
        }
        if (name == "abs") {
            return Value::of(std::fabs(number(evaluate(expr.args[0], node), node)));
        }
        if (name == "uppercase" || name == "lowercase") {
            requireLibrary(node, "Text", name + " of");
            std::string text = toText(evaluate(expr.args[0], node));
            if (name == "uppercase") {
                for (char& c : text) c = char(std::toupper(static_cast<unsigned char>(c)));
            } else {
                text = lowerCopy(text);
            }
            return Value::of(text);
        }
        if (name == "length") {
            requireLibrary(node, "Text", "length of");
            return Value::of(double(toText(evaluate(expr.args[0], node)).size()));
        }
        if (name == "random") {
            requireLibrary(node, "Random", "random number between");
            double low = number(evaluate(expr.args[0], node), node);
            double high = number(evaluate(expr.args[1], node), node);
            if (high < low) std::swap(low, high);
            std::uniform_real_distribution<double> pick(low, high);
            return Value::of(std::floor(pick(random_)));
        }
        fail(node, "E++ does not know the instruction \"" + name + "\".");
        return Value::of(0.0);
    }

    double number(const Value& value, const Stmt& node) {
        double numeric = 0;
        if (!isNumericText(toText(value), &numeric)) {
            fail(node, "\"" + toText(value) + "\" is not a number.", "Maths only works on numbers.");
        }
        return numeric;
    }

    Value binary(const Expr& expr, const Stmt& node) {
        const std::string& op = expr.text;
        Value left = evaluate(expr.args[0], node);
        Value right = evaluate(expr.args[1], node);
        if (op == "plus" || op == "+") {
            double a = 0, b = 0;
            if (isNumericText(toText(left), &a) && isNumericText(toText(right), &b)) return Value::of(a + b);
            return Value::of(toText(left) + toText(right));
        }
        if (op == "minus" || op == "-") return Value::of(number(left, node) - number(right, node));
        if (op == "times" || op == "*") return Value::of(number(left, node) * number(right, node));
        if (op == "divided" || op == "/") {
            requireLibrary(node, "Math", "divided by");
            double divisor = number(right, node);
            if (divisor == 0) fail(node, "Dividing by zero has no answer.");
            return Value::of(number(left, node) / divisor);
        }
        if (op == "power") {
            requireLibrary(node, "Math", "power of");
            return Value::of(std::pow(number(left, node), number(right, node)));
        }
        if (op == "percent") {
            requireLibrary(node, "Math", "percent of");
            return Value::of(number(left, node) * number(right, node) / 100.0);
        }
        fail(node, "E++ does not know the operator \"" + op + "\".");
        return Value::of(0.0);
    }

    bool test(const Cond& cond, const Stmt& node) {
        if (!cond.present) return true;
        Value left = evaluate(cond.left, node);
        Value right = cond.needsRight ? evaluate(cond.right, node) : Value::of(0.0);
        const std::string& op = cond.op;
        if (op.empty()) {
            double numeric = 0;
            if (isNumericText(toText(left), &numeric)) return numeric != 0;
            return !toText(left).empty();
        }
        if (op == "equal") return equalLoose(left, right, false);
        if (op == "notEqual") return !equalLoose(left, right, false);
        if (op == "exactlyEqual") return equalLoose(left, right, true);
        if (op == "notExactlyEqual") return !equalLoose(left, right, true);
        if (op == "greater") return number(left, node) > number(right, node);
        if (op == "less") return number(left, node) < number(right, node);
        if (op == "greaterOrEqual") return number(left, node) >= number(right, node);
        if (op == "lessOrEqual") return number(left, node) <= number(right, node);
        if (op == "isNumber") { double v = 0; return isNumericText(toText(left), &v); }
        if (op == "notNumber") { double v = 0; return !isNumericText(toText(left), &v); }
        if (op == "contains") return lowerCopy(toText(left)).find(lowerCopy(toText(right))) != std::string::npos;
        if (op == "positive") { requireLibrary(node, "Math", "is a positive number"); double v = 0; return isNumericText(toText(left), &v) && v > 0; }
        if (op == "notPositive") { requireLibrary(node, "Math", "is not a positive number"); double v = 0; return !(isNumericText(toText(left), &v) && v > 0); }
        if (op == "negative") { requireLibrary(node, "Math", "is a negative number"); double v = 0; return isNumericText(toText(left), &v) && v < 0; }
        if (op == "notNegative") { requireLibrary(node, "Math", "is not a negative number"); double v = 0; return !(isNumericText(toText(left), &v) && v < 0); }
        if (op == "inRange" || op == "notInRange") {
            requireLibrary(node, "Math", "is in the range of");
            double low = number(right, node);
            double high = number(evaluate(cond.expr2, node), node);
            if (high < low) std::swap(low, high);
            double value = number(left, node);
            bool inside = value >= low && value <= high;
            return op == "inRange" ? inside : !inside;
        }
        fail(node, "E++ does not understand the comparison \"" + op + "\".");
        return false;
    }

    void execute(const std::vector<Stmt>& body) {
        for (size_t index = 0; index < body.size(); ++index) {
            const Stmt& node = body[index];
            switch (node.kind) {
                case Stmt::Kind::Define:
                    variables_[lowerCopy(node.name)] = evaluate(node.expr, node);
                    break;
                case Stmt::Kind::SetName: {
                    std::string key = lowerCopy(node.name);
                    if (!variables_.count(key)) {
                        fail(node, "Cannot change '" + node.name + "' because it does not exist yet.",
                             "Define it first, for example: Define " + node.name + " as 1");
                    }
                    variables_[key] = evaluate(node.expr, node);
                    break;
                }
                case Stmt::Kind::Increase:
                case Stmt::Kind::Decrease: {
                    std::string key = lowerCopy(node.name);
                    auto found = variables_.find(key);
                    if (found == variables_.end()) {
                        fail(node, std::string(node.kind == Stmt::Kind::Increase ? "Cannot increase '" : "Cannot decrease '") +
                                       node.name + "' because it does not exist yet.",
                             "Define it first, for example: Define " + node.name + " as 1");
                    }
                    double amount = number(evaluate(node.expr, node), node);
                    double current = number(found->second, node);
                    found->second = Value::of(node.kind == Stmt::Kind::Increase ? current + amount : current - amount);
                    break;
                }
                case Stmt::Kind::Say: {
                    Value value = evaluate(node.expr, node);
                    emit(Line::Output, toText(value));
                    break;
                }
                case Stmt::Kind::Display: {
                    Value value = evaluate(node.expr, node);
                    if (node.text == "fraction") {
                        requireLibrary(node, "Math", "as fraction");
                        double left = number(value, node);
                        // Repeats the operands of a division when it can, otherwise shows n/1.
                        if (node.expr.kind == Expr::Kind::Binary && node.expr.text == "divided") {
                            double a = number(evaluate(node.expr.args[0], node), node);
                            double b = number(evaluate(node.expr.args[1], node), node);
                            emit(Line::Output, formatNumber(a) + "/" + formatNumber(b));
                        } else {
                            emit(Line::Output, formatNumber(left) + "/1");
                        }
                    } else if (node.text == "decimal") {
                        requireLibrary(node, "Math", "as decimal");
                        if (node.expr.kind == Expr::Kind::Binary && node.expr.text == "divided") {
                            double a = number(evaluate(node.expr.args[0], node), node);
                            double b = number(evaluate(node.expr.args[1], node), node);
                            if (b == 0) fail(node, "Dividing by zero has no answer.");
                            emit(Line::Output, formatNumber(a / b));
                        } else {
                            emit(Line::Output, formatNumber(number(value, node)));
                        }
                    } else {
                        emit(Line::Output, toText(value));
                    }
                    break;
                }
                case Stmt::Kind::Ask: {
                    emit(Line::Prompt, node.text);
                    if (answers_.empty()) {
                        fail(node, "This program asked a question, but no answers were given.",
                             "Type one answer per line in the Answers box, then run again.");
                    }
                    std::string answer = answers_.front();
                    answers_.erase(answers_.begin());
                    emit(Line::Answer, answer);
                    variables_[lowerCopy(node.name)] = Value::of(answer);
                    break;
                }
                case Stmt::Kind::If: {
                    if (test(node.cond, node)) {
                        execute(node.body);
                    } else {
                        for (const Stmt& other : node.otherwiseBody) execute({other});
                    }
                    break;
                }
                case Stmt::Kind::Repeat: {
                    double count = number(evaluate(node.expr, node), node);
                    if (count < 0) fail(node, "A loop cannot repeat a negative number of times.");
                    for (double i = 0; i < count; ++i) {
                        try {
                            execute(node.body);
                        } catch (const LoopSignal&) {
                            // loopback: skip the rest of this round, start the next one.
                        }
                    }
                    break;
                }
                case Stmt::Kind::While: {
                    long guard = 0;
                    while (test(node.cond, node)) {
                        try {
                            execute(node.body);
                        } catch (const LoopSignal&) {
                        }
                        if (++guard > 1000000) fail(node, "This loop ran a million times without stopping.",
                                                     "Check that something inside the loop changes the condition.");
                    }
                    break;
                }
                case Stmt::Kind::Loopback: {
                    LoopSignal signal;
                    signal.line = node.line;
                    signal.column = node.column;
                    throw signal;
                }
                case Stmt::Kind::AddLibrary: {
                    if (libraryNamed(node.text) == nullptr) {
                        fail(node, "\"" + node.text + "\" is not a library E++ knows.",
                             "The libraries are: Math, Text, Random, Image, Draw and Python.");
                    }
                    if (!options_.librariesAllowed) {
                        Error error;
                        error.category = "LibraryError";
                        error.message = "This file is .eppl, and .eppl files cannot use libraries. Change the name to end in .eppla to use \"" + node.text + "\".";
                        error.line = node.line;
                        error.column = node.column;
                        throw error;
                    }
                    if (!hasLibrary(node.text)) {
                        loaded_.push_back(node.text);
                        emit(Line::Library, "Library loaded: " + node.text);
                    }
                    break;
                }
                case Stmt::Kind::Python: {
                    requireLibrary(node, "Python", "python code");
                    emit(Line::System, "Python says:");
                    std::string code = node.text;
                    if (!code.empty() && (code[0] == ',' || code[0] == '-')) {
                        // Humanizer multi-line blocks: ", ... ," or "--- ... ---".
                        char marker = code[0];
                        code.erase(0, 1);
                        size_t end = code.rfind(marker);
                        if (end != std::string::npos && end > 0) code.erase(end);
                    }
                    try {
                        runPython(code, [this](const std::string& line) { emit(Line::Output, line); });
                    } catch (const Error& error) {
                        Error python = error;
                        python.category = "python";
                        python.line = node.line;
                        python.column = node.column;
                        throw python;
                    }
                    break;
                }
                case Stmt::Kind::ImageDefine: {
                    requireLibrary(node, "Image", "define as image");
                    Value source = evaluate(node.expr, node);
                    std::string text = toText(source);
                    std::string uri = text;
                    if (uri.compare(0, 5, "data:") != 0) {
                        std::string mime = "image/png";
                        if (uri.compare(0, 4, "/9j=") == 0) mime = "image/jpeg";
                        else if (uri.compare(0, 6, "R0lGOD") == 0) mime = "image/gif";
                        else if (uri.compare(0, 5, "UklGR") == 0) mime = "image/webp";
                        uri = "data:" + mime + ";base64," + uri;
                    }
                    Picture picture;
                    picture.name = node.name;
                    lastPicture_ = node.name;
                    picture.dataUri = uri;
                    result_.pictures.push_back(picture);
                    pictures_[lowerCopy(node.name)] = picture;
                    emit(Line::System, "Image defined: " + node.name);
                    break;
                }
                case Stmt::Kind::ImageDisplay: {
                    requireLibrary(node, "Image", "display image");
                    std::string wanted = node.name.empty() ? lastPicture_ : node.name;
                    auto found = pictures_.find(lowerCopy(wanted));
                    if (found == pictures_.end()) {
                        fail(node, "There is no image called '" + wanted + "' to display.",
                             "Define it first: define " + wanted + " as image \"<base64 text>\"");
                    }
                    LineOut line;
                    line.kind = Line::Output;
                    line.text = "[[image:" + found->second.dataUri + "]]";
                    result_.lines.push_back(line);
                    break;
                }
                case Stmt::Kind::ImageCheck: {
                    requireLibrary(node, "Image", "check if exists");
                    bool exists = pictures_.count(lowerCopy(node.name)) > 0;
                    emit(Line::Output, exists ? node.name + " exists" : node.name + " does not exist");
                    break;
                }
                case Stmt::Kind::SpriteDefine: {
                    requireLibrary(node, "Draw", "drawing sprite");
                    Sprite sprite;
                    sprite.name = node.name;
                    sprites_[lowerCopy(node.name)] = sprite;
                    break;
                }
                case Stmt::Kind::SpriteMove: {
                    requireLibrary(node, "Draw", "sprite movement");
                    auto found = sprites_.find(lowerCopy(node.name));
                    if (found == sprites_.end()) {
                        fail(node, "There is no sprite called '" + node.name + "'.",
                             "Create it first: define " + node.name + " as drawing sprite");
                    }
                    Value amount = evaluate(node.expr, node);
                    double pixels = 0;
                    std::string text = toText(amount);
                    while (!text.empty() && !std::isdigit(static_cast<unsigned char>(text.back())) &&
                           text.back() != '.' && text.back() != '-') {
                        text.pop_back();
                    }
                    while (!text.empty() && std::isspace(static_cast<unsigned char>(text.back()))) text.pop_back();
                    if (!isNumericText(text, &pixels)) {
                        fail(node, "How far should it move? Distances are written in double quotes: \"60 px\".");
                    }
                    if (node.text == "right") found->second.x += pixels;
                    else if (node.text == "left") found->second.x -= pixels;
                    else if (node.text == "down") found->second.y += pixels;
                    else found->second.y -= pixels;
                    break;
                }
                case Stmt::Kind::Wait: {
                    double seconds = number(evaluate(node.expr, node), node);
                    unsigned milliseconds = unsigned(std::max(0.0, seconds) * 1000);
                    if (milliseconds > options_.waitLimitMs) milliseconds = options_.waitLimitMs;
                    if (options_.sleep && milliseconds > 0) options_.sleep(milliseconds);
                    break;
                }
                case Stmt::Kind::SaveProject: {
                    emit(Line::System, "Project saved as " + node.text + " (the IDE writes files with Save).");
                    break;
                }
            }
        }
    }

    const Options& options_;
    Result& result_;
    std::map<std::string, Value> variables_;
    std::map<std::string, Picture> pictures_;
    std::string lastPicture_;
    std::map<std::string, Sprite> sprites_;
    std::vector<std::string> loaded_;
    std::vector<std::string> answers_ = options_.answers;
    std::mt19937 random_{std::random_device{}()};
};

}  // namespace

Result run(const std::string& source, const Options& options) {
    Result result;
    auto started = std::chrono::steady_clock::now();
    try {
        Options effective = options;
        effective.answers = options.answers;
        if (options.strictLibraries && !options.fileName.empty()) {
            std::string lower = lowerCopy(options.fileName);
            bool pure = lower.size() > 5 && lower.compare(lower.size() - 5, 5, ".eppl") == 0;
            if (pure) {
                // .eppl files may not use libraries, and the rule is enforced before running.
                auto needed = librariesUsed(source);
                if (!needed.empty()) {
                    Error error;
                    error.category = "LibraryError";
                    error.message = "\"" + options.fileName + "\" uses libraries, but a .eppl file is for programs without them.";
                    error.hint = "Rename the file so it ends in .eppla, then run it again.";
                    error.line = 1;
                    error.column = 1;
                    throw error;
                }
            }
        }
        Lexer lexer(source);
        std::vector<Token> tokens = lexer.scan();
        Parser parser(std::move(tokens), options.fileName);
        std::vector<Stmt> program = parser.parse();
        {
            Interpreter interpreter(effective, result);
            interpreter.run(program);
        }
    } catch (const LoopSignal& signal) {
        Error error;
        error.category = "RuntimeError";
        error.message = "loopback only works inside a loop.";
        error.hint = "Put it inside repeat ... end repeat or while ... end while.";
        error.line = signal.line;
        error.column = signal.column;
        result.error = error;
        result.ok = false;
        result.lines.push_back({Line::Error, error.format()});
    } catch (const Error& error) {
        result.error = error;
        result.ok = false;
        result.lines.push_back({Line::Error, error.format()});
    }
    result.milliseconds = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - started).count();
    return result;
}

Error check(const std::string& source, const std::string& fileName) {
    try {
        Lexer lexer(source);
        Parser parser(lexer.scan(), fileName);
        parser.parse();
        return Error();
    } catch (const Error& error) {
        return error;
    }
}

}  // namespace epp
