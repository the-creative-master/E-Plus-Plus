#include "json.hpp"

#include <cmath>
#include <cstdio>
#include <sstream>

namespace epp {
namespace {

struct Parser {
    const std::string& text;
    size_t pos = 0;
    std::string error;

    explicit Parser(const std::string& source) : text(source) {}

    bool fail(const std::string& message) {
        if (error.empty()) {
            std::ostringstream out;
            out << "line " << line() << ": " << message;
            error = out.str();
        }
        return false;
    }

    int line() const {
        int count = 1;
        for (size_t i = 0; i < pos && i < text.size(); ++i) {
            if (text[i] == '\n') ++count;
        }
        return count;
    }

    void skipSpace() {
        while (pos < text.size() && (text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\n' || text[pos] == '\r')) ++pos;
    }

    bool literal(const char* word) {
        size_t length = 0;
        while (word[length]) ++length;
        if (text.compare(pos, length, word) == 0) { pos += length; return true; }
        return false;
    }

    bool parseValue(Json& out) {
        skipSpace();
        if (pos >= text.size()) return fail("value expected");
        char c = text[pos];
        if (c == '{') return parseObject(out);
        if (c == '[') return parseArray(out);
        if (c == '"') { std::string s; if (!parseString(s)) return false; out = Json(s); return true; }
        if (literal("true")) { out = Json(true); return true; }
        if (literal("false")) { out = Json(false); return true; }
        if (literal("null")) { out = Json(); return true; }
        return parseNumber(out);
    }

    bool parseObject(Json& out) {
        ++pos;
        out = Json::object();
        skipSpace();
        if (pos < text.size() && text[pos] == '}') { ++pos; return true; }
        while (true) {
            skipSpace();
            std::string key;
            if (pos >= text.size() || text[pos] != '"') return fail("object key expected");
            if (!parseString(key)) return false;
            skipSpace();
            if (pos >= text.size() || text[pos] != ':') return fail("':' expected");
            ++pos;
            Json value;
            if (!parseValue(value)) return false;
            out.set(key, value);
            skipSpace();
            if (pos < text.size() && text[pos] == ',') { ++pos; continue; }
            if (pos < text.size() && text[pos] == '}') { ++pos; return true; }
            return fail("',' or '}' expected");
        }
    }

    bool parseArray(Json& out) {
        ++pos;
        out = Json::array();
        skipSpace();
        if (pos < text.size() && text[pos] == ']') { ++pos; return true; }
        while (true) {
            Json value;
            if (!parseValue(value)) return false;
            out.push(value);
            skipSpace();
            if (pos < text.size() && text[pos] == ',') { ++pos; continue; }
            if (pos < text.size() && text[pos] == ']') { ++pos; return true; }
            return fail("',' or ']' expected");
        }
    }

    bool parseString(std::string& out) {
        ++pos;
        out.clear();
        while (pos < text.size()) {
            char c = text[pos++];
            if (c == '"') return true;
            if (c != '\\') { out.push_back(c); continue; }
            if (pos >= text.size()) break;
            char esc = text[pos++];
            switch (esc) {
                case 'n': out.push_back('\n'); break;
                case 't': out.push_back('\t'); break;
                case 'r': out.push_back('\r'); break;
                case 'b': out.push_back('\b'); break;
                case 'f': out.push_back('\f'); break;
                case '"': out.push_back('"'); break;
                case '\\': out.push_back('\\'); break;
                case '/': out.push_back('/'); break;
                case 'u': {
                    unsigned code = 0;
                    for (int i = 0; i < 4 && pos < text.size(); ++i) {
                        char h = text[pos++];
                        code <<= 4;
                        if (h >= '0' && h <= '9') code |= unsigned(h - '0');
                        else if (h >= 'a' && h <= 'f') code |= unsigned(h - 'a' + 10);
                        else if (h >= 'A' && h <= 'F') code |= unsigned(h - 'A' + 10);
                    }
                    if (code < 0x80) {
                        out.push_back(char(code));
                    } else if (code < 0x800) {
                        out.push_back(char(0xC0 | (code >> 6)));
                        out.push_back(char(0x80 | (code & 0x3F)));
                    } else {
                        out.push_back(char(0xE0 | (code >> 12)));
                        out.push_back(char(0x80 | ((code >> 6) & 0x3F)));
                        out.push_back(char(0x80 | (code & 0x3F)));
                    }
                    break;
                }
                default: return fail("unknown escape");
            }
        }
        return fail("unterminated string");
    }

    bool parseNumber(Json& out) {
        size_t start = pos;
        if (pos < text.size() && (text[pos] == '-' || text[pos] == '+')) ++pos;
        bool digits = false;
        while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') { ++pos; digits = true; }
        if (pos < text.size() && text[pos] == '.') {
            ++pos;
            while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') { ++pos; digits = true; }
        }
        if (!digits) return fail("number expected");
        if (pos < text.size() && (text[pos] == 'e' || text[pos] == 'E')) {
            ++pos;
            if (pos < text.size() && (text[pos] == '-' || text[pos] == '+')) ++pos;
            while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') ++pos;
        }
        out = Json(std::strtod(text.substr(start, pos - start).c_str(), nullptr));
        return true;
    }
};

void dumpTo(const Json& value, std::ostringstream& out, int indent, int depth) {
    const std::string pad(static_cast<size_t>(indent > 0 ? indent * depth : 0), ' ');
    const std::string padInner(static_cast<size_t>(indent > 0 ? indent * (depth + 1) : 0), ' ');
    switch (value.type()) {
        case Json::Type::Null: out << "null"; break;
        case Json::Type::Bool: out << (value.boolean() ? "true" : "false"); break;
        case Json::Type::Number: {
            double n = value.number();
            if (n == std::floor(n) && std::fabs(n) < 1e15) out << static_cast<long long>(n);
            else out << n;
            break;
        }
        case Json::Type::String: out << "\"" << jsonEscape(value.str()) << "\""; break;
        case Json::Type::Array: {
            if (value.items().empty()) { out << "[]"; break; }
            out << "[";
            bool first = true;
            for (const Json& item : value.items()) {
                if (!first) out << ",";
                first = false;
                if (indent > 0) out << "\n" << padInner;
                dumpTo(item, out, indent, depth + 1);
            }
            if (indent > 0) out << "\n" << pad;
            out << "]";
            break;
        }
        case Json::Type::Object: {
            if (value.fields().empty()) { out << "{}"; break; }
            out << "{";
            bool first = true;
            for (const auto& entry : value.fields()) {
                if (!first) out << ",";
                first = false;
                if (indent > 0) out << "\n" << padInner;
                out << "\"" << jsonEscape(entry.first) << "\":" << (indent > 0 ? " " : "");
                dumpTo(entry.second, out, indent, depth + 1);
            }
            if (indent > 0) out << "\n" << pad;
            out << "}";
            break;
        }
    }
}

const Json& nullJson() { static const Json value; return value; }

}  // namespace

std::string Json::string(const std::string& fallback) const {
    switch (type_) {
        case Type::String: return string_.empty() ? fallback : string_;
        case Type::Number: {
            double n = number_;
            if (n == std::floor(n) && std::fabs(n) < 1e15) return std::to_string(static_cast<long long>(n));
            std::ostringstream out;
            out << n;
            return out.str();
        }
        case Type::Bool: return bool_ ? "true" : "false";
        default: return fallback;
    }
}

double Json::numeric(double fallback) const {
    if (type_ == Type::Number) return number_;
    if (type_ == Type::Bool) return bool_ ? 1 : 0;
    if (type_ == Type::String) {
        try {
            size_t used = 0;
            double value = std::stod(string_, &used);
            if (used == string_.size()) return value;
        } catch (...) {
        }
    }
    return fallback;
}

bool Json::flag(bool fallback) const {
    if (type_ == Type::Bool) return bool_;
    if (type_ == Type::Number) return number_ != 0;
    if (type_ == Type::String) {
        if (string_ == "true" || string_ == "yes" || string_ == "1") return true;
        if (string_ == "false" || string_ == "no" || string_ == "0") return false;
    }
    return fallback;
}

const Json& Json::at(const std::string& key) const {
    auto found = object_.find(key);
    return found == object_.end() ? nullJson() : found->second;
}

const Json& Json::at(size_t index) const {
    return index < array_.size() ? array_[index] : nullJson();
}

std::string Json::dump(int indent) const {
    std::ostringstream out;
    dumpTo(*this, out, indent, 0);
    return out.str();
}

Json jsonParse(const std::string& text, std::string* error) {
    Parser parser(text);
    Json value;
    if (!parser.parseValue(value)) {
        if (error) *error = parser.error.empty() ? "invalid JSON" : parser.error;
        return Json();
    }
    if (error) error->clear();
    return value;
}

std::string jsonEscape(const std::string& text) {
    std::string out;
    out.reserve(text.size() + 8);
    for (unsigned char c : text) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buffer[8];
                    std::snprintf(buffer, sizeof buffer, "\\u%04x", c);
                    out += buffer;
                } else {
                    out.push_back(char(c));
                }
        }
    }
    return out;
}

}  // namespace epp
