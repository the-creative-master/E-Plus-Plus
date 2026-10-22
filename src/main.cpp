#include "lexer.hpp"
#include "parser.hpp"
#include "interpreter.hpp"
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

void print_banner() {
    std::cout << "=========================================================\n";
    std::cout << "   E++ Programming Language [1.1 Workspace Patch 2]     \n";
    std::cout << "   \"Looks like English, feels like english, and is english\"\n";
    std::cout << "=========================================================\n";
}

void print_help() {
    print_banner();
    std::cout << "\nUsage:\n";
    std::cout << "  epp <script.epp>        Run an E++ script file\n";
    std::cout << "  epp -e \"<code>\"         Execute inline E++ code\n";
    std::cout << "  epp                     Start the interactive E++ REPL\n";
    std::cout << "  epp --help, -h          Show this help message\n";
    std::cout << "  epp --version, -v       Show version info\n";
    std::cout << "\nExamples:\n";
    std::cout << "  say \"Hello, World!\"\n";
    std::cout << "  say 1 plus 1\n";
    std::cout << "  let 'Grade' be 29\n";
    std::cout << "  say 'Grade'\n";
    std::cout << "  add the \"Math\" library\n";
    std::cout << "  say the square root of 2\n";
}

static void print_deterministic_error(const std::string& code, const std::string& name,
                                       const std::string& filename, int line, int col,
                                       const std::string& reason, const std::string& help_msg,
                                       const std::string& source = "") {
    std::cerr << "\n[E++ Error " << code << ": " << name << "]\n";
    std::cerr << "  --> " << filename << ":" << line << ":" << col << "\n";
    std::cerr << "   |\n";
    if (!source.empty()) {
        std::istringstream st(source);
        std::string cur;
        int cur_l = 1;
        while (std::getline(st, cur)) {
            if (cur_l == line) {
                std::cerr << "  " << line << " | " << cur << "\n";
                std::cerr << "   | ";
                for (int i = 1; i < col; i++) std::cerr << " ";
                std::cerr << "^\n";
                break;
            }
            cur_l++;
        }
    }
    std::cerr << "   = Reason: " << reason << "\n";
    std::cerr << "   = Help: " << help_msg << "\n\n";
}

bool run_code(const std::string& source, epp::Interpreter& interpreter, const std::string& filename = "<cli>") {
    try {
        epp::Lexer lexer(source);
        auto tokens = lexer.tokenize();

        epp::Parser parser(tokens);
        auto statements = parser.parse_program();

        interpreter.execute(statements);
        return true;
    } catch (const epp::LogicError& e) {
        print_deterministic_error("E402", "Logic Error", filename, e.line, e.col, e.what(), "Check the 3 Golden Rules: no quotes for math, single quotes for variables, double quotes for strings.", source);
        return false;
    } catch (const epp::ParseError& e) {
        std::string reason = e.what();
        std::string err_code = "E101";
        std::string help = "Verify statement syntax and matching keywords.";
        if (reason.find("otherwise") != std::string::npos) {
            err_code = "E103";
            help = "In E++, 'otherwise' must be on the line immediately following the 'if' statement.";
        }
        print_deterministic_error(err_code, "Syntax Error", filename, e.line, e.col, reason, help, source);
        return false;
    } catch (const epp::LibraryError& e) {
        print_deterministic_error("E301", "Library Not Added", filename, e.line, e.col, e.what(), "Add the library at the top of your program: add the \"<Library>\" library", source);
        return false;
    } catch (const epp::RuntimeError& e) {
        std::string reason = e.what();
        std::string err_code = "E702";
        std::string help = "Review the execution logic.";
        if (reason.find("turtle") != std::string::npos) {
            err_code = "E701";
            help = "The 'turtle' library is not supported in E++. Use standard data and math libraries instead.";
        }
        print_deterministic_error(err_code, "Runtime Error", filename, e.line, e.col, reason, help, source);
        return false;
    } catch (const std::exception& e) {
        print_deterministic_error("E101", "Execution Exception", filename, 1, 1, e.what(), "Check your program structure.", source);
        return false;
    }
}

void run_repl() {
    print_banner();
    std::cout << "Type E++ code and press Enter. Type 'exit' or 'quit' to exit.\n\n";

    epp::Interpreter interpreter;
    std::string line;

    while (true) {
        std::cout << "E++ > ";
        if (!std::getline(std::cin, line)) break;
        if (line == "exit" || line == "quit") break;
        if (line.empty()) continue;

        run_code(line, interpreter);
    }
    std::cout << "\nGoodbye from E++!\n";
}

int main(int argc, char* argv[]) {
    if (argc == 1) {
        run_repl();
        return 0;
    }

    std::string arg1 = argv[1];
    if (arg1 == "-h" || arg1 == "--help") {
        print_help();
        return 0;
    }
    if (arg1 == "-v" || arg1 == "--version") {
        print_banner();
        return 0;
    }

    // Encryption tool
    if (arg1 == "--encrypt" && argc >= 3) {
        std::string src_path = argv[2];
        std::ifstream f(src_path);
        if (!f.is_open()) {
            std::cerr << "Error: Could not open file '" << src_path << "'\n";
            return 1;
        }
        std::stringstream buf; buf << f.rdbuf();
        std::string encrypted = epp::encrypt_epp(buf.str());
        std::string out_path = (argc >= 5 && std::string(argv[3]) == "-o") ? argv[4] : src_path;
        std::ofstream out(out_path);
        out << encrypted;
        std::cout << "Encrypted " << src_path << " -> " << out_path << " with Release 1.1 millisecond frame key.\n";
        return 0;
    }

    // Decryption tool
    if (arg1 == "--decrypt" && argc >= 3) {
        std::string src_path = argv[2];
        std::ifstream f(src_path);
        if (!f.is_open()) {
            std::cerr << "Error: Could not open file '" << src_path << "'\n";
            return 1;
        }
        std::stringstream buf; buf << f.rdbuf();
        try {
            std::string decrypted = epp::decrypt_epp(buf.str(), src_path);
            std::cout << decrypted << "\n";
            return 0;
        } catch (const std::exception& e) {
            std::cerr << e.what() << "\n";
            return 1;
        }
    }

    epp::Interpreter interpreter;

    if (arg1 == "-e" && argc >= 3) {
        std::string inline_code = argv[2];
        bool ok = run_code(inline_code, interpreter);
        return ok ? 0 : 1;
    }

    // Run script file
    std::string filepath = arg1;
    std::ifstream file(filepath);
    if (!file.is_open()) {
        std::cerr << "Error: Could not open file '" << filepath << "'\n";
        return 1;
    }

    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string source = buffer.str();

    bool ok = run_code(source, interpreter, filepath);
    return ok ? 0 : 1;
}
