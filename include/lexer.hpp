#ifndef EPP_LEXER_HPP
#define EPP_LEXER_HPP

#include <string>
#include <vector>
#include <unordered_map>
#include <iostream>

namespace epp {

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

class Lexer {
public:
    explicit Lexer(const std::string& source);
    std::vector<Token> tokenize();

    static std::string token_type_name(TokenType t);
    static std::string to_lower(const std::string& s);

private:
    std::string src;
    size_t cursor = 0;
    int line = 1;
    int col = 1;

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
