// The words the IDE shows, and the templates it fills them into.
//
// Every user-facing phrase lives in data/messages.json and is looked up by key,
// so a wording change happens in one place. Templates in web/ hold the markup;
// {{placeholder}} marks the spots the program fills in.
#pragma once

#include <map>
#include <string>
#include <vector>

namespace epp {

class Text {
public:
    // Reads data/messages.json. Missing file leaves the catalogue empty.
    bool load(const std::string& path);

    // The phrase for `key`; unknown keys come back as the key itself so a typo
    // shows up instead of silently printing an empty line.
    std::string get(const std::string& key) const;

    // Same, with {name} placeholders replaced from `values`.
    std::string get(const std::string& key, const std::map<std::string, std::string>& values) const;

    // Replaces {name} in any piece of text.
    static std::string fill(const std::string& text, const std::map<std::string, std::string>& values);

    size_t size() const { return messages_.size(); }

    // The whole catalogue, for the API and for templates that want it all.
    const std::map<std::string, std::string>& all() const { return messages_; }

    // Lets templates write {{t:ui.run}} instead of passing every label in.
    static void install(const Text* text);

private:
    std::map<std::string, std::string> messages_;
};

std::string htmlEscape(const std::string& text);
std::string trim(const std::string& text);
std::string lower(const std::string& text);
std::string replaceAll(std::string text, const std::string& from, const std::string& to);
std::vector<std::string> splitLines(const std::string& text);
std::string joinLines(const std::vector<std::string>& lines, const std::string& separator);

// Reads a template file and replaces every {{key}}. Unknown placeholders are
// left alone so a missing value is visible while developing.
std::string renderTemplate(const std::string& path, const std::map<std::string, std::string>& values);

// Turns E++ source into syntax-highlighted HTML (used by the read-only view).
std::string highlightToHtml(const std::string& source);

}  // namespace epp
