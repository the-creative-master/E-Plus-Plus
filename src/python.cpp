// A small Python runner for the Python library: statements, expressions,
// print, if/elif/else, for over range, while, and Python's own error names.
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <functional>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include "engine.hpp"

namespace epp {
namespace {

struct PyValue {
    enum class Type { Number, Text, Bool, None, List } type = Type::None;
    double number = 0;
    std::string text;
    bool boolean = false;
    std::vector<PyValue> list;

    static PyValue num(double value) { PyValue v; v.type = Type::Number; v.number = value; return v; }
    static PyValue str(const std::string& value) { PyValue v; v.type = Type::Text; v.text = value; return v; }
    static PyValue truth(bool value) { PyValue v; v.type = Type::Bool; v.boolean = value; return v; }
    static PyValue none() { return PyValue(); }
    static PyValue array(std::vector<PyValue> items) { PyValue v; v.type = Type::List; v.list = std::move(items); return v; }

    bool truthy() const {
        switch (type) {
            case Type::Number: return number != 0;
            case Type::Text: return !text.empty();
            case Type::Bool: return boolean;
            case Type::List: return !list.empty();
            case Type::None: return false;
        }
        return false;
    }
};

struct PyError {
    std::string kind;
    std::string message;
    int line = 1;
};

std::string pyNumber(double value) {
    if (value == std::floor(value) && std::fabs(value) < 1e15) return std::to_string(static_cast<long long>(value));
    std::ostringstream out;
    out.precision(12);
    out << value;
    return out.str();
}

std::string pyText(const PyValue& value) {
    switch (value.type) {
        case PyValue::Type::Number: return pyNumber(value.number);
        case PyValue::Type::Text: return value.text;
        case PyValue::Type::Bool: return value.boolean ? "True" : "False";
        case PyValue::Type::None: return "None";
        case PyValue::Type::List: {
            std::string out = "[";
            for (size_t i = 0; i < value.list.size(); ++i) {
                if (i) out += ", ";
                out += value.list[i].type == PyValue::Type::Text ? "'" + value.list[i].text + "'" : pyText(value.list[i]);
            }
            return out + "]";
        }
    }
    return "";
}

struct PyToken {
    enum class Kind { Name, Number, String, Op, Newline, Indent, Dedent, End } kind = Kind::End;
    std::string text;
    double number = 0;
    int line = 1;
};

class PyLexer {
public:
    explicit PyLexer(const std::string& code) : code_(code) {}

    std::vector<PyToken> scan() {
        std::vector<PyToken> tokens;
        std::vector<int> levels{0};  // every indentation a block can come back to
        bool lineStart = true;
        while (pos_ < code_.size()) {
            if (lineStart) {
                int spaces = 0;
                size_t probe = pos_;
                while (probe < code_.size() && (code_[probe] == ' ' || code_[probe] == '\t')) {
                    spaces += code_[probe] == '\t' ? 4 : 1;
                    ++probe;
                }
                if (probe >= code_.size() || code_[probe] == '\n' || code_[probe] == '#') {
                    // Blank line or a comment: skip it without touching the indent.
                    pos_ = probe;
                    if (pos_ < code_.size() && code_[pos_] == '#') {
                        while (pos_ < code_.size() && code_[pos_] != '\n') ++pos_;
                    }
                    if (pos_ < code_.size()) { tokens.push_back({PyToken::Kind::Newline, "", 0, line_}); ++pos_; ++line_; }
                    continue;
                }
                if (spaces > levels.back()) {
                    levels.push_back(spaces);
                    tokens.push_back({PyToken::Kind::Indent, "", 0, line_});
                } else if (spaces < levels.back()) {
                    while (levels.size() > 1 && spaces < levels.back()) {
                        levels.pop_back();
                        tokens.push_back({PyToken::Kind::Dedent, "", 0, line_});
                    }
                    if (spaces != levels.back()) {
                        throw PyError{"IndentationError", "unindent does not match any outer indentation level", line_};
                    }
                }
                pos_ = probe;
                lineStart = false;
                continue;
            }
            char c = code_[pos_];
            if (c == ' ' || c == '\t' || c == '\r') { ++pos_; continue; }
            if (c == '#') { while (pos_ < code_.size() && code_[pos_] != '\n') ++pos_; continue; }
            if (c == '\n') {
                tokens.push_back({PyToken::Kind::Newline, "", 0, line_});
                ++pos_;
                ++line_;
                lineStart = true;
                continue;
            }
            if (c == '"' || c == '\'') { string(tokens, c); continue; }
            if (std::isdigit(static_cast<unsigned char>(c))) { number(tokens); continue; }
            if (std::isalpha(static_cast<unsigned char>(c)) || c == '_') { name(tokens); continue; }
            std::string two = code_.substr(pos_, 2);
            if (two == "//" || two == "**" || two == "==" || two == "!=" || two == "<=" || two == ">=" || two == "+=" || two == "-=") {
                tokens.push_back({PyToken::Kind::Op, two, 0, line_});
                pos_ += 2;
                continue;
            }
            tokens.push_back({PyToken::Kind::Op, std::string(1, c), 0, line_});
            ++pos_;
        }
        if (!tokens.empty() && tokens.back().kind != PyToken::Kind::Newline) {
            tokens.push_back({PyToken::Kind::Newline, "", 0, line_});
        }
        while (levels.size() > 1) { levels.pop_back(); tokens.push_back({PyToken::Kind::Dedent, "", 0, line_}); }
        tokens.push_back({PyToken::Kind::End, "", 0, line_});
        return tokens;
    }

private:
    void string(std::vector<PyToken>& tokens, char quote) {
        int startLine = line_;
        ++pos_;
        std::string value;
        while (pos_ < code_.size() && code_[pos_] != quote) {
            if (code_[pos_] == '\\' && pos_ + 1 < code_.size()) {
                ++pos_;
                char esc = code_[pos_];
                value.push_back(esc == 'n' ? '\n' : esc == 't' ? '\t' : esc);
                ++pos_;
                continue;
            }
            if (code_[pos_] == '\n') throw PyError{"SyntaxError", "EOL while scanning string literal", startLine};
            value.push_back(code_[pos_++]);
        }
        if (pos_ >= code_.size()) throw PyError{"SyntaxError", "EOL while scanning string literal", startLine};
        ++pos_;
        tokens.push_back({PyToken::Kind::String, value, 0, startLine});
    }

    void number(std::vector<PyToken>& tokens) {
        size_t start = pos_;
        while (pos_ < code_.size() && (std::isdigit(static_cast<unsigned char>(code_[pos_])) || code_[pos_] == '.')) ++pos_;
        std::string text = code_.substr(start, pos_ - start);
        PyToken token;
        token.kind = PyToken::Kind::Number;
        token.text = text;
        token.number = std::strtod(text.c_str(), nullptr);
        token.line = line_;
        tokens.push_back(token);
    }

    void name(std::vector<PyToken>& tokens) {
        size_t start = pos_;
        while (pos_ < code_.size() && (std::isalnum(static_cast<unsigned char>(code_[pos_])) || code_[pos_] == '_')) ++pos_;
        tokens.push_back({PyToken::Kind::Name, code_.substr(start, pos_ - start), 0, line_});
    }

    const std::string& code_;
    size_t pos_ = 0;
    int line_ = 1;
};

struct PyExpr {
    enum class Kind { Number, Text, Name, Binary, Unary, Compare, Call, List } kind = Kind::Number;
    double number = 0;
    std::string text;
    std::vector<PyExpr> args;
};

// Thrown by break and continue, caught by the loop they belong to.
struct PyBreak {};
struct PyContinue {};

struct PyStmt {
    enum class Kind { Assign, Print, If, For, While, Expr, Pass, Break, Continue } kind = Kind::Pass;
    std::string name;
    PyExpr expr;
    PyExpr target;
    std::vector<PyStmt> body;
    std::vector<PyStmt> otherwise;
    std::vector<std::pair<PyExpr, std::vector<PyStmt>>> branches;  // elif chains
    int line = 1;
};

class PyParser {
public:
    explicit PyParser(std::vector<PyToken> tokens) : tokens_(std::move(tokens)) {}

    std::vector<PyStmt> parseProgram() { return block(0); }

private:
    const PyToken& peek(size_t ahead = 0) const { return tokens_[std::min(pos_ + ahead, tokens_.size() - 1)]; }
    bool at(PyToken::Kind kind) const { return peek().kind == kind; }
    bool atName(const char* text) const { return at(PyToken::Kind::Name) && peek().text == text; }
    bool atOp(const char* text) const { return at(PyToken::Kind::Op) && peek().text == text; }
    const PyToken& advance() { return tokens_[pos_ < tokens_.size() - 1 ? pos_++ : pos_]; }

    [[noreturn]] void fail(const std::string& message, int line) { throw PyError{"SyntaxError", message, line}; }

    void newlines() {
        while (at(PyToken::Kind::Newline)) advance();
    }

    // Reads a loop body, remembering that break and continue are allowed inside it.
    std::vector<PyStmt> loopBody(int depth) {
        ++loopDepth_;
        std::vector<PyStmt> body = suite(depth);
        --loopDepth_;
        return body;
    }

    std::vector<PyStmt> block(int depth) {
        std::vector<PyStmt> body;
        newlines();
        while (!at(PyToken::Kind::End) && !at(PyToken::Kind::Dedent)) {
            body.push_back(statement(depth));
            newlines();
        }
        if (at(PyToken::Kind::Dedent)) advance();
        return body;
    }

    std::vector<PyStmt> suite(int depth) {
        if (at(PyToken::Kind::Newline)) {
            newlines();
            if (!at(PyToken::Kind::Indent)) fail("expected an indented block", peek().line);
            advance();
            return block(depth + 1);
        }
        std::vector<PyStmt> single;
        single.push_back(statement(depth));
        return single;
    }

    PyStmt statement(int depth) {
        PyStmt node;
        node.line = peek().line;
        if (atName("pass")) { advance(); node.kind = PyStmt::Kind::Pass; return node; }
        if (atName("print")) {
            advance();
            node.kind = PyStmt::Kind::Print;
            if (atOp("(")) {
                advance();
                if (!atOp(")")) {
                    node.expr = expression();
                    while (atOp(",")) { advance(); node.body.push_back(PyStmt{}); node.body.back().expr = expression(); }
                }
                if (!atOp(")")) fail("expected ')'", peek().line);
                advance();
            } else {
                // print as a function call without brackets, as old Python allowed.
                node.expr = expression();
            }
            return node;
        }
        if (atName("if")) {
            advance();
            node.kind = PyStmt::Kind::If;
            node.expr = expression();
            if (!atOp(":")) fail("expected ':'", peek().line);
            advance();
            node.body = suite(depth);
            while (true) {
                size_t save = pos_;
                newlines();
                if (atName("elif")) {
                    advance();
                    PyExpr cond = expression();
                    if (!atOp(":")) fail("expected ':'", peek().line);
                    advance();
                    node.branches.emplace_back(cond, suite(depth));
                    continue;
                }
                if (atName("else")) {
                    advance();
                    if (!atOp(":")) fail("expected ':'", peek().line);
                    advance();
                    node.otherwise = suite(depth);
                    break;
                }
                pos_ = save;
                break;
            }
            return node;
        }
        if (atName("for")) {
            advance();
            node.kind = PyStmt::Kind::For;
            if (!at(PyToken::Kind::Name)) fail("expected a name after 'for'", peek().line);
            node.name = advance().text;
            if (!atName("in")) fail("expected 'in'", peek().line);
            advance();
            node.expr = expression();
            if (!atOp(":")) fail("expected ':'", peek().line);
            advance();
            node.body = loopBody(depth);
            return node;
        }
        if (atName("while")) {
            advance();
            node.kind = PyStmt::Kind::While;
            node.expr = expression();
            if (!atOp(":")) fail("expected ':'", peek().line);
            advance();
            node.body = loopBody(depth);
            return node;
        }
        if (atName("def") || atName("class") || atName("import") || atName("from")) {
            fail("'" + peek().text + "' is not supported in this small Python runner", peek().line);
        }
        if (atName("break") || atName("continue")) {
            std::string word = peek().text;
            if (loopDepth_ == 0) fail("'" + word + "' outside loop", peek().line);
            advance();
            node.kind = word == "break" ? PyStmt::Kind::Break : PyStmt::Kind::Continue;
            return node;
        }
        if (at(PyToken::Kind::Name)) {
            PyExpr target = expression();
            if (atOp("=") || atOp("+=") || atOp("-=")) {
                std::string op = advance().text;
                node.kind = PyStmt::Kind::Assign;
                node.target = target;
                node.expr = expression();
                node.name = op;
                return node;
            }
            if (target.kind == PyExpr::Kind::Call) {
                node.kind = PyStmt::Kind::Expr;
                node.expr = target;
                return node;
            }
            fail("expected '=' after a name", peek().line);
        }
        fail("invalid syntax", peek().line);
        return node;
    }

    PyExpr expression() { return orExpr(); }

    PyExpr orExpr() {
        PyExpr left = andExpr();
        while (atName("or")) {
            advance();
            PyExpr node;
            node.kind = PyExpr::Kind::Binary;
            node.text = "or";
            node.args = {left, andExpr()};
            left = node;
        }
        return left;
    }

    PyExpr andExpr() {
        PyExpr left = notExpr();
        while (atName("and")) {
            advance();
            PyExpr node;
            node.kind = PyExpr::Kind::Binary;
            node.text = "and";
            node.args = {left, notExpr()};
            left = node;
        }
        return left;
    }

    PyExpr notExpr() {
        if (atName("not")) {
            advance();
            PyExpr node;
            node.kind = PyExpr::Kind::Unary;
            node.text = "not";
            node.args = {notExpr()};
            return node;
        }
        return comparison();
    }

    PyExpr comparison() {
        PyExpr left = sum();
        while ((at(PyToken::Kind::Op) &&
                (peek().text == "==" || peek().text == "!=" || peek().text == "<" || peek().text == ">" ||
                 peek().text == "<=" || peek().text == ">=")) ||
               atName("in") || atName("is")) {
            std::string op = atName("in") ? "in" : peek().text;
            advance();
            if (op == "is") {
                if (atName("not")) { advance(); op = "is not"; }
            }
            PyExpr node;
            node.kind = PyExpr::Kind::Compare;
            node.text = op;
            node.args = {left, sum()};
            left = node;
        }
        return left;
    }

    PyExpr sum() {
        PyExpr left = term();
        while (atOp("+") || atOp("-")) {
            std::string op = advance().text;
            PyExpr node;
            node.kind = PyExpr::Kind::Binary;
            node.text = op;
            node.args = {left, term()};
            left = node;
        }
        return left;
    }

    PyExpr term() {
        PyExpr left = power();
        while (atOp("*") || atOp("/") || atOp("//") || atOp("%")) {
            std::string op = advance().text;
            PyExpr node;
            node.kind = PyExpr::Kind::Binary;
            node.text = op;
            node.args = {left, power()};
            left = node;
        }
        return left;
    }

    PyExpr power() {
        PyExpr left = unary();
        if (atOp("**")) {
            advance();
            PyExpr node;
            node.kind = PyExpr::Kind::Binary;
            node.text = "**";
            node.args = {left, power()};
            return node;
        }
        return left;
    }

    PyExpr unary() {
        if (atOp("-")) {
            advance();
            PyExpr node;
            node.kind = PyExpr::Kind::Unary;
            node.text = "-";
            node.args = {unary()};
            return node;
        }
        return atom();
    }

    PyExpr atom() {
        if (at(PyToken::Kind::Number)) { PyExpr node; node.kind = PyExpr::Kind::Number; node.number = advance().number; return node; }
        if (at(PyToken::Kind::String)) { PyExpr node; node.kind = PyExpr::Kind::Text; node.text = advance().text; return node; }
        if (atOp("(")) {
            advance();
            PyExpr inner = expression();
            if (!atOp(")")) fail("expected ')'", peek().line);
            advance();
            return inner;
        }
        if (atOp("[")) {
            advance();
            PyExpr node;
            node.kind = PyExpr::Kind::List;
            if (!atOp("]")) {
                node.args.push_back(expression());
                while (atOp(",")) { advance(); node.args.push_back(expression()); }
            }
            if (!atOp("]")) fail("expected ']'", peek().line);
            advance();
            return node;
        }
        if (atName("True") || atName("False") || atName("None")) {
            PyExpr node;
            node.kind = PyExpr::Kind::Text;
            node.text = advance().text;
            return node;
        }
        if (at(PyToken::Kind::Name)) {
            PyExpr node;
            node.kind = PyExpr::Kind::Name;
            node.text = advance().text;
            if (atOp("(")) {
                advance();
                node.kind = PyExpr::Kind::Call;
                if (!atOp(")")) {
                    node.args.push_back(expression());
                    while (atOp(",")) { advance(); node.args.push_back(expression()); }
                }
                if (!atOp(")")) fail("expected ')'", peek().line);
                advance();
            }
            return node;
        }
        fail("invalid syntax", peek().line);
        return PyExpr();
    }

    std::vector<PyToken> tokens_;
    size_t pos_ = 0;
    int loopDepth_ = 0;
};

class PyRuntime {
public:
    explicit PyRuntime(const std::function<void(const std::string&)>& print) : print_(print) {}

    void run(const std::vector<PyStmt>& program) { execute(program); }

private:
    [[noreturn]] void fail(const std::string& kind, const std::string& message, int line) { throw PyError{kind, message, line}; }

    PyValue eval(const PyExpr& expr, int line) {
        switch (expr.kind) {
            case PyExpr::Kind::Number: return PyValue::num(expr.number);
            case PyExpr::Kind::Text:
                if (expr.text == "True") return PyValue::truth(true);
                if (expr.text == "False") return PyValue::truth(false);
                if (expr.text == "None") return PyValue::none();
                return PyValue::str(expr.text);
            case PyExpr::Kind::List: {
                std::vector<PyValue> items;
                for (const PyExpr& item : expr.args) items.push_back(eval(item, line));
                return PyValue::array(std::move(items));
            }
            case PyExpr::Kind::Name: {
                auto found = variables_.find(expr.text);
                if (found == variables_.end()) {
                    fail("NameError", "name '" + expr.text + "' is not defined", line);
                }
                return found->second;
            }
            case PyExpr::Kind::Unary: {
                PyValue value = eval(expr.args[0], line);
                if (expr.text == "not") return PyValue::truth(!value.truthy());
                if (value.type != PyValue::Type::Number) fail("TypeError", "bad operand type for unary -: '" + typeName(value) + "'", line);
                return PyValue::num(-value.number);
            }
            case PyExpr::Kind::Compare: return compare(expr, line);
            case PyExpr::Kind::Call: return call(expr, line);
            case PyExpr::Kind::Binary: break;
        }
        return binary(expr, line);
    }

    std::string typeName(const PyValue& value) const {
        switch (value.type) {
            case PyValue::Type::Number: return "number";
            case PyValue::Type::Text: return "str";
            case PyValue::Type::Bool: return "bool";
            case PyValue::Type::List: return "list";
            case PyValue::Type::None: return "NoneType";
        }
        return "value";
    }

    static bool bothNumbers(const PyValue& a, const PyValue& b) {
        return a.type == PyValue::Type::Number && b.type == PyValue::Type::Number;
    }

    PyValue binary(const PyExpr& expr, int line) {
        const std::string& op = expr.text;
        PyValue left = eval(expr.args[0], line);
        PyValue right = eval(expr.args[1], line);
        if (op == "and") return PyValue::truth(left.truthy() && right.truthy());
        if (op == "or") return PyValue::truth(left.truthy() || right.truthy());
        if (op == "+") {
            if (bothNumbers(left, right)) return PyValue::num(left.number + right.number);
            if (left.type == PyValue::Type::Text && right.type == PyValue::Type::Text) return PyValue::str(left.text + right.text);
            if (left.type == PyValue::Type::List && right.type == PyValue::Type::List) {
                std::vector<PyValue> items = left.list;
                items.insert(items.end(), right.list.begin(), right.list.end());
                return PyValue::array(std::move(items));
            }
            fail("TypeError", "unsupported operand type(s) for +: '" + typeName(left) + "' and '" + typeName(right) + "'", line);
        }
        if (op == "*") {
            if (bothNumbers(left, right)) return PyValue::num(left.number * right.number);
            if (left.type == PyValue::Type::Text && right.type == PyValue::Type::Number) {
                std::string out;
                for (int i = 0; i < int(right.number); ++i) out += left.text;
                return PyValue::str(out);
            }
            fail("TypeError", "can't multiply '" + typeName(left) + "' by '" + typeName(right) + "'", line);
        }
        if (op == "-" && bothNumbers(left, right)) return PyValue::num(left.number - right.number);
        if (op == "/") {
            if (!bothNumbers(left, right)) fail("TypeError", "unsupported operand type(s) for /", line);
            if (right.number == 0) fail("ZeroDivisionError", "division by zero", line);
            return PyValue::num(left.number / right.number);
        }
        if (op == "//") {
            if (!bothNumbers(left, right)) fail("TypeError", "unsupported operand type(s) for //", line);
            if (right.number == 0) fail("ZeroDivisionError", "integer division or modulo by zero", line);
            return PyValue::num(std::floor(left.number / right.number));
        }
        if (op == "%") {
            if (!bothNumbers(left, right)) fail("TypeError", "unsupported operand type(s) for %", line);
            if (right.number == 0) fail("ZeroDivisionError", "integer division or modulo by zero", line);
            double result = std::fmod(left.number, right.number);
            return PyValue::num(result);
        }
        if (op == "**") {
            if (!bothNumbers(left, right)) fail("TypeError", "unsupported operand type(s) for **", line);
            return PyValue::num(std::pow(left.number, right.number));
        }
        fail("TypeError", "unsupported operator '" + op + "'", line);
        return PyValue::none();
    }

    PyValue compare(const PyExpr& expr, int line) {
        const std::string& op = expr.text;
        PyValue left = eval(expr.args[0], line);
        PyValue right = eval(expr.args[1], line);
        if (op == "in") {
            if (right.type == PyValue::Type::List) {
                for (const PyValue& item : right.list) if (pyText(item) == pyText(left)) return PyValue::truth(true);
                return PyValue::truth(false);
            }
            if (right.type == PyValue::Type::Text && left.type == PyValue::Type::Text) {
                return PyValue::truth(right.text.find(left.text) != std::string::npos);
            }
            fail("TypeError", "argument of type '" + typeName(right) + "' is not iterable", line);
        }
        if (op == "is" || op == "is not") {
            bool same = left.type == right.type && (left.type == PyValue::Type::None || pyText(left) == pyText(right));
            return PyValue::truth(op == "is" ? same : !same);
        }
        if (op == "==") return PyValue::truth(pyText(left) == pyText(right));
        if (op == "!=") return PyValue::truth(pyText(left) != pyText(right));
        bool bothNumbersOkay = bothNumbers(left, right);
        bool bothText = left.type == PyValue::Type::Text && right.type == PyValue::Type::Text;
        if (!bothNumbersOkay && !bothText) {
            fail("TypeError", "'" + op + "' not supported between instances of '" + typeName(left) + "' and '" + typeName(right) + "'", line);
        }
        double a = bothNumbersOkay ? left.number : 0;
        double b = bothNumbersOkay ? right.number : 0;
        bool less = bothNumbersOkay ? a < b : left.text < right.text;
        bool greater = bothNumbersOkay ? a > b : left.text > right.text;
        if (op == "<") return PyValue::truth(less);
        if (op == ">") return PyValue::truth(greater);
        if (op == "<=") return PyValue::truth(!greater);
        if (op == ">=") return PyValue::truth(!less);
        fail("TypeError", "unsupported comparison '" + op + "'", line);
        return PyValue::none();
    }

    PyValue call(const PyExpr& expr, int line) {
        const std::string& name = expr.text;
        if (name == "range") {
            std::vector<PyValue> items;
            if (expr.args.size() == 1) {
                double count = number(eval(expr.args[0], line), name, line);
                for (double i = 0; i < count; i += 1) items.push_back(PyValue::num(i));
            } else if (expr.args.size() >= 2) {
                double start = number(eval(expr.args[0], line), name, line);
                double stop = number(eval(expr.args[1], line), name, line);
                double step = expr.args.size() > 2 ? number(eval(expr.args[2], line), name, line) : 1;
                if (step == 0) fail("ValueError", "range() arg 3 must not be zero", line);
                for (double i = start; step > 0 ? i < stop : i > stop; i += step) items.push_back(PyValue::num(i));
            }
            return PyValue::array(std::move(items));
        }
        if (name == "print") {
            std::string out;
            for (size_t i = 0; i < expr.args.size(); ++i) {
                if (i) out += " ";
                out += pyText(eval(expr.args[i], line));
            }
            print_(out);
            return PyValue::none();
        }
        if (name == "len") {
            PyValue value = eval(expr.args.at(0), line);
            if (value.type == PyValue::Type::Text) return PyValue::num(double(value.text.size()));
            if (value.type == PyValue::Type::List) return PyValue::num(double(value.list.size()));
            fail("TypeError", "object of type '" + typeName(value) + "' has no len()", line);
        }
        if (name == "int" || name == "float") {
            PyValue value = eval(expr.args.at(0), line);
            if (value.type == PyValue::Type::Number) return PyValue::num(name == "int" ? std::floor(value.number) : value.number);
            if (value.type == PyValue::Type::Text) {
                try {
                    double parsed = std::stod(value.text);
                    return PyValue::num(name == "int" ? std::floor(parsed) : parsed);
                } catch (...) {
                    fail("ValueError", "invalid literal for " + name + "(): '" + value.text + "'", line);
                }
            }
            fail("TypeError", name + "() argument must be a string or a number", line);
        }
        if (name == "str") return PyValue::str(pyText(eval(expr.args.at(0), line)));
        if (name == "abs") return PyValue::num(std::fabs(number(eval(expr.args.at(0), line), name, line)));
        if (name == "round") {
            double value = number(eval(expr.args.at(0), line), name, line);
            double digits = expr.args.size() > 1 ? number(eval(expr.args[1], line), name, line) : 0;
            double factor = std::pow(10, digits);
            return PyValue::num(std::round(value * factor) / factor);
        }
        if (name == "sum") {
            PyValue value = eval(expr.args.at(0), line);
            if (value.type != PyValue::Type::List) fail("TypeError", "sum() expects a list", line);
            double total = 0;
            for (const PyValue& item : value.list) total += number(item, name, line);
            return PyValue::num(total);
        }
        fail("NameError", "name '" + name + "' is not defined", line);
        return PyValue::none();
    }

    double number(const PyValue& value, const std::string& name, int line) {
        if (value.type == PyValue::Type::Number) return value.number;
        fail("TypeError", name + "() expects a number, not '" + typeName(value) + "'", line);
        return 0;
    }

    void execute(const std::vector<PyStmt>& body) {
        for (const PyStmt& node : body) {
            switch (node.kind) {
                case PyStmt::Kind::Pass: break;
                case PyStmt::Kind::Print: {
                    std::string out = pyText(eval(node.expr, node.line));
                    for (const PyStmt& extra : node.body) out += " " + pyText(eval(extra.expr, node.line));
                    print_(out);
                    break;
                }
                case PyStmt::Kind::Expr: eval(node.expr, node.line); break;
                case PyStmt::Kind::Assign: {
                    PyValue value = eval(node.expr, node.line);
                    if (node.target.kind == PyExpr::Kind::Name) {
                        if (node.name == "+=" || node.name == "-=") {
                            auto found = variables_.find(node.target.text);
                            if (found == variables_.end()) fail("NameError", "name '" + node.target.text + "' is not defined", node.line);
                            double delta = number(value, "assignment", node.line);
                            found->second = PyValue::num(found->second.number + (node.name == "+=" ? delta : -delta));
                        } else {
                            variables_[node.target.text] = value;
                        }
                        break;
                    }
                    fail("SyntaxError", "cannot assign to this expression", node.line);
                }
                case PyStmt::Kind::If: {
                    if (eval(node.expr, node.line).truthy()) { execute(node.body); break; }
                    bool taken = false;
                    for (auto& branch : node.branches) {
                        if (eval(branch.first, node.line).truthy()) { execute(branch.second); taken = true; break; }
                    }
                    if (!taken && !node.otherwise.empty()) execute(node.otherwise);
                    break;
                }
                case PyStmt::Kind::Break: throw PyBreak{};
                case PyStmt::Kind::Continue: throw PyContinue{};
                case PyStmt::Kind::For: {
                    PyValue items = eval(node.expr, node.line);
                    std::vector<PyValue> list;
                    if (items.type == PyValue::Type::List) list = items.list;
                    else if (items.type == PyValue::Type::Text) {
                        for (char c : items.text) list.push_back(PyValue::str(std::string(1, c)));
                    } else {
                        fail("TypeError", "'" + typeName(items) + "' object is not iterable", node.line);
                    }
                    for (const PyValue& item : list) {
                        variables_[node.name] = item;
                        try {
                            execute(node.body);
                        } catch (const PyContinue&) {
                            continue;
                        } catch (const PyBreak&) {
                            break;
                        }
                    }
                    break;
                }
                case PyStmt::Kind::While: {
                    long guard = 0;
                    while (eval(node.expr, node.line).truthy()) {
                        try {
                            execute(node.body);
                        } catch (const PyContinue&) {
                            continue;
                        } catch (const PyBreak&) {
                            break;
                        }
                        if (++guard > 1000000) fail("RuntimeError", "loop ran a million times without stopping", node.line);
                    }
                    break;
                }
            }
        }
    }

    std::function<void(const std::string&)> print_;
    std::map<std::string, PyValue> variables_;
};

}  // namespace

void runPython(const std::string& code, const std::function<void(const std::string&)>& print) {
    if (code.empty()) return;
    try {
        PyLexer lexer(code);
        PyParser parser(lexer.scan());
        PyRuntime runtime(print);
        runtime.run(parser.parseProgram());
    } catch (const PyError& error) {
        Error converted;
        converted.category = "python";
        converted.message = error.kind + ": " + error.message + " (line " + std::to_string(error.line) + ")";
        throw converted;
    }
}

}  // namespace epp
