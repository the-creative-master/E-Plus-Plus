CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2 -Iinclude

SRCS = src/lexer.cpp src/parser.cpp src/interpreter.cpp src/main.cpp
OBJS = $(SRCS:.cpp=.o)
TARGET = epp

.PHONY: all clean test

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) -o $@ $^

src/%.o: src/%.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET)

test: $(TARGET)
	@echo "=== Running E++ Tests ==="
	@./$(TARGET) -e 'note [Testing notes]'
	@./$(TARGET) -e 'say "Hello"'
	@./$(TARGET) -e 'say 1 plus 1'
	@./$(TARGET) -e 'say 1 minus 1'
	@./$(TARGET) -e 'say 2 times 3'
	@./$(TARGET) -e 'say 6 divided by 2'
	@./$(TARGET) -e 'check if "Hello" is not a number'
	@./$(TARGET) -e 'check if "Woohoo!" is a number'
	@./$(TARGET) -e 'say "Hello ", and concat it with "World!"'
	@./$(TARGET) -e 'say 1 + 2 and concat it with 2 + 3'
	@./$(TARGET) -e 'say 1 + 2 and concat it with 2 + 3 with the seperation method of "-"'
	@./$(TARGET) -e 'say "Hello " and concat it with "World! " and concat it with "Welcome to E++!" with the seperation method of "sigma"'
	@./$(TARGET) -e 'say "Hello ", "World! ", "Welcome to E++!"'
	@./$(TARGET) examples/04_variables.enpp
	@./$(TARGET) examples/06_math_library.enppl
	@./$(TARGET) examples/09_random_library.enppl
	@echo "=== All Tests Passed! ==="
