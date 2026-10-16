// E++ command line: run a program, check it, or start the IDE server.
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "engine.hpp"
#include "server.hpp"
#include "store.hpp"
#include "text.hpp"

namespace {

std::string readAll(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return std::string();
    std::ostringstream buffer;
    buffer << in.rdbuf();
    return buffer.str();
}

void printUsage() {
    std::cout <<
        "E++ 6.2\n"
        "  epp run <file.eppl|file.eppla> [--answers \"one,two\"]   run a program\n"
        "  epp check <file>                                       parse without running\n"
        "  epp serve [--port 8000] [--root DIR] [--workspace DIR]  start the IDE\n"
        "  epp libraries                                          list the libraries\n"
        "  epp version\n";
}

void printSpriteGrid(const std::vector<epp::Sprite>& sprites) {
    if (sprites.empty()) return;
    const int width = 41;
    const int height = 13;
    std::vector<std::string> grid(size_t(height), std::string(size_t(width), '.'));
    for (const epp::Sprite& sprite : sprites) {
        int column = int(width / 2 + sprite.x / 5);
        int row = int(height / 2 + sprite.y / 5);
        if (column < 0 || column >= width || row < 0 || row >= height) continue;
        grid[size_t(row)][size_t(column)] = sprite.name.empty() ? '#' : char(std::toupper(static_cast<unsigned char>(sprite.name[0])));
    }
    std::cout << "\n";
    for (const std::string& row : grid) std::cout << "  " << row << "\n";
}

}  // namespace

int main(int argc, char** argv) {
    std::vector<std::string> args(argv + 1, argv + argc);
    if (args.empty() || args[0] == "help" || args[0] == "--help" || args[0] == "-h") {
        printUsage();
        return args.empty() ? 1 : 0;
    }

    const std::string& command = args[0];

    if (command == "version") {
        std::cout << "E++ 6.2 (C++ engine)\n";
        return 0;
    }

    if (command == "libraries") {
        for (const epp::LibraryInfo& library : epp::libraryCatalogue()) {
            std::cout << library.name << " — " << library.description << "\n    add library \"" << library.name << "\"\n";
        }
        return 0;
    }

    if (command == "check" || command == "run") {
        if (args.size() < 2) {
            std::cerr << "Which file?\n";
            return 1;
        }
        std::string path = args[1];
        std::string source = readAll(path);
        if (!std::ifstream(path).good()) {
            std::cerr << "Cannot read " << path << "\n";
            return 1;
        }
        size_t slash = path.find_last_of('/');
        std::string name = slash == std::string::npos ? path : path.substr(slash + 1);

        if (command == "check") {
            epp::Error error = epp::check(source, name);
            if (error.empty()) {
                std::cout << name << " is valid E++.\n";
                return 0;
            }
            std::cout << error.format() << "\n";
            return 1;
        }

        epp::Options options;
        options.fileName = name;
        options.librariesAllowed = epp::Store::extensionOf(name) != ".eppl";
        options.sleep = [](unsigned ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); };
        for (size_t i = 2; i < args.size(); ++i) {
            if (args[i] == "--answers" && i + 1 < args.size()) {
                std::string text = args[++i];
                std::string current;
                for (char c : text) {
                    if (c == ',') { if (!current.empty()) options.answers.push_back(epp::trim(current)); current.clear(); }
                    else current.push_back(c);
                }
                if (!current.empty()) options.answers.push_back(epp::trim(current));
            }
        }
        epp::Result result = epp::run(source, options);
        for (const epp::LineOut& line : result.lines) {
            if (line.kind == epp::Line::Error) {
                std::cout << line.text << "\n";
            } else if (line.kind == epp::Line::Library) {
                std::cout << "· " << line.text << "\n";
            } else if (line.kind == epp::Line::Divider) {
                continue;
            } else {
                std::cout << line.text << "\n";
            }
        }
        printSpriteGrid(result.sprites);
        return result.ok ? 0 : 1;
    }

    if (command == "serve") {
        int port = 8000;
        std::string root = ".";
        std::string workspace = "";
        for (size_t i = 1; i < args.size(); ++i) {
            if (args[i] == "--port" && i + 1 < args.size()) port = std::atoi(args[++i].c_str());
            else if (args[i] == "--root" && i + 1 < args.size()) root = args[++i];
            else if (args[i] == "--workspace" && i + 1 < args.size()) workspace = args[++i];
        }
        if (workspace.empty()) workspace = root + "/workspace";
        epp::App app(root, root + "/web", root + "/data", workspace);
        app.load();
        epp::serve(port, app);
        return 0;
    }

    std::cerr << "Unknown command \"" << command << "\"\n";
    printUsage();
    return 1;
}
