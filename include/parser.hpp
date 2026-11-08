#ifndef EPP_PARSER_HPP
#define EPP_PARSER_HPP

#include "lexer.hpp"
#include "ast.hpp"
#include <vector>
#include <memory>
#include <stdexcept>
#include <string>

namespace epp {

// Release 1.4: a syntax error always carries one of the general codes
// E001-E075. `name` is the catalogue name of that code, so the command line,
// the Studio and E++.zip all print the same heading for the same mistake.
class ParseError : public std::runtime_error {
public:
    int line;
    int col;
    std::string code;
    std::string name;
    ParseError(const std::string& msg, int l, int c, const std::string& error_code = "E015",
               const std::string& error_name = "Unknown Statement")
        : std::runtime_error(msg), line(l), col(c), code(error_code), name(error_name) {}
};

// A LogicError is the parser saying "this is valid E++ but it does not mean
// anything": unquoted text where a value belongs (E001).
class LogicError : public std::runtime_error {
public:
    int line;
    int col;
    std::string code;
    LogicError(const std::string& msg, int l, int c, const std::string& error_code = "E001")
        : std::runtime_error(msg), line(l), col(c), code(error_code) {}
};

class Parser {
public:
    explicit Parser(const std::vector<Token>& tokens);
    std::vector<std::shared_ptr<Stmt>> parse_program();

private:
    std::vector<Token> tokens;
    size_t current = 0;

    // The general code that explains why `expected` was not there.
    static std::string code_for_missing(TokenType expected, const Token& found, const std::string& error_message);

    bool is_at_end() const;
    Token peek() const;
    Token peek_at(size_t offset) const;
    Token previous() const;
    Token advance();
    bool check(TokenType type) const;
    bool match(TokenType type);
    bool match_any(const std::vector<TokenType>& types);
    Token consume(TokenType type, const std::string& error_message);
    void synchronize();
    void skip_newlines();

    // Statement parsers
    std::shared_ptr<Stmt> parse_statement();
    std::shared_ptr<Stmt> parse_say_statement();
    std::shared_ptr<Stmt> parse_let_statement();
    std::shared_ptr<Stmt> parse_ask_statement();
    std::shared_ptr<Stmt> parse_add_library_statement();
    std::shared_ptr<Stmt> parse_if_statement();
    std::shared_ptr<Stmt> parse_repeat_statement();
    std::shared_ptr<Stmt> parse_while_statement();
    std::shared_ptr<Stmt> parse_check_statement();
    std::shared_ptr<Stmt> parse_note_statement();
    std::shared_ptr<Stmt> parse_python_statement();
    std::shared_ptr<Stmt> parse_wait_statement();
    std::shared_ptr<Stmt> parse_file_statement();
    std::shared_ptr<Stmt> parse_system_statement();
    std::shared_ptr<Stmt> parse_clear_statement();

    // Expression parsers
    std::shared_ptr<Expr> parse_expression();
    std::shared_ptr<Expr> parse_comparison();
    std::shared_ptr<Expr> parse_term();
    std::shared_ptr<Expr> parse_factor();
    std::shared_ptr<Expr> parse_power();
    std::shared_ptr<Expr> parse_primary();

    // Math & special English expressions
    std::shared_ptr<Expr> parse_math_prefix();
    std::shared_ptr<Expr> parse_type_check();
    std::shared_ptr<Expr> parse_string_prefix();
    std::shared_ptr<Expr> parse_time_prefix();
    std::shared_ptr<Expr> parse_system_prefix();

    bool is_concat_keyword();
    bool match_concat();
};

} // namespace epp

#endif // EPP_PARSER_HPP
