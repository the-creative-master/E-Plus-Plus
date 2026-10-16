#include "text.hpp"

#include <cctype>
#include <fstream>
#include <set>
#include <sstream>

#include "json.hpp"

namespace epp {
namespace {

const std::set<std::string>& commandWords() {
    static const std::set<std::string> words = {
        "say", "display", "define", "set", "increase", "decrease", "ask", "if", "then", "otherwise",
        "end", "repeat", "times", "while", "do", "loopback", "to", "add", "library", "python", "code",
        "wait", "save", "project", "as", "check", "exists", "image", "drawing", "sprite", "move",
        "up", "down", "left", "right"};
    return words;
}

const std::set<std::string>& helperWords() {
    static const std::set<std::string> words = {
        "plus", "minus", "times", "divided", "by", "power", "of", "percent", "square", "root",
        "uppercase", "lowercase", "length", "random", "number", "between", "and", "is", "not",
        "equal", "exactly", "greater", "less", "than", "or", "contains", "in", "the", "range",
        "positive", "negative", "a", "an", "value", "absolute"};
    return words;
}

std::string readFileOrEmpty(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return std::string();
    std::ostringstream buffer;
    buffer << in.rdbuf();
    return buffer.str();
}

const Text* g_text = nullptr;  // set by install, used by {{t:...}} in templates

}  // namespace

void Text::install(const Text* text) { g_text = text; }

bool Text::load(const std::string& path) {
    std::string error;
    Json data = jsonParse(readFileOrEmpty(path), &error);
    if (!error.empty() || !data.isObject()) return false;
    messages_.clear();
    for (const auto& entry : data.fields()) {
        if (entry.second.isString()) messages_[entry.first] = entry.second.str();
    }
    return true;
}

std::string Text::get(const std::string& key) const {
    auto found = messages_.find(key);
    return found == messages_.end() ? key : found->second;
}

std::string Text::get(const std::string& key, const std::map<std::string, std::string>& values) const {
    return fill(get(key), values);
}

std::string Text::fill(const std::string& text, const std::map<std::string, std::string>& values) {
    std::string out = text;
    for (const auto& value : values) out = replaceAll(out, "{" + value.first + "}", value.second);
    return out;
}

std::string htmlEscape(const std::string& text) {
    std::string out;
    out.reserve(text.size() + 16);
    for (char c : text) {
        switch (c) {
            case '&': out += "&amp;"; break;
            case '<': out += "&lt;"; break;
            case '>': out += "&gt;"; break;
            case '"': out += "&quot;"; break;
            case '\'': out += "&#39;"; break;
            default: out.push_back(c);
        }
    }
    return out;
}

std::string trim(const std::string& text) {
    size_t start = 0;
    size_t end = text.size();
    while (start < end && std::isspace(static_cast<unsigned char>(text[start]))) ++start;
    while (end > start && std::isspace(static_cast<unsigned char>(text[end - 1]))) --end;
    return text.substr(start, end - start);
}

std::string lower(const std::string& text) {
    std::string out = text;
    for (char& c : out) c = char(std::tolower(static_cast<unsigned char>(c)));
    return out;
}

std::string replaceAll(std::string text, const std::string& from, const std::string& to) {
    if (from.empty()) return text;
    size_t at = 0;
    while ((at = text.find(from, at)) != std::string::npos) {
        text.replace(at, from.size(), to);
        at += to.size();
    }
    return text;
}

std::vector<std::string> splitLines(const std::string& text) {
    std::vector<std::string> lines;
    std::string current;
    for (char c : text) {
        if (c == '\n') {
            if (!current.empty() && current.back() == '\r') current.pop_back();
            lines.push_back(current);
            current.clear();
        } else {
            current.push_back(c);
        }
    }
    if (!current.empty()) lines.push_back(current);
    return lines;
}

std::string joinLines(const std::vector<std::string>& lines, const std::string& separator) {
    std::string out;
    for (size_t i = 0; i < lines.size(); ++i) {
        if (i) out += separator;
        out += lines[i];
    }
    return out;
}

std::string renderTemplate(const std::string& path, const std::map<std::string, std::string>& values) {
    std::string body = readFileOrEmpty(path);
    if (body.empty()) return "<p>The template " + htmlEscape(path) + " is missing.</p>";
    for (const auto& value : values) {
        body = replaceAll(body, "{{" + value.first + "}}", value.second);
    }
    // {{t:key}} pulls the words from data/messages.json.
    size_t at = 0;
    while ((at = body.find("{{t:", at)) != std::string::npos) {
        size_t end = body.find("}}", at);
        if (end == std::string::npos) break;
        std::string key = body.substr(at + 4, end - at - 4);
        std::string words = g_text ? g_text->get(key) : key;
        words = Text::fill(words, values);  // {count} and friends come from the page
        body.replace(at, end - at + 2, words);
        at += words.size();
    }
    return body;
}

std::string highlightToHtml(const std::string& source) {
    std::string out;
    size_t pos = 0;
    int line = 1;
    out += "<span class=\"ln\">1</span> ";
    while (pos < source.size()) {
        char c = source[pos];
        if (c == '\n') {
            ++line;
            out += "\n";
            std::string number = std::to_string(line);
            out += "<span class=\"ln\">" + number + "</span> ";
            ++pos;
            continue;
        }
        if (c == ' ' || c == '\t') { out.push_back(c); ++pos; continue; }
        if (c == '"') {
            size_t end = source.find('"', pos + 1);
            if (end == std::string::npos) end = source.size() - 1;
            out += "<span class=\"t-str\">" + htmlEscape(source.substr(pos, end - pos + 1)) + "</span>";
            pos = end + 1;
            continue;
        }
        if (c == '\'') {
            size_t end = source.find('\'', pos + 1);
            if (end == std::string::npos) end = source.size() - 1;
            out += "<span class=\"t-var\">" + htmlEscape(source.substr(pos, end - pos + 1)) + "</span>";
            pos = end + 1;
            continue;
        }
        if (std::isdigit(static_cast<unsigned char>(c))) {
            size_t end = pos;
            while (end < source.size() && (std::isdigit(static_cast<unsigned char>(source[end])) || source[end] == '.')) ++end;
            out += "<span class=\"t-num\">" + htmlEscape(source.substr(pos, end - pos)) + "</span>";
            pos = end;
            continue;
        }
        if (std::isalpha(static_cast<unsigned char>(c))) {
            size_t end = pos;
            while (end < source.size() && (std::isalnum(static_cast<unsigned char>(source[end])) || source[end] == '_')) ++end;
            std::string word = source.substr(pos, end - pos);
            std::string lowered = lower(word);
            if (lowered == "note" && end < source.size() && source[end] == ':') {
                size_t lineEnd = source.find('\n', end);
                if (lineEnd == std::string::npos) lineEnd = source.size();
                out += "<span class=\"t-note\">" + htmlEscape(source.substr(pos, lineEnd - pos)) + "</span>";
                pos = lineEnd;
                continue;
            }
            if (commandWords().count(lowered)) out += "<span class=\"t-key\">" + htmlEscape(word) + "</span>";
            else if (helperWords().count(lowered)) out += "<span class=\"t-helper\">" + htmlEscape(word) + "</span>";
            else out += "<span class=\"t-word\">" + htmlEscape(word) + "</span>";
            pos = end;
            continue;
        }
        out += "<span class=\"t-op\">" + htmlEscape(std::string(1, c)) + "</span>";
        ++pos;
    }
    return out;
}

}  // namespace epp
