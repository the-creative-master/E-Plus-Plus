/*
 * E++ Release 1.2 — sealed projects (Encryption++), native implementation.
 *
 * js/vault.js is the reference implementation; this file has to stay
 * byte-compatible with it and with lexer.py, and tests/run-tests.mjs
 * cross-checks all three. The container layout is intentionally not written
 * out in prose here — read js/vault.js if you are maintaining the format.
 *
 * Keys are kept outside the file: --key <64 hex> or --keyring <json>, or a
 * keyring file found next to the project (epp-keys.json / keyring.json) or in
 * the EPP_KEYRING environment variable.
 */
#ifndef EPP_VAULT_HPP
#define EPP_VAULT_HPP

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace epp {

using VaultKey = std::array<uint8_t, 32>;
using Sha256Digest = std::array<uint8_t, 32>;

// ---- primitives (exposed so the test-suite can cross-check the format) ----
Sha256Digest sha256(const std::vector<uint8_t>& data);
Sha256Digest hmac_sha256(const std::vector<uint8_t>& key, const std::vector<uint8_t>& message);
std::array<uint8_t, 64> chacha20_block(const VaultKey& key, const std::array<uint8_t, 12>& nonce, uint32_t counter);
std::vector<uint8_t> chacha20_xor(const VaultKey& key, const std::array<uint8_t, 12>& nonce,
                                  const std::vector<uint8_t>& data, uint32_t counter = 0);

std::string base64_encode(const std::vector<uint8_t>& data);
std::vector<uint8_t> base64_decode(const std::string& text);
std::string to_hex(const std::vector<uint8_t>& data);
std::string fingerprint(const VaultKey& key);

// ---- vault ----
bool is_vault(const std::string& text);
VaultKey random_key();
bool key_from_hex(const std::string& hex, VaultKey& out);
std::string encrypt_epp(const std::string& plaintext, const VaultKey& key);
std::string decrypt_epp(const std::string& ciphertext, const VaultKey& key,
                        const std::string& filename = "<source>");

// ---- keyring ----
std::vector<VaultKey> load_keyring(const std::string& path);
std::vector<VaultKey> keyring_from_environment();
void set_keyring(std::vector<VaultKey> keys);
const std::vector<VaultKey>& active_keyring();
std::string open_vault(const std::string& ciphertext, const std::string& filename = "<source>");

} // namespace epp

#endif // EPP_VAULT_HPP
