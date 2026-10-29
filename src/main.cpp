#include "vault.hpp"
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
    std::cout << "   E++ Programming Language [1.3.5]                 \n";
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
    std::cout << "\nSealed projects (Release 1.2):\n";
    std::cout << "  epp --key <64 hex> <file.enpp>       Open with one key\n";
    std::cout << "  epp --keyring <keys.json> <file>     Try every key in a keyring\n";
    std::cout << "  epp --new-key                        Print a fresh vault key\n";
    std::cout << "  epp --save <in> -o <out> [--key]     Save a project\n";
    std::cout << "  epp --open <file> [--key]            Print a saved project\n";
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
    } catch (const epp::LexError& e) {
        print_deterministic_error(e.code, e.code == "E101" ? "Invalid Syntax" : "Quote Error", filename, e.line, e.col, e.what(), e.code == "E101" ? "Use note [text] for comments and close every note." : "Close quotes on the same line and give variables a name.", source);
        return false;
    } catch (const epp::LogicError& e) {
        print_deterministic_error("E402", "Logic Error", filename, e.line, e.col, e.what(), "Check the 3 Golden Rules: no quotes for math, single quotes for variables, double quotes for strings.", source);
        return false;
    } catch (const epp::ParseError& e) {
        std::string reason = e.what();
        std::string err_code = e.code;
        std::string help = err_code == "E302" ? "Open the full E++ Studio to use drawing sprites." : "Verify statement syntax and matching keywords.";
        if (reason.find("otherwise") != std::string::npos && err_code == "E101") {
            err_code = "E103";
            help = "In E++, 'otherwise' must be on the line immediately following the 'if' statement.";
        }
        print_deterministic_error(err_code, "Syntax Error", filename, e.line, e.col, reason, help, source);
        return false;
    } catch (const epp::LibraryError& e) {
        print_deterministic_error(e.code, "Library Error", filename, e.line, e.col, e.what(),
                                  e.code == "E301" ? "Add the library at the top of your program: add the \"<Library>\" library" : "Check the library name or open the full E++ Studio.", source);
        return false;
    } catch (const epp::RuntimeError& e) {
        std::string reason = e.what();
        std::string err_code = "E702";
        std::string help = "Review the execution logic.";
        if (reason.find("has not been defined") != std::string::npos) {
            err_code = "E201";
            help = "Define the variable before using it.";
        } else if (reason.find("zero") != std::string::npos) {
            err_code = "E403";
            help = "Use a divisor other than zero.";
        } else if (reason.find("Type Error") != std::string::npos || reason.find("Math Error") != std::string::npos) {
            err_code = "E405";
            help = "Use valid numbers for this operation.";
        } else if (reason.find("turtle") != std::string::npos) {
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

    // Pull the vault flags out first so they work before or after the file.
    std::string key_hex;
    std::string keyring_path;
    std::vector<std::string> args;
    for (int i = 0; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--key" && i + 1 < argc) { key_hex = argv[++i]; continue; }
        if (arg == "--keyring" && i + 1 < argc) { keyring_path = argv[++i]; continue; }
        args.push_back(arg);
    }

    std::vector<epp::VaultKey> keys;
    epp::VaultKey single_key{};
    bool have_single_key = false;
    if (!key_hex.empty()) {
        if (!epp::key_from_hex(key_hex, single_key)) {
            std::cerr << "[E++ Error E522: Bad Key] --key needs 64 hex characters (a 32-byte E++ vault key).\n";
            return 1;
        }
        have_single_key = true;
        keys.push_back(single_key);
    }
    std::vector<epp::VaultKey> from_keyring = epp::load_keyring(keyring_path);
    keys.insert(keys.end(), from_keyring.begin(), from_keyring.end());
    std::vector<epp::VaultKey> from_env = epp::keyring_from_environment();
    keys.insert(keys.end(), from_env.begin(), from_env.end());
    if (!keys.empty()) epp::set_keyring(keys);

    std::string arg1 = args[1];

    if (arg1 == "-h" || arg1 == "--help") {
        print_help();
        return 0;
    }
    if (arg1 == "-v" || arg1 == "--version") {
        print_banner();
        return 0;
    }

    // Fresh key for sealing a project from the command line.
    if (arg1 == "--new-key") {
        epp::VaultKey fresh = epp::random_key();
        std::string hex = epp::to_hex(std::vector<uint8_t>(fresh.begin(), fresh.end()));
        std::cout << hex << "\n";
        std::cerr << "Key fingerprint: " << epp::fingerprint(fresh) << "\n";
        return 0;
    }

    // Save a project
    if ((arg1 == "--save" || arg1 == "--encrypt") && args.size() >= 3) {
        std::string src_path = args[2];
        std::ifstream f(src_path);
        if (!f.is_open()) {
            std::cerr << "Error: Could not open file '" << src_path << "'\n";
            return 1;
        }
        std::stringstream buf; buf << f.rdbuf();
        epp::VaultKey key = have_single_key ? single_key : epp::random_key();
        std::string sealed_text = epp::save_project(buf.str(), key);
        std::string out_path = src_path;
        if (args.size() >= 5 && (args[3] == "-o" || args[3] == "--output")) out_path = args[4];
        std::ofstream out(out_path);
        out << sealed_text;
        std::cout << "Saved " << src_path << " -> " << out_path
                  << "\nKey (hex): " << epp::to_hex(std::vector<uint8_t>(key.begin(), key.end()))
                  << "\nFingerprint: " << epp::fingerprint(key)
                  << "\nKeep the key: the project cannot be opened without it.\n";
        return 0;
    }

    // Print a saved project
    if ((arg1 == "--open" || arg1 == "--decrypt") && args.size() >= 3) {
        std::string src_path = args[2];
        std::ifstream f(src_path);
        if (!f.is_open()) {
            std::cerr << "Error: Could not open file '" << src_path << "'\n";
            return 1;
        }
        std::stringstream buf; buf << f.rdbuf();
        try {
            std::string plaintext = epp::open_vault(buf.str(), src_path);
            std::cout << plaintext << "\n";
            return 0;
        } catch (const std::exception& e) {
            std::cerr << e.what() << "\n";
            return 1;
        }
    }

    epp::Interpreter interpreter;

    if (arg1 == "-e" && args.size() >= 3) {
        std::string inline_code = args[2];
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
    if (epp::is_vault(source)) {
        try {
            source = epp::open_vault(source, filepath);
        } catch (const std::exception& e) {
            std::cerr << e.what() << "\n";
            return 1;
        }
    }

    bool ok = run_code(source, interpreter, filepath);
    return ok ? 0 : 1;
}
