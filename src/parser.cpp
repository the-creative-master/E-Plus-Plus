#include "parser.hpp"
#include <iostream>
#include <sstream>

namespace epp {

Parser::Parser(const std::vector<Token>& toks) : tokens(toks) {}

bool Parser::is_at_end() const {
    return peek().type == TokenType::TOKEN_EOF;
}

Token Parser::peek() const {
    if (current >= tokens.size()) return tokens.back();
    return tokens[current];
}

Token Parser::previous() const {
    if (current == 0) return tokens[0];
    return tokens[current - 1];
}

Token Parser::advance() {
    if (!is_at_end()) current++;
    return previous();
}

bool Parser::check(TokenType type) const {
    if (is_at_end()) return false;
    return peek().type == type;
}

bool Parser::match(TokenType type) {
    if (check(type)) {
        advance();
        return true;
    }
    return false;
}

bool Parser::match_any(const std::vector<TokenType>& types) {
    for (TokenType t : types) {
        if (check(t)) {
            advance();
            return true;
        }
    }
    return false;
}

Token Parser::consume(TokenType type, const std::string& error_message) {
    if (check(type)) return advance();
    Token tok = peek();
    throw ParseError(error_message + " (found '" + tok.lexeme + "' at line " +
                     std::to_string(tok.line) + ", col " + std::to_string(tok.col) + ")",
                     tok.line, tok.col);
}

void Parser::skip_newlines() {
    while (match(TokenType::TOKEN_NEWLINE)) {}
}

void Parser::synchronize() {
    advance();
    while (!is_at_end()) {
        if (previous().type == TokenType::TOKEN_NEWLINE) return;
        switch (peek().type) {
            case TokenType::KW_SAY:
            case TokenType::KW_TELL:
            case TokenType::KW_LET:
            case TokenType::KW_SET:
            case TokenType::KW_ASK:
            case TokenType::KW_ADD:
            case TokenType::KW_IF:
            case TokenType::KW_REPEAT:
            case TokenType::KW_WHILE:
            case TokenType::KW_CHECK:
                return;
            default:
                break;
        }
        advance();
    }
}

std::vector<std::shared_ptr<Stmt>> Parser::parse_program() {
    std::vector<std::shared_ptr<Stmt>> statements;
    skip_newlines();

    while (!is_at_end()) {
        try {
            auto stmt = parse_statement();
            if (stmt) {
                statements.push_back(stmt);
            }
        } catch (const std::exception& e) {
            throw; // Let caller catch and display
        }
        skip_newlines();
    }

    return statements;
}

std::shared_ptr<Stmt> Parser::parse_statement() {
    skip_newlines();
    if (is_at_end()) return nullptr;

    Token tok = peek();

    if (tok.type == TokenType::KW_SAY || tok.type == TokenType::KW_TELL) {
        return parse_say_statement();
    }
    if (tok.type == TokenType::KW_LET || tok.type == TokenType::KW_SET || tok.type == TokenType::KW_DEFINE) {
        return parse_let_statement();
    }
    if (tok.type == TokenType::KW_NOTE) {
        return parse_note_statement();
    }
    if (tok.type == TokenType::KW_WAIT || tok.type == TokenType::KW_SLEEP) {
        return parse_wait_statement();
    }
    if (tok.type == TokenType::KW_READ || tok.type == TokenType::KW_WRITE || tok.type == TokenType::KW_APPEND) {
        return parse_file_statement();
    }
    if (tok.type == TokenType::KW_CLEAR) {
        return parse_clear_statement();
    }
    if (tok.type == TokenType::KW_RUN) {
        if (current + 1 < tokens.size() && tokens[current + 1].type == TokenType::KW_SYSTEM) {
            return parse_system_statement();
        }
        return parse_python_statement();
    }
    if (tok.type == TokenType::KW_PYTHON) {
        return parse_python_statement();
    }
    if (tok.type == TokenType::KW_ASK) {
        return parse_ask_statement();
    }
    if (tok.type == TokenType::KW_ADD) {
        return parse_add_library_statement();
    }
    if (tok.type == TokenType::KW_IF) {
        return parse_if_statement();
    }
    if (tok.type == TokenType::KW_REPEAT) {
        return parse_repeat_statement();
    }
    if (tok.type == TokenType::KW_WHILE) {
        return parse_while_statement();
    }
    if (tok.type == TokenType::KW_CHECK) {
        return parse_check_statement();
    }
    if (tok.type == TokenType::KW_OTHERWISE) {
        throw ParseError("Syntax Error at line " + std::to_string(tok.line) + ", col " + std::to_string(tok.col) +
                         ": 'otherwise' can only appear immediately on the next line after an 'if' statement.",
                         tok.line, tok.col);
    }

    // Otherwise, standalone expression or unrecognized line
    int l = tok.line;
    int c = tok.col;
    auto expr = parse_expression();
    if (match(TokenType::TOKEN_NEWLINE) || is_at_end()) {
        return std::make_shared<ExprStmt>(expr, l, c);
    }

    throw ParseError("Unexpected token '" + peek().lexeme + "' at line " +
                     std::to_string(peek().line) + ", col " + std::to_string(peek().col),
                     peek().line, peek().col);
}

// say "Hello", "World" with the separation method of " - "
// say red "Error: Something failed"
std::shared_ptr<Stmt> Parser::parse_say_statement() {
    Token say_tok = advance(); // Consume 'say' or 'tell'
    int line = say_tok.line;
    int col = say_tok.col;

    std::string color = "";
    if (match(TokenType::KW_RED)) color = "red";
    else if (match(TokenType::KW_GREEN)) color = "green";
    else if (match(TokenType::KW_BLUE)) color = "blue";
    else if (match(TokenType::KW_YELLOW)) color = "yellow";
    else if (match(TokenType::KW_CYAN)) color = "cyan";
    else if (match(TokenType::KW_MAGENTA)) color = "magenta";

    std::vector<std::shared_ptr<Expr>> expressions;
    std::shared_ptr<Expr> separator = nullptr;

    while (!is_at_end() && peek().type != TokenType::TOKEN_NEWLINE) {
        // Check for separator method clause first
        if (peek().type == TokenType::KW_WITH) {
            advance(); // consume 'with'
            match(TokenType::KW_THE);
            if (!match(TokenType::KW_SEPARATION)) {
                throw ParseError("Expected 'separation method of' after 'with', got '" +
                                 peek().lexeme + "'", peek().line, peek().col);
            }
            if (match(TokenType::KW_METHOD)) {
                match(TokenType::KW_OF);
            } else if (!match(TokenType::KW_OF)) {
                throw ParseError("Expected 'method of' or 'of' after 'separation', got '" +
                                 peek().lexeme + "'", peek().line, peek().col);
            }
            separator = parse_expression();
            break;
        }

        // Parse one expression
        auto expr = parse_expression();
        expressions.push_back(expr);

        // Check if separator clause comes immediately after expr
        if (peek().type == TokenType::KW_WITH) {
            advance(); // consume 'with'
            match(TokenType::KW_THE);
            if (!match(TokenType::KW_SEPARATION)) {
                throw ParseError("Expected 'separation method of' after 'with', got '" +
                                 peek().lexeme + "'", peek().line, peek().col);
            }
            if (match(TokenType::KW_METHOD)) {
                match(TokenType::KW_OF);
            } else if (!match(TokenType::KW_OF)) {
                throw ParseError("Expected 'method of' or 'of' after 'separation', got '" +
                                 peek().lexeme + "'", peek().line, peek().col);
            }
            separator = parse_expression();
            break;
        }

        // Check delimiters: comma or "and concat it with"
        if (match(TokenType::TOKEN_COMMA)) {
            // Check if comma is followed by "and concat it with" or "and concat with"
            if (match(TokenType::KW_AND)) {
                if (match(TokenType::KW_CONCAT)) {
                    match(TokenType::KW_IT);
                    match(TokenType::KW_WITH);
                }
            } else if (match(TokenType::KW_CONCAT)) {
                match(TokenType::KW_IT);
                match(TokenType::KW_WITH);
            }
            // Check if next is separator clause
            if (peek().type == TokenType::KW_WITH) continue;
            // otherwise parse next expression
            continue;
        }

        if (match(TokenType::KW_AND)) {
            if (match(TokenType::KW_CONCAT)) {
                match(TokenType::KW_IT);
                match(TokenType::KW_WITH);
                continue;
            } else {
                // e.g. "and concat with"
                // Rewind if not concat
                current--; // unconsume 'and'
                break;
            }
        }

        if (match(TokenType::KW_CONCAT)) {
            match(TokenType::KW_IT);
            match(TokenType::KW_WITH);
            continue;
        }

        break;
    }

    match(TokenType::TOKEN_NEWLINE);
    return std::make_shared<SayStmt>(expressions, separator, line, col, color);
}

// let 'Number' be 2
// let 'Student' be Sam
// let 'Comment' be What a Disgrace!
std::shared_ptr<Stmt> Parser::parse_let_statement() {
    Token let_tok = advance(); // Consume 'let' or 'set'
    int line = let_tok.line;
    int col = let_tok.col;

    // Check if the user used double quotes: let "Number" be 2
    if (peek().type == TokenType::TOKEN_STRING) {
        Token bad_tok = peek();
        throw ParseError("Syntax Error at line " + std::to_string(bad_tok.line) +
                         ", col " + std::to_string(bad_tok.col) +
                         ": Variables in E++ must always be enclosed in single quotes like '" +
                         bad_tok.string_value + "', never double quotes! Double quotes are reserved for text strings.",
                         bad_tok.line, bad_tok.col);
    }

    if (peek().type != TokenType::TOKEN_VARIABLE) {
        Token bad_tok = peek();
        throw ParseError("Syntax Error at line " + std::to_string(bad_tok.line) +
                         ", col " + std::to_string(bad_tok.col) +
                         ": Expected variable name in single quotes (e.g. 'VariableName'), but found '" +
                         bad_tok.lexeme + "'.", bad_tok.line, bad_tok.col);
    }

    Token var_tok = advance();
    std::string var_name = var_tok.string_value;

    // Expect 'be' or 'to' or 'as' or '='
    if (!match(TokenType::KW_BE) && !match(TokenType::KW_TO) && !match(TokenType::KW_AS)) {
        Token bad_tok = peek();
        throw ParseError("Syntax Error at line " + std::to_string(bad_tok.line) +
                         ": Expected 'be' or 'as' after variable '" + var_tok.lexeme +
                         "', e.g. let " + var_tok.lexeme + " be <value> or define " + var_tok.lexeme + " as <value>.",
                         bad_tok.line, bad_tok.col);
    }

    // Now inspect RHS:
    // If the next token is an IDENTIFIER (not keyword, not string, not number, not variable),
    // it could be unquoted text like "Sam" or "What a Disgrace!"
    if (peek().type == TokenType::TOKEN_IDENTIFIER) {
        // Collect all tokens until newline
        std::string raw_text;
        while (!is_at_end() && peek().type != TokenType::TOKEN_NEWLINE) {
            Token t = advance();
            if (!raw_text.empty() && t.type != TokenType::TOKEN_EXCLAMATION && t.type != TokenType::TOKEN_QUESTION && t.type != TokenType::TOKEN_COMMA) {
                raw_text += " ";
            }
            raw_text += t.lexeme;
        }
        match(TokenType::TOKEN_NEWLINE);
        return std::make_shared<LetStmt>(var_name, raw_text, line, col);
    }

    // Otherwise, parse standard expression
    auto val_expr = parse_expression();
    match(TokenType::TOKEN_NEWLINE);
    return std::make_shared<LetStmt>(var_name, val_expr, line, col);
}

// ask "What is your name?" and save the output as 'Name'
std::shared_ptr<Stmt> Parser::parse_ask_statement() {
    Token ask_tok = advance(); // Consume 'ask'
    int line = ask_tok.line;
    int col = ask_tok.col;

    auto prompt = parse_expression();

    // Expect "and save [the/it] [output/answer/result] as 'Name'"
    if (!match(TokenType::KW_AND)) {
        throw ParseError("Expected 'and' after ask prompt, e.g. ask ... and save the output as 'Name'",
                         peek().line, peek().col);
    }
    if (!match(TokenType::KW_SAVE)) {
        throw ParseError("Expected 'save' after 'and', e.g. and save the output as 'Name'",
                         peek().line, peek().col);
    }

    match(TokenType::KW_THE);
    match(TokenType::KW_IT);

    if (!match(TokenType::KW_OUTPUT) && !match(TokenType::KW_ANSWER) && !match(TokenType::KW_RESULT)) {
        // optional
    }

    if (!match(TokenType::KW_AS) && !match(TokenType::KW_IN)) {
        throw ParseError("Expected 'as' or 'in' before variable name, e.g. save the output as 'Name'",
                         peek().line, peek().col);
    }

    if (peek().type == TokenType::TOKEN_STRING) {
        Token bad_tok = peek();
        throw ParseError("Syntax Error at line " + std::to_string(bad_tok.line) +
                         ": Variables in E++ must always be enclosed in single quotes like '" +
                         bad_tok.string_value + "', never double quotes!",
                         bad_tok.line, bad_tok.col);
    }

    Token var_tok = consume(TokenType::TOKEN_VARIABLE,
                            "Expected variable name in single quotes, e.g. 'Name'");
    match(TokenType::TOKEN_NEWLINE);

    return std::make_shared<AskStmt>(prompt, var_tok.string_value, line, col);
}

// add the "Math" library
std::shared_ptr<Stmt> Parser::parse_add_library_statement() {
    Token add_tok = advance(); // Consume 'add'
    int line = add_tok.line;
    int col = add_tok.col;

    match(TokenType::KW_THE);

    std::string lib_name;
    if (peek().type == TokenType::TOKEN_STRING) {
        lib_name = advance().string_value;
    } else if (peek().type == TokenType::TOKEN_IDENTIFIER) {
        lib_name = advance().lexeme;
    } else {
        lib_name = advance().lexeme;
    }

    match(TokenType::KW_LIBRARY);
    match(TokenType::TOKEN_NEWLINE);

    return std::make_shared<AddLibraryStmt>(lib_name, line, col);
}

// note [Comment text]
std::shared_ptr<Stmt> Parser::parse_note_statement() {
    Token note_tok = advance(); // Consume 'note'
    int line = note_tok.line;
    int col = note_tok.col;
    std::string text = note_tok.string_value;
    match(TokenType::TOKEN_NEWLINE);
    return std::make_shared<NoteStmt>(text, line, col);
}

// run the python code "print('hello')" or run the python code:
std::shared_ptr<Stmt> Parser::parse_python_statement() {
    Token start_tok = peek();
    int line = start_tok.line;
    int col = start_tok.col;

    if (match(TokenType::KW_RUN)) {
        match(TokenType::KW_THE);
    }
    match(TokenType::KW_PYTHON);
    match(TokenType::KW_CODE);

    std::string py_code = "";
    std::string out_var = "";
    bool is_multiline = false;

    if (match(TokenType::TOKEN_COLON)) {
        is_multiline = true;
        skip_newlines();
        if (peek().type == TokenType::TOKEN_PYTHON_BLOCK) {
            py_code = advance().string_value;
        } else {
            bool line_start = true;
            while (!is_at_end()) {
                Token t = peek();
                if (t.type == TokenType::KW_SAY || t.type == TokenType::KW_TELL ||
                    t.type == TokenType::KW_LET || t.type == TokenType::KW_DEFINE ||
                    t.type == TokenType::KW_ASK || t.type == TokenType::KW_ADD ||
                    t.type == TokenType::KW_NOTE || t.type == TokenType::KW_RUN ||
                    t.type == TokenType::KW_END) {
                    if (t.col <= 2) break;
                }
                if (t.type == TokenType::TOKEN_NEWLINE) {
                    advance();
                    py_code += "\n";
                    line_start = true;
                    continue;
                }
                Token next_tok = advance();
                if (line_start) {
                    if (next_tok.col > 1) {
                        py_code += std::string(next_tok.col - 1, ' ');
                    }
                    line_start = false;
                } else if (!py_code.empty() && py_code.back() != '\n' && py_code.back() != ' ' && py_code.back() != '.' && py_code.back() != '(' &&
                    next_tok.lexeme != "(" && next_tok.lexeme != ")" && next_tok.lexeme != ":" && next_tok.lexeme != "." && next_tok.lexeme != ",") {
                    if (!((py_code.back() == 'f' || py_code.back() == 'r' || py_code.back() == 'b') && (!next_tok.lexeme.empty() && (next_tok.lexeme.front() == '"' || next_tok.lexeme.front() == '\'')))) {
                        py_code += " ";
                    }
                }
                py_code += next_tok.lexeme;
            }
        }
    } else if (peek().type == TokenType::TOKEN_STRING) {
        py_code = advance().string_value;
    } else {
        throw ParseError("Expected ':' or python code in quotes after 'run the python code'", line, col);
    }

    if (match(TokenType::KW_AND)) {
        match(TokenType::KW_SAVE);
        match(TokenType::KW_THE);
        match(TokenType::KW_OUTPUT);
        match(TokenType::KW_AS);
        if (peek().type == TokenType::TOKEN_VARIABLE) {
            out_var = advance().string_value;
        }
    }

    match(TokenType::TOKEN_NEWLINE);
    return std::make_shared<PythonStmt>(py_code, out_var, is_multiline, line, col);
}

// wait 2 seconds / sleep 500 milliseconds
std::shared_ptr<Stmt> Parser::parse_wait_statement() {
    Token wait_tok = advance(); // 'wait' or 'sleep'
    int line = wait_tok.line;
    int col = wait_tok.col;

    auto dur_expr = parse_expression();
    bool is_ms = false;

    if (match(TokenType::KW_MILLISECONDS) || match(TokenType::KW_MILLISECOND)) {
        is_ms = true;
    } else if (match(TokenType::KW_SECONDS) || match(TokenType::KW_SECOND)) {
        is_ms = false;
    }

    match(TokenType::TOKEN_NEWLINE);
    return std::make_shared<WaitStmt>(dur_expr, is_ms, line, col);
}

// read file "path" and save the output as 'Var'
// write "Hello" to file "path"
// append "Hello" to file "path"
std::shared_ptr<Stmt> Parser::parse_file_statement() {
    Token op_tok = advance(); // 'read', 'write', 'append'
    int line = op_tok.line;
    int col = op_tok.col;

    if (op_tok.type == TokenType::KW_READ) {
        match(TokenType::KW_THE);
        consume(TokenType::KW_FILE, "Expected 'file' after 'read'");
        auto path_expr = parse_expression();

        match(TokenType::KW_AND);
        consume(TokenType::KW_SAVE, "Expected 'and save' after file path");
        match(TokenType::KW_THE);
        if (match(TokenType::KW_OUTPUT) || match(TokenType::KW_RESULT) || match(TokenType::KW_ANSWER)) {}
        consume(TokenType::KW_AS, "Expected 'as' before variable name");

        Token var_tok = consume(TokenType::TOKEN_VARIABLE, "Expected variable name in single quotes (e.g. 'Var')");
        match(TokenType::TOKEN_NEWLINE);
        return std::make_shared<FileStmt>(FileOp::READ, path_expr, nullptr, var_tok.string_value, line, col);
    } else if (op_tok.type == TokenType::KW_WRITE || op_tok.type == TokenType::KW_APPEND) {
        FileOp fop = (op_tok.type == TokenType::KW_WRITE) ? FileOp::WRITE : FileOp::APPEND;
        auto content_expr = parse_expression();
        consume(TokenType::KW_TO, "Expected 'to' before 'file'");
        match(TokenType::KW_THE);
        consume(TokenType::KW_FILE, "Expected 'file' after 'to'");
        auto path_expr = parse_expression();
        match(TokenType::TOKEN_NEWLINE);
        return std::make_shared<FileStmt>(fop, path_expr, content_expr, "", line, col);
    }

    throw ParseError("Unknown file operation at line " + std::to_string(line), line, col);
}

// run system command "ls" and save the output as 'Output'
// or run system command "echo hi"
std::shared_ptr<Stmt> Parser::parse_system_statement() {
    Token run_tok = advance(); // 'run'
    int line = run_tok.line;
    int col = run_tok.col;

    consume(TokenType::KW_SYSTEM, "Expected 'system' after 'run'");
    consume(TokenType::KW_COMMAND, "Expected 'command' after 'system'");

    auto cmd_expr = parse_expression();
    std::string out_var = "";

    if (match(TokenType::KW_AND)) {
        consume(TokenType::KW_SAVE, "Expected 'save' after 'and'");
        match(TokenType::KW_THE);
        if (match(TokenType::KW_OUTPUT) || match(TokenType::KW_RESULT) || match(TokenType::KW_ANSWER)) {}
        consume(TokenType::KW_AS, "Expected 'as' before variable name");
        Token var_tok = consume(TokenType::TOKEN_VARIABLE, "Expected variable name in single quotes (e.g. 'Var')");
        out_var = var_tok.string_value;
    }

    match(TokenType::TOKEN_NEWLINE);
    return std::make_shared<SystemStmt>(cmd_expr, out_var, line, col);
}

// clear the console / clear screen
std::shared_ptr<Stmt> Parser::parse_clear_statement() {
    Token clr_tok = advance(); // 'clear'
    int line = clr_tok.line;
    int col = clr_tok.col;

    match(TokenType::KW_THE);
    if (!match(TokenType::KW_CONSOLE) && !match(TokenType::KW_SCREEN)) {
        // default
    }
    match(TokenType::TOKEN_NEWLINE);
    return std::make_shared<ClearStmt>(line, col);
}

// check if "Hello" is not a number
std::shared_ptr<Stmt> Parser::parse_check_statement() {
    int line = peek().line;
    int col = peek().col;
    auto check_expr = parse_type_check();
    match(TokenType::TOKEN_NEWLINE);
    return std::make_shared<ExprStmt>(check_expr, line, col);
}

// if <condition> then ... [else/otherwise ...] [end if]
// Supports:
// 1. Single-line: if [input] then [output]
//    Optionally followed on the next line by: otherwise [output]
// 2. Block: if [input] then: ... [else/otherwise:] ... end if
std::shared_ptr<Stmt> Parser::parse_if_statement() {
    Token if_tok = advance(); // Consume 'if'
    int line = if_tok.line;
    int col = if_tok.col;

    auto cond = parse_expression();
    consume(TokenType::KW_THEN, "Expected 'then' after if condition");

    std::vector<std::shared_ptr<Stmt>> then_branch;
    std::vector<std::shared_ptr<Stmt>> else_branch;

    // Check if it's block if: then: \n
    if (match(TokenType::TOKEN_COLON)) {
        match(TokenType::TOKEN_NEWLINE);
        while (!is_at_end() && peek().type != TokenType::KW_ELSE && peek().type != TokenType::KW_OTHERWISE && peek().type != TokenType::KW_END) {
            skip_newlines();
            if (peek().type == TokenType::KW_ELSE || peek().type == TokenType::KW_OTHERWISE || peek().type == TokenType::KW_END) break;
            auto s = parse_statement();
            if (s) then_branch.push_back(s);
        }

        if (match(TokenType::KW_ELSE) || match(TokenType::KW_OTHERWISE)) {
            match(TokenType::TOKEN_COLON);
            match(TokenType::TOKEN_NEWLINE);
            while (!is_at_end() && peek().type != TokenType::KW_END) {
                skip_newlines();
                if (peek().type == TokenType::KW_END) break;
                auto s = parse_statement();
                if (s) else_branch.push_back(s);
            }
        }

        consume(TokenType::KW_END, "Expected 'end if' to close if block");
        match(TokenType::KW_IF);
        match(TokenType::TOKEN_NEWLINE);

        return std::make_shared<IfStmt>(cond, then_branch, else_branch, line, col);
    }

    // Single-line inline 'if [input] then [output]'
    if (peek().type == TokenType::KW_OTHERWISE) {
        throw ParseError("Syntax Error at line " + std::to_string(peek().line) +
                         ": 'otherwise' cannot be on the same line as 'if ... then'. In E++, 'otherwise' always has to be on the next line.",
                         peek().line, peek().col);
    }

    auto then_stmt = parse_statement();
    if (then_stmt) {
        then_branch.push_back(then_stmt);
    }

    // Did then_stmt already consume the newline?
    if (previous().type == TokenType::TOKEN_NEWLINE) {
        if (peek().type == TokenType::KW_OTHERWISE || peek().type == TokenType::KW_ELSE) {
            advance(); // consume 'otherwise' or 'else'
            auto else_stmt = parse_statement();
            if (else_stmt) {
                else_branch.push_back(else_stmt);
            }
        }
    } else {
        // Was 'otherwise' placed on the same line?
        if (peek().type == TokenType::KW_OTHERWISE || peek().type == TokenType::KW_ELSE) {
            throw ParseError("Syntax Error at line " + std::to_string(peek().line) +
                             ": 'otherwise' cannot be on the same line as 'if ... then'. In E++, 'otherwise' always has to be on the next line.",
                             peek().line, peek().col);
        }
        if (match(TokenType::TOKEN_NEWLINE)) {
            if (peek().type == TokenType::KW_OTHERWISE || peek().type == TokenType::KW_ELSE) {
                advance(); // consume 'otherwise' or 'else'
                auto else_stmt = parse_statement();
                if (else_stmt) {
                    else_branch.push_back(else_stmt);
                }
            } else {
                current--; // rewind newline
            }
        }
    }

    return std::make_shared<IfStmt>(cond, then_branch, else_branch, line, col);
}

// repeat <count> times: ... end repeat
std::shared_ptr<Stmt> Parser::parse_repeat_statement() {
    Token rep_tok = advance(); // Consume 'repeat'
    int line = rep_tok.line;
    int col = rep_tok.col;

    auto count = parse_power();
    consume(TokenType::KW_TIMES, "Expected 'times' after repeat count");
    match(TokenType::TOKEN_COLON);
    match(TokenType::TOKEN_NEWLINE);

    std::vector<std::shared_ptr<Stmt>> body;
    while (!is_at_end() && peek().type != TokenType::KW_END) {
        skip_newlines();
        if (peek().type == TokenType::KW_END) break;
        auto s = parse_statement();
        if (s) body.push_back(s);
    }

    consume(TokenType::KW_END, "Expected 'end repeat' to close repeat block");
    match(TokenType::KW_REPEAT);
    match(TokenType::TOKEN_NEWLINE);

    return std::make_shared<RepeatStmt>(count, body, line, col);
}

// while <condition> do: ... end while
std::shared_ptr<Stmt> Parser::parse_while_statement() {
    Token w_tok = advance(); // Consume 'while'
    int line = w_tok.line;
    int col = w_tok.col;

    auto cond = parse_expression();
    match(TokenType::KW_DO);
    match(TokenType::TOKEN_COLON);
    match(TokenType::TOKEN_NEWLINE);

    std::vector<std::shared_ptr<Stmt>> body;
    while (!is_at_end() && peek().type != TokenType::KW_END) {
        skip_newlines();
        if (peek().type == TokenType::KW_END) break;
        auto s = parse_statement();
        if (s) body.push_back(s);
    }

    consume(TokenType::KW_END, "Expected 'end while' to close while block");
    match(TokenType::KW_WHILE);
    match(TokenType::TOKEN_NEWLINE);

    return std::make_shared<WhileStmt>(cond, body, line, col);
}

// Expression parsing
std::shared_ptr<Expr> Parser::parse_expression() {
    // Check if it's a type check expression: check if ...
    if (peek().type == TokenType::KW_CHECK) {
        return parse_type_check();
    }
    return parse_comparison();
}

std::shared_ptr<Expr> Parser::parse_comparison() {
    auto expr = parse_term();

    while (true) {
        int l = peek().line;
        int c = peek().col;

        if (match(TokenType::KW_EQUALS) || match(TokenType::KW_EQUAL)) {
            auto right = parse_term();
            expr = std::make_shared<BinaryExpr>(BinaryOp::EQ, expr, right, l, c);
        } else if (match(TokenType::KW_IS)) {
            if (match(TokenType::KW_NOT)) {
                if (match(TokenType::KW_EQUAL)) match(TokenType::KW_TO);
                auto right = parse_term();
                expr = std::make_shared<BinaryExpr>(BinaryOp::NEQ, expr, right, l, c);
            } else if (match(TokenType::KW_GREATER)) {
                match(TokenType::KW_THAN);
                auto right = parse_term();
                expr = std::make_shared<BinaryExpr>(BinaryOp::GT, expr, right, l, c);
            } else if (match(TokenType::KW_LESS)) {
                match(TokenType::KW_THAN);
                auto right = parse_term();
                expr = std::make_shared<BinaryExpr>(BinaryOp::LT, expr, right, l, c);
            } else if (match(TokenType::KW_EQUAL)) {
                match(TokenType::KW_TO);
                auto right = parse_term();
                expr = std::make_shared<BinaryExpr>(BinaryOp::EQ, expr, right, l, c);
            } else {
                // e.g. "is 5" -> equals 5
                auto right = parse_term();
                expr = std::make_shared<BinaryExpr>(BinaryOp::EQ, expr, right, l, c);
            }
        } else {
            break;
        }
    }

    return expr;
}

std::shared_ptr<Expr> Parser::parse_term() {
    auto expr = parse_factor();

    while (true) {
        int l = peek().line;
        int c = peek().col;

        if (match(TokenType::KW_PLUS) || match(TokenType::TOKEN_PLUS_SYM)) {
            auto right = parse_factor();
            expr = std::make_shared<BinaryExpr>(BinaryOp::ADD, expr, right, l, c);
        } else if (match(TokenType::KW_MINUS) || match(TokenType::TOKEN_MINUS_SYM)) {
            auto right = parse_factor();
            expr = std::make_shared<BinaryExpr>(BinaryOp::SUB, expr, right, l, c);
        } else {
            break;
        }
    }

    return expr;
}

std::shared_ptr<Expr> Parser::parse_factor() {
    auto expr = parse_power();

    while (true) {
        int l = peek().line;
        int c = peek().col;

        if (match(TokenType::KW_TIMES) || match(TokenType::TOKEN_STAR_SYM)) {
            auto right = parse_power();
            expr = std::make_shared<BinaryExpr>(BinaryOp::MUL, expr, right, l, c);
        } else if (match(TokenType::KW_MULTIPLIED)) {
            match(TokenType::KW_BY);
            auto right = parse_power();
            expr = std::make_shared<BinaryExpr>(BinaryOp::MUL, expr, right, l, c);
        } else if (match(TokenType::KW_DIVIDED)) {
            match(TokenType::KW_BY);
            auto right = parse_power();
            expr = std::make_shared<BinaryExpr>(BinaryOp::DIV, expr, right, l, c);
        } else if (match(TokenType::TOKEN_SLASH_SYM)) {
            auto right = parse_power();
            expr = std::make_shared<BinaryExpr>(BinaryOp::DIV, expr, right, l, c);
        } else if (match(TokenType::KW_MODULO) || match(TokenType::KW_MOD) || match(TokenType::TOKEN_PERCENT_SYM)) {
            auto right = parse_power();
            expr = std::make_shared<BinaryExpr>(BinaryOp::MOD, expr, right, l, c);
        } else {
            break;
        }
    }

    return expr;
}

std::shared_ptr<Expr> Parser::parse_power() {
    auto expr = parse_primary();

    while (true) {
        int l = peek().line;
        int c = peek().col;

        if (match(TokenType::KW_RAISED)) {
            match(TokenType::KW_TO);
            auto right = parse_primary();
            std::vector<std::shared_ptr<Expr>> args = {expr, right};
            expr = std::make_shared<MathFuncExpr>(MathFunc::POW, args, l, c);
        } else if (match(TokenType::KW_TO)) {
            if (match(TokenType::KW_THE)) {
                if (match(TokenType::KW_POWER)) {
                    match(TokenType::KW_OF);
                    auto right = parse_primary();
                    std::vector<std::shared_ptr<Expr>> args = {expr, right};
                    expr = std::make_shared<MathFuncExpr>(MathFunc::POW, args, l, c);
                    continue;
                }
            }
            current--; // rewind 'to'
            break;
        } else {
            break;
        }
    }

    return expr;
}

std::shared_ptr<Expr> Parser::parse_primary() {
    Token tok = peek();
    int l = tok.line;
    int c = tok.col;

    // Numbers
    if (match(TokenType::TOKEN_NUMBER)) {
        return std::make_shared<LiteralExpr>(Value::make_number(tok.number_value), l, c);
    }

    // Double-quoted strings
    if (match(TokenType::TOKEN_STRING)) {
        return std::make_shared<LiteralExpr>(Value::make_string(tok.string_value), l, c);
    }

    // Single-quoted variables
    if (match(TokenType::TOKEN_VARIABLE)) {
        return std::make_shared<VariableExpr>(tok.string_value, l, c);
    }

    // Booleans
    if (match(TokenType::KW_TRUE)) {
        return std::make_shared<LiteralExpr>(Value::make_bool(true), l, c);
    }
    if (match(TokenType::KW_FALSE)) {
        return std::make_shared<LiteralExpr>(Value::make_bool(false), l, c);
    }

    // Parentheses
    if (match(TokenType::TOKEN_LPAREN)) {
        auto expr = parse_expression();
        consume(TokenType::TOKEN_RPAREN, "Expected ')' after expression");
        return expr;
    }

    // Check for "it's a random number between X and Y" or "it's the number between X and Y"
    if (tok.type == TokenType::KW_ITS) {
        advance(); // consume it's / its
        int line = tok.line;
        int col = tok.col;
        match(TokenType::KW_A);
        match(TokenType::KW_THE);
        match(TokenType::KW_RANDOM);
        consume(TokenType::KW_NUMBER, "Expected 'number' after 'it\'s a [random]'");
        consume(TokenType::KW_BETWEEN, "Expected 'between' in random number expression");
        auto min_e = parse_term();
        consume(TokenType::KW_AND, "Expected 'and' between random bounds");
        auto max_e = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::RANDOM_BETWEEN,
                                              std::vector<std::shared_ptr<Expr>>{min_e, max_e},
                                              line, col);
    }

    // Math prefixes starting with "the", "how", "a random", "round", etc.
    if (tok.type == TokenType::KW_ROLL) {
        advance(); // consume 'roll'
        int line = tok.line;
        int col = tok.col;
        match(TokenType::KW_A);
        consume(TokenType::KW_DICE, "Expected 'dice' after 'roll'");
        std::vector<std::shared_ptr<Expr>> args;
        if (match(TokenType::KW_WITH)) {
            auto sides = parse_primary();
            match(TokenType::KW_SIDES);
            args.push_back(sides);
        }
        return std::make_shared<MathFuncExpr>(MathFunc::DICE_ROLL, args, line, col);
    }
    if (tok.type == TokenType::KW_FLIP) {
        advance(); // consume 'flip'
        int line = tok.line;
        int col = tok.col;
        match(TokenType::KW_A);
        consume(TokenType::KW_COIN, "Expected 'coin' after 'flip'");
        return std::make_shared<MathFuncExpr>(MathFunc::COIN_FLIP, std::vector<std::shared_ptr<Expr>>{}, line, col);
    }
    if (tok.type == TokenType::KW_HOW) {
        return parse_math_prefix();
    }
    if (tok.type == TokenType::KW_ROUND) {
        advance();
        auto arg = parse_primary();
        return std::make_shared<MathFuncExpr>(MathFunc::ROUND, std::vector<std::shared_ptr<Expr>>{arg}, l, c);
    }
    if (tok.type == TokenType::KW_PI) {
        advance();
        return std::make_shared<MathFuncExpr>(MathFunc::PI_CONST, std::vector<std::shared_ptr<Expr>>{}, l, c);
    }
    if (tok.type == TokenType::KW_A) {
        // e.g. "a random number between X and Y"
        return parse_math_prefix();
    }

    if (tok.type == TokenType::KW_THE) {
        // Check next token
        advance(); // consume 'the'
        Token next = peek();

        if (next.type == TokenType::KW_SQUARE || next.type == TokenType::KW_CUBE ||
            next.type == TokenType::KW_ABSOLUTE || next.type == TokenType::KW_POWER ||
            next.type == TokenType::KW_ROUND || next.type == TokenType::KW_FLOOR ||
            next.type == TokenType::KW_CEILING || next.type == TokenType::KW_CEIL ||
            next.type == TokenType::KW_SINE || next.type == TokenType::KW_SIN ||
            next.type == TokenType::KW_COSINE || next.type == TokenType::KW_COS ||
            next.type == TokenType::KW_TANGENT || next.type == TokenType::KW_TAN ||
            next.type == TokenType::KW_MINIMUM || next.type == TokenType::KW_MIN ||
            next.type == TokenType::KW_MAXIMUM || next.type == TokenType::KW_MAX ||
            next.type == TokenType::KW_LOGARITHM || next.type == TokenType::KW_LOG ||
            next.type == TokenType::KW_FACTORIAL || next.type == TokenType::KW_HYPOTENUSE ||
            next.type == TokenType::KW_VALUE || next.type == TokenType::KW_PI || next.type == TokenType::KW_E ||
            next.type == TokenType::KW_NUMBER || next.type == TokenType::KW_RANDOM) {
            current--; // rewind 'the'
            return parse_math_prefix();
        }

        if (next.type == TokenType::KW_LENGTH || next.type == TokenType::KW_UPPERCASE ||
            next.type == TokenType::KW_LOWERCASE || next.type == TokenType::KW_REVERSE ||
            next.type == TokenType::KW_FIRST || next.type == TokenType::KW_LAST ||
            next.type == TokenType::KW_TRIM || next.type == TokenType::KW_TRIMMED) {
            current--; // rewind 'the'
            return parse_string_prefix();
        }

        if (next.type == TokenType::KW_CURRENT) {
            current--; // rewind 'the'
            return parse_time_prefix();
        }

        if (next.type == TokenType::KW_SYSTEM || next.type == TokenType::KW_PLATFORM || next.type == TokenType::KW_OS) {
            current--; // rewind 'the'
            return parse_system_prefix();
        }

        current--; // rewind 'the'
    }

    // If it's an unquoted word (TOKEN_IDENTIFIER), throw LOGIC ERROR!
    // As requested: say hello -> throws logic error!
    if (tok.type == TokenType::TOKEN_IDENTIFIER) {
        advance();
        throw LogicError("Logic Error at line " + std::to_string(l) + ", col " + std::to_string(c) +
                         ": Unknown word or unquoted text '" + tok.lexeme +
                         "'. In E++, text strings must be enclosed in double quotes (e.g. \"" +
                         tok.lexeme + "\") and variables in single quotes (e.g. '" + tok.lexeme + "').",
                         l, c);
    }

    throw ParseError("Expected expression, found '" + tok.lexeme + "' at line " +
                     std::to_string(l) + ", col " + std::to_string(c), l, c);
}

// check if <expr> is [not] a number
std::shared_ptr<Expr> Parser::parse_type_check() {
    Token chk = advance(); // consume 'check'
    int line = chk.line;
    int col = chk.col;

    consume(TokenType::KW_IF, "Expected 'if' after 'check'");
    auto target = parse_term();

    consume(TokenType::KW_IS, "Expected 'is' after target expression");
    bool is_not = false;
    if (match(TokenType::KW_NOT)) {
        is_not = true;
    }

    match(TokenType::KW_A);
    consume(TokenType::KW_NUMBER, "Expected 'number' in type check expression");

    return std::make_shared<TypeCheckExpr>(target, is_not, line, col);
}

// Math prefixes
std::shared_ptr<Expr> Parser::parse_math_prefix() {
    int line = peek().line;
    int col = peek().col;

    // "how much 60 percent is of 100"
    if (match(TokenType::KW_HOW)) {
        consume(TokenType::KW_MUCH, "Expected 'much' after 'how'");
        auto pct = parse_term();
        consume(TokenType::KW_PERCENT, "Expected 'percent' after percentage value");
        consume(TokenType::KW_IS, "Expected 'is' after 'percent'");
        consume(TokenType::KW_OF, "Expected 'of' after 'is'");
        auto total = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::PERCENT_OF,
                                              std::vector<std::shared_ptr<Expr>>{pct, total},
                                              line, col);
    }

    // "a random number between X and Y" or "a number between X and Y"
    if (match(TokenType::KW_A)) {
        match(TokenType::KW_RANDOM);
        consume(TokenType::KW_NUMBER, "Expected 'number' in 'a [random] number between X and Y'");
        consume(TokenType::KW_BETWEEN, "Expected 'between' in random expression");
        auto min_e = parse_term();
        consume(TokenType::KW_AND, "Expected 'and' between random bounds");
        auto max_e = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::RANDOM_BETWEEN,
                                              std::vector<std::shared_ptr<Expr>>{min_e, max_e},
                                              line, col);
    }

    // "the ..."
    match(TokenType::KW_THE);

    // "the [random] number between X and Y"
    if (match(TokenType::KW_RANDOM)) {
        match(TokenType::KW_NUMBER);
        consume(TokenType::KW_BETWEEN, "Expected 'between' after 'the random number'");
        auto a = parse_term();
        consume(TokenType::KW_AND, "Expected 'and' between random bounds");
        auto b = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::RANDOM_BETWEEN,
                                              std::vector<std::shared_ptr<Expr>>{a, b},
                                              line, col);
    }

    if (match(TokenType::KW_NUMBER)) {
        consume(TokenType::KW_BETWEEN, "Expected 'between' after 'the number'");
        auto a = parse_term();
        consume(TokenType::KW_AND, "Expected 'and' between bounds");
        auto b = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::RANDOM_BETWEEN,
                                              std::vector<std::shared_ptr<Expr>>{a, b},
                                              line, col);
    }

    // "the square root of <expr>"
    if (match(TokenType::KW_SQUARE)) {
        consume(TokenType::KW_ROOT, "Expected 'root' after 'square'");
        consume(TokenType::KW_OF, "Expected 'of' after 'square root'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::SQRT,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the cube root of <expr>"
    if (match(TokenType::KW_CUBE)) {
        consume(TokenType::KW_ROOT, "Expected 'root' after 'cube'");
        consume(TokenType::KW_OF, "Expected 'of' after 'cube root'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::CUBE_ROOT,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the absolute value of <expr>"
    if (match(TokenType::KW_ABSOLUTE)) {
        consume(TokenType::KW_VALUE, "Expected 'value' after 'absolute'");
        consume(TokenType::KW_OF, "Expected 'of' after 'absolute value'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::ABS,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the power of X to Y"
    if (match(TokenType::KW_POWER)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'power'");
        auto base = parse_term();
        consume(TokenType::KW_TO, "Expected 'to' in 'power of X to Y'");
        auto exp = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::POW,
                                              std::vector<std::shared_ptr<Expr>>{base, exp},
                                              line, col);
    }

    // "the round of <expr>"
    if (match(TokenType::KW_ROUND)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'round'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::ROUND,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the floor of <expr>"
    if (match(TokenType::KW_FLOOR)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'floor'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::FLOOR,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the ceiling of <expr>"
    if (match(TokenType::KW_CEILING) || match(TokenType::KW_CEIL)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'ceiling'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::CEILING,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the sine of <expr>"
    if (match(TokenType::KW_SINE) || match(TokenType::KW_SIN)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'sine'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::SINE,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the cosine of <expr>"
    if (match(TokenType::KW_COSINE) || match(TokenType::KW_COS)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'cosine'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::COSINE,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the tangent of <expr>"
    if (match(TokenType::KW_TANGENT) || match(TokenType::KW_TAN)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'tangent'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::TANGENT,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the minimum of X and Y"
    if (match(TokenType::KW_MINIMUM) || match(TokenType::KW_MIN)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'minimum'");
        auto a = parse_term();
        consume(TokenType::KW_AND, "Expected 'and' between minimum values");
        auto b = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::MINIMUM,
                                              std::vector<std::shared_ptr<Expr>>{a, b},
                                              line, col);
    }

    // "the maximum of X and Y"
    if (match(TokenType::KW_MAXIMUM) || match(TokenType::KW_MAX)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'maximum'");
        auto a = parse_term();
        consume(TokenType::KW_AND, "Expected 'and' between maximum values");
        auto b = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::MAXIMUM,
                                              std::vector<std::shared_ptr<Expr>>{a, b},
                                              line, col);
    }

    // "the logarithm of <expr>"
    if (match(TokenType::KW_LOGARITHM) || match(TokenType::KW_LOG)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'logarithm'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::LOGARITHM,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the factorial of <expr>"
    if (match(TokenType::KW_FACTORIAL)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'factorial'");
        auto arg = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::FACTORIAL,
                                              std::vector<std::shared_ptr<Expr>>{arg},
                                              line, col);
    }

    // "the hypotenuse of X and Y"
    if (match(TokenType::KW_HYPOTENUSE)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'hypotenuse'");
        auto a = parse_term();
        consume(TokenType::KW_AND, "Expected 'and' between hypotenuse values");
        auto b = parse_term();
        return std::make_shared<MathFuncExpr>(MathFunc::HYPOTENUSE,
                                              std::vector<std::shared_ptr<Expr>>{a, b},
                                              line, col);
    }

    // "the value of pi" or "the value of e"
    if (match(TokenType::KW_VALUE)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'value'");
        if (match(TokenType::KW_PI)) {
            return std::make_shared<MathFuncExpr>(MathFunc::PI_CONST, std::vector<std::shared_ptr<Expr>>{}, line, col);
        }
        if (match(TokenType::KW_E)) {
            return std::make_shared<MathFuncExpr>(MathFunc::E_CONST, std::vector<std::shared_ptr<Expr>>{}, line, col);
        }
    }

    if (match(TokenType::KW_PI)) {
        return std::make_shared<MathFuncExpr>(MathFunc::PI_CONST, std::vector<std::shared_ptr<Expr>>{}, line, col);
    }
    if (match(TokenType::KW_E)) {
        return std::make_shared<MathFuncExpr>(MathFunc::E_CONST, std::vector<std::shared_ptr<Expr>>{}, line, col);
    }

    throw ParseError("Unrecognized math phrase starting with 'the' at line " +
                     std::to_string(line), line, col);
}

// String prefixes: the length of, the uppercase of, the reverse of
std::shared_ptr<Expr> Parser::parse_string_prefix() {
    int line = peek().line;
    int col = peek().col;

    match(TokenType::KW_THE);

    if (match(TokenType::KW_LENGTH)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'length'");
        auto arg = parse_term();
        return std::make_shared<StringFuncExpr>(StringFunc::LENGTH, std::vector<std::shared_ptr<Expr>>{arg}, line, col);
    }
    if (match(TokenType::KW_UPPERCASE)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'uppercase'");
        auto arg = parse_term();
        return std::make_shared<StringFuncExpr>(StringFunc::UPPERCASE, std::vector<std::shared_ptr<Expr>>{arg}, line, col);
    }
    if (match(TokenType::KW_LOWERCASE)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'lowercase'");
        auto arg = parse_term();
        return std::make_shared<StringFuncExpr>(StringFunc::LOWERCASE, std::vector<std::shared_ptr<Expr>>{arg}, line, col);
    }
    if (match(TokenType::KW_REVERSE)) {
        consume(TokenType::KW_OF, "Expected 'of' after 'reverse'");
        auto arg = parse_term();
        return std::make_shared<StringFuncExpr>(StringFunc::REVERSE, std::vector<std::shared_ptr<Expr>>{arg}, line, col);
    }
    if (match(TokenType::KW_FIRST)) {
        match(TokenType::KW_LETTER);
        consume(TokenType::KW_OF, "Expected 'of' after 'first letter'");
        auto arg = parse_term();
        return std::make_shared<StringFuncExpr>(StringFunc::FIRST_LETTER, std::vector<std::shared_ptr<Expr>>{arg}, line, col);
    }
    if (match(TokenType::KW_LAST)) {
        match(TokenType::KW_LETTER);
        consume(TokenType::KW_OF, "Expected 'of' after 'last letter'");
        auto arg = parse_term();
        return std::make_shared<StringFuncExpr>(StringFunc::LAST_LETTER, std::vector<std::shared_ptr<Expr>>{arg}, line, col);
    }
    if (match(TokenType::KW_TRIM) || match(TokenType::KW_TRIMMED)) {
        match(TokenType::KW_OF);
        auto arg = parse_term();
        return std::make_shared<StringFuncExpr>(StringFunc::TRIM, std::vector<std::shared_ptr<Expr>>{arg}, line, col);
    }

    throw ParseError("Unrecognized string phrase at line " + std::to_string(line), line, col);
}

// Time prefixes: the current time, the current date, the current year, the current timestamp
std::shared_ptr<Expr> Parser::parse_time_prefix() {
    int line = peek().line;
    int col = peek().col;

    match(TokenType::KW_THE);
    consume(TokenType::KW_CURRENT, "Expected 'current' after 'the'");

    if (match(TokenType::KW_TIME)) {
        return std::make_shared<TimeFuncExpr>(TimeFunc::CURRENT_TIME, line, col);
    }
    if (match(TokenType::KW_DATE)) {
        return std::make_shared<TimeFuncExpr>(TimeFunc::CURRENT_DATE, line, col);
    }
    if (match(TokenType::KW_YEAR)) {
        return std::make_shared<TimeFuncExpr>(TimeFunc::CURRENT_YEAR, line, col);
    }
    if (match(TokenType::KW_TIMESTAMP)) {
        return std::make_shared<TimeFuncExpr>(TimeFunc::CURRENT_TIMESTAMP, line, col);
    }

    throw ParseError("Expected 'time', 'date', 'year', or 'timestamp' after 'the current'", line, col);
}

// System prefixes: the operating system, the system platform, the platform
std::shared_ptr<Expr> Parser::parse_system_prefix() {
    int line = peek().line;
    int col = peek().col;

    match(TokenType::KW_THE);
    if (match(TokenType::KW_SYSTEM)) {
        if (match(TokenType::KW_PLATFORM)) {
            return std::make_shared<SystemFuncExpr>(SystemFunc::PLATFORM, line, col);
        }
        if (match(TokenType::KW_OS)) {
            return std::make_shared<SystemFuncExpr>(SystemFunc::OS_NAME, line, col);
        }
    }
    if (match(TokenType::KW_PLATFORM)) {
        return std::make_shared<SystemFuncExpr>(SystemFunc::PLATFORM, line, col);
    }
    if (match(TokenType::KW_OS)) {
        return std::make_shared<SystemFuncExpr>(SystemFunc::OS_NAME, line, col);
    }

    throw ParseError("Expected 'platform' or 'os' after 'the'", line, col);
}

} // namespace epp
