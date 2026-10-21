#include "interpreter.hpp"
#include <cmath>
#include <algorithm>
#include <chrono>
#include <ctime>
#include <random>
#include <thread>
#include <fstream>
#include <sstream>

namespace epp {

Interpreter::Interpreter(std::ostream& out_stream, std::istream& in_stream)
    : out(out_stream), in(in_stream) {}

std::string Interpreter::normalize_name(const std::string& name) const {
    std::string res = name;
    std::transform(res.begin(), res.end(), res.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return res;
}

bool Interpreter::has_variable(const std::string& name) const {
    return variables.find(normalize_name(name)) != variables.end();
}

Value Interpreter::get_variable(const std::string& name) const {
    auto it = variables.find(normalize_name(name));
    if (it == variables.end()) {
        throw RuntimeError("Logic Error: Variable '" + name + "' has not been defined yet! Define it first with: let '" + name + "' be <value>", 1, 1);
    }
    return it->second;
}

void Interpreter::set_variable(const std::string& name, const Value& val) {
    std::string norm = normalize_name(name);
    variables[norm] = val;
    original_var_names[norm] = name;
}

bool Interpreter::is_library_loaded(const std::string& name) const {
    return loaded_libraries.find(normalize_name(name)) != loaded_libraries.end();
}

void Interpreter::require_library(const std::string& lib_name, const std::string& feature, int line, int col) {
    if (!is_library_loaded(lib_name)) {
        throw LibraryError("Library Error at line " + std::to_string(line) + ", col " + std::to_string(col) +
                           ": '" + feature + "' requires the \"" + lib_name +
                           "\" library. Please add: add the \"" + lib_name + "\" library", line, col);
    }
}

void Interpreter::execute(const std::vector<std::shared_ptr<Stmt>>& statements) {
    for (const auto& stmt : statements) {
        if (stmt) {
            stmt->accept(this);
        }
    }
}

void Interpreter::execute(std::shared_ptr<Stmt> statement) {
    if (statement) {
        statement->accept(this);
    }
}

// Expression Visitor Implementations

Value Interpreter::visitLiteralExpr(LiteralExpr* expr) {
    return expr->value;
}

Value Interpreter::visitVariableExpr(VariableExpr* expr) {
    std::string norm = normalize_name(expr->name);
    auto it = variables.find(norm);
    if (it == variables.end()) {
        throw RuntimeError("Logic Error at line " + std::to_string(expr->line) + ", col " + std::to_string(expr->col) +
                           ": Variable '" + expr->name + "' has not been defined yet! Define it first with: let '" +
                           expr->name + "' be <value>", expr->line, expr->col);
    }
    return it->second;
}

Value Interpreter::visitBinaryExpr(BinaryExpr* expr) {
    Value left = expr->left->accept(this);
    Value right = expr->right->accept(this);

    switch (expr->op) {
        case BinaryOp::ADD: {
            if (left.is_number() && right.is_number()) {
                return Value::make_number(left.number_val + right.number_val);
            }
            if (left.can_be_number() && right.can_be_number()) {
                return Value::make_number(left.as_number() + right.as_number());
            }
            // String concatenation
            return Value::make_string(left.to_string() + right.to_string());
        }
        case BinaryOp::SUB: {
            if (!left.can_be_number() || !right.can_be_number()) {
                throw RuntimeError("Type Error: Cannot subtract non-numeric values ('" +
                                   left.to_string() + "' minus '" + right.to_string() + "')",
                                   expr->line, expr->col);
            }
            return Value::make_number(left.as_number() - right.as_number());
        }
        case BinaryOp::MUL: {
            if (!left.can_be_number() || !right.can_be_number()) {
                throw RuntimeError("Type Error: Cannot multiply non-numeric values ('" +
                                   left.to_string() + "' times '" + right.to_string() + "')",
                                   expr->line, expr->col);
            }
            return Value::make_number(left.as_number() * right.as_number());
        }
        case BinaryOp::DIV: {
            if (!left.can_be_number() || !right.can_be_number()) {
                throw RuntimeError("Type Error: Cannot divide non-numeric values ('" +
                                   left.to_string() + "' divided by '" + right.to_string() + "')",
                                   expr->line, expr->col);
            }
            double denom = right.as_number();
            if (denom == 0.0) {
                throw RuntimeError("Math Error: Division by zero!", expr->line, expr->col);
            }
            return Value::make_number(left.as_number() / denom);
        }
        case BinaryOp::MOD: {
            if (!left.can_be_number() || !right.can_be_number()) {
                throw RuntimeError("Type Error: Cannot compute modulo of non-numeric values", expr->line, expr->col);
            }
            double denom = right.as_number();
            if (denom == 0.0) {
                throw RuntimeError("Math Error: Modulo by zero!", expr->line, expr->col);
            }
            return Value::make_number(std::fmod(left.as_number(), denom));
        }
        case BinaryOp::CONCAT: {
            return Value::make_string(left.to_string() + right.to_string());
        }
        case BinaryOp::EQ: {
            return Value::make_bool(left.equals(right));
        }
        case BinaryOp::NEQ: {
            return Value::make_bool(!left.equals(right));
        }
        case BinaryOp::GT: {
            if (left.can_be_number() && right.can_be_number()) {
                return Value::make_bool(left.as_number() > right.as_number());
            }
            return Value::make_bool(left.to_string() > right.to_string());
        }
        case BinaryOp::LT: {
            if (left.can_be_number() && right.can_be_number()) {
                return Value::make_bool(left.as_number() < right.as_number());
            }
            return Value::make_bool(left.to_string() < right.to_string());
        }
        case BinaryOp::GTE: {
            if (left.can_be_number() && right.can_be_number()) {
                return Value::make_bool(left.as_number() >= right.as_number());
            }
            return Value::make_bool(left.to_string() >= right.to_string());
        }
        case BinaryOp::LTE: {
            if (left.can_be_number() && right.can_be_number()) {
                return Value::make_bool(left.as_number() <= right.as_number());
            }
            return Value::make_bool(left.to_string() <= right.to_string());
        }
    }
    return Value::make_nil();
}

Value Interpreter::visitTypeCheckExpr(TypeCheckExpr* expr) {
    Value target = expr->target->accept(this);
    bool is_num = target.can_be_number();
    if (expr->is_not) {
        return Value::make_bool(!is_num);
    }
    return Value::make_bool(is_num);
}

Value Interpreter::visitMathFuncExpr(MathFuncExpr* expr) {
    if (expr->func == MathFunc::RANDOM_BETWEEN || expr->func == MathFunc::DICE_ROLL || expr->func == MathFunc::COIN_FLIP) {
        if (!is_library_loaded("Random") && !is_library_loaded("Math")) {
            throw LibraryError("Library Error at line " + std::to_string(expr->line) + ", col " + std::to_string(expr->col) +
                               ": Random operations require either the \"Random\" library or the \"Math\" library. Please add: add the \"Random\" library", expr->line, expr->col);
        }
    } else {
        require_library("Math", "Math function", expr->line, expr->col);
    }

    switch (expr->func) {
        case MathFunc::SQRT: {
            Value arg = expr->args[0]->accept(this);
            double val = arg.as_number();
            if (val < 0.0) {
                throw RuntimeError("Math Error: Cannot compute square root of negative number (" + std::to_string(val) + ")",
                                   expr->line, expr->col);
            }
            return Value::make_number(std::sqrt(val));
        }
        case MathFunc::CUBE_ROOT: {
            Value arg = expr->args[0]->accept(this);
            return Value::make_number(std::cbrt(arg.as_number()));
        }
        case MathFunc::PERCENT_OF: {
            Value pct = expr->args[0]->accept(this);
            Value total = expr->args[1]->accept(this);
            double res = (pct.as_number() / 100.0) * total.as_number();
            return Value::make_number(res);
        }
        case MathFunc::ABS: {
            Value arg = expr->args[0]->accept(this);
            return Value::make_number(std::abs(arg.as_number()));
        }
        case MathFunc::POW: {
            Value base = expr->args[0]->accept(this);
            Value exp = expr->args[1]->accept(this);
            return Value::make_number(std::pow(base.as_number(), exp.as_number()));
        }
        case MathFunc::ROUND: {
            Value arg = expr->args[0]->accept(this);
            return Value::make_number(std::round(arg.as_number()));
        }
        case MathFunc::FLOOR: {
            Value arg = expr->args[0]->accept(this);
            return Value::make_number(std::floor(arg.as_number()));
        }
        case MathFunc::CEILING: {
            Value arg = expr->args[0]->accept(this);
            return Value::make_number(std::ceil(arg.as_number()));
        }
        case MathFunc::SINE: {
            Value arg = expr->args[0]->accept(this);
            // Default to degrees for natural English intuition
            double rad = arg.as_number() * (M_PI / 180.0);
            return Value::make_number(std::sin(rad));
        }
        case MathFunc::COSINE: {
            Value arg = expr->args[0]->accept(this);
            double rad = arg.as_number() * (M_PI / 180.0);
            return Value::make_number(std::cos(rad));
        }
        case MathFunc::TANGENT: {
            Value arg = expr->args[0]->accept(this);
            double rad = arg.as_number() * (M_PI / 180.0);
            return Value::make_number(std::tan(rad));
        }
        case MathFunc::MINIMUM: {
            Value a = expr->args[0]->accept(this);
            Value b = expr->args[1]->accept(this);
            return Value::make_number(std::min(a.as_number(), b.as_number()));
        }
        case MathFunc::MAXIMUM: {
            Value a = expr->args[0]->accept(this);
            Value b = expr->args[1]->accept(this);
            return Value::make_number(std::max(a.as_number(), b.as_number()));
        }
        case MathFunc::RANDOM_BETWEEN: {
            Value a = expr->args[0]->accept(this);
            Value b = expr->args[1]->accept(this);
            double min_v = a.as_number();
            double max_v = b.as_number();
            if (min_v > max_v) std::swap(min_v, max_v);
            static std::mt19937 rng(std::random_device{}());
            if (std::floor(min_v) == min_v && std::floor(max_v) == max_v) {
                std::uniform_int_distribution<long long> dist(static_cast<long long>(min_v), static_cast<long long>(max_v));
                return Value::make_number(static_cast<double>(dist(rng)));
            } else {
                std::uniform_real_distribution<double> dist(min_v, max_v);
                return Value::make_number(dist(rng));
            }
        }
        case MathFunc::LOGARITHM: {
            Value arg = expr->args[0]->accept(this);
            double v = arg.as_number();
            if (v <= 0.0) {
                throw RuntimeError("Math Error: Logarithm domain error for " + std::to_string(v), expr->line, expr->col);
            }
            return Value::make_number(std::log(v));
        }
        case MathFunc::FACTORIAL: {
            Value arg = expr->args[0]->accept(this);
            double v = arg.as_number();
            if (v < 0 || std::floor(v) != v) {
                throw RuntimeError("Math Error: Factorial requires non-negative integer", expr->line, expr->col);
            }
            double res = 1.0;
            for (int i = 2; i <= static_cast<int>(v); ++i) {
                res *= i;
            }
            return Value::make_number(res);
        }
        case MathFunc::HYPOTENUSE: {
            Value a = expr->args[0]->accept(this);
            Value b = expr->args[1]->accept(this);
            return Value::make_number(std::hypot(a.as_number(), b.as_number()));
        }
        case MathFunc::PI_CONST: {
            return Value::make_number(3.14159265358979323846);
        }
        case MathFunc::E_CONST: {
            return Value::make_number(2.71828182845904523536);
        }
        case MathFunc::DICE_ROLL: {
            require_library("Random", "Rolling dice", expr->line, expr->col);
            int sides = 6;
            if (!expr->args.empty()) {
                sides = static_cast<int>(expr->args[0]->accept(this).as_number());
                if (sides < 1) sides = 6;
            }
            static std::mt19937 rng(std::random_device{}());
            std::uniform_int_distribution<int> dist(1, sides);
            return Value::make_number(dist(rng));
        }
        case MathFunc::COIN_FLIP: {
            require_library("Random", "Flipping a coin", expr->line, expr->col);
            static std::mt19937 rng(std::random_device{}());
            std::uniform_int_distribution<int> dist(0, 1);
            return Value::make_string(dist(rng) == 0 ? "heads" : "tails");
        }
    }
    return Value::make_nil();
}

Value Interpreter::visitStringFuncExpr(StringFuncExpr* expr) {
    require_library("Strings", "String function", expr->line, expr->col);

    Value target = expr->args[0]->accept(this);
    std::string s = target.to_string();

    switch (expr->func) {
        case StringFunc::LENGTH: {
            return Value::make_number(static_cast<double>(s.size()));
        }
        case StringFunc::UPPERCASE: {
            std::string res = s;
            std::transform(res.begin(), res.end(), res.begin(), [](unsigned char c) {
                return static_cast<char>(std::toupper(c));
            });
            return Value::make_string(res);
        }
        case StringFunc::LOWERCASE: {
            std::string res = s;
            std::transform(res.begin(), res.end(), res.begin(), [](unsigned char c) {
                return static_cast<char>(std::tolower(c));
            });
            return Value::make_string(res);
        }
        case StringFunc::REVERSE: {
            std::string res = s;
            std::reverse(res.begin(), res.end());
            return Value::make_string(res);
        }
        case StringFunc::FIRST_LETTER: {
            if (s.empty()) return Value::make_string("");
            return Value::make_string(std::string(1, s[0]));
        }
        case StringFunc::LAST_LETTER: {
            if (s.empty()) return Value::make_string("");
            return Value::make_string(std::string(1, s.back()));
        }
        case StringFunc::TRIM: {
            size_t first = s.find_first_not_of(" \t\n\r");
            if (first == std::string::npos) return Value::make_string("");
            size_t last = s.find_last_not_of(" \t\n\r");
            return Value::make_string(s.substr(first, last - first + 1));
        }
        case StringFunc::REPLACE: {
            return Value::make_string(s);
        }
    }
    return Value::make_nil();
}

Value Interpreter::visitTimeFuncExpr(TimeFuncExpr* expr) {
    require_library("Time", "Time function", expr->line, expr->col);

    auto now = std::chrono::system_clock::now();
    std::time_t tt = std::chrono::system_clock::to_time_t(now);
    std::tm tm_buf;
#if defined(_WIN32)
    localtime_s(&tm_buf, &tt);
#else
    localtime_r(&tt, &tm_buf);
#endif

    char buffer[128];
    switch (expr->func) {
        case TimeFunc::CURRENT_TIME: {
            std::strftime(buffer, sizeof(buffer), "%H:%M:%S", &tm_buf);
            return Value::make_string(buffer);
        }
        case TimeFunc::CURRENT_DATE: {
            std::strftime(buffer, sizeof(buffer), "%Y-%m-%d", &tm_buf);
            return Value::make_string(buffer);
        }
        case TimeFunc::CURRENT_YEAR: {
            return Value::make_number(1900 + tm_buf.tm_year);
        }
        case TimeFunc::CURRENT_TIMESTAMP: {
            return Value::make_number(static_cast<double>(std::time(nullptr)));
        }
    }
    return Value::make_nil();
}

Value Interpreter::visitSystemFuncExpr(SystemFuncExpr* expr) {
    require_library("System", "System function", expr->line, expr->col);
    switch (expr->func) {
        case SystemFunc::PLATFORM: {
#if defined(_WIN32)
            return Value::make_string("Windows");
#elif defined(__APPLE__)
            return Value::make_string("macOS");
#elif defined(__linux__)
            return Value::make_string("Linux x86_64");
#else
            return Value::make_string("Generic POSIX");
#endif
        }
        case SystemFunc::OS_NAME: {
#if defined(_WIN32)
            return Value::make_string("Windows");
#elif defined(__APPLE__)
            return Value::make_string("macOS");
#elif defined(__linux__)
            return Value::make_string("Linux");
#else
            return Value::make_string("Unix");
#endif
        }
    }
    return Value::make_nil();
}

// Statement Visitor Implementations

void Interpreter::visitSayStmt(SayStmt* stmt) {
    if (!stmt->color.empty()) {
        require_library("Colors", "Colored output", stmt->line, stmt->col);
    }

    std::string sep_str = "";
    bool has_sep = (stmt->separator != nullptr);
    if (has_sep) {
        sep_str = stmt->separator->accept(this).to_string();
    }

    std::string result;
    for (size_t i = 0; i < stmt->expressions.size(); ++i) {
        Value val = stmt->expressions[i]->accept(this);
        std::string s = val.to_string();

        if (i == 0) {
            result += s;
        } else {
            if (has_sep) {
                if (!result.empty() && result.back() == ' ') {
                    result += sep_str + " " + s;
                } else {
                    result += sep_str + s;
                }
            } else {
                // If adjacent characters are both alphanumeric, add natural word space
                if (!result.empty() && !s.empty()) {
                    if (std::isalnum(static_cast<unsigned char>(result.back())) &&
                        std::isalnum(static_cast<unsigned char>(s.front()))) {
                        result += " ";
                    } else if ((result.back() == '!' || result.back() == '?' || result.back() == ':') &&
                               s.front() != ' ') {
                        result += " ";
                    }
                }
                result += s;
            }
        }
    }

    if (!stmt->color.empty()) {
        std::string ansi = "\033[0m";
        if (stmt->color == "red") ansi = "\033[31m";
        else if (stmt->color == "green") ansi = "\033[32m";
        else if (stmt->color == "yellow") ansi = "\033[33m";
        else if (stmt->color == "blue") ansi = "\033[34m";
        else if (stmt->color == "magenta") ansi = "\033[35m";
        else if (stmt->color == "cyan") ansi = "\033[36m";
        out << ansi << result << "\033[0m\n";
    } else {
        out << result << "\n";
    }
}

void Interpreter::visitLetStmt(LetStmt* stmt) {
    if (stmt->is_raw_text) {
        set_variable(stmt->variable_name, Value::make_string(stmt->raw_fallback));
    } else {
        Value val = stmt->value_expr->accept(this);
        set_variable(stmt->variable_name, val);
    }
}

void Interpreter::visitAskStmt(AskStmt* stmt) {
    Value prompt_val = stmt->prompt->accept(this);
    std::string user_input;

    if (input_handler) {
        user_input = input_handler(prompt_val.to_string());
    } else {
        out << prompt_val.to_string() << " " << std::flush;
        if (!std::getline(in, user_input)) {
            user_input = "";
        }
    }

    Value val;
    val = Value::make_string(user_input);
    if (val.can_be_number()) {
        try {
            val = Value::make_number(val.as_number());
        } catch (...) {
            val = Value::make_string(user_input);
        }
    }
    set_variable(stmt->variable_name, val);
}

void Interpreter::visitAddLibraryStmt(AddLibraryStmt* stmt) {
    std::string norm = normalize_name(stmt->library_name);
    loaded_libraries.insert(norm);
}

void Interpreter::visitIfStmt(IfStmt* stmt) {
    Value cond = stmt->condition->accept(this);
    if (cond.is_truthy()) {
        for (const auto& s : stmt->then_branch) {
            s->accept(this);
        }
    } else {
        for (const auto& s : stmt->else_branch) {
            s->accept(this);
        }
    }
}

void Interpreter::visitRepeatStmt(RepeatStmt* stmt) {
    Value count_val = stmt->count->accept(this);
    long long cnt = static_cast<long long>(count_val.as_number());
    for (long long i = 0; i < cnt; ++i) {
        for (const auto& s : stmt->body) {
            s->accept(this);
        }
    }
}

void Interpreter::visitWhileStmt(WhileStmt* stmt) {
    while (stmt->condition->accept(this).is_truthy()) {
        for (const auto& s : stmt->body) {
            s->accept(this);
        }
    }
}

void Interpreter::visitExprStmt(ExprStmt* stmt) {
    Value val = stmt->expr->accept(this);
    // If it's a standalone expression statement, output result
    out << val.to_string() << "\n";
}

void Interpreter::visitNoteStmt(NoteStmt* /*stmt*/) {
    // Note statements are comments in E++: no-op
}

void Interpreter::visitPythonStmt(PythonStmt* stmt) {
    require_library("Python", "Running Python code", stmt->line, stmt->col);

    // Build python script with injected E++ variables
    std::string script = "";
    for (const auto& pair : variables) {
        // Only valid identifier names
        std::string var_name = pair.first;
        if (!var_name.empty() && std::isalpha(static_cast<unsigned char>(var_name[0]))) {
            std::string py_val = "";
            if (pair.second.is_number()) {
                py_val = pair.second.to_string();
            } else if (pair.second.is_bool()) {
                py_val = pair.second.bool_val ? "True" : "False";
            } else {
                std::string s = pair.second.string_val;
                // escape quotes
                std::string escaped = "";
                for (char c : s) {
                    if (c == '"') escaped += "\\\"";
                    else if (c == '\n') escaped += "\\n";
                    else escaped += c;
                }
                py_val = "\"" + escaped + "\"";
            }
            script += var_name + " = " + py_val + "\n";

            auto it = original_var_names.find(var_name);
            if (it != original_var_names.end() && it->second != var_name) {
                script += it->second + " = " + var_name + "\n";
            }
        }
    }

    std::string code = stmt->python_code;
    // Auto-fix "range X:" to "range(X):" if written in natural English
    // e.g. for I in range 3: -> for I in range(3):
    size_t range_pos = code.find("range ");
    while (range_pos != std::string::npos) {
        size_t colon_pos = code.find(":", range_pos);
        if (colon_pos != std::string::npos) {
            std::string num_str = code.substr(range_pos + 6, colon_pos - (range_pos + 6));
            // Check if num_str is pure digits
            bool all_digits = !num_str.empty();
            for (char c : num_str) {
                if (!std::isdigit(static_cast<unsigned char>(c)) && c != ' ') all_digits = false;
            }
            if (all_digits) {
                // Trim num_str
                size_t first = num_str.find_first_not_of(' ');
                size_t last = num_str.find_last_not_of(' ');
                if (first != std::string::npos && last != std::string::npos) {
                    std::string clean_num = num_str.substr(first, last - first + 1);
                    code.replace(range_pos, colon_pos - range_pos, "range(" + clean_num + ")");
                }
            }
        }
        range_pos = code.find("range ", range_pos + 6);
    }

    script += code + "\n";

    // Write to temp file and run
    std::string tmp_path = "/tmp/epp_python_exec.py";
    FILE* tmp_file = fopen(tmp_path.c_str(), "w");
    if (!tmp_file) {
        throw RuntimeError("Failed to create temporary script for Python execution", stmt->line, stmt->col);
    }
    fwrite(script.c_str(), 1, script.size(), tmp_file);
    fclose(tmp_file);

    std::string cmd = "python3 " + tmp_path + " 2>&1";
    FILE* pipe = popen(cmd.c_str(), "r");
    if (!pipe) {
        throw RuntimeError("Failed to launch python3 subprocess", stmt->line, stmt->col);
    }

    char buffer[256];
    std::string total_output = "";
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        out << buffer;
        total_output += buffer;
    }
    pclose(pipe);

    // Save to output variable if specified
    if (!stmt->output_var.empty()) {
        // Trim trailing newline
        while (!total_output.empty() && (total_output.back() == '\n' || total_output.back() == '\r')) {
            total_output.pop_back();
        }
        set_variable(stmt->output_var, Value::make_string(total_output));
    }
}

void Interpreter::visitWaitStmt(WaitStmt* stmt) {
    require_library("Time", "Wait / Sleep", stmt->line, stmt->col);
    double dur = stmt->duration->accept(this).as_number();
    if (stmt->is_milliseconds) {
        std::this_thread::sleep_for(std::chrono::milliseconds(static_cast<int>(dur)));
    } else {
        std::this_thread::sleep_for(std::chrono::milliseconds(static_cast<int>(dur * 1000.0)));
    }
}

void Interpreter::visitFileStmt(FileStmt* stmt) {
    require_library("Files", "File I/O", stmt->line, stmt->col);
    std::string path = stmt->path->accept(this).to_string();

    if (stmt->op == FileOp::READ) {
        std::ifstream file(path);
        if (!file.is_open()) {
            throw RuntimeError("File Error: Could not open file '" + path + "' for reading", stmt->line, stmt->col);
        }
        std::stringstream ss;
        ss << file.rdbuf();
        set_variable(stmt->target_var, Value::make_string(ss.str()));
    } else if (stmt->op == FileOp::WRITE) {
        std::string content = stmt->content->accept(this).to_string();
        std::ofstream file(path);
        if (!file.is_open()) {
            throw RuntimeError("File Error: Could not open file '" + path + "' for writing", stmt->line, stmt->col);
        }
        file << content;
    } else if (stmt->op == FileOp::APPEND) {
        std::string content = stmt->content->accept(this).to_string();
        std::ofstream file(path, std::ios::app);
        if (!file.is_open()) {
            throw RuntimeError("File Error: Could not open file '" + path + "' for appending", stmt->line, stmt->col);
        }
        file << content;
    }
}

void Interpreter::visitSystemStmt(SystemStmt* stmt) {
    require_library("System", "System command", stmt->line, stmt->col);
    std::string cmd = stmt->command->accept(this).to_string();

    if (!stmt->target_var.empty()) {
        std::string full_cmd = cmd + " 2>&1";
        FILE* pipe = popen(full_cmd.c_str(), "r");
        if (!pipe) {
            throw RuntimeError("System Error: Failed to run command '" + cmd + "'", stmt->line, stmt->col);
        }
        char buf[256];
        std::string total_out = "";
        while (fgets(buf, sizeof(buf), pipe) != nullptr) {
            total_out += buf;
        }
        pclose(pipe);
        while (!total_out.empty() && (total_out.back() == '\n' || total_out.back() == '\r')) {
            total_out.pop_back();
        }
        set_variable(stmt->target_var, Value::make_string(total_out));
    } else {
        int ret = std::system(cmd.c_str());
        (void)ret;
    }
}

void Interpreter::visitClearStmt(ClearStmt* stmt) {
    require_library("Console", "Clear console", stmt->line, stmt->col);
    out << "\033[2J\033[H" << std::flush;
}

} // namespace epp
