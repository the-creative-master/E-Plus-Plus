CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2 -Iinclude

SRCS = src/lexer.cpp src/parser.cpp src/interpreter.cpp src/vault.cpp src/main.cpp
OBJS = $(SRCS:.cpp=.o)
DEPS = $(OBJS:.o=.d)
TARGET = epp

.PHONY: all clean test zip wasm-lexer windows

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) -o $@ $^

src/%.o: src/%.cpp
	$(CXX) $(CXXFLAGS) -MMD -MP -c $< -o $@

-include $(DEPS)

clean:
	rm -f $(OBJS) $(DEPS) $(TARGET) epp.exe

zip: $(TARGET)
	@node tools/build-zip.mjs

# Requires Zig with the WASI target. Override with ZIG=/path/to/zig.
wasm-lexer:
	@node tools/build-lexer-wasm.mjs

# 1.5a1 — the optional epp.exe for Windows. Zig cross-compiles a static
# 64-bit console binary, so no Windows machine is needed to build it.
# Override with ZIG=/path/to/zig (or use the ziglang wheel on any platform).
windows:
	@node tools/build-windows.mjs

test: $(TARGET)
	@echo "=== Running E++ Tests (C++ Engine) ==="
	@./$(TARGET) -e 'note [Testing notes]'
	@./$(TARGET) -e 'say "Hello"'
	@./$(TARGET) -e 'say 1 plus 1'
	@./$(TARGET) -e 'say 1 minus 1'
	@./$(TARGET) -e 'say 2 times 3'
	@./$(TARGET) -e 'say 6 divided by 2'
	@./$(TARGET) -e 'check if "Hello" is not a number'
	@./$(TARGET) -e 'check if "Woohoo!" is a number'
	@./$(TARGET) -e 'if 1 plus 1 is equal to 2 then say "Duh, its math"'
	@printf 'let '\''Answer'\'' be 2\nif '\''Answer'\'' is equal to 2 then say "Correct!"\notherwise say "U dumb?"\n' | ./$(TARGET) -e "$$(cat)"
	@./$(TARGET) -e 'say "Hello ", and concat it with "World!"'
	@./$(TARGET) -e 'say 1 + 2 and concat it with 2 + 3'
	@./$(TARGET) -e 'say 1 + 2 and concat it with 2 + 3 with the seperation method of "-"'
	@./$(TARGET) -e 'say "Hello " and concat it with "World! " and concat it with "Welcome to E++!" with the seperation method of "sigma"'
	@./$(TARGET) -e 'say "Hello ", "World! ", "Welcome to E++!"'
	@./$(TARGET) examples/01_hello.enpp
	@./$(TARGET) examples/02_arithmetic.enpp
	@./$(TARGET) examples/03_variables_and_questions.enpp
	@./$(TARGET) examples/04_control_flow.enpp
	@./$(TARGET) examples/05_math_library.enppl
	@./$(TARGET) examples/06_files_library.enppl
	@./$(TARGET) examples/07_wait_until.enppl
	@./$(TARGET) examples/08_python_library.enppl
	@./$(TARGET) examples/09_strings_library.enppl
	@./$(TARGET) --keyring examples/epp-keys.json examples/10_saved_project.enpp
	@echo "=== Running E++ Tests (Python Runner) ==="
	@python3 epp.py examples/01_hello.enpp
	@python3 epp.py examples/02_arithmetic.enpp
	@python3 epp.py examples/03_variables_and_questions.enpp
	@python3 epp.py examples/04_control_flow.enpp
	@python3 epp.py examples/05_math_library.enppl
	@python3 epp.py examples/06_files_library.enppl
	@python3 epp.py examples/07_wait_until.enppl
	@python3 epp.py examples/08_python_library.enppl
	@python3 epp.py examples/09_strings_library.enppl
	@python3 epp.py --keyring examples/epp-keys.json examples/10_saved_project.enpp
	@python3 tests/cli-1.3.py
	@tmp=$$(mktemp); trap 'rm -f "$$tmp"' EXIT; \
	  $(CXX) $(CXXFLAGS) -DEPP_BROWSER_PLAINTEXT -DEPP_LEXER_TEST_MAIN src/lexer.cpp src/wasm_lexer.cpp -o "$$tmp" && \
	  node tests/native-lexer.mjs --probe "$$tmp"
	@echo "=== All Tests Passed! ==="
