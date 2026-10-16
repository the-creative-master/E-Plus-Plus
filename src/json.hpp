// Minimal JSON for E++: enough to read the data files and answer the API.
#pragma once

#include <map>
#include <string>
#include <vector>

namespace epp {

class Json {
public:
    enum class Type { Null, Bool, Number, String, Array, Object };

    Json() : type_(Type::Null), bool_(false), number_(0) {}
    explicit Json(bool value) : type_(Type::Bool), bool_(value), number_(0) {}
    explicit Json(double value) : type_(Type::Number), bool_(false), number_(value) {}
    explicit Json(const std::string& value) : type_(Type::String), bool_(false), number_(0), string_(value) {}
    explicit Json(const char* value) : type_(Type::String), bool_(false), number_(0), string_(value ? value : "") {}

    static Json array() { Json j; j.type_ = Type::Array; return j; }
    static Json object() { Json j; j.type_ = Type::Object; return j; }

    Type type() const { return type_; }
    bool isNull() const { return type_ == Type::Null; }
    bool isBool() const { return type_ == Type::Bool; }
    bool isNumber() const { return type_ == Type::Number; }
    bool isString() const { return type_ == Type::String; }
    bool isArray() const { return type_ == Type::Array; }
    bool isObject() const { return type_ == Type::Object; }

    bool boolean() const { return bool_; }
    double number() const { return number_; }
    const std::string& str() const { return string_; }

    // Reads coerced values, so data files may use "2" or 2 interchangeably.
    std::string string(const std::string& fallback = "") const;
    double numeric(double fallback = 0) const;
    bool flag(bool fallback = false) const;

    const std::vector<Json>& items() const { return array_; }
    const std::map<std::string, Json>& fields() const { return object_; }

    void push(const Json& value) { type_ = Type::Array; array_.push_back(value); }
    void set(const std::string& key, const Json& value) { type_ = Type::Object; object_[key] = value; }
    bool has(const std::string& key) const { return type_ == Type::Object && object_.count(key) > 0; }
    const Json& at(const std::string& key) const;
    const Json& at(size_t index) const;

    std::string dump(int indent = 0) const;

private:
    Type type_;
    bool bool_;
    double number_;
    std::string string_;
    std::vector<Json> array_;
    std::map<std::string, Json> object_;
};

// Returns a null Json when the text does not parse; use lastJsonError() for why.
Json jsonParse(const std::string& text, std::string* error = nullptr);
std::string jsonEscape(const std::string& text);

}  // namespace epp
