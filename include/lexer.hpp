#ifndef EPP_LEXER_HPP
#define EPP_LEXER_HPP

#include <string>
#include <vector>
#include <unordered_map>
#include <iostream>
#include <stdexcept>

namespace epp {

// Release 1.4b1: every lexer failure is one of the fatal codes F001-F015.
// A fatal error means the lexer cannot build a token stream, so the parser and
// the program never run. `name` is the English catalogue name of the code and
// `help` is the one-line fix shown under the reason.
class LexError : public std::runtime_error {
public:
    int line, col;
    std::string code;
    std::string name;
    std::string help;
    LexError(const std::string& message, int l, int c, const std::string& error_code = "F003",
             const std::string& error_name = "Unrecognised Character",
             const std::string& error_help = "E++ uses words for maths. Remove or replace this character.")
        : std::runtime_error(message), line(l), col(c), code(error_code),
          name(error_name), help(error_help) {}
};

enum class TokenType {
    // End of file / line
    TOKEN_EOF,
    TOKEN_NEWLINE,

    // Literals
    TOKEN_NUMBER,
    TOKEN_STRING,       // "double quotes"
    TOKEN_VARIABLE,     // 'single quotes'
    TOKEN_IDENTIFIER,   // unquoted word
    TOKEN_PYTHON_BLOCK, // raw multi-line Python block

    // Punctuation & math symbols
    TOKEN_COMMA,
    TOKEN_LPAREN,
    TOKEN_RPAREN,
    TOKEN_COLON,
    TOKEN_EXCLAMATION,
    TOKEN_QUESTION,
    TOKEN_PLUS_SYM,
    TOKEN_MINUS_SYM,
    TOKEN_STAR_SYM,
    TOKEN_SLASH_SYM,
    TOKEN_PERCENT_SYM,

    // General English keywords
    KW_SAY,
    KW_TELL,
    KW_LET,
    KW_BE,
    KW_SET,
    KW_TO,
    KW_DEFINE,
    KW_NOTE,
    KW_ITS,
    KW_RUN,
    KW_PYTHON,
    KW_CODE,
    KW_ASK,
    KW_AND,
    KW_SAVE,
    KW_THE,
    KW_OUTPUT,
    KW_ANSWER,
    KW_RESULT,
    KW_AS,
    KW_IN,
    KW_ADD,
    KW_LIBRARY,

    // Type checking keywords
    KW_CHECK,
    KW_IF,
    KW_IS,
    KW_NOT,
    KW_A,
    KW_NUMBER,

    // Arithmetic words
    KW_PLUS,
    KW_MINUS,
    KW_TIMES,
    KW_MULTIPLIED,
    KW_DIVIDED,
    KW_BY,
    KW_MODULO,
    KW_MOD,

    // Concatenation & separation
    KW_CONCAT,
    KW_IT,
    KW_WITH,
    KW_SEPARATION,      // covers both "separation" and "seperation"
    KW_METHOD,
    KW_OF,

    // Control flow
    KW_THEN,
    KW_ELSE,
    KW_OTHERWISE,
    KW_END,
    KW_REPEAT,
    KW_WHILE,
    KW_DO,
    KW_EQUALS,
    KW_EQUAL,
    KW_GREATER,
    KW_LESS,
    KW_THAN,
    KW_TRUE,
    KW_FALSE,

    // Math Library words
    KW_SQUARE,
    KW_ROOT,
    KW_CUBE,
    KW_HOW,
    KW_MUCH,
    KW_PERCENT,
    KW_ABSOLUTE,
    KW_VALUE,
    KW_POWER,
    KW_RAISED,
    KW_ROUND,
    KW_FLOOR,
    KW_CEILING,
    KW_CEIL,
    KW_SINE,
    KW_SIN,
    KW_COSINE,
    KW_COS,
    KW_TANGENT,
    KW_TAN,
    KW_MINIMUM,
    KW_MIN,
    KW_MAXIMUM,
    KW_MAX,
    KW_RANDOM,
    KW_BETWEEN,
    KW_LOGARITHM,
    KW_LOG,
    KW_NATURAL,
    KW_FACTORIAL,
    KW_HYPOTENUSE,
    KW_PI,
    KW_E,

    // String & Time library words
    KW_LENGTH,
    KW_UPPERCASE,
    KW_LOWERCASE,
    KW_REVERSE,
    KW_FIRST,
    KW_LAST,
    KW_LETTER,
    KW_REPLACE,
    KW_CURRENT,
    KW_TIME,
    KW_DATE,
    KW_YEAR,
    KW_TIMESTAMP,
    KW_TRIM,
    KW_TRIMMED,
    KW_WAIT,
    KW_SLEEP,
    KW_SECOND,
    KW_SECONDS,
    KW_MILLISECOND,
    KW_MILLISECONDS,

    // File, System, Colors, Console library words
    KW_FILE,
    KW_FILES,
    KW_READ,
    KW_WRITE,
    KW_APPEND,
    KW_EXISTS,
    KW_SYSTEM,
    KW_COMMAND,
    KW_PLATFORM,
    KW_OS,
    KW_CLEAR,
    KW_CONSOLE,
    KW_SCREEN,
    KW_RED,
    KW_GREEN,
    KW_BLUE,
    KW_YELLOW,
    KW_CYAN,
    KW_MAGENTA,
    KW_ROLL,
    KW_DICE,
    KW_FLIP,
    KW_COIN,
    KW_SIDES
};

struct Token {
    TokenType type;
    std::string lexeme;
    double number_value = 0.0;
    std::string string_value;
    int line = 1;
    int col = 1;

    Token() : type(TokenType::TOKEN_EOF), line(1), col(1) {}
    Token(TokenType t, const std::string& lex, int l, int c)
        : type(t), lexeme(lex), line(l), col(c) {}
};

// The browser build cannot use C++ exceptions, so both builds record the same
// lexical issue first. The native API still throws LexError from tokenize().
struct LexIssue {
    std::string message;
    std::string code;
    std::string name;   // the catalogue name of the code
    std::string help;   // the catalogue fix for the code
    int line = 1;
    int col = 1;
};

class Lexer {
public:
    explicit Lexer(const std::string& source);
    std::vector<Token> tokenize();
    bool has_error() const { return failed; }
    const LexIssue& error() const { return issue; }

    static std::string token_type_name(TokenType t);
    static std::string to_lower(const std::string& s);

private:
    // The largest program the lexer will accept, so a runaway paste cannot
    // exhaust the browser's memory. Exceeding it is fatal (F002).
    static const size_t MAX_SOURCE_LENGTH = 4u * 1024u * 1024u;
    // Words are bounded too: a 10 MB "word" is never a mistake a person made.
    static const size_t MAX_WORD_LENGTH = 256;

    std::string src;
    size_t cursor = 0;
    int line = 1;
    int col = 1;
    bool failed = false;
    bool source_invalid = false;  // F001: the caller handed over no program
    LexIssue issue;
    void report_error(const std::string& message, int l, int c, const std::string& code = "F003");
    void report_catalogue(const std::string& code, int l, int c);
    static const char* catalogue_name(const std::string& code);
    static const char* catalogue_help(const std::string& code);

    bool is_at_end() const;
    char peek() const;
    char peek_next() const;
    char advance();
    bool match(char expected);

    void skip_whitespace_and_comments();
    Token scan_token();
    Token scan_number();
    Token scan_string();
    Token scan_variable();
    Token scan_word();

    static const std::unordered_map<std::string, TokenType> keywords;
};

// Release 1.2 project files live in vault.hpp: save_project / load_project /
// open_vault / is_vault.

} // namespace epp

#endif // EPP_LEXER_HPP
