#!/usr/bin/env python3
"""
E++ (E-Plus-Plus) 1.3 Lexer and Subsystem
Written in Python for direct execution and runtime integration.
"""

import sys
import time
import struct
import base64
from enum import Enum, auto
from typing import List, Optional, Tuple, Dict, Any

# ==========================================
# Release 1.2 project files
# ==========================================
#
# A project that leaves the Studio is written in a container of its own. The
# key that opens it is made for that download and kept outside the file, in
# the browser's key store or in an exported keyring. js/vault.js and
# src/vault.cpp read and write the same bytes (tests/run-tests.mjs keeps the
# three in step).
#
# The layout is deliberately not described here: maintaining the format is
# what the cross-engine checks are for.

import hashlib
import hmac
import os

VAULT_MAGIC = b"\x8b\xe7\x1c"
VAULT_VERSION = 0x12
VAULT_HEADER = 16
VAULT_TAG = 32
VAULT_KEY_LEN = 32
VAULT_NONCE_LEN = 12
VAULT_ENC_LABEL = b"E++ Vault v1 encryption"
VAULT_MAC_LABEL = b"E++ Vault v1 authentication"


def _rotl32(value: int, count: int) -> int:
    return ((value << count) | (value >> (32 - count))) & 0xFFFFFFFF


def _quarter_round(state, a, b, c, d):
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF
    state[d] = _rotl32(state[d] ^ state[a], 16)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF
    state[b] = _rotl32(state[b] ^ state[c], 12)
    state[a] = (state[a] + state[b]) & 0xFFFFFFFF
    state[d] = _rotl32(state[d] ^ state[a], 8)
    state[c] = (state[c] + state[d]) & 0xFFFFFFFF
    state[b] = _rotl32(state[b] ^ state[c], 7)


def chacha20_block(key: bytes, nonce: bytes, counter: int) -> bytes:
    constants = [0x61707865, 0x3320646E, 0x79622D32, 0x6B206574]
    state = constants[:]
    for i in range(8):
        state.append(int.from_bytes(key[i * 4:i * 4 + 4], "little"))
    state.append(counter & 0xFFFFFFFF)
    for i in range(3):
        state.append(int.from_bytes(nonce[i * 4:i * 4 + 4], "little"))

    working = state[:]
    for _ in range(10):
        _quarter_round(working, 0, 4, 8, 12)
        _quarter_round(working, 1, 5, 9, 13)
        _quarter_round(working, 2, 6, 10, 14)
        _quarter_round(working, 3, 7, 11, 15)
        _quarter_round(working, 0, 5, 10, 15)
        _quarter_round(working, 1, 6, 11, 12)
        _quarter_round(working, 2, 7, 8, 13)
        _quarter_round(working, 3, 4, 9, 14)

    out = bytearray()
    for i in range(16):
        value = (working[i] + state[i]) & 0xFFFFFFFF
        out += value.to_bytes(4, "little")
    return bytes(out)


def chacha20_xor(key: bytes, nonce: bytes, data: bytes, counter: int = 0) -> bytes:
    out = bytearray()
    for offset in range(0, len(data), 64):
        block = chacha20_block(key, nonce, counter)
        counter += 1
        chunk = data[offset:offset + 64]
        out += bytes(a ^ b for a, b in zip(chunk, block))
    return bytes(out)


def vault_subkeys(master: bytes):
    if len(master) != VAULT_KEY_LEN:
        raise ValueError("An E++ project key must be 32 bytes.")
    enc = hmac.new(master, VAULT_ENC_LABEL, hashlib.sha256).digest()
    mac = hmac.new(master, VAULT_MAC_LABEL, hashlib.sha256).digest()
    return enc, mac


def random_key() -> bytes:
    return os.urandom(VAULT_KEY_LEN)


def key_from_hex(keyhex: str) -> bytes:
    key = bytes.fromhex(str(keyhex).strip())
    if len(key) != VAULT_KEY_LEN:
        raise ValueError("An E++ vault key must be 32 bytes (64 hex characters).")
    return key


def vault_fingerprint(master: bytes) -> str:
    digest = hashlib.sha256(b"E++ Vault v1 fingerprint" + master).digest()
    return digest[:3].hex()


def is_vault(text: str) -> bool:
    try:
        raw = base64.b64decode("".join(str(text).split()), validate=True)
    except Exception:
        return False
    return len(raw) > VAULT_HEADER + VAULT_TAG and raw[:3] == VAULT_MAGIC


def save_epp(plaintext: str, key: bytes) -> str:
    """Writes source code as a 1.2 project file with the given 32-byte key."""
    if isinstance(key, str):
        key = bytes.fromhex(key)
    enc_key, mac_key = vault_subkeys(key)
    nonce = os.urandom(VAULT_NONCE_LEN)
    body = chacha20_xor(enc_key, nonce, plaintext.encode("utf-8"))
    header = VAULT_MAGIC + bytes([VAULT_VERSION]) + nonce
    payload = header + body
    tag = hmac.new(mac_key, payload, hashlib.sha256).digest()
    encoded = base64.b64encode(payload + tag).decode("ascii")
    return "\n".join(encoded[i:i + 60] for i in range(0, len(encoded), 60)) + "\n"


def load_epp(ciphertext: str, key: bytes, filename: str = "<source>") -> str:
    """Reads a 1.2 project file. Raises EppDiagnosticError with E511-E520."""
    if isinstance(key, str):
        key = bytes.fromhex(key)
    try:
        raw = base64.b64decode("".join(str(ciphertext).split()), validate=True)
    except Exception:
        raise EppDiagnosticError(
            code="E511", name="This is not an E++ project", filename=filename,
            line=1, col=1, source_line="",
            reason="The file contains characters that are not part of an E++ project file.",
            help_msg="Download the project again from the E++ Studio, or check the file was not edited by hand."
        )
    if len(raw) < VAULT_HEADER + VAULT_TAG:
        raise EppDiagnosticError(
            code="E512", name="This E++ project file is too short", filename=filename,
            line=1, col=1, source_line="",
            reason="The file is smaller than its own header, so part of it is missing.",
            help_msg="Download the project again to get a complete file."
        )
    if raw[:3] != VAULT_MAGIC:
        raise EppDiagnosticError(
            code="E511", name="This is not an E++ project", filename=filename,
            line=1, col=1, source_line="",
            reason="The file does not start with the E++ project signature.",
            help_msg="Only project files saved by the E++ Studio can be opened."
        )
    if raw[3] != VAULT_VERSION:
        raise EppDiagnosticError(
            code="E513", name="This project file was written by a different release", filename=filename,
            line=1, col=1, source_line="",
            reason=f"The file format version is {raw[3]}, but this engine reads version {VAULT_VERSION}.",
            help_msg="Open the file with the release of E++ that created it, then download it again."
        )

    enc_key, mac_key = vault_subkeys(key)
    nonce = raw[4:4 + VAULT_NONCE_LEN]
    payload, tag = raw[:-VAULT_TAG], raw[-VAULT_TAG:]
    if not hmac.compare_digest(hmac.new(mac_key, payload, hashlib.sha256).digest(), tag):
        raise EppDiagnosticError(
            code="E520", name="This key does not open this project", filename=filename,
            line=1, col=1, source_line="",
            reason="The key was tried, but the file rejected it — the key belongs to another project, or the file has changed.",
            help_msg="Pass the key that sealed this project with --key, or point --keyring at its keyring file."
        )
    body = raw[VAULT_HEADER:-VAULT_TAG]
    try:
        return chacha20_xor(enc_key, nonce, body).decode("utf-8")
    except UnicodeDecodeError as exc:
        raise EppDiagnosticError(
            code="E512", name="Damaged Project File", filename=filename,
            line=1, col=1, source_line="",
            reason=f"The decrypted stream is not valid UTF-8: {exc}",
            help_msg="The project may have been truncated."
        )


def load_keyring(path: Optional[str] = None) -> List[dict]:
    """Reads an E++ keyring file (the JSON the Studio exports)."""
    import json
    candidates = []
    if path:
        candidates.append(path)
    env_path = os.environ.get("EPP_KEYRING")
    if env_path:
        candidates.append(env_path)
    candidates.extend(["epp-keys.json", "keyring.json"])
    for candidate in candidates:
        if not candidate or not os.path.exists(candidate):
            continue
        try:
            with open(candidate, "r", encoding="utf-8") as handle:
                data = json.load(handle)
        except Exception:
            continue
        keys = data.get("keys") if isinstance(data, dict) else data
        if isinstance(keys, list):
            return [entry for entry in keys if isinstance(entry, dict) and entry.get("key")]
    return []


def keyring_keys(keyring_path: Optional[str] = None) -> List[bytes]:
    keys: List[bytes] = []
    for entry in load_keyring(keyring_path):
        try:
            keys.append(base64.b64decode(entry["key"]))
        except Exception:
            continue
    return keys


def _open_vault_with_keys(text: str, filename: str, keys: Optional[List[bytes]] = None) -> str:
    attempts = list(keys or []) + keyring_keys()
    last: Optional[EppDiagnosticError] = None
    for candidate in attempts:
        try:
            return load_epp(text, candidate, filename)
        except EppDiagnosticError as exc:
            if exc.code == "E520":
                last = exc
                continue
            raise
    if last is not None:
        raise EppDiagnosticError(
            code="E520", name="This key does not open this project", filename=filename,
            line=1, col=1, source_line="",
            reason=f"None of the {len(attempts)} key(s) that were tried open this project.",
            help_msg="Put the keyring the Studio exported next to the project (epp-keys.json), or set EPP_KEYRING."
        )
    raise EppDiagnosticError(
        code="E521", name="No Key Available", filename=filename, line=1, col=1, source_line="",
        reason="This project needs a key, and none was found.",
        help_msg="Export the keyring from the Studio (🔑 Keys) and save it as epp-keys.json next to the project, or set EPP_KEYRING."
    )


def open_vault(text: str, filename: str = "<source>", keyhex: Optional[str] = None, keyring_path: Optional[str] = None) -> str:
    """Tries the given key, then every key in the keyring, until one opens the vault."""
    tried = 0
    errors = []
    keys: List[bytes] = []
    if keyhex:
        try:
            keys.append(bytes.fromhex(keyhex.strip()))
        except ValueError:
            raise EppDiagnosticError(
                code="E522", name="Bad Key", filename=filename, line=1, col=1, source_line="",
                reason="--key needs 64 hex characters (a 32-byte E++ project key).",
                help_msg="Copy the key from epp-keys.json, or point --keyring at that file."
            )
    for entry in load_keyring(keyring_path):
        try:
            keys.append(base64.b64decode(entry["key"]))
        except Exception:
            continue
    for candidate in keys:
        tried += 1
        try:
            return load_epp(text, candidate, filename)
        except EppDiagnosticError as exc:
            if exc.code == "E520":
                errors.append(exc)
                continue
            raise
    if tried == 0:
        raise EppDiagnosticError(
            code="E521", name="No Key Available", filename=filename, line=1, col=1, source_line="",
            reason="This project needs a key, and none was supplied.",
            help_msg="Use --key <64 hex characters>, put epp-keys.json next to the project, or set EPP_KEYRING."
        )
    raise EppDiagnosticError(
        code="E520", name="This key does not open this project", filename=filename, line=1, col=1, source_line="",
        reason=f"None of the {tried} key(s) that were tried open this project.",
        help_msg="Pass the key that sealed it with --key, or import the keyring the Studio exported."
    )


# ==========================================
# Deterministic Error Diagnostic Engine
# ==========================================

class EppDiagnosticError(Exception):
    def __init__(self, code: str, name: str, filename: str, line: int, col: int, source_line: str, reason: str, help_msg: str):
        self.code = code
        self.name = name
        self.filename = filename
        self.line = line
        self.col = col
        self.source_line = source_line
        self.reason = reason
        self.help_msg = help_msg
        super().__init__(self.format_message())

    def format_message(self) -> str:
        loc = f"{self.filename}:{self.line}:{self.col}"
        line_prefix = f"  {self.line} | "
        indent = len(line_prefix)
        caret_pad = " " * max(0, self.col - 1)

        msg = [
            f"\n[E++ Error {self.code}: {self.name}]",
            f"  --> {loc}",
            f"   |",
            f"{line_prefix}{self.source_line}",
            f"   | {caret_pad}^",
            f"   = Reason: {self.reason}",
            f"   = Help: {self.help_msg}\n"
        ]
        return "\n".join(msg)


# ==========================================
# Token Types & Definitions
# ==========================================

class TokenType(Enum):
    # Literals
    NUMBER = auto()
    STRING = auto()
    VARIABLE = auto()
    IDENTIFIER = auto()

    # Keywords
    KW_SAY = auto()
    KW_TELL = auto()
    KW_LET = auto()
    KW_SET = auto()
    KW_DEFINE = auto()
    KW_BE = auto()
    KW_TO = auto()
    KW_AS = auto()
    KW_ASK = auto()
    KW_AND = auto()
    KW_SAVE = auto()
    KW_THE = auto()
    KW_OUTPUT = auto()
    KW_ANSWER = auto()
    KW_RESULT = auto()
    KW_IN = auto()
    KW_ADD = auto()
    KW_LIBRARY = auto()
    KW_CHECK = auto()
    KW_IF = auto()
    KW_THEN = auto()
    KW_OTHERWISE = auto()
    KW_ELSE = auto()
    KW_END = auto()
    KW_IS = auto()
    KW_EQUAL = auto()
    KW_NOT = auto()
    KW_A = auto()
    KW_NUMBER_TYPE = auto()
    KW_GREATER = auto()
    KW_LESS = auto()
    KW_THAN = auto()
    KW_REPEAT = auto()
    KW_TIMES = auto()
    KW_WHILE = auto()
    KW_DO = auto()
    KW_RUN = auto()
    KW_PYTHON = auto()
    KW_CODE = auto()
    KW_CONCAT = auto()
    KW_IT = auto()
    KW_WITH = auto()
    KW_SEPARATION = auto()
    KW_METHOD = auto()
    KW_OF = auto()
    KW_NOTE = auto()
    KW_ITS = auto()

    # Math Words & Symbols
    MATH_PLUS = auto()
    MATH_MINUS = auto()
    MATH_TIMES = auto()
    MATH_DIVIDED_BY = auto()
    MATH_MODULO = auto()

    # Symbols
    COMMA = auto()
    COLON = auto()
    LPAREN = auto()
    RPAREN = auto()
    NEWLINE = auto()
    EOF = auto()

    # Dedicated Python Block
    PYTHON_BLOCK = auto()


KEYWORDS = {
    "say": TokenType.KW_SAY,
    "tell": TokenType.KW_TELL,
    "let": TokenType.KW_LET,
    "set": TokenType.KW_SET,
    "define": TokenType.KW_DEFINE,
    "be": TokenType.KW_BE,
    "to": TokenType.KW_TO,
    "as": TokenType.KW_AS,
    "ask": TokenType.KW_ASK,
    "and": TokenType.KW_AND,
    "save": TokenType.KW_SAVE,
    "the": TokenType.KW_THE,
    "output": TokenType.KW_OUTPUT,
    "answer": TokenType.KW_ANSWER,
    "result": TokenType.KW_RESULT,
    "in": TokenType.KW_IN,
    "add": TokenType.KW_ADD,
    "library": TokenType.KW_LIBRARY,
    "check": TokenType.KW_CHECK,
    "if": TokenType.KW_IF,
    "then": TokenType.KW_THEN,
    "otherwise": TokenType.KW_OTHERWISE,
    "else": TokenType.KW_ELSE,
    "end": TokenType.KW_END,
    "is": TokenType.KW_IS,
    "equal": TokenType.KW_EQUAL,
    "not": TokenType.KW_NOT,
    "a": TokenType.KW_A,
    "number": TokenType.KW_NUMBER_TYPE,
    "greater": TokenType.KW_GREATER,
    "less": TokenType.KW_LESS,
    "than": TokenType.KW_THAN,
    "repeat": TokenType.KW_REPEAT,
    "times": TokenType.KW_TIMES,
    "while": TokenType.KW_WHILE,
    "do": TokenType.KW_DO,
    "run": TokenType.KW_RUN,
    "python": TokenType.KW_PYTHON,
    "code": TokenType.KW_CODE,
    "concat": TokenType.KW_CONCAT,
    "it": TokenType.KW_IT,
    "with": TokenType.KW_WITH,
    "seperation": TokenType.KW_SEPARATION,
    "separation": TokenType.KW_SEPARATION,
    "method": TokenType.KW_METHOD,
    "of": TokenType.KW_OF,
    "note": TokenType.KW_NOTE,
    "it's": TokenType.KW_ITS,
    "its": TokenType.KW_ITS,

    # Math
    "plus": TokenType.MATH_PLUS,
    "minus": TokenType.MATH_MINUS,
    "modulo": TokenType.MATH_MODULO,
    "mod": TokenType.MATH_MODULO,
}


class Token:
    def __init__(self, token_type: TokenType, lexeme: str, line: int, col: int,
                 string_value: str = "", number_value: float = 0.0):
        self.type = token_type
        self.lexeme = lexeme
        self.line = line
        self.col = col
        self.string_value = string_value
        self.number_value = number_value

    def __repr__(self) -> str:
        return f"Token({self.type.name}, '{self.lexeme}', L{self.line}:C{self.col})"


# ==========================================
# Lexer Implementation
# ==========================================

class Lexer:
    def __init__(self, source: str, filename: str = "<source>", keys: Optional[List[bytes]] = None):
        # A sealed project is opened before lexing. The keys come from the
        # keyring file (EPP_KEYRING / keyring.json) awarded by the Studio.
        if is_vault(source):
            source = _open_vault_with_keys(source, filename, keys)

        self.source = source
        self.filename = filename
        self.cursor = 0
        self.line = 1
        self.col = 1
        self.lines = source.split("\n")

    def get_source_line(self, line_num: int) -> str:
        if 1 <= line_num <= len(self.lines):
            return self.lines[line_num - 1]
        return ""

    def is_at_end(self) -> bool:
        return self.cursor >= len(self.source)

    def peek(self) -> str:
        if self.is_at_end():
            return "\0"
        return self.source[self.cursor]

    def peek_next(self) -> str:
        if self.cursor + 1 >= len(self.source):
            return "\0"
        return self.source[self.cursor + 1]

    def advance(self) -> str:
        c = self.source[self.cursor]
        self.cursor += 1
        if c == "\n":
            self.line += 1
            self.col = 1
        else:
            self.col += 1
        return c

    def skip_whitespace_except_newline(self):
        while not self.is_at_end():
            c = self.peek()
            if c in (" ", "\t", "\r"):
                self.advance()
            else:
                break

    def tokenize(self) -> List[Token]:
        tokens = []
        while not self.is_at_end():
            self.skip_whitespace_except_newline()
            if self.is_at_end():
                break

            start_line = self.line
            start_col = self.col
            c = self.peek()

            # Newline handling
            if c == "\n":
                self.advance()
                if tokens and tokens[-1].type != TokenType.NEWLINE:
                    tokens.append(Token(TokenType.NEWLINE, "\n", start_line, start_col))
                continue

            # Note parsing: note [...]
            if self.match_word_exact("note"):
                tokens.append(self.scan_note(start_line, start_col))
                continue

            if self.match_word_exact("it's"):
                for _ in range(4): self.advance()
                tokens.append(Token(TokenType.KW_ITS, "it's", start_line, start_col))
                continue

            # Check legacy illegal comments '//' or '#'
            if c == "/" and self.peek_next() == "/":
                cur_line = self.get_source_line(start_line)
                raise EppDiagnosticError(
                    code="E101",
                    name="Illegal Comment Syntax",
                    filename=self.filename,
                    line=start_line,
                    col=start_col,
                    source_line=cur_line,
                    reason="E++ does not use '// note' comments.",
                    help_msg="Use the standard E++ note syntax: note [Your note here]."
                )
            if c == "#":
                cur_line = self.get_source_line(start_line)
                raise EppDiagnosticError(
                    code="E101",
                    name="Illegal Comment Syntax",
                    filename=self.filename,
                    line=start_line,
                    col=start_col,
                    source_line=cur_line,
                    reason="E++ does not use '#' comments.",
                    help_msg="Use the standard E++ note syntax: note [Your note here]."
                )

            # Python block parsing: 'run the python code:' or 'run python code:'
            if self.match_python_block_trigger():
                tokens.extend(self.scan_python_block(start_line, start_col))
                continue

            # Punctuation & Operators
            if c == ",":
                self.advance()
                tokens.append(Token(TokenType.COMMA, ",", start_line, start_col))
                continue
            if c == "!":
                self.advance()
                tokens.append(Token(TokenType.IDENTIFIER, "!", start_line, start_col))
                continue
            if c == "?":
                self.advance()
                tokens.append(Token(TokenType.IDENTIFIER, "?", start_line, start_col))
                continue
            if c == ":":
                self.advance()
                tokens.append(Token(TokenType.COLON, ":", start_line, start_col))
                continue
            if c == "(":
                self.advance()
                tokens.append(Token(TokenType.LPAREN, "(", start_line, start_col))
                continue
            if c == ")":
                self.advance()
                tokens.append(Token(TokenType.RPAREN, ")", start_line, start_col))
                continue
            if c == "+":
                self.advance()
                tokens.append(Token(TokenType.MATH_PLUS, "+", start_line, start_col))
                continue
            if c == "-":
                self.advance()
                tokens.append(Token(TokenType.MATH_MINUS, "-", start_line, start_col))
                continue
            if c == "*":
                self.advance()
                tokens.append(Token(TokenType.MATH_TIMES, "*", start_line, start_col))
                continue
            if c == "/":
                self.advance()
                tokens.append(Token(TokenType.MATH_DIVIDED_BY, "/", start_line, start_col))
                continue
            if c == "%":
                self.advance()
                tokens.append(Token(TokenType.MATH_MODULO, "%", start_line, start_col))
                continue

            # String literal: "..."
            if c == '"':
                tokens.append(self.scan_string(start_line, start_col))
                continue

            # Variable: '...'
            if c == "'":
                tokens.append(self.scan_variable(start_line, start_col))
                continue

            # Number
            if c.isdigit():
                tokens.append(self.scan_number(start_line, start_col))
                continue

            # Word / Keyword / Identifier
            if c.isalpha() or c == "_":
                tokens.append(self.scan_word(start_line, start_col))
                continue

            # Unknown character
            unknown_char = self.advance()
            cur_line = self.get_source_line(start_line)
            raise EppDiagnosticError(
                code="E101",
                name="Unexpected Character",
                filename=self.filename,
                line=start_line,
                col=start_col,
                source_line=cur_line,
                reason=f"Unrecognized symbol '{unknown_char}' in E++ code.",
                help_msg="Remove or replace this character."
            )

        tokens.append(Token(TokenType.EOF, "", self.line, self.col))
        return tokens

    def match_word_exact(self, word: str) -> bool:
        saved_cursor = self.cursor
        saved_line = self.line
        saved_col = self.col
        n = len(word)
        if self.source[self.cursor:self.cursor+n].lower() == word:
            next_char = self.source[self.cursor+n:self.cursor+n+1]
            if not next_char or not (next_char.isalnum() or next_char == "_"):
                return True
        return False

    def scan_note(self, start_line: int, start_col: int) -> Token:
        # Advance over 'note'
        for _ in range(4):
            self.advance()
        self.skip_whitespace_except_newline()
        if self.peek() != "[":
            cur_line = self.get_source_line(start_line)
            raise EppDiagnosticError(
                code="E101",
                name="Invalid Note Syntax",
                filename=self.filename,
                line=start_line,
                col=self.col,
                source_line=cur_line,
                reason="Notes in E++ must enclose their content in square brackets: note [...]",
                help_msg="Format your note as: note [Note text here]"
            )
        self.advance() # consume '['
        note_content = []
        while not self.is_at_end() and self.peek() != "]":
            if self.peek() == "\n":
                cur_line = self.get_source_line(start_line)
                raise EppDiagnosticError(
                    code="E101",
                    name="Unterminated Note",
                    filename=self.filename,
                    line=start_line,
                    col=start_col,
                    source_line=cur_line,
                    reason="Note was not closed before end of line.",
                    help_msg="Add closing bracket ']' at the end of the note."
                )
            note_content.append(self.advance())
        if self.is_at_end():
            cur_line = self.get_source_line(start_line)
            raise EppDiagnosticError(
                code="E101",
                name="Unterminated Note",
                filename=self.filename,
                line=start_line,
                col=start_col,
                source_line=cur_line,
                reason="Note reached EOF without closing bracket ']'.",
                help_msg="Add closing bracket ']'."
            )
        self.advance() # consume ']'
        return Token(TokenType.KW_NOTE, "".join(note_content), start_line, start_col, string_value="".join(note_content))

    def match_python_block_trigger(self) -> bool:
        saved_pos = self.cursor
        rem = self.source[self.cursor:]
        import re
        m = re.match(r'^(?:run\s+)?(?:the\s+)?python\s+code\s*:\s*\n', rem, re.IGNORECASE)
        return bool(m)

    def scan_python_block(self, start_line: int, start_col: int) -> List[Token]:
        import re
        rem = self.source[self.cursor:]
        m = re.match(r'^(?:run\s+)?(?:the\s+)?python\s+code\s*:\s*\n', rem, re.IGNORECASE)
        match_len = m.end()

        # Advance through the header
        for _ in range(match_len):
            self.advance()

        # Collect python lines until an unindented E++ keyword or EOF
        py_lines = []
        epp_keywords = {"say", "tell", "let", "set", "define", "ask", "add", "note", "run", "if", "otherwise"}

        while not self.is_at_end():
            line_start_pos = self.cursor
            # Read until newline
            line_chars = []
            while not self.is_at_end() and self.peek() != "\n":
                line_chars.append(self.advance())
            if not self.is_at_end() and self.peek() == "\n":
                self.advance()

            line_str = "".join(line_chars)
            stripped = line_str.strip()

            # Check if this line starts unindented with an E++ keyword
            if stripped and not (line_str.startswith(" ") or line_str.startswith("\t")):
                first_word = stripped.split()[0].lower()
                if first_word in epp_keywords:
                    # Rewind back to start of this line
                    self.cursor = line_start_pos
                    # Recalculate line/col
                    lines_up_to = self.source[:self.cursor].split("\n")
                    self.line = len(lines_up_to)
                    self.col = len(lines_up_to[-1]) + 1
                    break

            py_lines.append(line_str)

        py_source = "\n".join(py_lines)

        tokens = [
            Token(TokenType.KW_RUN, "run", start_line, start_col),
            Token(TokenType.KW_PYTHON, "python", start_line, start_col),
            Token(TokenType.KW_CODE, "code", start_line, start_col),
            Token(TokenType.COLON, ":", start_line, start_col),
            Token(TokenType.NEWLINE, "\n", start_line, start_col),
            Token(TokenType.PYTHON_BLOCK, py_source, start_line + 1, 1, string_value=py_source)
        ]
        return tokens

    def scan_string(self, start_line: int, start_col: int) -> Token:
        self.advance() # opening "
        text = []
        while not self.is_at_end() and self.peek() != '"':
            c = self.peek()
            if c == "\n":
                cur_line = self.get_source_line(start_line)
                raise EppDiagnosticError(
                    code="E102",
                    name="Unterminated String",
                    filename=self.filename,
                    line=start_line,
                    col=start_col,
                    source_line=cur_line,
                    reason="String literal was not closed before end of line.",
                    help_msg="Add closing double quote (\") at the end of the text."
                )
            if c == "\\":
                self.advance()
                if self.is_at_end():
                    break
                esc = self.advance()
                if esc == "n": text.append("\n")
                elif esc == "t": text.append("\t")
                elif esc == "r": text.append("\r")
                elif esc == '"': text.append('"')
                elif esc == "\\": text.append("\\")
                else: text.append(esc)
            else:
                text.append(self.advance())

        if self.is_at_end():
            cur_line = self.get_source_line(start_line)
            raise EppDiagnosticError(
                code="E102",
                name="Unterminated String",
                filename=self.filename,
                line=start_line,
                col=start_col,
                source_line=cur_line,
                reason="String literal reached EOF without closing double quote.",
                help_msg="Add closing double quote (\")."
            )

        self.advance() # closing "
        full_str = "".join(text)
        return Token(TokenType.STRING, f'"{full_str}"', start_line, start_col, string_value=full_str)

    def scan_variable(self, start_line: int, start_col: int) -> Token:
        self.advance() # opening '
        text = []
        while not self.is_at_end() and self.peek() != "'":
            c = self.peek()
            if c == "\n":
                cur_line = self.get_source_line(start_line)
                raise EppDiagnosticError(
                    code="E102",
                    name="Unterminated Variable Name",
                    filename=self.filename,
                    line=start_line,
                    col=start_col,
                    source_line=cur_line,
                    reason="Variable name was not closed before end of line.",
                    help_msg="Add closing single quote (') at the end of the variable name."
                )
            text.append(self.advance())

        if self.is_at_end():
            cur_line = self.get_source_line(start_line)
            raise EppDiagnosticError(
                code="E102",
                name="Unterminated Variable Name",
                filename=self.filename,
                line=start_line,
                col=start_col,
                source_line=cur_line,
                reason="Variable name reached EOF without closing single quote.",
                help_msg="Add closing single quote (')."
            )

        self.advance() # closing '
        var_name = "".join(text)
        if not var_name.strip():
            raise EppDiagnosticError(code="E202", name="Empty Variable Name", filename=self.filename,
                                     line=start_line, col=start_col, source_line=self.get_source_line(start_line),
                                     reason="A variable name cannot be empty.", help_msg="Put a name between the single quotes.")
        return Token(TokenType.VARIABLE, f"'{var_name}'", start_line, start_col, string_value=var_name)

    def scan_number(self, start_line: int, start_col: int) -> Token:
        digits = []
        while not self.is_at_end() and self.peek().isdigit():
            digits.append(self.advance())
        if self.peek() == "." and self.peek_next().isdigit():
            digits.append(self.advance()) # '.'
            while not self.is_at_end() and self.peek().isdigit():
                digits.append(self.advance())
        num_str = "".join(digits)
        val = float(num_str) if "." in num_str else int(num_str)
        return Token(TokenType.NUMBER, num_str, start_line, start_col, number_value=float(val))

    def scan_word(self, start_line: int, start_col: int) -> Token:
        chars = []
        while not self.is_at_end() and (self.peek().isalnum() or self.peek() == "_"):
            chars.append(self.advance())
        word = "".join(chars)
        lower = word.lower()

        # Check keyword map
        if lower in KEYWORDS:
            return Token(KEYWORDS[lower], word, start_line, start_col)

        # Check multi-word phrase lookahead: "divided by"
        if lower == "divided":
            saved_cursor = self.cursor
            saved_line = self.line
            saved_col = self.col
            self.skip_whitespace_except_newline()
            if self.match_word_exact("by"):
                for _ in range(2):
                    self.advance()
                return Token(TokenType.MATH_DIVIDED_BY, "divided by", start_line, start_col)
            self.cursor = saved_cursor
            self.line = saved_line
            self.col = saved_col

        return Token(TokenType.IDENTIFIER, word, start_line, start_col)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        fname = sys.argv[1]
        with open(fname, "r", encoding="utf-8") as f:
            src = f.read()
        lexer = Lexer(src, fname)
        tokens = lexer.tokenize()
        for t in tokens:
            print(t)
    else:
        print("E++ 1.3 Lexer module loaded.")
