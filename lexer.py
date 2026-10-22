#!/usr/bin/env python3
"""
E++ (E-Plus-Plus) 1.1 Workspace Patch 1 Lexer and Subsystem
Written in Python for direct execution and runtime integration.
"""

import sys
import time
import struct
import base64
from enum import Enum, auto
from typing import List, Optional, Tuple, Dict, Any

# ==========================================
# Release 1.1 Randomized Encryption Engine
# ==========================================

def encrypt_epp(plaintext: str) -> str:
    """
    Encrypts E++ source code into Release 1.1 format.
    Uses a randomized 64-bit millisecond key called at that exact frame.
    Format:
      call ENCRYPTION_KEY
      <encrypted_gibberish>
    """
    frame_key = int(time.time() * 1000)
    data = plaintext.encode("utf-8")
    out = bytearray(8)
    struct.pack_into(">Q", out, 0, frame_key)

    k = frame_key
    mul = 6364136223846793005
    add = 1442695040888963407
    mask = 0xFFFFFFFFFFFFFFFF

    for b in data:
        k = (k * mul + add) & mask
        keystream = (k >> 33) & 0xFF
        out.append(b ^ keystream)

    gibberish = base64.b64encode(out).decode("ascii")
    return f"call ENCRYPTION_KEY\n{gibberish}"


def decrypt_epp(ciphertext: str, filename: str = "<source>") -> str:
    """
    Decrypts Release 1.1 encrypted .enpp/.enppl content.
    Identifies and validates the 'call ENCRYPTION_KEY' header.
    """
    lines = ciphertext.strip().split("\n")
    if not lines or lines[0].strip() != "call ENCRYPTION_KEY":
        raise EppDiagnosticError(
            code="E501",
            name="Unencrypted Source File",
            filename=filename,
            line=1,
            col=1,
            source_line=lines[0] if lines else "",
            reason=".enpp and .enppl files in Release 1.1 are encrypted and must begin with 'call ENCRYPTION_KEY'.",
            help_msg="Ensure the file was saved with E++ encryption. Plain text files are no longer permitted."
        )

    gibberish = "".join(lines[1:]).strip()
    try:
        raw = base64.b64decode(gibberish)
    except Exception as e:
        raise EppDiagnosticError(
            code="E502",
            name="Corrupted Encrypted Payload",
            filename=filename,
            line=2,
            col=1,
            source_line=lines[1] if len(lines) > 1 else "",
            reason=f"Failed to decode encrypted base64 payload: {str(e)}",
            help_msg="Check that the encrypted file has not been altered or truncated."
        )

    if len(raw) < 8:
        raise EppDiagnosticError(
            code="E502",
            name="Corrupted Encrypted Payload",
            filename=filename,
            line=2,
            col=1,
            source_line=lines[1] if len(lines) > 1 else "",
            reason="Payload is too short to contain a valid 64-bit frame key header.",
            help_msg="File appears truncated."
        )

    frame_key = struct.unpack_from(">Q", raw, 0)[0]
    k = frame_key
    mul = 6364136223846793005
    add = 1442695040888963407
    mask = 0xFFFFFFFFFFFFFFFF

    dec = bytearray()
    for b in raw[8:]:
        k = (k * mul + add) & mask
        keystream = (k >> 33) & 0xFF
        dec.append(b ^ keystream)

    try:
        return dec.decode("utf-8")
    except Exception as e:
        raise EppDiagnosticError(
            code="E502",
            name="Corrupted Encrypted Payload",
            filename=filename,
            line=2,
            col=1,
            source_line="",
            reason=f"Decrypted stream is not valid UTF-8: {str(e)}",
            help_msg="Verify the encryption frame key."
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
    def __init__(self, source: str, filename: str = "<source>"):
        # Auto-decrypt if encrypted
        if source.strip().startswith("call ENCRYPTION_KEY"):
            source = decrypt_epp(source, filename)

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
        print("E++ 1.1 Workspace Patch 1 Lexer module loaded.")
