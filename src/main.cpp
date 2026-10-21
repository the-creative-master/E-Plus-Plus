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
    std::cout << "   E++ Programming Language [Release 1.0]                \n";
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

bool run_code(const std::string& source, epp::Interpreter& interpreter) {
    try {
        epp::Lexer lexer(source);
        auto tokens = lexer.tokenize();

        epp::Parser parser(tokens);
        auto statements = parser.parse_program();

        interpreter.execute(statements);
        return true;
    } catch (const epp::LogicError& e) {
        std::cerr << "\n[E++ Logic Error] " << e.what() << "\n";
        return false;
    } catch (const epp::ParseError& e) {
        std::cerr << "\n[E++ Syntax Error] " << e.what() << "\n";
        return false;
    } catch (const epp::LibraryError& e) {
        std::cerr << "\n[E++ Library Error] " << e.what() << "\n";
        return false;
    } catch (const epp::RuntimeError& e) {
        std::cerr << "\n[E++ Runtime Error] " << e.what() << "\n";
        return false;
    } catch (const std::exception& e) {
        std::cerr << "\n[E++ Syntax Error] " << e.what() << "\n";
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

    bool ok = run_code(source, interpreter);
    return ok ? 0 : 1;
}
