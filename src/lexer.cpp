#include "vault.hpp"
#include "lexer.hpp"
#include <cctype>
#include <algorithm>
#include <stdexcept>
#include <cstdint>
#include <chrono>
#include <sstream>
#include <vector>

namespace epp {

const std::unordered_map<std::string, TokenType> Lexer::keywords = {
    {"say", TokenType::KW_SAY},
    {"tell", TokenType::KW_TELL},
    {"let", TokenType::KW_LET},
    {"be", TokenType::KW_BE},
    {"set", TokenType::KW_SET},
    {"to", TokenType::KW_TO},
    {"define", TokenType::KW_DEFINE},
    {"note", TokenType::KW_NOTE},
    {"it's", TokenType::KW_ITS},
    {"its", TokenType::KW_ITS},
    {"run", TokenType::KW_RUN},
    {"python", TokenType::KW_PYTHON},
    {"code", TokenType::KW_CODE},
    {"ask", TokenType::KW_ASK},
    {"and", TokenType::KW_AND},
    {"save", TokenType::KW_SAVE},
    {"the", TokenType::KW_THE},
    {"output", TokenType::KW_OUTPUT},
    {"answer", TokenType::KW_ANSWER},
    {"result", TokenType::KW_RESULT},
    {"as", TokenType::KW_AS},
    {"in", TokenType::KW_IN},
    {"add", TokenType::KW_ADD},
    {"library", TokenType::KW_LIBRARY},

    {"check", TokenType::KW_CHECK},
    {"if", TokenType::KW_IF},
    {"is", TokenType::KW_IS},
    {"not", TokenType::KW_NOT},
    {"a", TokenType::KW_A},
    {"number", TokenType::KW_NUMBER},

    {"plus", TokenType::KW_PLUS},
    {"minus", TokenType::KW_MINUS},
    {"times", TokenType::KW_TIMES},
    {"multiplied", TokenType::KW_MULTIPLIED},
    {"divided", TokenType::KW_DIVIDED},
    {"by", TokenType::KW_BY},
    {"modulo", TokenType::KW_MODULO},
    {"mod", TokenType::KW_MOD},

    {"concat", TokenType::KW_CONCAT},
    {"it", TokenType::KW_IT},
    {"with", TokenType::KW_WITH},
    {"separation", TokenType::KW_SEPARATION},
    {"seperation", TokenType::KW_SEPARATION},
    {"method", TokenType::KW_METHOD},
    {"of", TokenType::KW_OF},

    {"then", TokenType::KW_THEN},
    {"else", TokenType::KW_ELSE},
    {"otherwise", TokenType::KW_OTHERWISE},
    {"end", TokenType::KW_END},
    {"repeat", TokenType::KW_REPEAT},
    {"while", TokenType::KW_WHILE},
    {"do", TokenType::KW_DO},
    {"equals", TokenType::KW_EQUALS},
    {"equal", TokenType::KW_EQUAL},
    {"greater", TokenType::KW_GREATER},
    {"less", TokenType::KW_LESS},
    {"than", TokenType::KW_THAN},
    {"true", TokenType::KW_TRUE},
    {"false", TokenType::KW_FALSE},

    {"square", TokenType::KW_SQUARE},
    {"root", TokenType::KW_ROOT},
    {"cube", TokenType::KW_CUBE},
    {"how", TokenType::KW_HOW},
    {"much", TokenType::KW_MUCH},
    {"percent", TokenType::KW_PERCENT},
    {"absolute", TokenType::KW_ABSOLUTE},
    {"value", TokenType::KW_VALUE},
    {"power", TokenType::KW_POWER},
    {"raised", TokenType::KW_RAISED},
    {"round", TokenType::KW_ROUND},
    {"floor", TokenType::KW_FLOOR},
    {"ceiling", TokenType::KW_CEILING},
    {"ceil", TokenType::KW_CEIL},
    {"sine", TokenType::KW_SINE},
    {"sin", TokenType::KW_SIN},
    {"cosine", TokenType::KW_COSINE},
    {"cos", TokenType::KW_COS},
    {"tangent", TokenType::KW_TANGENT},
    {"tan", TokenType::KW_TAN},
    {"minimum", TokenType::KW_MINIMUM},
    {"min", TokenType::KW_MIN},
    {"maximum", TokenType::KW_MAXIMUM},
    {"max", TokenType::KW_MAX},
    {"random", TokenType::KW_RANDOM},
    {"between", TokenType::KW_BETWEEN},
    {"logarithm", TokenType::KW_LOGARITHM},
    {"log", TokenType::KW_LOG},
    {"natural", TokenType::KW_NATURAL},
    {"factorial", TokenType::KW_FACTORIAL},
    {"hypotenuse", TokenType::KW_HYPOTENUSE},
    {"pi", TokenType::KW_PI},
    {"e", TokenType::KW_E},

    {"length", TokenType::KW_LENGTH},
    {"uppercase", TokenType::KW_UPPERCASE},
    {"lowercase", TokenType::KW_LOWERCASE},
    {"reverse", TokenType::KW_REVERSE},
    {"first", TokenType::KW_FIRST},
    {"last", TokenType::KW_LAST},
    {"letter", TokenType::KW_LETTER},
    {"replace", TokenType::KW_REPLACE},
    {"current", TokenType::KW_CURRENT},
    {"time", TokenType::KW_TIME},
    {"date", TokenType::KW_DATE},
    {"year", TokenType::KW_YEAR},
    {"timestamp", TokenType::KW_TIMESTAMP},
    {"trim", TokenType::KW_TRIM},
    {"trimmed", TokenType::KW_TRIMMED},
    {"wait", TokenType::KW_WAIT},
    {"sleep", TokenType::KW_SLEEP},
    {"second", TokenType::KW_SECOND},
    {"seconds", TokenType::KW_SECONDS},
    {"millisecond", TokenType::KW_MILLISECOND},
    {"milliseconds", TokenType::KW_MILLISECONDS},

    {"file", TokenType::KW_FILE},
    {"files", TokenType::KW_FILES},
    {"read", TokenType::KW_READ},
    {"write", TokenType::KW_WRITE},
    {"append", TokenType::KW_APPEND},
    {"exists", TokenType::KW_EXISTS},
    {"system", TokenType::KW_SYSTEM},
    {"command", TokenType::KW_COMMAND},
    {"platform", TokenType::KW_PLATFORM},
    {"os", TokenType::KW_OS},
    {"clear", TokenType::KW_CLEAR},
    {"console", TokenType::KW_CONSOLE},
    {"screen", TokenType::KW_SCREEN},
    {"red", TokenType::KW_RED},
    {"green", TokenType::KW_GREEN},
    {"blue", TokenType::KW_BLUE},
    {"yellow", TokenType::KW_YELLOW},
    {"cyan", TokenType::KW_CYAN},
    {"magenta", TokenType::KW_MAGENTA},
    {"roll", TokenType::KW_ROLL},
    {"dice", TokenType::KW_DICE},
    {"flip", TokenType::KW_FLIP},
    {"coin", TokenType::KW_COIN},
    {"sides", TokenType::KW_SIDES}
};

std::string Lexer::to_lower(const std::string& s) {
    std::string res = s;
    std::transform(res.begin(), res.end(), res.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return res;
}

Lexer::Lexer(const std::string& source) : src(source) {
    // Release 1.2: a sealed project is opened with the keyring before lexing.
    if (is_vault(src)) {
        src = open_vault(src);
    }
}

bool Lexer::is_at_end() const {
    return cursor >= src.size();
}

char Lexer::peek() const {
    if (is_at_end()) return '\0';
    return src[cursor];
}

char Lexer::peek_next() const {
    if (cursor + 1 >= src.size()) return '\0';
    return src[cursor + 1];
}

char Lexer::advance() {
    if (is_at_end()) return '\0';
    char c = src[cursor++];
    if (c == '\n') {
        line++;
        col = 1;
    } else {
        col++;
    }
    return c;
}

bool Lexer::match(char expected) {
    if (is_at_end() || src[cursor] != expected) return false;
    advance();
    return true;
}

void Lexer::skip_whitespace_and_comments() {
    while (!is_at_end()) {
        char c = peek();
        if (c == ' ' || c == '\t' || c == '\r') {
            advance();
        } else if (c == '/' && peek_next() == '/') {
            int err_line = line;
            int err_col = col;
            throw std::runtime_error("Syntax Error at line " + std::to_string(err_line) +
                                     ", col " + std::to_string(err_col) +
                                     ": E++ does not use '// note'. Notes must use the syntax: note [Note]");
        } else if (c == '#') {
            int err_line = line;
            int err_col = col;
            throw std::runtime_error("Syntax Error at line " + std::to_string(err_line) +
                                     ", col " + std::to_string(err_col) +
                                     ": E++ does not use '#' comments. Notes must use the syntax: note [Note]");
        } else {
            break;
        }
    }
}

static bool is_py_block_header(const std::string& s, size_t pos) {
    auto skip_ws = [&](size_t& p) {
        while (p < s.size() && (s[p] == ' ' || s[p] == '\t')) p++;
    };
    auto match_kw = [&](size_t& p, const std::string& kw) -> bool {
        skip_ws(p);
        if (p + kw.size() <= s.size()) {
            std::string sub = s.substr(p, kw.size());
            for (char& ch : sub) ch = std::tolower(ch);
            if (sub == kw) {
                size_t after = p + kw.size();
                if (after == s.size() || !isalnum(static_cast<unsigned char>(s[after]))) {
                    p = after;
                    return true;
                }
            }
        }
        return false;
    };
    match_kw(pos, "run");
    match_kw(pos, "the");
    if (!match_kw(pos, "python")) return false;
    if (!match_kw(pos, "code")) return false;
    skip_ws(pos);
    if (pos < s.size() && s[pos] == ':') {
        pos++;
        skip_ws(pos);
        if (pos < s.size() && s[pos] == '\n') {
            return true;
        }
    }
    return false;
}

std::vector<Token> Lexer::tokenize() {
    std::vector<Token> tokens;
    while (!is_at_end()) {
        skip_whitespace_and_comments();
        if (is_at_end()) break;

        char c = peek();
        if (c == '\n') {
            int start_line = line;
            int start_col = col;
            advance();
            // Don't add duplicate newlines
            if (!tokens.empty() && tokens.back().type != TokenType::TOKEN_NEWLINE) {
                tokens.emplace_back(TokenType::TOKEN_NEWLINE, "\n", start_line, start_col);
            }
            continue;
        }

        // Check for dedicated raw Python block
        if (is_py_block_header(src, cursor)) {
            int start_l = line;
            int start_c = col;
            while (!is_at_end() && peek() != '\n') advance();
            if (!is_at_end() && peek() == '\n') advance();

            tokens.emplace_back(TokenType::KW_RUN, "run", start_l, start_c);
            tokens.emplace_back(TokenType::KW_PYTHON, "python", start_l, start_c);
            tokens.emplace_back(TokenType::KW_CODE, "code", start_l, start_c);
            tokens.emplace_back(TokenType::TOKEN_COLON, ":", start_l, start_c);
            tokens.emplace_back(TokenType::TOKEN_NEWLINE, "\n", start_l, start_c);

            std::string py_block = "";
            int py_start_line = line;

            while (!is_at_end()) {
                size_t temp = cursor;
                while (temp < src.size() && (src[temp] == ' ' || src[temp] == '\t')) temp++;
                size_t indent_len = temp - cursor;
                if (temp < src.size() && src[temp] != '\n' && src[temp] != '\r') {
                    size_t w_end = temp;
                    while (w_end < src.size() && (isalnum(static_cast<unsigned char>(src[w_end])) || src[w_end] == '_')) w_end++;
                    std::string first_w = src.substr(temp, w_end - temp);
                    for (char& ch : first_w) ch = std::tolower(ch);
                    if (indent_len == 0 && (first_w == "say" || first_w == "tell" || first_w == "let" ||
                        first_w == "set" || first_w == "define" || first_w == "ask" || first_w == "add" ||
                        first_w == "note" || first_w == "run" || first_w == "if" || first_w == "otherwise")) {
                        break;
                    }
                }
                while (!is_at_end() && peek() != '\n') {
                    py_block += advance();
                }
                if (!is_at_end() && peek() == '\n') {
                    py_block += advance();
                }
            }

            Token tok(TokenType::TOKEN_PYTHON_BLOCK, py_block, py_start_line, 1);
            tok.string_value = py_block;
            tokens.push_back(tok);
            continue;
        }

        tokens.push_back(scan_token());
    }

    tokens.emplace_back(TokenType::TOKEN_EOF, "", line, col);
    return tokens;
}

Token Lexer::scan_token() {
    skip_whitespace_and_comments();
    int start_line = line;
    int start_col = col;
    char c = advance();

    switch (c) {
        case ',': return Token(TokenType::TOKEN_COMMA, ",", start_line, start_col);
        case '(': return Token(TokenType::TOKEN_LPAREN, "(", start_line, start_col);
        case ')': return Token(TokenType::TOKEN_RPAREN, ")", start_line, start_col);
        case ':': return Token(TokenType::TOKEN_COLON, ":", start_line, start_col);
        case '!': return Token(TokenType::TOKEN_EXCLAMATION, "!", start_line, start_col);
        case '?': return Token(TokenType::TOKEN_QUESTION, "?", start_line, start_col);
        case '+': return Token(TokenType::TOKEN_PLUS_SYM, "+", start_line, start_col);
        case '-': return Token(TokenType::TOKEN_MINUS_SYM, "-", start_line, start_col);
        case '*': return Token(TokenType::TOKEN_STAR_SYM, "*", start_line, start_col);
        case '/': return Token(TokenType::TOKEN_SLASH_SYM, "/", start_line, start_col);
        case '%': return Token(TokenType::TOKEN_PERCENT_SYM, "%", start_line, start_col);

        case '"': {
            cursor--; // rewind
            col--;
            return scan_string();
        }
        case '\'': {
            cursor--; // rewind
            col--;
            return scan_variable();
        }

        default: {
            if (std::isdigit(static_cast<unsigned char>(c))) {
                cursor--; // rewind
                col--;
                return scan_number();
            }
            if (std::isalpha(static_cast<unsigned char>(c)) || c == '_') {
                cursor--; // rewind
                col--;
                return scan_word();
            }

            std::string s(1, c);
            return Token(TokenType::TOKEN_IDENTIFIER, s, start_line, start_col);
        }
    }
}

Token Lexer::scan_number() {
    int start_line = line;
    int start_col = col;
    std::string text;

    while (!is_at_end() && std::isdigit(static_cast<unsigned char>(peek()))) {
        text.push_back(advance());
    }

    if (peek() == '.' && std::isdigit(static_cast<unsigned char>(peek_next()))) {
        text.push_back(advance()); // Consume '.'
        while (!is_at_end() && std::isdigit(static_cast<unsigned char>(peek()))) {
            text.push_back(advance());
        }
    }

    Token tok(TokenType::TOKEN_NUMBER, text, start_line, start_col);
    try {
        tok.number_value = std::stod(text);
    } catch (...) {
        tok.number_value = 0.0;
    }
    return tok;
}

Token Lexer::scan_string() {
    int start_line = line;
    int start_col = col;
    size_t start_pos = cursor;
    advance(); // Consume opening '"'
    std::string text;

    while (!is_at_end() && peek() != '"') {
        char c = peek();
        if (c == '\\') {
            advance();
            if (is_at_end()) break;
            char esc = advance();
            if (esc == 'n') text.push_back('\n');
            else if (esc == 't') text.push_back('\t');
            else if (esc == 'r') text.push_back('\r');
            else if (esc == '"') text.push_back('"');
            else if (esc == '\\') text.push_back('\\');
            else text.push_back(esc);
        } else {
            text.push_back(advance());
        }
    }

    if (is_at_end()) {
        std::cerr << "Warning at line " << start_line << ": Unterminated string literal!\n";
    } else {
        advance(); // Consume closing '"'
    }

    std::string raw_lexeme = src.substr(start_pos, cursor - start_pos);
    Token tok(TokenType::TOKEN_STRING, raw_lexeme, start_line, start_col);
    tok.string_value = text;
    return tok;
}

Token Lexer::scan_variable() {
    int start_line = line;
    int start_col = col;
    advance(); // Consume opening '\''
    std::string text;

    while (!is_at_end() && peek() != '\'') {
        char c = advance();
        text.push_back(c);
    }

    if (is_at_end()) {
        std::cerr << "Warning at line " << start_line << ": Unterminated variable name in single quotes!\n";
    } else {
        advance(); // Consume closing '\''
    }

    Token tok(TokenType::TOKEN_VARIABLE, "'" + text + "'", start_line, start_col);
    tok.string_value = text; // variable name
    return tok;
}

Token Lexer::scan_word() {
    int start_line = line;
    int start_col = col;
    std::string text;

    while (!is_at_end()) {
        char c = peek();
        if (std::isalnum(static_cast<unsigned char>(c)) || c == '_') {
            text.push_back(advance());
        } else {
            break;
        }
    }

    // Check for "it's"
    if (to_lower(text) == "it" && peek() == '\'' && (peek_next() == 's' || peek_next() == 'S')) {
        advance(); // consume '\''
        advance(); // consume 's'
        text = "it's";
    }

    std::string lower = to_lower(text);
    if (lower == "note") {
        // Must use note [Note]
        skip_whitespace_and_comments();
        if (peek() == '[') {
            advance(); // consume '['
            std::string note_text = "";
            while (!is_at_end() && peek() != ']') {
                note_text += advance();
            }
            if (peek() == ']') {
                advance(); // consume ']'
            }
            Token tok(TokenType::KW_NOTE, "note [" + note_text + "]", start_line, start_col);
            tok.string_value = note_text;
            return tok;
        } else {
            throw std::runtime_error("Syntax Error at line " + std::to_string(start_line) +
                                     ", col " + std::to_string(start_col) +
                                     ": Notes in E++ must use the syntax: note [Note]");
        }
    }

    auto it = keywords.find(lower);
    if (it != keywords.end()) {
        return Token(it->second, text, start_line, start_col);
    }

    // Unquoted identifier/word
    Token tok(TokenType::TOKEN_IDENTIFIER, text, start_line, start_col);
    tok.string_value = text;
    return tok;
}

std::string Lexer::token_type_name(TokenType t) {
    switch (t) {
        case TokenType::TOKEN_EOF: return "EOF";
        case TokenType::TOKEN_NEWLINE: return "NEWLINE";
        case TokenType::TOKEN_NUMBER: return "NUMBER";
        case TokenType::TOKEN_STRING: return "STRING";
        case TokenType::TOKEN_VARIABLE: return "VARIABLE";
        case TokenType::TOKEN_IDENTIFIER: return "IDENTIFIER";
        case TokenType::TOKEN_COMMA: return ",";
        case TokenType::TOKEN_LPAREN: return "(";
        case TokenType::TOKEN_RPAREN: return ")";
        case TokenType::TOKEN_COLON: return ":";
        case TokenType::TOKEN_EXCLAMATION: return "!";
        case TokenType::TOKEN_QUESTION: return "?";
        case TokenType::TOKEN_PLUS_SYM: return "+";
        case TokenType::TOKEN_MINUS_SYM: return "-";
        case TokenType::TOKEN_STAR_SYM: return "*";
        case TokenType::TOKEN_SLASH_SYM: return "/";
        case TokenType::TOKEN_PERCENT_SYM: return "%";
        case TokenType::KW_SAY: return "say";
        case TokenType::KW_TELL: return "tell";
        case TokenType::KW_LET: return "let";
        case TokenType::KW_BE: return "be";
        case TokenType::KW_SET: return "set";
        case TokenType::KW_TO: return "to";
        case TokenType::KW_ASK: return "ask";
        case TokenType::KW_AND: return "and";
        case TokenType::KW_SAVE: return "save";
        case TokenType::KW_THE: return "the";
        case TokenType::KW_OUTPUT: return "output";
        case TokenType::KW_ANSWER: return "answer";
        case TokenType::KW_RESULT: return "result";
        case TokenType::KW_AS: return "as";
        case TokenType::KW_IN: return "in";
        case TokenType::KW_ADD: return "add";
        case TokenType::KW_LIBRARY: return "library";
        case TokenType::KW_CHECK: return "check";
        case TokenType::KW_IF: return "if";
        case TokenType::KW_IS: return "is";
        case TokenType::KW_NOT: return "not";
        case TokenType::KW_A: return "a";
        case TokenType::KW_NUMBER: return "number";
        case TokenType::KW_PLUS: return "plus";
        case TokenType::KW_MINUS: return "minus";
        case TokenType::KW_TIMES: return "times";
        case TokenType::KW_MULTIPLIED: return "multiplied";
        case TokenType::KW_DIVIDED: return "divided";
        case TokenType::KW_BY: return "by";
        case TokenType::KW_MODULO: return "modulo";
        case TokenType::KW_MOD: return "mod";
        case TokenType::KW_CONCAT: return "concat";
        case TokenType::KW_IT: return "it";
        case TokenType::KW_WITH: return "with";
        case TokenType::KW_SEPARATION: return "separation";
        case TokenType::KW_METHOD: return "method";
        case TokenType::KW_OF: return "of";
        case TokenType::TOKEN_PYTHON_BLOCK: return "PYTHON_BLOCK";
        default: return "KEYWORD";
    }
}

} // namespace epp
