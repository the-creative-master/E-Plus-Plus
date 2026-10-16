# E++ — build the engine, the IDE server and the tests.
CXX      ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -pthread
BUILD    := build
ENGINE   := $(filter-out src/main.cpp,$(wildcard src/*.cpp))

.PHONY: all test clean run

all: $(BUILD)/epp

$(BUILD)/epp: $(wildcard src/*.cpp) $(wildcard src/*.hpp) | $(BUILD)
	$(CXX) $(CXXFLAGS) -o $@ $(wildcard src/*.cpp)

$(BUILD)/engine_test: $(wildcard tests/*.cpp) $(ENGINE) | $(BUILD)
	$(CXX) $(CXXFLAGS) -I src -o $@ $(wildcard tests/*.cpp) $(ENGINE)

$(BUILD):
	mkdir -p $(BUILD)

# Unit tests, then an end-to-end pass through the real server.
test: $(BUILD)/epp $(BUILD)/engine_test
	$(BUILD)/engine_test
	tests/http_smoke.sh
	tests/no_refs.sh

# Start the IDE: make run PORT=8000
run: $(BUILD)/epp
	$(BUILD)/epp serve --port $(or $(PORT),8000)

clean:
	rm -rf $(BUILD)
