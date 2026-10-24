/*
 * E++ Release 1.2 — project files, native implementation.
 * See include/vault.hpp for the format. No external dependencies.
 */
#include "vault.hpp"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <fstream>
#include <random>
#include <sstream>
#include <stdexcept>
#include <cstring>

namespace epp {

namespace {

const uint8_t VAULT_MAGIC[3] = {0x8b, 0xe7, 0x1c};
const uint8_t VAULT_VERSION = 0x12;
const size_t VAULT_HEADER = 16;   // magic(3) + version(1) + nonce(12)
const size_t VAULT_TAG = 32;
const size_t VAULT_NONCE = 12;

const char* B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

inline uint32_t rotr32(uint32_t value, int count) {
    return (value >> count) | (value << (32 - count));
}

inline uint32_t rotl32(uint32_t value, int count) {
    return (value << count) | (value >> (32 - count));
}

inline uint32_t load_le32(const uint8_t* p) {
    return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
           (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}

inline void store_le32(uint8_t* p, uint32_t value) {
    p[0] = value & 0xff;
    p[1] = (value >> 8) & 0xff;
    p[2] = (value >> 16) & 0xff;
    p[3] = (value >> 24) & 0xff;
}

const uint32_t SHA256_K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};

void sha256_transform(uint32_t state[8], const uint8_t block[64]) {
    uint32_t w[64];
    for (int i = 0; i < 16; i++) {
        w[i] = (static_cast<uint32_t>(block[i * 4]) << 24) |
               (static_cast<uint32_t>(block[i * 4 + 1]) << 16) |
               (static_cast<uint32_t>(block[i * 4 + 2]) << 8) |
               static_cast<uint32_t>(block[i * 4 + 3]);
    }
    for (int i = 16; i < 64; i++) {
        uint32_t s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >> 3);
        uint32_t s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = state[0], b = state[1], c = state[2], d = state[3];
    uint32_t e = state[4], f = state[5], g = state[6], h = state[7];
    for (int i = 0; i < 64; i++) {
        uint32_t s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        uint32_t ch = (e & f) ^ (~e & g);
        uint32_t temp1 = h + s1 + ch + SHA256_K[i] + w[i];
        uint32_t s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
        uint32_t temp2 = s0 + maj;
        h = g; g = f; f = e; e = d + temp1;
        d = c; c = b; b = a; a = temp1 + temp2;
    }
    state[0] += a; state[1] += b; state[2] += c; state[3] += d;
    state[4] += e; state[5] += f; state[6] += g; state[7] += h;
}

void quarter_round(uint32_t* s, int a, int b, int c, int d) {
    s[a] += s[b]; s[d] = rotl32(s[d] ^ s[a], 16);
    s[c] += s[d]; s[b] = rotl32(s[b] ^ s[c], 12);
    s[a] += s[b]; s[d] = rotl32(s[d] ^ s[a], 8);
    s[c] += s[d]; s[b] = rotl32(s[b] ^ s[c], 7);
}

bool constant_time_equal(const std::vector<uint8_t>& a, const std::vector<uint8_t>& b) {
    if (a.size() != b.size()) return false;
    uint8_t diff = 0;
    for (size_t i = 0; i < a.size(); i++) diff |= static_cast<uint8_t>(a[i] ^ b[i]);
    return diff == 0;
}

std::string read_file(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) return std::string();
    std::ostringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

std::vector<uint8_t> string_bytes(const std::string& text) {
    return std::vector<uint8_t>(text.begin(), text.end());
}

// Very small JSON scan: every "key": "<base64>" value in a keyring file.
std::vector<std::string> extract_key_values(const std::string& json) {
    std::vector<std::string> values;
    size_t pos = 0;
    while ((pos = json.find("\"key\"", pos)) != std::string::npos) {
        size_t colon = json.find(':', pos);
        if (colon == std::string::npos) break;
        size_t quote = json.find('"', colon);
        if (quote == std::string::npos) break;
        size_t end = json.find('"', quote + 1);
        if (end == std::string::npos) break;
        values.push_back(json.substr(quote + 1, end - quote - 1));
        pos = end + 1;
    }
    return values;
}

} // namespace

// ---------------------------------------------------------------- SHA-256
Sha256Digest sha256(const std::vector<uint8_t>& data) {
    uint32_t state[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                         0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
    std::vector<uint8_t> padded(data);
    uint64_t bit_length = static_cast<uint64_t>(data.size()) * 8ULL;
    padded.push_back(0x80);
    while (padded.size() % 64 != 56) padded.push_back(0x00);
    for (int i = 7; i >= 0; i--) padded.push_back(static_cast<uint8_t>((bit_length >> (i * 8)) & 0xff));
    for (size_t offset = 0; offset < padded.size(); offset += 64) {
        sha256_transform(state, &padded[offset]);
    }
    Sha256Digest digest{};
    for (int i = 0; i < 8; i++) {
        digest[i * 4] = static_cast<uint8_t>((state[i] >> 24) & 0xff);
        digest[i * 4 + 1] = static_cast<uint8_t>((state[i] >> 16) & 0xff);
        digest[i * 4 + 2] = static_cast<uint8_t>((state[i] >> 8) & 0xff);
        digest[i * 4 + 3] = static_cast<uint8_t>(state[i] & 0xff);
    }
    return digest;
}

Sha256Digest hmac_sha256(const std::vector<uint8_t>& key, const std::vector<uint8_t>& message) {
    const size_t BLOCK = 64;
    std::vector<uint8_t> padded(key);
    if (padded.size() > BLOCK) {
        Sha256Digest hashed = sha256(padded);
        padded.assign(hashed.begin(), hashed.end());
    }
    padded.resize(BLOCK, 0x00);
    std::vector<uint8_t> inner(BLOCK), outer(BLOCK);
    for (size_t i = 0; i < BLOCK; i++) {
        inner[i] = static_cast<uint8_t>(padded[i] ^ 0x36);
        outer[i] = static_cast<uint8_t>(padded[i] ^ 0x5c);
    }
    inner.insert(inner.end(), message.begin(), message.end());
    Sha256Digest inner_hash = sha256(inner);
    outer.insert(outer.end(), inner_hash.begin(), inner_hash.end());
    return sha256(outer);
}

// ---------------------------------------------------------------- ChaCha20
std::array<uint8_t, 64> chacha20_block(const VaultKey& key, const std::array<uint8_t, 12>& nonce, uint32_t counter) {
    uint32_t state[16];
    state[0] = 0x61707865; state[1] = 0x3320646e; state[2] = 0x79622d32; state[3] = 0x6b206574;
    for (int i = 0; i < 8; i++) state[4 + i] = load_le32(&key[i * 4]);
    state[12] = counter;
    state[13] = load_le32(&nonce[0]);
    state[14] = load_le32(&nonce[4]);
    state[15] = load_le32(&nonce[8]);

    uint32_t working[16];
    std::copy(state, state + 16, working);
    for (int round = 0; round < 10; round++) {
        quarter_round(working, 0, 4, 8, 12);
        quarter_round(working, 1, 5, 9, 13);
        quarter_round(working, 2, 6, 10, 14);
        quarter_round(working, 3, 7, 11, 15);
        quarter_round(working, 0, 5, 10, 15);
        quarter_round(working, 1, 6, 11, 12);
        quarter_round(working, 2, 7, 8, 13);
        quarter_round(working, 3, 4, 9, 14);
    }
    std::array<uint8_t, 64> out{};
    for (int i = 0; i < 16; i++) store_le32(&out[i * 4], working[i] + state[i]);
    return out;
}

std::vector<uint8_t> chacha20_xor(const VaultKey& key, const std::array<uint8_t, 12>& nonce,
                                  const std::vector<uint8_t>& data, uint32_t counter) {
    std::vector<uint8_t> out(data.size());
    for (size_t offset = 0; offset < data.size(); offset += 64) {
        std::array<uint8_t, 64> block = chacha20_block(key, nonce, counter);
        counter += 1;
        size_t limit = std::min<size_t>(64, data.size() - offset);
        for (size_t i = 0; i < limit; i++) out[offset + i] = static_cast<uint8_t>(data[offset + i] ^ block[i]);
    }
    return out;
}

// ---------------------------------------------------------------- base64
std::string base64_encode(const std::vector<uint8_t>& data) {
    std::string out;
    size_t i = 0;
    while (i + 2 < data.size()) {
        uint32_t triple = (static_cast<uint32_t>(data[i]) << 16) |
                          (static_cast<uint32_t>(data[i + 1]) << 8) |
                          static_cast<uint32_t>(data[i + 2]);
        out += B64_CHARS[(triple >> 18) & 0x3f];
        out += B64_CHARS[(triple >> 12) & 0x3f];
        out += B64_CHARS[(triple >> 6) & 0x3f];
        out += B64_CHARS[triple & 0x3f];
        i += 3;
    }
    if (i < data.size()) {
        uint32_t triple = static_cast<uint32_t>(data[i]) << 16;
        bool has_second = (i + 1 < data.size());
        if (has_second) triple |= static_cast<uint32_t>(data[i + 1]) << 8;
        out += B64_CHARS[(triple >> 18) & 0x3f];
        out += B64_CHARS[(triple >> 12) & 0x3f];
        out += has_second ? B64_CHARS[(triple >> 6) & 0x3f] : '=';
        out += '=';
    }
    return out;
}

std::vector<uint8_t> base64_decode(const std::string& text) {
    static int lookup[256];
    static bool ready = false;
    if (!ready) {
        for (int i = 0; i < 256; i++) lookup[i] = -1;
        for (int i = 0; i < 64; i++) lookup[static_cast<unsigned char>(B64_CHARS[i])] = i;
        ready = true;
    }
    std::string clean;
    for (char c : text) {
        if (!std::isspace(static_cast<unsigned char>(c))) clean += c;
    }
    if (clean.size() % 4 != 0) throw std::runtime_error("bad base64 length");
    std::vector<uint8_t> out;
    for (size_t i = 0; i < clean.size(); i += 4) {
        int values[4];
        for (int j = 0; j < 4; j++) {
            char c = clean[i + j];
            values[j] = (c == '=') ? 0 : lookup[static_cast<unsigned char>(c)];
            if (values[j] < 0) throw std::runtime_error("bad base64 character");
        }
        out.push_back(static_cast<uint8_t>((values[0] << 2) | (values[1] >> 4)));
        if (clean[i + 2] != '=') out.push_back(static_cast<uint8_t>(((values[1] & 0xf) << 4) | (values[2] >> 2)));
        if (clean[i + 3] != '=') out.push_back(static_cast<uint8_t>(((values[2] & 0x3) << 6) | values[3]));
    }
    return out;
}

std::string to_hex(const std::vector<uint8_t>& data) {
    static const char* digits = "0123456789abcdef";
    std::string out;
    for (uint8_t byte : data) {
        out += digits[byte >> 4];
        out += digits[byte & 0x0f];
    }
    return out;
}

std::string fingerprint(const VaultKey& key) {
    std::string label = "E++ Vault v1 fingerprint";
    std::vector<uint8_t> data = string_bytes(label);
    data.insert(data.end(), key.begin(), key.end());
    Sha256Digest digest = sha256(data);
    return to_hex(std::vector<uint8_t>(digest.begin(), digest.begin() + 3));
}

// ---------------------------------------------------------------- keys
VaultKey random_key() {
    VaultKey key{};
    std::random_device device;
    for (size_t i = 0; i < key.size(); i += 4) {
        uint32_t value = device();
        std::memcpy(&key[i], &value, key.size() - i >= 4 ? 4 : key.size() - i);
    }
    return key;
}

bool key_from_hex(const std::string& hex, VaultKey& out) {
    std::string clean;
    for (char c : hex) {
        if (!std::isspace(static_cast<unsigned char>(c)) && c != '-' && c != ':') clean += c;
    }
    if (clean.size() != 64) return false;
    for (size_t i = 0; i < 32; i++) {
        char high = clean[i * 2], low = clean[i * 2 + 1];
        auto value = [](char c) -> int {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            return -1;
        };
        int h = value(high), l = value(low);
        if (h < 0 || l < 0) return false;
        out[i] = static_cast<uint8_t>((h << 4) | l);
    }
    return true;
}

// ---------------------------------------------------------------- vault
bool is_vault(const std::string& text) {
    try {
        std::string trimmed = text;
        while (!trimmed.empty() && std::isspace(static_cast<unsigned char>(trimmed.back()))) trimmed.pop_back();
        if (trimmed.empty()) return false;
        std::vector<uint8_t> raw = base64_decode(text);
        return raw.size() > VAULT_HEADER + VAULT_TAG &&
               raw[0] == VAULT_MAGIC[0] && raw[1] == VAULT_MAGIC[1] && raw[2] == VAULT_MAGIC[2];
    } catch (...) {
        return false;
    }
}

std::string save_project(const std::string& plaintext, const VaultKey& key) {
    std::vector<uint8_t> enc_label = string_bytes("E++ Vault v1 encryption");
    std::vector<uint8_t> mac_label = string_bytes("E++ Vault v1 authentication");
    std::vector<uint8_t> master(key.begin(), key.end());
    Sha256Digest enc_digest = hmac_sha256(master, enc_label);
    Sha256Digest mac_digest = hmac_sha256(master, mac_label);
    VaultKey enc_key{};
    std::copy(enc_digest.begin(), enc_digest.end(), enc_key.begin());

    VaultKey random_source = random_key();
    std::array<uint8_t, 12> nonce{};
    std::copy(random_source.begin(), random_source.begin() + 12, nonce.begin());

    std::vector<uint8_t> body = chacha20_xor(enc_key, nonce, string_bytes(plaintext));
    std::vector<uint8_t> payload;
    payload.push_back(VAULT_MAGIC[0]);
    payload.push_back(VAULT_MAGIC[1]);
    payload.push_back(VAULT_MAGIC[2]);
    payload.push_back(VAULT_VERSION);
    payload.insert(payload.end(), nonce.begin(), nonce.end());
    payload.insert(payload.end(), body.begin(), body.end());

    Sha256Digest tag = hmac_sha256(std::vector<uint8_t>(mac_digest.begin(), mac_digest.end()), payload);
    payload.insert(payload.end(), tag.begin(), tag.end());

    std::string encoded = base64_encode(payload);
    std::string out;
    for (size_t i = 0; i < encoded.size(); i += 60) {
        out += encoded.substr(i, 60);
        out += "\n";
    }
    return out;
}

std::string load_project(const std::string& ciphertext, const VaultKey& key, const std::string& filename) {
    (void)filename;
    std::vector<uint8_t> raw;
    try {
        raw = base64_decode(ciphertext);
    } catch (...) {
        throw std::runtime_error("[E++ Error E511: Not an E++ vault] The file is not a sealed E++ project.");
    }
    if (raw.size() < VAULT_HEADER + VAULT_TAG) {
        throw std::runtime_error("[E++ Error E512: Truncated vault] The file is smaller than its own header.");
    }
    if (raw[0] != VAULT_MAGIC[0] || raw[1] != VAULT_MAGIC[1] || raw[2] != VAULT_MAGIC[2]) {
        throw std::runtime_error("[E++ Error E511: Not an E++ vault] The file does not start with the E++ vault signature.");
    }
    if (raw[3] != VAULT_VERSION) {
        throw std::runtime_error("[E++ Error E513: Different vault version] This file was written by another release of E++.");
    }

    std::vector<uint8_t> enc_label = string_bytes("E++ Vault v1 encryption");
    std::vector<uint8_t> mac_label = string_bytes("E++ Vault v1 authentication");
    std::vector<uint8_t> master(key.begin(), key.end());
    Sha256Digest enc_digest = hmac_sha256(master, enc_label);
    Sha256Digest mac_digest = hmac_sha256(master, mac_label);
    VaultKey enc_key{};
    std::copy(enc_digest.begin(), enc_digest.end(), enc_key.begin());

    std::array<uint8_t, 12> nonce{};
    std::copy(raw.begin() + 4, raw.begin() + 4 + 12, nonce.begin());
    std::vector<uint8_t> payload(raw.begin(), raw.end() - VAULT_TAG);
    std::vector<uint8_t> tag(raw.end() - VAULT_TAG, raw.end());
    std::vector<uint8_t> expected = [&]() {
        Sha256Digest digest = hmac_sha256(std::vector<uint8_t>(mac_digest.begin(), mac_digest.end()), payload);
        return std::vector<uint8_t>(digest.begin(), digest.end());
    }();
    if (!constant_time_equal(expected, tag)) {
        throw std::runtime_error("[E++ Error E520: Wrong key] This key does not open this project.");
    }
    std::vector<uint8_t> body(payload.begin() + VAULT_HEADER, payload.end());
    std::vector<uint8_t> plain = chacha20_xor(enc_key, nonce, body);
    return std::string(plain.begin(), plain.end());
}

// ---------------------------------------------------------------- keyring
std::vector<VaultKey> load_keyring(const std::string& path) {
    std::vector<VaultKey> keys;
    if (path.empty()) return keys;
    std::string json = read_file(path);
    if (json.empty()) return keys;
    for (const std::string& value : extract_key_values(json)) {
        try {
            std::vector<uint8_t> raw = base64_decode(value);
            if (raw.size() == 32) {
                VaultKey key{};
                std::copy(raw.begin(), raw.end(), key.begin());
                keys.push_back(key);
            }
        } catch (...) {
            // Skip values that are not base64 keys.
        }
    }
    return keys;
}

std::vector<VaultKey> keyring_from_environment() {
    std::vector<VaultKey> keys;
    const char* env_path = std::getenv("EPP_KEYRING");
    if (env_path) {
        std::vector<VaultKey> from_env = load_keyring(env_path);
        keys.insert(keys.end(), from_env.begin(), from_env.end());
    }
    for (const char* candidate : {"epp-keys.json", "keyring.json"}) {
        std::vector<VaultKey> found = load_keyring(candidate);
        keys.insert(keys.end(), found.begin(), found.end());
    }
    return keys;
}

namespace {
std::vector<VaultKey> g_keyring;
}

void set_keyring(std::vector<VaultKey> keys) { g_keyring = std::move(keys); }

const std::vector<VaultKey>& active_keyring() {
    if (g_keyring.empty()) g_keyring = keyring_from_environment();
    return g_keyring;
}

std::string open_vault(const std::string& ciphertext, const std::string& filename) {
    const std::vector<VaultKey>& keys = active_keyring();
    std::string last_error;
    for (const VaultKey& key : keys) {
        try {
            return load_project(ciphertext, key, filename);
        } catch (const std::runtime_error& error) {
            std::string message = error.what();
            if (message.find("E520") == std::string::npos) throw;
            last_error = message;
        }
    }
    if (last_error.empty()) {
        throw std::runtime_error(
            "[E++ Error E521: No key available] This project is sealed. Pass --key <64 hex characters> or save the "
            "Studio's epp-keys.json next to the project (or set EPP_KEYRING).");
    }
    throw std::runtime_error(last_error + " (no saved key opened it)");
}

} // namespace epp
