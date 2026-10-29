cmake_minimum_required(VERSION 3.12)
project(EPlusPlus VERSION 1.3.5 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

add_executable(epp
    src/lexer.cpp
    src/parser.cpp
    src/interpreter.cpp
    src/vault.cpp
    src/main.cpp
)
