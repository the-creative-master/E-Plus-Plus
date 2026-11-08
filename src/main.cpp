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
    std::cout << "   E++ Programming Language [1.4]                 \n";
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
    std::cout << "\nSealed project files:\n";
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

// Release 1.4: one reporter for every family.
//
//   [E++ Error F004: Unterminated String]     a fatal lexer error
//     --> file.epp:3:7
//      |
//    3 | say "unterminated
//      |     ^
//     = Reason: ...
//     = Help: ...
//
// E codes are general errors, W codes are warnings (the program still runs),
// Z codes only exist in E++.zip and F codes are fatal. The numbers are the
// ones documented in LANGUAGE.md and js/errors.js.
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

// The English names of the general codes the native engine can raise. The
// strings match js/errors.js exactly; epp.py has the same table.
static std::string error_name(const std::string& code) {
    // 1.4: the whole catalogue, mirrored from js/errors.js (75 E, 5 W,
    // 5 Z and 15 F codes). Keep this list in step with the catalogue.
    if (code == "E001") return "Unquoted Text";
    if (code == "E002") return "Bare Variable Name";
    if (code == "E003") return "Missing Value";
    if (code == "E004") return "Unfinished Value";
    if (code == "E005") return "Unterminated Double Quote";
    if (code == "E006") return "Unterminated Single Quote";
    if (code == "E007") return "Empty Variable Name";
    if (code == "E008") return "Empty Value";
    if (code == "E009") return "Invalid Character In A Variable Name";
    if (code == "E010") return "Value Out Of Range";
    if (code == "E011") return "Value Is Not A Number";
    if (code == "E012") return "Unsupported Escape Sequence";
    if (code == "E013") return "Equation Inside Quotes";
    if (code == "E014") return "Empty String";
    if (code == "E015") return "Unknown Statement";
    if (code == "E016") return "Empty Statement";
    if (code == "E017") return "Unexpected Block Ending";
    if (code == "E018") return "Unclosed Block";
    if (code == "E019") return "Mismatched Block Ending";
    if (code == "E020") return "Missing Then";
    if (code == "E021") return "Invalid Otherwise Placement";
    if (code == "E022") return "Standalone Otherwise";
    if (code == "E023") return "Missing Repeat Count";
    if (code == "E024") return "Invalid Repeat Count";
    if (code == "E025") return "Missing While Condition";
    if (code == "E026") return "Invalid Comparison";
    if (code == "E027") return "Invalid Condition";
    if (code == "E028") return "Undefined Variable";
    if (code == "E029") return "Variable Already Defined";
    if (code == "E030") return "Invalid Variable Name";
    if (code == "E031") return "Missing Assignment Value";
    if (code == "E032") return "Not A Number";
    if (code == "E033") return "Division By Zero (fraction)";
    if (code == "E034") return "Square Root Of A Negative Number";
    if (code == "E035") return "Invalid Fraction";
    if (code == "E036") return "Variables Are Not Quoted";
    if (code == "E037") return "Change Needs A Number";
    if (code == "E038") return "Amount Must Be A Number";
    if (code == "E039") return "Ask Needs A Variable";
    if (code == "E040") return "Missing Ask Question";
    if (code == "E041") return "Variable Name Is Too Long";
    if (code == "E042") return "Library Not Added";
    if (code == "E043") return "Unknown Library";
    if (code == "E044") return "Library Name Not Quoted";
    if (code == "E045") return "Invalid Library Statement";
    if (code == "E046") return "Libraries Need An .eppla File";
    if (code == "E047") return "Python Library Not Added";
    if (code == "E048") return "Python Code Is Not E++";
    if (code == "E049") return "Python Code Block Never Ends";
    if (code == "E050") return "Empty Python Code";
    if (code == "E051") return "Library Already Added";
    if (code == "E052") return "File Needs A Name";
    if (code == "E053") return "File Already Exists";
    if (code == "E054") return "File Not Found";
    if (code == "E055") return "Wrong File Extension";
    if (code == "E056") return "Not An E++ Project";
    if (code == "E057") return "Damaged Project File";
    if (code == "E058") return "Project Saved By Another Release";
    if (code == "E059") return "Key Does Not Open This Project";
    if (code == "E060") return "E++ Does Not Use This Punctuation";
    if (code == "E061") return "Symbols Are Not Values";
    if (code == "E062") return "Unexpected Word";
    if (code == "E063") return "Unexpected End Of Line";
    if (code == "E064") return "Unexpected End Of Program";
    if (code == "E065") return "Unclosed Parenthesis";
    if (code == "E066") return "Division By Zero (numbers)";
    if (code == "E067") return "The Program Ran Too Long";
    if (code == "E068") return "Endless Loop";
    if (code == "E069") return "Stop Used Outside A Repeat";
    if (code == "E070") return "Execution Stopped";
    if (code == "E071") return "Picture Is Empty";
    if (code == "E072") return "Value Is Not A Picture";
    if (code == "E073") return "Unknown Actor";
    if (code == "E074") return "Unknown Image";
    if (code == "E075") return "Sprite Not Defined";
    if (code == "W001") return "Text Looks Like An Equation";
    if (code == "W002") return "Variable Name Looks Like Text";
    if (code == "W003") return "Library Added But Unused";
    if (code == "W004") return "Continued On The Next Line";
    if (code == "W005") return "Number Written As Text";
    if (code == "Z001") return "Colors Live In The Studio";
    if (code == "Z002") return "Draw Is Not In E++.zip";
    if (code == "Z003") return "Game Is Not In E++.zip";
    if (code == "Z004") return "ImprovedWait Is Not In E++.zip";
    if (code == "Z005") return "JavaScript Runtime Is Not In E++.zip";
    if (code == "F001") return "Lexer Received Invalid Input";
    if (code == "F002") return "The Program Is Too Large To Lex";
    if (code == "F003") return "Unrecognised Character";
    if (code == "F004") return "Unterminated String";
    if (code == "F005") return "Unterminated Variable Name";
    if (code == "F006") return "Empty Variable Reference";
    if (code == "F007") return "Reserved Lexer Code";
    if (code == "F008") return "Note Without Brackets";
    if (code == "F009") return "Line Contains A Null Character";
    if (code == "F010") return "Unrecognised Number";
    if (code == "F011") return "Comment Characters Are Not E++";
    if (code == "F012") return "Word Is Too Long";
    if (code == "F013") return "Unexpected End Of Input Inside A Value";
    if (code == "F014") return "Invalid Escape Sequence";
    if (code == "F015") return "Lexer Could Not Build The Token Stream";
    return "E++ Error " + code;
}

// The one-line fix for a code whose call site does not supply its own help.
static std::string error_help(const std::string& code) {
    if (code == "E001") return "Put text in double quotes, or use single quotes for a variable.";
    if (code == "E002") return "Write the variable name inside single quotes, for example: let 'score' be 0";
    if (code == "E003") return "Give the statement a value to use, for example: say \"Hello\"";
    if (code == "E004") return "Finish the value, for example: say 2 plus 3";
    if (code == "E005") return "Close the string with a second double quote (\") on the same line.";
    if (code == "E006") return "Close the variable name with a second single quote (') on the same line.";
    if (code == "E007") return "Put a name between the single quotes, for example: 'score'";
    if (code == "E008") return "Give the statement something between the quotes, or remove the quotes.";
    if (code == "E009") return "Use letters, digits, spaces, underscores or hyphens inside the quotes.";
    if (code == "E010") return "Use a smaller value, for example: repeat 10 times";
    if (code == "E011") return "Use a number, or a variable that holds a number.";
    if (code == "E012") return "E++ understands \\n, \\t, \\\", \\\\ and \\r inside double quotes.";
    if (code == "E013") return "Remove the quotes so E++ can work out the maths: say 1 plus 1";
    if (code == "E014") return "Write something between the quotes: say \"Hello\"";
    if (code == "E015") return "Statements start with a word such as say, let, if, repeat, while, note or add library.";
    if (code == "E016") return "Remove the leftover punctuation or put a statement on that line.";
    if (code == "E017") return "Remove the leftover ending, or open the block it belongs to.";
    if (code == "E018") return "Close the block with its own ending, for example: end repeat";
    if (code == "E019") return "An if closes with end if, a repeat with end repeat and a while with end while.";
    if (code == "E020") return "Write the decision like this: if 1 is 1 then say \"Yes\"";
    if (code == "E021") return "Move otherwise to the line straight after its if.";
    if (code == "E022") return "Put otherwise immediately after the if it belongs to.";
    if (code == "E023") return "Write the loop like this: repeat 3 times";
    if (code == "E024") return "Repeat needs a whole number from 0 to 100000, for example: repeat 3 times";
    if (code == "E025") return "Write the loop like this: while 'count' is less than 4 do";
    if (code == "E026") return "Compare with \"equal to\", \"greater than\", \"less than\" or the number tests.";
    if (code == "E027") return "Write a condition such as: if 'score' is greater than 10 then";
    if (code == "E028") return "Define the variable first, for example: let 'score' be 0";
    if (code == "E029") return "Pick another name, or change the existing variable with Set.";
    if (code == "E030") return "Write the name in single quotes, for example: let 'score' be 0";
    if (code == "E031") return "Give the variable a value, for example: let 'score' be 0";
    if (code == "E032") return "Use a number, or a variable that holds a number, in the maths.";
    if (code == "E033") return "A fraction cannot have zero underneath. Change the number after \"divided by\".";
    if (code == "E034") return "Square roots need a number that is zero or more.";
    if (code == "E035") return "A fraction cannot have zero underneath.";
    if (code == "E036") return "Variables use single quotes and text uses double quotes.";
    if (code == "E037") return "Only numbers can go up or down: define 'score' as 0 first.";
    if (code == "E038") return "Write a number after \"by\", for example: Increase 'score' by 1";
    if (code == "E039") return "Save the answer like this: ask \"Name?\" and save the output as 'name'";
    if (code == "E040") return "Give the ask a question, for example: ask \"Your name?\" and save the output as 'name'";
    if (code == "E041") return "Keep variable names to 64 characters or fewer.";
    if (code == "E042") return "Add the library before using what it unlocks, for example: add library \"Math\"";
    if (code == "E043") return "Check the spelling, or look at the Libraries panel for the full list.";
    if (code == "E044") return "Write the library name in double quotes, for example: add library \"Math\"";
    if (code == "E045") return "Write it like this: add library \"Math\"";
    if (code == "E046") return "Rename the file so it ends in .eppla: a file that uses libraries is an .eppla file.";
    if (code == "E047") return "Add this line above the Python code: add library \"Python\"";
    if (code == "E048") return "To run Python, add the Python library and use: python code \"...\"";
    if (code == "E049") return "Close the Python block with its own closing quote.";
    if (code == "E050") return "Put the Python code between the quotes: python code \"print(1)\"";
    if (code == "E051") return "Remove the repeated line; the library is already loaded.";
    if (code == "E052") return "Give the file a name such as hello.eppl or game.eppla.";
    if (code == "E053") return "Pick a different name, or open the existing file.";
    if (code == "E054") return "Create the file first, or pick another one in the explorer.";
    if (code == "E055") return "Files that use libraries are .eppla files; files without libraries are .eppl files.";
    if (code == "E056") return "Open a project file that E++ saved, or start a new .eppl file.";
    if (code == "E057") return "Download the project again to get a complete file.";
    if (code == "E058") return "Open the project with the release that saved it, then save it again.";
    if (code == "E059") return "Import the project in the browser that saved it, or add its key.";
    if (code == "E060") return "E++ uses words for maths: plus, minus, times, divided by.";
    if (code == "E061") return "Names start with a letter or an underscore.";
    if (code == "E062") return "Check the sentence structure: E++ statements read like English sentences.";
    if (code == "E063") return "Finish the statement, or continue it on the next line.";
    if (code == "E064") return "Finish the idea: a value, a condition or a block ending is missing.";
    if (code == "E065") return "Add the closing ) where the maths ends.";
    if (code == "E066") return "Change the number after \"divided by\" so it is not zero.";
    if (code == "E067") return "Check for a loop that never ends.";
    if (code == "E068") return "Make sure the loop can finish, or add conditions that eventually stop it.";
    if (code == "E069") return "stop ends a repeat loop, so put it inside repeat ... end repeat.";
    if (code == "E070") return "Press Run again when you are ready.";
    if (code == "E071") return "Link a picture file to the actor: link the image \"hero.png\" to the actor 'hero'";
    if (code == "E072") return "Use a picture file such as \"hero.png\", or pick one with the Image button.";
    if (code == "E073") return "Create the actor first: create the actor 'hero' with the image \"hero.png\"";
    if (code == "E074") return "Define the image first: define 'cat' as image \"<picture>\"";
    if (code == "E075") return "Define the sprite first: define 'pencil' as drawing sprite";
    if (code == "W001") return "Remove the quotes if you wanted the maths: say 1 plus 1";
    if (code == "W002") return "Use double quotes for text and single quotes for variables.";
    if (code == "W003") return "Remove the library line, or use one of its features.";
    if (code == "W004") return "One statement per line keeps the structure clear.";
    if (code == "W005") return "Write the number without double quotes, for example: wait 2 seconds";
    if (code == "Z001") return "Download the full E++ Studio to print in color. In E++.zip use a plain say statement.";
    if (code == "Z002") return "Download the full E++ Studio to draw with sprites.";
    if (code == "Z003") return "Download the full E++ Studio to create games and actors.";
    if (code == "Z004") return "In E++.zip use ImprovedWaitLite: add library \"ImprovedWaitLite\"";
    if (code == "Z005") return "Use the native engine or epp.py in E++.zip, or download the full Studio for the JavaScript runtime.";
    if (code == "F001") return "Pass the program as text (a string) to the lexer.";
    if (code == "F002") return "Split the program into smaller files.";
    if (code == "F003") return "E++ uses words for maths. Remove or replace this character.";
    if (code == "F004") return "Close the string, for example: say \"Hello\".";
    if (code == "F005") return "Close it, for example: say 'name'.";
    if (code == "F006") return "Put a variable name between the single quotes.";
    if (code == "F007") return "Unterminated notes are general program errors and use E064.";
    if (code == "F008") return "Write notes like this: note [Your note]";
    if (code == "F009") return "Remove the invisible NUL character (it usually arrives from a binary file).";
    if (code == "F010") return "Write numbers as digits, for example 42 or 3.5.";
    if (code == "F011") return "E++ notes do not use // or #. Use: note [Your note]";
    if (code == "F012") return "Keep words to 256 characters or fewer.";
    if (code == "F013") return "Finish the value before the line or the program ends.";
    if (code == "F014") return "E++ understands \\n, \\t, \\\", \\\\ and \\r inside double quotes.";
    if (code == "F015") return "This is a bug in E++: report it with the program that caused it.";
    return "Check the program and try again.";
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
        // F001-F015: the lexer could not build a token stream at all.
        print_deterministic_error(e.code, e.name.empty() ? "Fatal Lexer Error" : e.name,
                                  filename, e.line, e.col, e.what(),
                                  e.help.empty() ? error_help(e.code) : e.help, source);
        return false;
    } catch (const epp::LogicError& e) {
        // Valid E++, but the value does not mean anything: unquoted text.
        print_deterministic_error(e.code, error_name(e.code), filename, e.line, e.col, e.what(),
                                  error_help(e.code), source);
        return false;
    } catch (const epp::ParseError& e) {
        print_deterministic_error(e.code, error_name(e.code), filename, e.line, e.col, e.what(),
                                  error_help(e.code), source);
        return false;
    } catch (const epp::LibraryError& e) {
        print_deterministic_error(e.code, error_name(e.code), filename, e.line, e.col, e.what(),
                                  error_help(e.code), source);
        return false;
    } catch (const epp::RuntimeError& e) {
        // The interpreter now names its own general code; older messages that
        // arrive without one are classified here.
        std::string reason = e.what();
        std::string err_code = e.code;
        if (reason.find("has not been defined") != std::string::npos) err_code = "E028";
        else if (reason.find("zero") != std::string::npos) err_code = "E066";
        else if (reason.find("Type Error") != std::string::npos || reason.find("Math Error") != std::string::npos) err_code = "E032";
        else if (reason.find("turtle") != std::string::npos) err_code = "E048";
        print_deterministic_error(err_code, error_name(err_code), filename, e.line, e.col, reason,
                                  error_help(err_code), source);
        return false;
    } catch (const std::exception& e) {
        print_deterministic_error("E015", "Execution Exception", filename, 1, 1, e.what(),
                                  "Check your program structure.", source);
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
            std::cerr << "[E++ Error E059: Key Does Not Open This Project] --key needs 64 hex characters (a 32-byte E++ vault key).\n";
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
