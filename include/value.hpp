#ifndef EPP_VALUE_HPP
#define EPP_VALUE_HPP

#include <string>
#include <sstream>
#include <iomanip>
#include <cmath>
#include <stdexcept>
#include <iostream>

namespace epp {

enum class ValueType {
    NIL,
    NUMBER,
    STRING,
    BOOLEAN
};

class Value {
public:
    ValueType type;
    double number_val = 0.0;
    std::string string_val;
    bool bool_val = false;

    Value() : type(ValueType::NIL) {}
    Value(double n) : type(ValueType::NUMBER), number_val(n) {}
    Value(int n) : type(ValueType::NUMBER), number_val(static_cast<double>(n)) {}
    Value(const std::string& s) : type(ValueType::STRING), string_val(s) {}
    Value(const char* s) : type(ValueType::STRING), string_val(s) {}
    Value(bool b) : type(ValueType::BOOLEAN), bool_val(b) {}

    static Value make_nil() { return Value(); }
    static Value make_number(double n) { return Value(n); }
    static Value make_string(const std::string& s) { return Value(s); }
    static Value make_bool(bool b) { return Value(b); }

    bool is_nil() const { return type == ValueType::NIL; }
    bool is_number() const { return type == ValueType::NUMBER; }
    bool is_string() const { return type == ValueType::STRING; }
    bool is_bool() const { return type == ValueType::BOOLEAN; }

    bool can_be_number() const {
        if (type == ValueType::NUMBER) return true;
        if (type == ValueType::STRING) {
            if (string_val.empty()) return false;
            try {
                size_t idx = 0;
                // Skip leading whitespaces
                size_t start = string_val.find_first_not_of(" \t\r\n");
                if (start == std::string::npos) return false;
                std::stod(string_val.substr(start), &idx);
                size_t end = string_val.find_first_not_of(" \t\r\n", start + idx);
                return (end == std::string::npos);
            } catch (...) {
                return false;
            }
        }
        return false;
    }

    double as_number() const {
        if (type == ValueType::NUMBER) return number_val;
        if (type == ValueType::STRING) {
            try {
                return std::stod(string_val);
            } catch (...) {
                throw std::runtime_error("Cannot convert string '" + string_val + "' to a number");
            }
        }
        if (type == ValueType::BOOLEAN) return bool_val ? 1.0 : 0.0;
        return 0.0;
    }

    std::string to_string() const {
        switch (type) {
            case ValueType::NIL:
                return "nil";
            case ValueType::BOOLEAN:
                return bool_val ? "true" : "false";
            case ValueType::STRING:
                return string_val;
            case ValueType::NUMBER: {
                if (std::isnan(number_val)) return "NaN";
                if (std::isinf(number_val)) return number_val > 0 ? "Infinity" : "-Infinity";
                // If it is integer
                if (std::floor(number_val) == number_val && std::abs(number_val) < 1e15) {
                    std::ostringstream ss;
                    ss << static_cast<long long>(number_val);
                    return ss.str();
                }
                std::ostringstream ss;
                ss << std::setprecision(10) << number_val;
                std::string s = ss.str();
                return s;
            }
        }
        return "";
    }

    bool is_truthy() const {
        if (type == ValueType::BOOLEAN) return bool_val;
        if (type == ValueType::NIL) return false;
        if (type == ValueType::NUMBER) return number_val != 0.0;
        if (type == ValueType::STRING) return !string_val.empty();
        return false;
    }

    bool equals(const Value& other) const {
        if (type != other.type) {
            if (can_be_number() && other.can_be_number()) {
                return as_number() == other.as_number();
            }
            return false;
        }
        switch (type) {
            case ValueType::NIL: return true;
            case ValueType::BOOLEAN: return bool_val == other.bool_val;
            case ValueType::NUMBER: return number_val == other.number_val;
            case ValueType::STRING: return string_val == other.string_val;
        }
        return false;
    }
};

} // namespace epp

#endif // EPP_VALUE_HPP
