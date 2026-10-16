// The IDE server: plain HTTP, the pages from web/, and the E++ engine behind it.
#pragma once

#include <map>
#include <string>
#include <vector>

#include "engine.hpp"
#include "json.hpp"
#include "store.hpp"
#include "text.hpp"

namespace epp {

struct Request {
    std::string method;
    std::string path;
    std::map<std::string, std::string> query;
    std::map<std::string, std::string> form;
    std::map<std::string, std::string> headers;
    std::string body;
};

struct Response {
    int status = 200;
    std::string contentType = "text/html; charset=utf-8";
    std::string body;
    std::map<std::string, std::string> headers;
};

class App {
public:
    App(std::string projectRoot, std::string webDir, std::string dataDir, std::string workspaceDir);

    void load();
    Response handle(const Request& request);

private:
    // pages
    Response idePage(const std::string& file, const std::string& query, const std::string& answers,
                     const std::string& code, const std::string& notice, const std::string& kind,
                     const std::string& output, const std::string& spriteGrid);
    Response tutorialPage(const std::string& lessonId, const std::string& notice, const std::string& kind);
    Response settingsPage(const std::string& notice);
    Response aboutPage();
    Response fileFormPage(const std::string& mode, const std::string& file);
    Response page(const std::string& title, const std::string& content, const std::string& notice = "",
                  const std::string& kind = "", const std::string& extraClass = "");

    // helpers
    std::string renderConsole(const std::vector<LineOut>& lines, size_t limit) const;
    std::string renderFiles(const std::string& active, const std::string& filter) const;
    std::string renderLibraryCards(const std::string& active) const;
    std::string renderLessons(const std::string& activeId) const;
    std::string renderSettingsGroups() const;
    std::string renderSpriteGrid(const std::vector<Sprite>& sprites) const;
    std::string flashHtml(const std::string& notice, const std::string& kind) const;
    std::string currentFile(const std::string& asked) const;

    Json tutorial() const;         // data/tutorial.json plus the lessons you added
    Json officialTutorial() const; // data/tutorial.json only
    std::string workspaceFile(const std::string& name) const;
    std::string settingsClass() const;
    std::string baseVars(const std::string& title, const std::string& content, const std::string& notice,
                         const std::string& kind) const;

    std::string projectRoot_;
    std::string webDir_;
    std::string dataDir_;
    std::string workspaceDir_;
    Store store_;
    Text text_;
    Json settings_;
    bool firstVisit_ = false;
};

// Blocks and answers requests until the process is stopped.
void serve(int port, App& app);

}  // namespace epp
