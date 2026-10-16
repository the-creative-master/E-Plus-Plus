#include "server.hpp"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <signal.h>
#include <sys/socket.h>
#include <unistd.h>

#include <algorithm>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <thread>

#include "engine.hpp"

namespace fs = std::filesystem;

namespace epp {
namespace {

std::string urlDecode(const std::string& text) {
    std::string out;
    for (size_t i = 0; i < text.size(); ++i) {
        char c = text[i];
        if (c == '+') { out.push_back(' '); continue; }
        if (c == '%' && i + 2 < text.size()) {
            auto hex = [](char h) {
                if (h >= '0' && h <= '9') return h - '0';
                if (h >= 'a' && h <= 'f') return h - 'a' + 10;
                if (h >= 'A' && h <= 'F') return h - 'A' + 10;
                return 0;
            };
            out.push_back(char(hex(text[i + 1]) * 16 + hex(text[i + 2])));
            i += 2;
            continue;
        }
        out.push_back(c);
    }
    return out;
}

std::string urlEncode(const std::string& text) {
    static const char* digits = "0123456789ABCDEF";
    std::string out;
    for (unsigned char c : text) {
        if (std::isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') out.push_back(char(c));
        else {
            out.push_back('%');
            out.push_back(digits[c >> 4]);
            out.push_back(digits[c & 15]);
        }
    }
    return out;
}

std::map<std::string, std::string> parsePairs(const std::string& text) {
    std::map<std::string, std::string> pairs;
    size_t start = 0;
    while (start <= text.size() && !text.empty()) {
        size_t amp = text.find('&', start);
        std::string piece = text.substr(start, amp == std::string::npos ? std::string::npos : amp - start);
        size_t equals = piece.find('=');
        if (equals != std::string::npos) {
            pairs[urlDecode(piece.substr(0, equals))] = urlDecode(piece.substr(equals + 1));
        } else if (!piece.empty()) {
            pairs[urlDecode(piece)] = "";
        }
        if (amp == std::string::npos) break;
        start = amp + 1;
    }
    return pairs;
}

std::string readFile(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return std::string();
    std::ostringstream buffer;
    buffer << in.rdbuf();
    return buffer.str();
}

bool writeFile(const std::string& path, const std::string& content) {
    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    if (!out) return false;
    out << content;
    return out.good();
}

std::string contentTypeFor(const std::string& path) {
    if (path.size() > 4 && path.compare(path.size() - 4, 4, ".css") == 0) return "text/css; charset=utf-8";
    if (path.size() > 3 && path.compare(path.size() - 3, 3, ".js") == 0) return "text/javascript; charset=utf-8";
    if (path.size() > 5 && path.compare(path.size() - 5, 5, ".html") == 0) return "text/html; charset=utf-8";
    if (path.size() > 5 && path.compare(path.size() - 5, 5, ".json") == 0) return "application/json; charset=utf-8";
    if (path.size() > 4 && path.compare(path.size() - 4, 4, ".svg") == 0) return "image/svg+xml";
    return "text/plain; charset=utf-8";
}

std::string humanSize(long bytes) {
    std::ostringstream out;
    if (bytes < 1024) out << bytes << " B";
    else out.precision(1), out << std::fixed << (double(bytes) / 1024.0) << " kB";
    return out.str();
}

}  // namespace

// ---------------------------------------------------------------- pages

App::App(std::string projectRoot, std::string webDir, std::string dataDir, std::string workspaceDir)
    : projectRoot_(std::move(projectRoot)),
      webDir_(std::move(webDir)),
      dataDir_(std::move(dataDir)),
      workspaceDir_(workspaceDir),
      store_(std::move(workspaceDir)) {
    if (workspaceDir_.empty()) workspaceDir_ = "workspace";
}

void App::load() {
    store_.ensure();
    text_.load(dataDir_ + "/messages.json");
    Text::install(&text_);  // templates read their labels with {{t:key}}
    Json defaults = jsonParse(readFile(dataDir_ + "/settings.json")).at("defaults");
    if (!defaults.isObject()) defaults = Json::object();
    settings_ = store_.loadSettings(defaults);
    if (!fs::exists(store_.root() + "/.settings.json")) store_.saveSettings(settings_);
    firstVisit_ = !fs::exists(store_.root() + "/.seen");
    if (firstVisit_) writeFile(store_.root() + "/.seen", "welcome\n");
    store_.restoreExamples(dataDir_ + "/examples");
}

Json App::officialTutorial() const {
    Json pack = jsonParse(readFile(dataDir_ + "/tutorial.json"));
    if (!pack.isArray()) pack = Json::array();
    return pack;
}

Json App::tutorial() const {
    Json all = Json::array();
    Json official = officialTutorial();
    Json custom = store_.loadCustomLessons();
    for (const Json& lesson : official.items()) all.push(lesson);
    for (const Json& lesson : custom.items()) all.push(lesson);
    return all;
}

std::string App::workspaceFile(const std::string& name) const { return store_.root() + "/" + name; }

std::string App::settingsClass() const {
    std::string classes;
    if (settings_.at("theme").string() == "light") classes += " light";
    if (settings_.at("density").string() == "compact") classes += " compact";
    return trim(classes);
}

std::string App::flashHtml(const std::string& notice, const std::string& kind) const {
    if (notice.empty()) return "";
    std::string html = "<p class=\"flash " + std::string(kind == "error" ? "flash-error" : "flash-ok") + "\">" + htmlEscape(notice);
    if (kind == "error") html += " <a href=\"/\">" + htmlEscape(text_.get("ui.dismiss")) + "</a>";
    return html + "</p>";
}

std::string App::baseVars(const std::string& title, const std::string& content, const std::string& notice,
                          const std::string& kind) const {
    return renderTemplate(webDir_ + "/layout.html",
                          {{"title", htmlEscape(title)},
                           {"pageClass", htmlEscape(settingsClass())},
                           {"codeSize", htmlEscape(settings_.at("fontSize").string("14"))},
                           {"topbar", renderTemplate(webDir_ + "/partials/topbar.html", {})},
                           {"footer", renderTemplate(webDir_ + "/partials/footer.html", {{"build", text_.get("build")}})},
                           {"content", content},
                           {"flash", flashHtml(notice, kind)}});
}

Response App::page(const std::string& title, const std::string& content, const std::string& notice,
                   const std::string& kind, const std::string& extraClass) {
    std::string html = renderTemplate(webDir_ + "/layout.html",
                                      {{"title", htmlEscape(title)},
                                       {"codeSize", htmlEscape(settings_.at("fontSize").string("14"))},
                                       {"pageClass", trim(settingsClass() + " " + extraClass)},
                                       {"topbar", renderTemplate(webDir_ + "/partials/topbar.html", {})},
                                       {"footer", renderTemplate(webDir_ + "/partials/footer.html", {{"build", text_.get("build")}})},
                                       {"content", content},
                                       {"flash", flashHtml(notice, kind)}});
    Response response;
    response.body = html;
    return response;
}

std::string App::renderFiles(const std::string& active, const std::string& filter) const {
    std::string rows;
    for (const FileInfo& file : store_.list(filter)) {
        bool selected = file.name == active;
        rows += renderTemplate(webDir_ + "/partials/file_row.html",
                               {{"name", htmlEscape(file.name)},
                                {"url", urlEncode(file.name)},
                                {"size", humanSize(file.size)},
                                {"updated", htmlEscape(file.updated)},
                                {"kind", Store::extensionOf(file.name) == ".eppla" ? "lib" : "pure"},
                                {"selected", selected ? " selected" : ""}});
    }
    return rows.empty() ? renderTemplate(webDir_ + "/partials/empty_files.html", {}) : rows;
}

std::string App::renderLibraryCards(const std::string& active) const {
    std::string cards;
    std::vector<std::string> loaded;
    if (!active.empty()) {
        std::string source = store_.read(active);
        for (const std::string& name : librariesUsed(source)) loaded.push_back(name);
    }
    for (const LibraryInfo& library : libraryCatalogue()) {
        std::string words;
        for (size_t i = 0; i < library.words.size(); ++i) {
            if (i) words += " · ";
            words += library.words[i];
        }
        bool inPlace = std::find(loaded.begin(), loaded.end(), library.name) != loaded.end();
        cards += renderTemplate(webDir_ + "/partials/library_card.html",
                                {{"name", htmlEscape(library.name)},
                                 {"description", htmlEscape(library.description)},
                                 {"words", htmlEscape(words)},
                                 {"state", inPlace ? "in this file" : ""},
                                 {"file", urlEncode(active)}});
    }
    return cards;
}

std::string App::renderLessons(const std::string& activeId) const {
    std::string rows;
    Json lessons = tutorial();
    int index = 0;
    for (const Json& lesson : lessons.items()) {
        ++index;
        bool custom = lesson.at("custom").flag(false);
        rows += renderTemplate(webDir_ + "/partials/lesson_item.html",
                               {{"id", urlEncode(lesson.at("id").string())},
                                {"title", htmlEscape(lesson.at("title").string())},
                                {"badge", htmlEscape(lesson.at("badge").string())},
                                {"number", std::to_string(index)},
                                {"selected", lesson.at("id").string() == activeId ? " selected" : ""},
                                {"custom", custom ? " custom" : ""}});
    }
    return rows;
}

std::string App::renderSettingsGroups() const {
    Json schema = jsonParse(readFile(dataDir_ + "/settings.json"));
    std::string html;
    for (const Json& group : schema.at("groups").items()) {
        std::string controls;
        for (const Json& control : group.at("controls").items()) {
            std::string type = control.at("type").string();
            std::string key = control.at("key").string();
            std::string value = settings_.has(key) ? settings_.at(key).string() : control.at("default").string();
            std::string options;
            if (type == "select") {
                for (const Json& option : control.at("options").items()) {
                    std::string optionValue = option.at("value").string();
                    bool chosen = optionValue == value;
                    options += renderTemplate(webDir_ + "/partials/setting_option.html",
                                              {{"value", htmlEscape(optionValue)},
                                               {"label", htmlEscape(option.at("label").string())},
                                               {"chosen", chosen ? " selected" : ""}});
                }
                controls += renderTemplate(webDir_ + "/partials/setting_select.html",
                                           {{"key", htmlEscape(key)},
                                            {"label", htmlEscape(control.at("label").string())},
                                            {"description", htmlEscape(control.at("description").string())},
                                            {"options", options}});
            } else if (type == "checkbox") {
                controls += renderTemplate(webDir_ + "/partials/setting_checkbox.html",
                                           {{"key", htmlEscape(key)},
                                            {"label", htmlEscape(control.at("label").string())},
                                            {"description", htmlEscape(control.at("description").string())},
                                            {"checked", value == "true" ? " checked" : ""}});
            } else if (type == "text") {
                controls += renderTemplate(webDir_ + "/partials/setting_text.html",
                                           {{"key", htmlEscape(key)},
                                            {"label", htmlEscape(control.at("label").string())},
                                            {"description", htmlEscape(control.at("description").string())},
                                            {"value", htmlEscape(value)}});
            }
        }
        html += renderTemplate(webDir_ + "/partials/setting_group.html",
                               {{"title", htmlEscape(group.at("title").string())}, {"controls", controls}});
    }
    return html;
}

std::string App::renderConsole(const std::vector<LineOut>& lines, size_t limit) const {
    if (lines.empty()) return renderTemplate(webDir_ + "/partials/console_empty.html", {});
    std::string html;
    size_t start = lines.size() > limit ? lines.size() - limit : 0;
    if (start > 0) {
        html += "<div class=\"line system\">" +
                htmlEscape(text_.get("console.hidden", {{"count", std::to_string(start)}})) + "</div>\n";
    }
    for (size_t i = start; i < lines.size(); ++i) {
        const LineOut& line = lines[i];
        const std::string& text = line.text;
        if (text.compare(0, 8, "[[image:") == 0 && text.size() > 10 && text.compare(text.size() - 2, 2, "]]") == 0) {
            html += "<div class=\"line image\"><img alt=\"picture from the Image library\" src=\"" +
                    htmlEscape(text.substr(8, text.size() - 10)) + "\"></div>\n";
            continue;
        }
        std::string className = "output";
        switch (line.kind) {
            case Line::Output: break;
            case Line::System: className = "system"; break;
            case Line::Library: className = "library"; break;
            case Line::Prompt: className = "prompt"; break;
            case Line::Answer: className = "answer"; break;
            case Line::Error: className = "error"; break;
            case Line::Divider: className = "divider"; break;
        }
        html += "<div class=\"line " + className + "\">" + htmlEscape(text) + "</div>\n";
    }
    return html;
}

std::string App::renderSpriteGrid(const std::vector<Sprite>& sprites) const {
    if (sprites.empty()) return "";
    const int width = 41;
    const int height = 13;
    std::vector<std::string> grid(size_t(height), std::string(size_t(width), '.'));
    for (const Sprite& sprite : sprites) {
        int column = int(width / 2 + sprite.x / 5);
        int row = int(height / 2 + sprite.y / 5);
        if (column < 0 || column >= width || row < 0 || row >= height) continue;
        grid[size_t(row)][size_t(column)] = sprite.name.empty() ? '#' : char(std::toupper(static_cast<unsigned char>(sprite.name[0])));
    }
    std::string out;
    for (const std::string& row : grid) out += row + "\n";
    return renderTemplate(webDir_ + "/partials/grid.html", {{"grid", htmlEscape(out)}});
}

std::string App::currentFile(const std::string& asked) const {
    if (!asked.empty() && store_.exists(asked)) return asked;
    std::vector<FileInfo> files = store_.list();
    return files.empty() ? "" : files.front().name;
}

Response App::idePage(const std::string& file, const std::string& query, const std::string& answers,
                      const std::string& code, const std::string& notice, const std::string& kind,
                      const std::string& output, const std::string& spriteGrid) {
    std::string active = currentFile(file);
    std::string source = code;
    bool fresh = code.empty();
    if (fresh && !active.empty()) source = store_.read(active);
    bool hasAnswers = !answers.empty();
    std::string answersText = hasAnswers ? answers : settings_.at("defaultAnswers").string();

    std::string console = output;
    if (console.empty()) console = renderTemplate(webDir_ + "/partials/console_empty.html", {});

    std::string content = renderTemplate(
        webDir_ + "/ide.html",
        {{"files", renderFiles(active, query)},
         {"search", htmlEscape(query)},
         {"fileCount", std::to_string(store_.list().size())},
         {"currentName", active.empty() ? text_.get("files.none") : htmlEscape(active)},
         {"currentRaw", htmlEscape(active)},
         {"currentUrl", urlEncode(active)},
         {"code", htmlEscape(source)},
         {"answers", htmlEscape(answersText)},
         {"console", console},
         {"libraryCards", renderLibraryCards(active)},
         {"librariesHidden", settings_.at("showLibraries").flag(true) ? "" : " hidden"},
         {"referenceHidden", settings_.at("showReference").flag(true) ? "" : " hidden"},
         {"dashboardHidden", settings_.at("showDashboard").flag(true) ? "" : " hidden"},
         {"spriteGrid", spriteGrid},
         {"codeView", settings_.at("highlightCode").flag(true) && !source.empty() ? highlightToHtml(source) : ""},
         {"lineLimit", settings_.at("consoleLines").string()},
         {"extensionNote", htmlEscape(text_.get("extensions.note"))},
         {"reference", htmlEscape(text_.get("reference.cheatsheet"))}});
    return page(text_.get("brand.title"), content, notice, kind);
}

Response App::tutorialPage(const std::string& lessonId, const std::string& notice, const std::string& kind) {
    Json lessons = tutorial();
    std::string activeId = lessonId;
    if (activeId.empty() && !lessons.items().empty()) activeId = lessons.items().front().at("id").string();
    Json lesson;
    int index = 0;
    for (const Json& candidate : lessons.items()) {
        ++index;
        if (candidate.at("id").string() == activeId) { lesson = candidate; break; }
    }
    if (lesson.isNull() && !lessons.items().empty()) { lesson = lessons.items().front(); index = 1; activeId = lesson.at("id").string(); }

    int custom = 0;
    for (const Json& candidate : lessons.items()) if (candidate.at("custom").flag(false)) ++custom;

    std::string removeForm;
    if (lesson.at("custom").flag(false)) {
        removeForm = renderTemplate(webDir_ + "/partials/lesson_remove.html", {{"id", urlEncode(activeId)}});
    }

    std::string content = renderTemplate(
        webDir_ + "/tutorial.html",
        {{"removeForm", removeForm},
         {"lessons", renderLessons(activeId)},
         {"title", htmlEscape(lesson.at("title").string())},
         {"badge", htmlEscape(lesson.at("badge").string())},
         {"summary", htmlEscape(lesson.at("summary").string())},
         {"explanation", htmlEscape(lesson.at("explanation").string())},
         {"code", htmlEscape(lesson.at("code").string())},
         {"highlight", highlightToHtml(lesson.at("code").string())},
         {"id", urlEncode(activeId)},
         {"step", std::to_string(index) + " / " + std::to_string(lessons.items().size())},
         {"count", std::to_string(lessons.items().size())},
         {"pack", htmlEscape(text_.get("tutorial.source"))},
         {"customCount", std::to_string(custom)}});
    return page(text_.get("tutorial.title"), content, notice, kind);
}

Response App::settingsPage(const std::string& notice) {
    std::string content = renderTemplate(
        webDir_ + "/settings.html",
        {{"groups", renderSettingsGroups()},
         {"subtitle", htmlEscape(text_.get("settings.subtitle"))},
         {"source", htmlEscape(text_.get("settings.source"))},
         {"schemaNote", htmlEscape(text_.get("settings.schemaNote"))}});
    return page(text_.get("settings.title"), content, notice);
}

Response App::aboutPage() {
    std::string libraries;
    for (const LibraryInfo& library : libraryCatalogue()) {
        libraries += "<li><strong>" + htmlEscape(library.name) + "</strong> — " + htmlEscape(library.description) + "</li>\n";
    }
    std::string content = renderTemplate(
        webDir_ + "/about.html",
        {{"extensionNote", htmlEscape(text_.get("extensions.note"))},
         {"origin", htmlEscape(text_.get("about.origin"))},
         {"cheatsheet", htmlEscape(text_.get("reference.cheatsheet"))},
         {"libraries", libraries},
         {"build", htmlEscape(text_.get("build"))}});
    return page(text_.get("about.title"), content);
}

Response App::fileFormPage(const std::string& mode, const std::string& file) {
    std::string content;
    if (mode == "delete") {
        content = renderTemplate(webDir_ + "/delete.html", {{"file", htmlEscape(file)}, {"url", urlEncode(file)}});
    } else if (mode == "rename") {
        content = renderTemplate(webDir_ + "/rename.html", {{"file", htmlEscape(file)}, {"url", urlEncode(file)}});
    } else {
        content = renderTemplate(webDir_ + "/new.html", {{"example", htmlEscape(text_.get("files.exampleName"))}});
    }
    return page(text_.get("files." + mode), content);
}

// ---------------------------------------------------------------- routes

Response App::handle(const Request& request) {
    const std::string& path = request.path;
    auto form = [&](const char* key) {
        auto found = request.form.find(key);
        return found == request.form.end() ? std::string() : found->second;
    };
    auto query = [&](const char* key) {
        auto found = request.query.find(key);
        return found == request.query.end() ? std::string() : found->second;
    };

    if (path == "/" || path == "/index.html") {
        if (firstVisit_ && settings_.at("autoOpenTutorial").flag(true)) {
            firstVisit_ = false;
            Response redirect;
            redirect.status = 303;
            redirect.headers["Location"] = "/tutorial";
            return redirect;
        }
        firstVisit_ = false;
        return idePage(query("file"), query("q"), "", "", query("msg"), query("kind"), "", "");
    }

    if (path == "/open") return idePage(query("file"), query("q"), "", "", query("msg"), query("kind"), "", "");
    if (path == "/files") return idePage(currentFile(query("file")), query("q"), "", "", "", "", "", "");

    if (path == "/run" && request.method == "POST") {
        std::string fileName = form("file");
        std::string code = form("code");
        std::string answers = form("answers");
        Options options;
        options.fileName = fileName;
        options.librariesAllowed = Store::extensionOf(fileName) == ".eppla";
        options.sleep = [](unsigned ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); };
        for (const std::string& line : splitLines(answers)) {
            std::string answer = trim(line);
            if (!answer.empty()) options.answers.push_back(answer);
        }
        std::vector<LineOut> lines;
        lines.push_back({Line::Divider, "Run: " + (fileName.empty() ? std::string("(no file)") : fileName)});
        Result result = run(code, options);
        for (const LineOut& line : result.lines) lines.push_back(line);
        lines.push_back({Line::Divider, result.ok ? "Finished in " + std::to_string(result.milliseconds) + " ms"
                                                  : "Stopped after " + std::to_string(result.milliseconds) + " ms"});
        size_t limit = size_t(std::max(20.0, settings_.at("consoleLines").numeric(400)));
        return idePage(fileName, "", answers, code, "", result.ok ? "" : "error",
                       renderConsole(lines, limit), renderSpriteGrid(result.sprites));
    }

    if (path == "/save" && request.method == "POST") {
        std::string name = Store::nameFor(form("file"), form("code"));
        if (name.empty()) {
            std::string error = Store::errorForName(form("file"), form("code"));
            return idePage(form("file"), "", form("answers"), form("code"), error, "error", "", "");
        }
        std::string upgraded = Store::upgradedFor(name, form("code"));
        std::string note = text_.get("files.saved", {{"name", upgraded}});
        if (upgraded != name) {
            store_.remove(name);
            note = text_.get("files.upgraded", {{"name", upgraded}});
        }
        store_.write(upgraded, form("code"));
        Response redirect;
        redirect.status = 303;
        redirect.headers["Location"] = "/open?file=" + urlEncode(upgraded) + "&msg=" + urlEncode(note);
        return redirect;
    }

    if (path == "/new" && request.method == "POST") {
        std::string content = form("content");
        std::string name = Store::nameFor(form("name"), content);
        if (name.empty()) return fileFormPage("new", form("name"));
        if (store_.exists(name)) {
            return idePage(name, "", "", "", text_.get("files.exists", {{"name", name}}), "error", "", "");
        }
        store_.create(name, content.empty() ? text_.get("files.starter") : content);
        Response redirect;
        redirect.status = 303;
        redirect.headers["Location"] = "/open?file=" + urlEncode(name) + "&msg=" + urlEncode(text_.get("files.created", {{"name", name}}));
        return redirect;
    }

    if (path == "/rename" && request.method == "POST") {
        std::string from = form("file");
        std::string to = Store::nameFor(form("to"), store_.read(from));
        if (to.empty() || !store_.rename(from, to)) {
            return fileFormPage("rename", from);
        }
        Response redirect;
        redirect.status = 303;
        redirect.headers["Location"] = "/open?file=" + urlEncode(to) + "&msg=" + urlEncode(text_.get("files.renamed", {{"name", to}}));
        return redirect;
    }

    if (path == "/delete" && request.method == "POST") {
        std::string file = form("file");
        store_.remove(file);
        std::string next = currentFile("");
        Response redirect;
        redirect.status = 303;
        redirect.headers["Location"] = "/open?file=" + urlEncode(next) + "&msg=" + urlEncode(text_.get("files.deleted", {{"name", file}}));
        return redirect;
    }

    if (path == "/restore-examples" && request.method == "POST") {
        int added = store_.restoreExamples(dataDir_ + "/examples");
        Response redirect;
        redirect.status = 303;
        redirect.headers["Location"] = "/?msg=" +
            urlEncode(text_.get(added ? "files.examplesAdded" : "files.examplesThere",
                                 {{"count", std::to_string(added)}}));
        return redirect;
    }

    if (path == "/insert-library" && request.method == "POST") {
        std::string library = form("library");
        std::string file = currentFile(form("file"));
        std::string line = "add library \"" + library + "\"\n";
        std::string source = store_.read(file);
        if (source.find(line) == std::string::npos) source = line + source;
        std::string upgraded = Store::upgradedFor(file, source);
        std::string note = text_.get("library.inserted", {{"name", library}});
        if (upgraded != file) {
            store_.remove(file);
            std::map<std::string, std::string> values;
            values["name"] = upgraded;
            values["library"] = library;
            note = text_.get("library.upgraded", values);
        }
        store_.write(upgraded, source);
        Response redirect;
        redirect.status = 303;
        redirect.headers["Location"] = "/open?file=" + urlEncode(upgraded) + "&msg=" + urlEncode(note);
        return redirect;
    }

    if (path == "/download") {
        std::string file = query("file");
        Response response;
        response.contentType = "text/plain; charset=utf-8";
        response.headers["Content-Disposition"] = "attachment; filename=\"" + file + "\"";
        response.body = store_.read(file);
        return response;
    }

    if (path == "/tutorial") {
        return tutorialPage(query("lesson"), query("msg"), query("kind"));
    }

    if (path == "/tutorial/open" && request.method == "POST") {
        std::string id = form("lesson");
        Json lesson;
        Json all = tutorial();
        for (const Json& candidate : all.items()) if (candidate.at("id").string() == id) lesson = candidate;
        if (lesson.isNull()) return tutorialPage("", text_.get("tutorial.missing"), "error");
        std::string name = "tutorial-" + id + (usesLibrary(lesson.at("code").string()) ? ".eppla" : ".eppl");
        if (store_.exists(name)) store_.write(name, lesson.at("code").string());
        else store_.create(name, lesson.at("code").string());
        Response redirect;
        redirect.status = 303;
        redirect.headers["Location"] = "/open?file=" + urlEncode(name) + "&msg=" +
                                       urlEncode(text_.get("tutorial.opened", {{"name", name}}));
        return redirect;
    }

    if (path == "/tutorial/save" && request.method == "POST") {
        std::string title = trim(form("title"));
        std::string code = form("code");
        if (title.empty() || trim(code).empty()) {
            return tutorialPage(form("lesson"), text_.get("tutorial.needTitle"), "error");
        }
        Json custom = store_.loadCustomLessons();
        std::string id;
        for (char c : lower(title)) id += std::isalnum(static_cast<unsigned char>(c)) ? c : '-';
        while (id.find("--") != std::string::npos) id = replaceAll(id, "--", "-");
        if (!id.empty() && id.back() == '-') id.pop_back();
        std::string unique = id.empty() ? "lesson" : id;
        int suffix = 2;
        bool clash = true;
        while (clash) {
            clash = false;
            Json all = tutorial();
            for (const Json& lesson : all.items()) if (lesson.at("id").string() == unique) clash = true;
            if (clash) unique = id + "-" + std::to_string(suffix++);
        }
        Json lesson = Json::object();
        lesson.set("id", Json(unique));
        lesson.set("title", Json(title));
        lesson.set("badge", Json(form("badge").empty() ? std::string("My lesson") : form("badge")));
        lesson.set("summary", Json(form("summary").empty() ? std::string("Saved from the editor.") : form("summary")));
        lesson.set("explanation", Json(form("explanation")));
        lesson.set("code", Json(code));
        lesson.set("custom", Json(true));
        custom.push(lesson);
        store_.saveCustomLessons(custom);
        return tutorialPage(unique, text_.get("tutorial.saved", {{"title", title}}), "");
    }

    if (path == "/tutorial/remove" && request.method == "POST") {
        std::string id = form("lesson");
        Json kept = Json::array();
        Json stored = store_.loadCustomLessons();
        for (const Json& lesson : stored.items()) {
            if (lesson.at("id").string() != id) kept.push(lesson);
        }
        store_.saveCustomLessons(kept);
        return tutorialPage("", text_.get("tutorial.removed"), "");
    }

    if (path == "/tutorial/import" && request.method == "POST") {
        std::string payload = form("pack");
        std::string error;
        Json parsed = jsonParse(payload, &error);
        Json incoming = parsed.isArray() ? parsed : parsed.at("lessons");
        if (!incoming.isArray() || incoming.items().empty()) {
            return tutorialPage("", text_.get("tutorial.badPack"), "error");
        }
        Json custom = store_.loadCustomLessons();
        int added = 0;
        for (const Json& lesson : incoming.items()) {
            if (!lesson.isObject() || !lesson.has("title") || !lesson.has("code")) continue;
            Json entry = Json::object();
            std::string id = lesson.has("id") ? lesson.at("id").string() : lesson.at("title").string();
            std::string slug;
            for (char c : lower(id)) slug += std::isalnum(static_cast<unsigned char>(c)) ? c : '-';
            while (slug.find("--") != std::string::npos) slug = replaceAll(slug, "--", "-");
            entry.set("id", Json(slug.empty() ? "imported" : slug));
            entry.set("title", Json(lesson.at("title").string()));
            entry.set("badge", Json(lesson.has("badge") ? lesson.at("badge").string() : "Imported"));
            entry.set("summary", Json(lesson.has("summary") ? lesson.at("summary").string() : ""));
            entry.set("explanation", Json(lesson.has("explanation") ? lesson.at("explanation").string() : ""));
            entry.set("code", Json(lesson.at("code").string()));
            entry.set("custom", Json(true));
            custom.push(entry);
            ++added;
        }
        store_.saveCustomLessons(custom);
        return tutorialPage("", text_.get("tutorial.imported", {{"count", std::to_string(added)}}), "");
    }

    if (path == "/tutorial/export") {
        Json pack = Json::object();
        pack.set("format", Json(std::string("eplusplus-lessons")));
        pack.set("version", Json(text_.get("build")));
        Json lessons = Json::array();
        Json all = tutorial();
        for (const Json& lesson : all.items()) lessons.push(lesson);
        pack.set("lessons", lessons);
        Response response;
        response.contentType = "application/json; charset=utf-8";
        response.headers["Content-Disposition"] = "attachment; filename=\"epp-lessons.json\"";
        response.body = pack.dump(2) + "\n";
        return response;
    }

    if (path == "/settings") {
        if (request.method == "POST") {
            Json updated = settings_;
            Json schema = jsonParse(readFile(dataDir_ + "/settings.json"));
            for (const Json& group : schema.at("groups").items()) {
                for (const Json& control : group.at("controls").items()) {
                    std::string key = control.at("key").string();
                    if (key.empty()) continue;
                    if (control.at("type").string() == "checkbox") {
                        updated.set(key, Json(request.form.count(key) > 0));
                    } else {
                        auto found = request.form.find(key);
                        if (found != request.form.end()) updated.set(key, Json(found->second));
                    }
                }
            }
            settings_ = updated;
            store_.saveSettings(settings_);
            Response redirect;
            redirect.status = 303;
            redirect.headers["Location"] = "/settings?msg=" + urlEncode(text_.get("settings.saved"));
            return redirect;
        }
        return settingsPage(query("msg"));
    }

    if (path == "/settings/reset" && request.method == "POST") {
        Json defaults = jsonParse(readFile(dataDir_ + "/settings.json")).at("defaults");
        settings_ = defaults.isObject() ? defaults : Json::object();
        store_.saveSettings(settings_);
        Response redirect;
        redirect.status = 303;
        redirect.headers["Location"] = "/settings?msg=" + urlEncode(text_.get("settings.reset"));
        return redirect;
    }

    if (path == "/about") return aboutPage();

    if (path == "/new") return fileFormPage("new", "");
    if (path == "/rename") return fileFormPage("rename", query("file"));
    if (path == "/delete") return fileFormPage("delete", query("file"));

    if (path == "/api/status") {
        Json status = Json::object();
        status.set("build", Json(text_.get("build")));
        status.set("files", Json(double(store_.list().size())));
        status.set("libraries", Json(double(libraryCatalogue().size())));
        Json allLessons = tutorial();
        status.set("lessons", Json(double(allLessons.items().size())));
        Response response;
        response.contentType = "application/json; charset=utf-8";
        response.body = status.dump(2) + "\n";
        return response;
    }

    if (path == "/api/run" && request.method == "POST") {
        std::string error;
        Json payload = jsonParse(request.body, &error);
        Options options;
        options.fileName = payload.at("file").string();
        options.librariesAllowed = Store::extensionOf(options.fileName) != ".eppl";
        for (const Json& answer : payload.at("answers").items()) options.answers.push_back(answer.string());
        Result result = run(payload.at("code").string(), options);
        Json out = Json::object();
        out.set("ok", Json(result.ok));
        out.set("milliseconds", Json(double(result.milliseconds)));
        Json lines = Json::array();
        for (const LineOut& line : result.lines) {
            std::string kind = "output";
            switch (line.kind) {
                case Line::Output: break;
                case Line::System: kind = "system"; break;
                case Line::Library: kind = "library"; break;
                case Line::Prompt: kind = "prompt"; break;
                case Line::Answer: kind = "answer"; break;
                case Line::Error: kind = "error"; break;
                case Line::Divider: kind = "divider"; break;
            }
            Json entry = Json::object();
            entry.set("kind", Json(kind));
            entry.set("text", Json(line.text));
            lines.push(entry);
        }
        out.set("lines", lines);
        if (!result.ok) {
            out.set("error", Json(result.error.format()));
            out.set("category", Json(result.error.category));
        }
        Json libraries = Json::array();
        for (const std::string& name : result.libraries) libraries.push(Json(name));
        out.set("libraries", libraries);
        Json sprites = Json::array();
        for (const Sprite& sprite : result.sprites) {
            Json entry = Json::object();
            entry.set("name", Json(sprite.name));
            entry.set("x", Json(sprite.x));
            entry.set("y", Json(sprite.y));
            sprites.push(entry);
        }
        out.set("sprites", sprites);
        Response response;
        response.contentType = "application/json; charset=utf-8";
        response.body = out.dump(2) + "\n";
        return response;
    }

    // Anything else under /assets/ comes straight from web/.
    std::string clean = path;
    while (!clean.empty() && clean.front() == '/') clean.erase(clean.begin());
    if (clean.find("..") == std::string::npos && !clean.empty()) {
        std::string candidate = webDir_ + "/" + clean;
        std::string body = readFile(candidate);
        if (!body.empty()) {
            Response response;
            response.contentType = contentTypeFor(candidate);
            response.body = body;
            return response;
        }
    }

    Response missing = page(text_.get("error.notFound"), renderTemplate(webDir_ + "/error.html", {}));
    missing.status = 404;
    return missing;
}

// ---------------------------------------------------------------- HTTP plumbing

namespace {

std::string headerValue(const std::string& headers, const std::string& name) {
    std::string lowered = lower(headers);
    std::string needle = lower(name) + ":";
    size_t at = lowered.find(needle);
    if (at == std::string::npos) return "";
    size_t start = at + needle.size();
    size_t end = headers.find("\r\n", start);
    return trim(headers.substr(start, end == std::string::npos ? std::string::npos : end - start));
}

void writeAll(int socket, const std::string& data) {
    size_t sent = 0;
    while (sent < data.size()) {
        ssize_t written = ::send(socket, data.data() + sent, data.size() - sent, MSG_NOSIGNAL);
        if (written <= 0) return;
        sent += size_t(written);
    }
}

void handleConnection(int socket, App& app) {
    std::string buffer;
    char chunk[4096];
    size_t headerEnd = std::string::npos;
    while (true) {
        ssize_t got = ::recv(socket, chunk, sizeof chunk, 0);
        if (got <= 0) break;
        buffer.append(chunk, size_t(got));
        headerEnd = buffer.find("\r\n\r\n");
        if (headerEnd != std::string::npos) {
            size_t length = size_t(std::max(0.0, std::atof(headerValue(buffer.substr(0, headerEnd), "Content-Length").c_str())));
            if (buffer.size() >= headerEnd + 4 + length) break;
        }
        if (buffer.size() > 4 * 1024 * 1024) break;
    }
    if (headerEnd == std::string::npos) { ::close(socket); return; }

    std::string head = buffer.substr(0, headerEnd);
    std::string body = buffer.substr(headerEnd + 4);
    size_t length = size_t(std::max(0.0, std::atof(headerValue(head, "Content-Length").c_str())));
    if (body.size() > length) body.resize(length);

    Request request;
    size_t lineEnd = head.find("\r\n");
    std::string requestLine = head.substr(0, lineEnd == std::string::npos ? head.size() : lineEnd);
    std::istringstream first(requestLine);
    std::string target;
    std::string version;
    first >> request.method >> target >> version;
    size_t question = target.find('?');
    request.path = question == std::string::npos ? target : target.substr(0, question);
    if (question != std::string::npos) request.query = parsePairs(target.substr(question + 1));
    request.body = body;
    if (headerValue(head, "Content-Type").find("application/x-www-form-urlencoded") != std::string::npos) {
        request.form = parsePairs(body);
    }

    Response response = app.handle(request);
    std::string status = response.status == 200 ? "200 OK" : response.status == 303 ? "303 See Other"
                       : response.status == 404 ? "404 Not Found" : "500 Server Error";
    std::string out = "HTTP/1.1 " + status + "\r\n";
    out += "Content-Type: " + response.contentType + "\r\n";
    out += "Content-Length: " + std::to_string(response.body.size()) + "\r\n";
    out += "Cache-Control: no-store\r\n";
    for (const auto& header : response.headers) out += header.first + ": " + header.second + "\r\n";
    out += "Connection: close\r\n\r\n";
    out += response.body;
    writeAll(socket, out);
    ::shutdown(socket, SHUT_WR);
    ::close(socket);
}

}  // namespace

void serve(int port, App& app) {
    ::signal(SIGPIPE, SIG_IGN);
    int listener = ::socket(AF_INET, SOCK_STREAM, 0);
    if (listener < 0) return;
    int reuse = 1;
    ::setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof reuse);
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(uint16_t(port));
    if (::bind(listener, reinterpret_cast<sockaddr*>(&address), sizeof address) < 0) return;
    if (::listen(listener, 64) < 0) return;

    std::printf("E++ running at http://localhost:%d  (Ctrl+C to stop)\n", port);
    std::fflush(stdout);
    while (true) {
        int client = ::accept(listener, nullptr, nullptr);
        if (client < 0) continue;
        std::thread(handleConnection, client, std::ref(app)).detach();
    }
}

}  // namespace epp
