#ifndef EPP_INTERPRETER_HPP
#define EPP_INTERPRETER_HPP

#include "ast.hpp"
#include "value.hpp"
#include <unordered_map>
#include <unordered_set>
#include <iostream>
#include <functional>
#include <memory>

namespace epp {

class LibraryError : public std::runtime_error {
public:
    int line;
    int col;
    LibraryError(const std::string& msg, int l, int c)
        : std::runtime_error(msg), line(l), col(c) {}
};

class RuntimeError : public std::runtime_error {
public:
    int line;
    int col;
    RuntimeError(const std::string& msg, int l, int c)
        : std::runtime_error(msg), line(l), col(c) {}
};

class Interpreter : public ASTVisitor {
public:
    Interpreter(std::ostream& out_stream = std::cout, std::istream& in_stream = std::cin);

    void execute(const std::vector<std::shared_ptr<Stmt>>& statements);
    void execute(std::shared_ptr<Stmt> statement);

    // Callbacks for web/GUI embedding
    using InputHandler = std::function<std::string(const std::string& prompt)>;
    void set_input_handler(InputHandler handler) { input_handler = handler; }

    // AST Visitor methods
    Value visitLiteralExpr(LiteralExpr* expr) override;
    Value visitVariableExpr(VariableExpr* expr) override;
    Value visitBinaryExpr(BinaryExpr* expr) override;
    Value visitTypeCheckExpr(TypeCheckExpr* expr) override;
    Value visitMathFuncExpr(MathFuncExpr* expr) override;
    Value visitStringFuncExpr(StringFuncExpr* expr) override;
    Value visitTimeFuncExpr(TimeFuncExpr* expr) override;
    Value visitSystemFuncExpr(SystemFuncExpr* expr) override;

    void visitSayStmt(SayStmt* stmt) override;
    void visitLetStmt(LetStmt* stmt) override;
    void visitAskStmt(AskStmt* stmt) override;
    void visitAddLibraryStmt(AddLibraryStmt* stmt) override;
    void visitIfStmt(IfStmt* stmt) override;
    void visitRepeatStmt(RepeatStmt* stmt) override;
    void visitWhileStmt(WhileStmt* stmt) override;
    void visitExprStmt(ExprStmt* stmt) override;
    void visitNoteStmt(NoteStmt* stmt) override;
    void visitPythonStmt(PythonStmt* stmt) override;
    void visitWaitStmt(WaitStmt* stmt) override;
    void visitFileStmt(FileStmt* stmt) override;
    void visitSystemStmt(SystemStmt* stmt) override;
    void visitClearStmt(ClearStmt* stmt) override;

    // Environment inspection
    bool has_variable(const std::string& name) const;
    Value get_variable(const std::string& name) const;
    void set_variable(const std::string& name, const Value& val);
    bool is_library_loaded(const std::string& name) const;

private:
    std::unordered_map<std::string, Value> variables;
    std::unordered_map<std::string, std::string> original_var_names;
    std::unordered_set<std::string> loaded_libraries;
    std::ostream& out;
    std::istream& in;
    InputHandler input_handler = nullptr;

    std::string normalize_name(const std::string& name) const;
    void require_library(const std::string& lib_name, const std::string& feature, int line, int col);
};

} // namespace epp

#endif // EPP_INTERPRETER_HPP
