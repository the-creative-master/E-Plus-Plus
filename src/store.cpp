#include "store.hpp"

#include <algorithm>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <sstream>

#include "engine.hpp"
#include "text.hpp"

namespace fs = std::filesystem;

namespace epp {
namespace {

std::string readWholeFile(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return std::string();
    std::ostringstream buffer;
    buffer << in.rdbuf();
    return buffer.str();
}

bool writeWholeFile(const std::string& path, const std::string& content) {
    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    if (!out) return false;
    out << content;
    return out.good();
}

std::string stamp(const fs::path& path) {
    std::error_code error;
    auto time = fs::last_write_time(path, error);
    if (error) return "";
    std::time_t seconds = std::chrono::duration_cast<std::chrono::seconds>(time.time_since_epoch()).count();
    std::tm parts{};
#if defined(_WIN32)
    localtime_s(&parts, &seconds);
#else
    localtime_r(&seconds, &parts);
#endif
    char buffer[32];
    std::strftime(buffer, sizeof buffer, "%Y-%m-%d %H:%M", &parts);
    return buffer;
}

}  // namespace

Store::Store(std::string root) : root_(std::move(root)) {}

bool Store::ensure() const {
    std::error_code error;
    fs::create_directories(root_, error);
    return !error;
}

std::string Store::pathFor(const std::string& name) const { return root_ + "/" + name; }

bool Store::validName(const std::string& name) {
    return !name.empty() && name.find('/') == std::string::npos && name.find('\\') == std::string::npos &&
           name.find("..") == std::string::npos;
}

std::string Store::extensionOf(const std::string& name) {
    size_t dot = name.rfind('.');
    if (dot == std::string::npos) return "";
    return lower(name.substr(dot));
}

std::string Store::nameFor(const std::string& wanted, const std::string& content) {
    std::string name = trim(wanted);
    if (!validName(name)) return "";
    std::string extension = extensionOf(name);
    if (extension == ".eppl" || extension == ".eppla") return name;
    if (!extension.empty()) return "";  // some other extension: refuse
    return name + (usesLibrary(content) ? ".eppla" : ".eppl");
}

std::string Store::upgradedFor(const std::string& name, const std::string& content) {
    if (extensionOf(name) != ".eppl") return name;
    if (!usesLibrary(content)) return name;
    return name.substr(0, name.size() - 5) + ".eppla";
}

std::string Store::errorForName(const std::string& wanted, const std::string& content) {
    if (trim(wanted).empty()) return "A file needs a name.";
    if (!validName(wanted)) return "File names cannot contain slashes or \"..\".";
    std::string extension = extensionOf(wanted);
    if (!extension.empty() && extension != ".eppl" && extension != ".eppla") {
        return "E++ files end in .eppl or .eppla, not " + extension + ".";
    }
    (void)content;
    return "";
}

std::vector<FileInfo> Store::list(const std::string& filter) const {
    std::vector<FileInfo> files;
    std::error_code error;
    if (!fs::exists(root_, error)) return files;
    std::string needle = lower(trim(filter));
    for (const auto& entry : fs::directory_iterator(root_, error)) {
        if (error) break;
        if (!entry.is_regular_file()) continue;
        std::string name = entry.path().filename().string();
        if (name.size() > 0 && name[0] == '.') continue;
        std::string extension = extensionOf(name);
        if (extension != ".eppl" && extension != ".eppla") continue;
        if (!needle.empty() && lower(name).find(needle) == std::string::npos) continue;
        FileInfo info;
        info.name = name;
        info.size = long(entry.file_size(error));
        info.updated = stamp(entry.path());
        files.push_back(info);
    }
    std::sort(files.begin(), files.end(), [](const FileInfo& a, const FileInfo& b) { return lower(a.name) < lower(b.name); });
    return files;
}

bool Store::exists(const std::string& name) const {
    std::error_code error;
    return validName(name) && fs::is_regular_file(pathFor(name), error);
}

std::string Store::read(const std::string& name, bool* ok) const {
    if (!validName(name)) { if (ok) *ok = false; return std::string(); }
    std::ifstream in(pathFor(name), std::ios::binary);
    if (!in) { if (ok) *ok = false; return std::string(); }
    if (ok) *ok = true;
    std::ostringstream buffer;
    buffer << in.rdbuf();
    return buffer.str();
}

bool Store::write(const std::string& name, const std::string& content) const {
    return validName(name) && writeWholeFile(pathFor(name), content);
}

bool Store::create(const std::string& name, const std::string& content) const {
    return !exists(name) && write(name, content);
}

bool Store::rename(const std::string& from, const std::string& to) const {
    if (!exists(from) || !validName(to)) return false;
    std::error_code error;
    if (fs::exists(pathFor(to), error)) return false;
    fs::rename(pathFor(from), pathFor(to), error);
    return !error;
}

bool Store::remove(const std::string& name) const {
    std::error_code error;
    return validName(name) && fs::remove(pathFor(name), error) && !error;
}

int Store::restoreExamples(const std::string& examplesDir) const {
    std::error_code error;
    int added = 0;
    if (!fs::exists(examplesDir, error)) return 0;
    for (const auto& entry : fs::directory_iterator(examplesDir, error)) {
        if (!entry.is_regular_file()) continue;
        std::string name = entry.path().filename().string();
        std::string extension = extensionOf(name);
        if (extension != ".eppl" && extension != ".eppla") continue;
        if (exists(name)) continue;
        if (write(name, readWholeFile(entry.path().string()))) ++added;
    }
    return added;
}

Json Store::loadSettings(const Json& defaults) const {
    std::string error;
    Json stored = jsonParse(readWholeFile(pathFor(".settings.json")), &error);
    if (!error.empty() || !stored.isObject()) return defaults;
    Json merged = defaults;
    for (const auto& entry : defaults.fields()) {
        if (stored.has(entry.first) && !stored.at(entry.first).isNull()) {
            merged.set(entry.first, stored.at(entry.first));
        }
    }
    return merged;
}

void Store::saveSettings(const Json& settings) const {
    ensure();
    writeWholeFile(pathFor(".settings.json"), settings.dump(2) + "\n");
}

Json Store::loadCustomLessons() const {
    std::string error;
    Json stored = jsonParse(readWholeFile(pathFor(".lessons.json")), &error);
    if (!error.empty() || !stored.isArray()) return Json::array();
    return stored;
}

void Store::saveCustomLessons(const Json& lessons) const {
    ensure();
    writeWholeFile(pathFor(".lessons.json"), lessons.dump(2) + "\n");
}

}  // namespace epp
