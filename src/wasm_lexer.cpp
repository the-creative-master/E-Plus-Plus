// Browser ABI for the *same* lexer used by the native CLI (src/lexer.cpp).
// Saved projects are decrypted by Studio before this interface receives them.
// EPP_BROWSER_PLAINTEXT makes lexer errors available as data rather than C++
// exceptions, which keeps the WebAssembly build portable across browsers.
#include "lexer.hpp"

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

namespace {
std::string result;

void quoted(std::string& out, const std::string& text) {
    static const char hex[] = "0123456789abcdef";
    out.push_back('"');
    for (unsigned char ch : text) {
        switch (ch) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (ch < 0x20) {
                    out += "\\u00";
                    out.push_back(hex[ch >> 4]);
                    out.push_back(hex[ch & 15]);
                } else {
                    out.push_back(static_cast<char>(ch));
                }
        }
    }
    out.push_back('"');
}

void integer(std::string& out, int value) {
    out += std::to_string(value);
}
}

extern "C" {
void* epp_lexer_alloc(size_t size) { return std::malloc(size); }
void epp_lexer_free(void* address) { std::free(address); }

// The return value remains valid until the next call. The host copies it out
// before freeing the source buffer. No output is selected from examples.
const char* epp_lexer_tokenize(const char* source, size_t size) {
    epp::Lexer lexer(std::string(source, size));
    const std::vector<epp::Token> tokens = lexer.tokenize();
    result.clear();
    if (lexer.has_error()) {
        const epp::LexIssue& issue = lexer.error();
        result += "{\"ok\":false,\"error\":{\"code\":";
        quoted(result, issue.code);
        result += ",\"message\":";
        quoted(result, issue.message);
        result += ",\"line\":";
        integer(result, issue.line);
        result += ",\"column\":";
        integer(result, issue.col);
        result += "}}";
        return result.c_str();
    }
    result += "{\"ok\":true,\"tokens\":[";
    bool first = true;
    for (const epp::Token& token : tokens) {
        if (!first) result.push_back(',');
        first = false;
        result += "{\"type\":";
        quoted(result, epp::Lexer::token_type_name(token.type));
        result += ",\"kind\":";
        integer(result, static_cast<int>(token.type));
        result += ",\"lexeme\":";
        quoted(result, token.lexeme);
        result += ",\"value\":";
        if (token.type == epp::TokenType::TOKEN_NUMBER) {
            char number[64];
            std::snprintf(number, sizeof(number), "%.17g", token.number_value);
            result += number;
        } else {
            quoted(result, token.string_value);
        }
        result += ",\"line\":";
        integer(result, token.line);
        result += ",\"column\":";
        integer(result, token.col);
        result.push_back('}');
    }
    result += "]}";
    return result.c_str();
}
}

#ifdef EPP_LEXER_TEST_MAIN
#include <iostream>
#include <iterator>
int main() {
    const std::string source{std::istreambuf_iterator<char>(std::cin), std::istreambuf_iterator<char>()};
    std::cout << epp_lexer_tokenize(source.data(), source.size()) << '\n';
}
#endif
