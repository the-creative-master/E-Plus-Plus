#ifndef EPP_AST_HPP
#define EPP_AST_HPP

#include "value.hpp"
#include <string>
#include <vector>
#include <memory>

namespace epp {

// Forward declarations
class ASTVisitor;

class ASTNode {
public:
    int line = 1;
    int col = 1;
    virtual ~ASTNode() = default;
};

class Expr : public ASTNode {
public:
    virtual Value accept(ASTVisitor* visitor) = 0;
};

class Stmt : public ASTNode {
public:
    virtual void accept(ASTVisitor* visitor) = 0;
};

// Literal Expression (numbers, strings, booleans)
class LiteralExpr : public Expr {
public:
    Value value;
    LiteralExpr(const Value& val, int l, int c) : value(val) { line = l; col = c; }
    Value accept(ASTVisitor* visitor) override;
};

// Variable Reference Expression ('Grade', 'Student')
class VariableExpr : public Expr {
public:
    std::string name;
    VariableExpr(const std::string& n, int l, int c) : name(n) { line = l; col = c; }
    Value accept(ASTVisitor* visitor) override;
};

// Binary Expression (+, -, *, /, mod, concat, comparisons)
enum class BinaryOp {
    ADD,
    SUB,
    MUL,
    DIV,
    MOD,
    CONCAT,
    EQ,
    NEQ,
    GT,
    LT,
    GTE,
    LTE
};

class BinaryExpr : public Expr {
public:
    BinaryOp op;
    std::shared_ptr<Expr> left;
    std::shared_ptr<Expr> right;
    BinaryExpr(BinaryOp o, std::shared_ptr<Expr> l, std::shared_ptr<Expr> r, int ln, int c)
        : op(o), left(l), right(r) { line = ln; col = c; }
    Value accept(ASTVisitor* visitor) override;
};

// Type Check Expression: check if <expr> is [not] a number
class TypeCheckExpr : public Expr {
public:
    std::shared_ptr<Expr> target;
    bool is_not;
    TypeCheckExpr(std::shared_ptr<Expr> t, bool not_flag, int l, int c)
        : target(t), is_not(not_flag) { line = l; col = c; }
    Value accept(ASTVisitor* visitor) override;
};

// Math Function Expression (sqrt, percent of, pow, etc.)
enum class MathFunc {
    SQRT,
    PERCENT_OF,
    ABS,
    POW,
    CUBE_ROOT,
    ROUND,
    FLOOR,
    CEILING,
    SINE,
    COSINE,
    TANGENT,
    MINIMUM,
    MAXIMUM,
    RANDOM_BETWEEN,
    DICE_ROLL,
    COIN_FLIP,
    LOGARITHM,
    FACTORIAL,
    HYPOTENUSE,
    PI_CONST,
    E_CONST
};

class MathFuncExpr : public Expr {
public:
    MathFunc func;
    std::vector<std::shared_ptr<Expr>> args;
    MathFuncExpr(MathFunc f, const std::vector<std::shared_ptr<Expr>>& a, int l, int c)
        : func(f), args(a) { line = l; col = c; }
    Value accept(ASTVisitor* visitor) override;
};

// String Function Expression (length, uppercase, etc.)
enum class StringFunc {
    LENGTH,
    UPPERCASE,
    LOWERCASE,
    REVERSE,
    FIRST_LETTER,
    LAST_LETTER,
    TRIM,
    REPLACE
};

class StringFuncExpr : public Expr {
public:
    StringFunc func;
    std::vector<std::shared_ptr<Expr>> args;
    StringFuncExpr(StringFunc f, const std::vector<std::shared_ptr<Expr>>& a, int l, int c)
        : func(f), args(a) { line = l; col = c; }
    Value accept(ASTVisitor* visitor) override;
};

// Time Function Expression
enum class TimeFunc {
    CURRENT_TIME,
    CURRENT_DATE,
    CURRENT_YEAR,
    CURRENT_TIMESTAMP
};

class TimeFuncExpr : public Expr {
public:
    TimeFunc func;
    TimeFuncExpr(TimeFunc f, int l, int c) : func(f) { line = l; col = c; }
    Value accept(ASTVisitor* visitor) override;
};

// System Function Expression
enum class SystemFunc {
    PLATFORM,
    OS_NAME
};

class SystemFuncExpr : public Expr {
public:
    SystemFunc func;
    SystemFuncExpr(SystemFunc f, int l, int c) : func(f) { line = l; col = c; }
    Value accept(ASTVisitor* visitor) override;
};

// Statements

// say "Hello", "World" with the separation method of " - "
// say red "Error: Something failed"
class SayStmt : public Stmt {
public:
    std::vector<std::shared_ptr<Expr>> expressions;
    std::shared_ptr<Expr> separator; // optional
    std::string color;               // optional color: "red", "green", "blue", "yellow", "cyan", "magenta"
    SayStmt(const std::vector<std::shared_ptr<Expr>>& exprs, std::shared_ptr<Expr> sep, int l, int c, const std::string& col_name = "")
        : expressions(exprs), separator(sep), color(col_name) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// let 'Number' be 2
// let 'Student' be Sam
class LetStmt : public Stmt {
public:
    std::string variable_name;
    std::shared_ptr<Expr> value_expr;
    std::string raw_fallback; // if rhs was unquoted words like "What a Disgrace!"
    bool is_raw_text = false;

    LetStmt(const std::string& name, std::shared_ptr<Expr> expr, int l, int c)
        : variable_name(name), value_expr(expr), is_raw_text(false) { line = l; col = c; }

    LetStmt(const std::string& name, const std::string& raw, int l, int c)
        : variable_name(name), raw_fallback(raw), is_raw_text(true) { line = l; col = c; }

    void accept(ASTVisitor* visitor) override;
};

// ask "What is your name?" and save the output as 'Name'
class AskStmt : public Stmt {
public:
    std::shared_ptr<Expr> prompt;
    std::string variable_name;
    AskStmt(std::shared_ptr<Expr> p, const std::string& var, int l, int c)
        : prompt(p), variable_name(var) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// add the "Math" library
class AddLibraryStmt : public Stmt {
public:
    std::string library_name;
    AddLibraryStmt(const std::string& lib, int l, int c)
        : library_name(lib) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// if <condition> then ... [else ...] end if
class IfStmt : public Stmt {
public:
    std::shared_ptr<Expr> condition;
    std::vector<std::shared_ptr<Stmt>> then_branch;
    std::vector<std::shared_ptr<Stmt>> else_branch;
    IfStmt(std::shared_ptr<Expr> cond,
           const std::vector<std::shared_ptr<Stmt>>& tb,
           const std::vector<std::shared_ptr<Stmt>>& eb,
           int l, int c)
        : condition(cond), then_branch(tb), else_branch(eb) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// repeat <count> times: ... end repeat
class RepeatStmt : public Stmt {
public:
    std::shared_ptr<Expr> count;
    std::vector<std::shared_ptr<Stmt>> body;
    RepeatStmt(std::shared_ptr<Expr> cnt, const std::vector<std::shared_ptr<Stmt>>& b, int l, int c)
        : count(cnt), body(b) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// while <condition> do: ... end while
class WhileStmt : public Stmt {
public:
    std::shared_ptr<Expr> condition;
    std::vector<std::shared_ptr<Stmt>> body;
    WhileStmt(std::shared_ptr<Expr> cond, const std::vector<std::shared_ptr<Stmt>>& b, int l, int c)
        : condition(cond), body(b) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// Standalone expression statement
class ExprStmt : public Stmt {
public:
    std::shared_ptr<Expr> expr;
    ExprStmt(std::shared_ptr<Expr> e, int l, int c) : expr(e) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// note "Comment text"
class NoteStmt : public Stmt {
public:
    std::string text;
    NoteStmt(const std::string& t, int l, int c) : text(t) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// run the python code "print('hello')" or run the python code:
class PythonStmt : public Stmt {
public:
    std::string python_code;
    std::string output_var;
    bool is_multiline = false;

    PythonStmt(const std::string& code, const std::string& out_var, bool multiline, int l, int c)
        : python_code(code), output_var(out_var), is_multiline(multiline) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// wait 2 seconds / sleep 500 milliseconds
class WaitStmt : public Stmt {
public:
    std::shared_ptr<Expr> duration;
    bool is_milliseconds = false;
    WaitStmt(std::shared_ptr<Expr> dur, bool ms, int l, int c)
        : duration(dur), is_milliseconds(ms) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// read file "test.txt" and save the output as 'Content'
// write "Hello" to file "test.txt"
// append "Hello" to file "test.txt"
enum class FileOp {
    READ,
    WRITE,
    APPEND,
    CHECK_EXISTS
};

class FileStmt : public Stmt {
public:
    FileOp op;
    std::shared_ptr<Expr> path;
    std::shared_ptr<Expr> content; // for write / append
    std::string target_var;        // for read
    FileStmt(FileOp o, std::shared_ptr<Expr> p, std::shared_ptr<Expr> cnt, const std::string& var, int l, int cl)
        : op(o), path(p), content(cnt), target_var(var) { line = l; col = cl; }
    void accept(ASTVisitor* visitor) override;
};

// run system command "ls -la" and save the output as 'Output'
class SystemStmt : public Stmt {
public:
    std::shared_ptr<Expr> command;
    std::string target_var;
    SystemStmt(std::shared_ptr<Expr> cmd, const std::string& var, int l, int c)
        : command(cmd), target_var(var) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// clear the console / clear screen
class ClearStmt : public Stmt {
public:
    ClearStmt(int l, int c) { line = l; col = c; }
    void accept(ASTVisitor* visitor) override;
};

// AST Visitor interface
class ASTVisitor {
public:
    virtual ~ASTVisitor() = default;

    virtual Value visitLiteralExpr(LiteralExpr* expr) = 0;
    virtual Value visitVariableExpr(VariableExpr* expr) = 0;
    virtual Value visitBinaryExpr(BinaryExpr* expr) = 0;
    virtual Value visitTypeCheckExpr(TypeCheckExpr* expr) = 0;
    virtual Value visitMathFuncExpr(MathFuncExpr* expr) = 0;
    virtual Value visitStringFuncExpr(StringFuncExpr* expr) = 0;
    virtual Value visitTimeFuncExpr(TimeFuncExpr* expr) = 0;
    virtual Value visitSystemFuncExpr(SystemFuncExpr* expr) = 0;

    virtual void visitSayStmt(SayStmt* stmt) = 0;
    virtual void visitLetStmt(LetStmt* stmt) = 0;
    virtual void visitAskStmt(AskStmt* stmt) = 0;
    virtual void visitAddLibraryStmt(AddLibraryStmt* stmt) = 0;
    virtual void visitIfStmt(IfStmt* stmt) = 0;
    virtual void visitRepeatStmt(RepeatStmt* stmt) = 0;
    virtual void visitWhileStmt(WhileStmt* stmt) = 0;
    virtual void visitExprStmt(ExprStmt* stmt) = 0;
    virtual void visitNoteStmt(NoteStmt* stmt) = 0;
    virtual void visitPythonStmt(PythonStmt* stmt) = 0;
    virtual void visitWaitStmt(WaitStmt* stmt) = 0;
    virtual void visitFileStmt(FileStmt* stmt) = 0;
    virtual void visitSystemStmt(SystemStmt* stmt) = 0;
    virtual void visitClearStmt(ClearStmt* stmt) = 0;
};

// Inlined accept implementations
inline Value LiteralExpr::accept(ASTVisitor* visitor) { return visitor->visitLiteralExpr(this); }
inline Value VariableExpr::accept(ASTVisitor* visitor) { return visitor->visitVariableExpr(this); }
inline Value BinaryExpr::accept(ASTVisitor* visitor) { return visitor->visitBinaryExpr(this); }
inline Value TypeCheckExpr::accept(ASTVisitor* visitor) { return visitor->visitTypeCheckExpr(this); }
inline Value MathFuncExpr::accept(ASTVisitor* visitor) { return visitor->visitMathFuncExpr(this); }
inline Value StringFuncExpr::accept(ASTVisitor* visitor) { return visitor->visitStringFuncExpr(this); }
inline Value TimeFuncExpr::accept(ASTVisitor* visitor) { return visitor->visitTimeFuncExpr(this); }
inline Value SystemFuncExpr::accept(ASTVisitor* visitor) { return visitor->visitSystemFuncExpr(this); }

inline void SayStmt::accept(ASTVisitor* visitor) { visitor->visitSayStmt(this); }
inline void LetStmt::accept(ASTVisitor* visitor) { visitor->visitLetStmt(this); }
inline void AskStmt::accept(ASTVisitor* visitor) { visitor->visitAskStmt(this); }
inline void AddLibraryStmt::accept(ASTVisitor* visitor) { visitor->visitAddLibraryStmt(this); }
inline void IfStmt::accept(ASTVisitor* visitor) { visitor->visitIfStmt(this); }
inline void RepeatStmt::accept(ASTVisitor* visitor) { visitor->visitRepeatStmt(this); }
inline void WhileStmt::accept(ASTVisitor* visitor) { visitor->visitWhileStmt(this); }
inline void ExprStmt::accept(ASTVisitor* visitor) { visitor->visitExprStmt(this); }
inline void NoteStmt::accept(ASTVisitor* visitor) { visitor->visitNoteStmt(this); }
inline void PythonStmt::accept(ASTVisitor* visitor) { visitor->visitPythonStmt(this); }
inline void WaitStmt::accept(ASTVisitor* visitor) { visitor->visitWaitStmt(this); }
inline void FileStmt::accept(ASTVisitor* visitor) { visitor->visitFileStmt(this); }
inline void SystemStmt::accept(ASTVisitor* visitor) { visitor->visitSystemStmt(this); }
inline void ClearStmt::accept(ASTVisitor* visitor) { visitor->visitClearStmt(this); }

} // namespace epp

#endif // EPP_AST_HPP
