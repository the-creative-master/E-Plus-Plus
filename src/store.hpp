// Files on disk: the program files, the settings and any lessons you add.
#pragma once

#include <string>
#include <vector>

#include "json.hpp"

namespace epp {

struct FileInfo {
    std::string name;
    long size = 0;
    std::string updated;  // "2026-10-16 18:04"
};

class Store {
public:
    // `root` is the folder that holds the .eppl/.eppla files (created if needed).
    explicit Store(std::string root);

    bool ensure() const;
    const std::string& root() const { return root_; }

    std::vector<FileInfo> list(const std::string& filter = "") const;
    bool exists(const std::string& name) const;
    std::string read(const std::string& name, bool* ok = nullptr) const;
    bool write(const std::string& name, const std::string& content) const;
    bool create(const std::string& name, const std::string& content) const;
    bool rename(const std::string& from, const std::string& to) const;
    bool remove(const std::string& name) const;

    // Copies example programs in; returns how many were added.
    int restoreExamples(const std::string& examplesDir) const;

    // Fills in a missing extension and rejects anything else.
    static bool validName(const std::string& name);
    static std::string extensionOf(const std::string& name);
    static std::string nameFor(const std::string& wanted, const std::string& content);
    // A .eppl file whose code now uses libraries becomes .eppla.
    static std::string upgradedFor(const std::string& name, const std::string& content);
    static std::string errorForName(const std::string& wanted, const std::string& content);

    // Settings and custom lessons live next to the program files.
    Json loadSettings(const Json& defaults) const;
    void saveSettings(const Json& settings) const;
    Json loadCustomLessons() const;
    void saveCustomLessons(const Json& lessons) const;

private:
    std::string pathFor(const std::string& name) const;
    std::string root_;
};

}  // namespace epp
