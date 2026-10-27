#!/usr/bin/env python3
"""
E++ (E-Plus-Plus) 1.3 Direct Python Runtime & Engine
Uses the native Python lexer to run E++ and Python code directly, including
project files saved by the Studio.
"""

import sys
import os
import math
import random
import json
import re
import datetime
import time
import statistics
import string
import hashlib
import base64
import io
import contextlib
import ast
from typing import Dict, Any, List, Optional

from lexer import (
    Lexer, Token, TokenType, EppDiagnosticError,
    save_epp, load_epp, is_vault, open_vault, random_key,
    key_from_hex, vault_fingerprint
)

class Interpreter:
    def __init__(self, filename: str = "<stdin>"):
        self.filename = filename
        self.vars: Dict[str, Any] = {}
        self.original_var_names: Dict[str, str] = {}
        self.libs = set()
        self.current_line_num = 1
        self.current_line_text = ""
        self.source_lines: List[str] = []

    def norm(self, name: str) -> str:
        return name.lower().strip()

    def set_var(self, name: str, value: Any):
        norm_name = self.norm(name)
        self.vars[norm_name] = value
        self.original_var_names[norm_name] = name.strip()

    def get_var(self, name: str, line: int, col: int) -> Any:
        norm_name = self.norm(name)
        if norm_name not in self.vars:
            cur_line = self.get_source_line(line)
            raise EppDiagnosticError(
                code="E201",
                name="Undefined Variable",
                filename=self.filename,
                line=line,
                col=col,
                source_line=cur_line,
                reason=f"Variable '{name}' has not been defined yet.",
                help_msg=f"Define the variable first with: let '{name}' be <value>"
            )
        return self.vars[norm_name]

    def require_lib(self, lib_name: str, feature: str, line: int, col: int):
        norm_lib = self.norm(lib_name)
        if norm_lib not in self.libs:
            cur_line = self.get_source_line(line)
            raise EppDiagnosticError(
                code="E301",
                name="Library Not Added",
                filename=self.filename,
                line=line,
                col=col,
                source_line=cur_line,
                reason=f"{feature} requires the '{lib_name}' library.",
                help_msg=f"Add this line before using it: add the \"{lib_name}\" library"
            )

    def get_source_line(self, line_num: int) -> str:
        if 1 <= line_num <= len(self.source_lines):
            return self.source_lines[line_num - 1]
        return ""

    def diagnostic(self, code: str, name: str, reason: str, help_msg: str, line: int, col: int = 1):
        return EppDiagnosticError(code=code, name=name, filename=self.filename, line=line, col=col,
                                  source_line=self.get_source_line(line), reason=reason, help_msg=help_msg)

    def execute_python_code(self, py_code: str, line: int, col: int) -> str:
        self.require_lib("Python", "Running Python code", line, col)

        # Explicitly block turtle
        if re.search(r'\b(?:import\s+turtle|from\s+turtle|turtle\.)\b', py_code):
            cur_line = self.get_source_line(line)
            raise EppDiagnosticError(
                code="E701",
                name="Python Library Prohibited",
                filename=self.filename,
                line=line,
                col=col,
                source_line=cur_line,
                reason="The 'turtle' library is not supported in E++.",
                help_msg="E++ does not support canvas or GUI turtle drawing. Use standard data/math libraries instead."
            )

        # Prepare Python execution scope
        stdout_capture = io.StringIO()
        py_globals = {
            "__builtins__": __builtins__,
            "math": math,
            "random": random,
            "json": json,
            "re": re,
            "datetime": datetime,
            "time": time,
            "statistics": statistics,
            "string": string,
            "sys": sys,
            "os": os,
            "hashlib": hashlib,
            "base64": base64,
        }

        # Inject E++ variables into Python
        for norm_name, val in self.vars.items():
            orig = self.original_var_names.get(norm_name, norm_name)
            # Inject clean valid identifier name
            clean_ident = re.sub(r'\W|^(?=\d)', '_', orig)
            if clean_ident:
                py_globals[clean_ident] = val
                py_globals[clean_ident.lower()] = val
                py_globals[clean_ident.upper()] = val
                cap = "".join(w.capitalize() for w in clean_ident.split("_"))
                py_globals[cap] = val
            if norm_name:
                py_globals[norm_name] = val

        # Auto-fix 'for I in range 3:' -> 'for I in range(3):'
        import textwrap
        clean_code = textwrap.dedent(py_code)
        clean_code = re.sub(r'range\s+(\d+)\s*:', r'range(\1):', clean_code)

        try:
            with contextlib.redirect_stdout(stdout_capture):
                exec(clean_code, py_globals)
        except Exception as err:
            cur_line = self.get_source_line(line)
            raise EppDiagnosticError(
                code="E702",
                name="Python Runtime Exception",
                filename=self.filename,
                line=line,
                col=col,
                source_line=cur_line,
                reason=f"Python execution error: {type(err).__name__}: {str(err)}",
                help_msg="Review the Python syntax and runtime logic inside your Python block."
            )

        output = stdout_capture.getvalue()
        # Print output to current console
        if output:
            sys.stdout.write(output)
            sys.stdout.flush()

        return output.strip()

    def run_source(self, source: str):
        # A sealed project is opened with the keyring before interpretation.
        from lexer import is_vault, _open_vault_with_keys
        if is_vault(source):
            source = _open_vault_with_keys(source, self.filename)

        self.source_lines = source.split("\n")
        lexer = Lexer(source, self.filename)
        tokens = lexer.tokenize()

        self.validate_tokens(tokens)
        try:
            self.parse_and_execute(tokens)
        except EppDiagnosticError:
            raise
        except (ValueError, TypeError, OverflowError, ZeroDivisionError) as err:
            code = "E403" if isinstance(err, ZeroDivisionError) else "E405"
            raise self.diagnostic(code, "Invalid Value", str(err) or "This operation needs valid numbers.",
                                  "Check the values used by this operation.", self.current_line_num)

    def validate_tokens(self, tokens: List[Token]):
        """Check statements even inside branches that will not execute."""
        by_line = {}
        for token in tokens:
            if token.type in (TokenType.NEWLINE, TokenType.EOF, TokenType.PYTHON_BLOCK):
                continue
            by_line.setdefault(token.line, []).append(token)
        allowed = {TokenType.KW_SAY, TokenType.KW_TELL, TokenType.KW_LET, TokenType.KW_SET,
                   TokenType.KW_DEFINE, TokenType.KW_ASK, TokenType.KW_ADD, TokenType.KW_IF,
                   TokenType.KW_OTHERWISE, TokenType.KW_ELSE, TokenType.KW_END, TokenType.KW_REPEAT,
                   TokenType.KW_WHILE, TokenType.KW_CHECK, TokenType.KW_NOTE, TokenType.KW_RUN}
        word_commands = {"write", "append", "read", "clear", "wait", "sleep"}
        colors = {"red", "green", "blue", "yellow", "cyan", "magenta"}

        def check_value(parts):
            if not parts: return
            # Mask only recognised language phrases and quoted literals; every
            # remaining identifier is unquoted text, even in a dead branch.
            positions, cursor, chunks = [], 0, []
            for t in parts:
                word = t.lexeme
                positions.append(cursor)
                chunks.append(' ' * len(word) if t.type in (TokenType.STRING, TokenType.VARIABLE) else word)
                cursor += len(word) + 1
            masked = ' '.join(chunks)
            phrases = [
                r"\b(?:and\s+)?concat\s+(?:it\s+)?with\b|\bwith\s+(?:the\s+)?sep[ae]ration\s+(?:method\s+)?of\b",
                r"\b(?:the\s+)?(?:length|uppercase|lowercase|reverse|trim|square\s+root|absolute\s+value|minimum|maximum|first\s+letter|last\s+letter|value)\s+of\b",
                r"\b(?:the\s+)?current\s+(?:time|date|year|timestamp)\b",
                r"\bthe\s+(?:system\s+platform|platform|operating\s+system|os|key\s+pressed)\b",
                r"\b(?:it['’]?s\s+)?(?:a\s+|the\s+)?(?:random\s+)?number\s+between\b",
                r"\broll\s+(?:a\s+)?dice(?:\s+with)?\b|\bsides\b|\bflip\s+(?:a\s+)?coin\b",
                r"\bhow\s+much\b|\bpercent\s+(?:is\s+)?of\b|\bpower\s+of\b"
            ]
            for pattern in phrases:
                masked = re.sub(pattern, lambda m: ' ' * len(m.group()), masked, flags=re.IGNORECASE)
            for t, pos in zip(parts, positions):
                if t.type == TokenType.IDENTIFIER and masked[pos:pos + len(t.lexeme)].strip() and t.lexeme.lower() not in {"pi", "e", "true", "false"}:
                    raise self.diagnostic("E402", "Unquoted Text", f"Unquoted text '{t.lexeme}' is not a value.",
                                          'Put text in double quotes, or use single quotes for a variable.', t.line, t.col)

        def check_statement(line):
            if not line: return
            first = line[0]
            if first.type not in allowed and not (first.type == TokenType.IDENTIFIER and first.lexeme.lower() in word_commands):
                raise self.diagnostic("E101", "Unknown Statement", f"E++ does not recognize '{first.lexeme}' as a statement.",
                                      "Start with a command such as say, let, or if.", first.line, first.col)
            if first.type == TokenType.KW_IF:
                then = next((i for i, t in enumerate(line) if t.type == TokenType.KW_THEN), -1)
                if then < 0:
                    raise self.diagnostic("E101", "Invalid If", "Expected 'then' after the condition.",
                                          'For example: if 1 is 1 then say "Yes"', first.line, first.col)
                if any(t.type == TokenType.KW_OTHERWISE for t in line[then + 1:]):
                    bad = next(t for t in line[then + 1:] if t.type == TokenType.KW_OTHERWISE)
                    raise self.diagnostic("E103", "Invalid Otherwise Placement", "'otherwise' belongs on the next line.",
                                          "Move otherwise to the next line.", bad.line, bad.col)
                action = line[then + 1:]
                if action and action[0].type != TokenType.COLON: check_statement(action)
            elif first.type == TokenType.KW_OTHERWISE:
                action = line[1:]
                if action and action[0].type != TokenType.COLON: check_statement(action)
            elif first.type in (TokenType.KW_SAY, TokenType.KW_TELL):
                value = line[1:]
                if value and value[0].type == TokenType.IDENTIFIER and value[0].lexeme.lower() in colors: value = value[1:]
                if not value:
                    raise self.diagnostic("E105", "Missing Value", "'say' needs a value to print.",
                                          'For example: say "Hello"', first.line, first.col)
                # Split at commas/concat so bare text in any output part is checked.
                part = []
                for t in value:
                    if t.type == TokenType.COMMA:
                        check_value(part); part = []
                    else: part.append(t)
                check_value(part)
            elif first.type in (TokenType.KW_LET, TokenType.KW_SET, TokenType.KW_DEFINE):
                if len(line) < 2 or line[1].type != TokenType.VARIABLE:
                    raise self.diagnostic("E202", "Invalid Variable Name", "Variable names must be in single quotes.",
                                          "For example: let 'name' be \"Ada\"", first.line, first.col)
                if len(line) < 3 or line[2].type not in (TokenType.KW_BE, TokenType.KW_TO, TokenType.KW_AS):
                    raise self.diagnostic("E101", "Invalid Assignment", "Expected 'be', 'as', or 'to' after the variable.",
                                          "For example: let 'name' be \"Ada\"", first.line, first.col)
                if len(line) < 4:
                    raise self.diagnostic("E105", "Missing Value", "The variable needs a value.",
                                          "For example: let 'name' be \"Ada\"", first.line, first.col)
                if " ".join(t.lexeme.lower() for t in line[3:]) == "drawing sprite":
                    raise self.diagnostic("E302", "Library Not In This Build", "Draw is available in E++ Studio, not E++.zip.",
                                          "Open the full E++ Studio to use drawing sprites.", first.line, line[3].col)
                check_value(line[3:])
            elif first.type == TokenType.KW_ASK:
                split = next((i for i in range(1, len(line) - 1) if line[i].type == TokenType.KW_AND and line[i + 1].type == TokenType.KW_SAVE), -1)
                if split < 2:
                    raise self.diagnostic("E101", "Invalid Ask", "An ask needs a question and a variable for the answer.",
                                          "For example: ask \"Name?\" and save the output as 'name'", first.line, first.col)
                check_value(line[1:split])
            elif first.type == TokenType.KW_REPEAT:
                end = len(line) - (1 if line[-1].type == TokenType.COLON else 0)
                if end < 3 or line[end - 1].lexeme.lower() not in ("time", "times"):
                    raise self.diagnostic("E101", "Invalid Repeat", "A repeat needs a count followed by 'times'.",
                                          "For example: repeat 3 times", first.line, first.col)
                check_value(line[1:end - 1])

        stack = []
        previous_inline_if = False
        for line in by_line.values():
            check_statement(line)
            first = line[0]
            if first.type == TokenType.KW_END:
                ending = line[1].lexeme.lower() if len(line) == 2 else ""
                if not stack or stack[-1][0] != ending:
                    raise self.diagnostic("E106", "Unexpected Block End", "This ending does not match the open block.",
                                          "Use end if, end repeat, or end while for the matching block.", first.line, first.col)
                stack.pop()
                previous_inline_if = False
            elif first.type == TokenType.KW_IF:
                then = next((i for i, t in enumerate(line) if t.type == TokenType.KW_THEN), -1)
                is_block = then >= 0 and then + 1 < len(line) and line[then + 1].type == TokenType.COLON
                if is_block:
                    if then + 2 < len(line):
                        raise self.diagnostic("E101", "Invalid If Block", "Put a block's statements on the following lines.",
                                              "For example: if 1 is 1 then: followed by a new line.", first.line, first.col)
                    stack.append(("if", first))
                previous_inline_if = not is_block
            elif first.type in (TokenType.KW_REPEAT, TokenType.KW_WHILE):
                stack.append((first.lexeme.lower(), first))
                previous_inline_if = False
            elif first.type in (TokenType.KW_OTHERWISE, TokenType.KW_ELSE):
                if not previous_inline_if and not (stack and stack[-1][0] == "if"):
                    raise self.diagnostic("E104", "Standalone Otherwise", "'otherwise' needs a preceding if.",
                                          "Put otherwise immediately after an if statement.", first.line, first.col)
                previous_inline_if = False
            else:
                previous_inline_if = False
        if stack:
            kind, first = stack[-1]
            raise self.diagnostic("E106", "Unclosed Block", f"This {kind} has no matching ending.",
                                  f"Close it with: end {kind}", first.line, first.col)

    def parse_and_execute(self, tokens: List[Token]):
        idx = 0
        n = len(tokens)

        def peek(offset=0) -> Token:
            pos = idx + offset
            if pos < n:
                return tokens[pos]
            return tokens[-1]

        def match(token_type: TokenType) -> bool:
            nonlocal idx
            if idx < n and tokens[idx].type == token_type:
                idx += 1
                return True
            return False

        def skip_newlines():
            nonlocal idx
            while idx < n and tokens[idx].type == TokenType.NEWLINE:
                idx += 1

        while idx < n:
            skip_newlines()
            if idx >= n or tokens[idx].type == TokenType.EOF:
                break

            tok = tokens[idx]
            line_num = tok.line
            col_num = tok.col
            self.current_line_num = line_num

            # 1. NOTE
            if tok.type == TokenType.KW_NOTE:
                idx += 1
                continue

            # Library declarations support both documented word orders.
            if tok.type == TokenType.KW_ADD:
                end = idx
                while end < n and tokens[end].type not in (TokenType.NEWLINE, TokenType.EOF):
                    end += 1
                declaration = tokens[idx:end]
                j = 1
                if j < len(declaration) and declaration[j].type == TokenType.KW_THE: j += 1
                library_first = j < len(declaration) and declaration[j].type == TokenType.KW_LIBRARY
                if library_first: j += 1
                if j >= len(declaration) or declaration[j].type not in (TokenType.STRING, TokenType.IDENTIFIER):
                    raise self.diagnostic("E101", "Invalid Library Declaration", "Expected a library name.",
                                          'Use: add the "Math" library', line_num, col_num)
                name_token = declaration[j]
                lib_name = name_token.string_value if name_token.type == TokenType.STRING else name_token.lexeme
                j += 1
                if not library_first:
                    if j >= len(declaration) or declaration[j].type != TokenType.KW_LIBRARY:
                        raise self.diagnostic("E101", "Invalid Library Declaration", "Expected 'library' after the name.",
                                              'Use: add the "Math" library', line_num, col_num)
                    j += 1
                if j != len(declaration):
                    raise self.diagnostic("E101", "Invalid Library Declaration", "Unexpected text after the library name.",
                                          'Use: add the "Math" library', line_num, declaration[j].col)
                normalized = self.norm(lib_name)
                if normalized in ("draw", "drawing", "sprites", "game", "improvedwait"):
                    raise self.diagnostic("E302", "Library Not In This Build",
                                          f"The '{lib_name}' library is available in E++ Studio, not E++.zip.",
                                          "Open the full E++ Studio to use this library.", line_num, name_token.col)
                known = {"python", "math", "random", "strings", "text", "colors", "time", "files", "system", "console", "keyboard", "improvedwaitlite"}
                if normalized not in known:
                    raise self.diagnostic("E303", "Unknown Library", f"There is no library called '{lib_name}'.",
                                          "Check the library name and spelling.", line_num, name_token.col)
                self.libs.add("strings" if normalized == "text" else normalized)
                idx = end
                continue

            # Repeat and while blocks use the same interpreter/environment, and
            # preserve the original token locations even in nested loops.
            if tok.type in (TokenType.KW_REPEAT, TokenType.KW_WHILE):
                kind = "repeat" if tok.type == TokenType.KW_REPEAT else "while"
                end_header = idx + 1
                while end_header < n and tokens[end_header].type not in (TokenType.NEWLINE, TokenType.EOF): end_header += 1
                header = list(tokens[idx + 1:end_header])
                if header and header[-1].type == TokenType.COLON: header.pop()
                if kind == "repeat":
                    if not header or header[-1].lexeme.lower() not in ("times", "time"):
                        raise self.diagnostic("E101", "Invalid Repeat", "A repeat needs a count followed by 'times'.",
                                              "For example: repeat 3 times", line_num, col_num)
                    count_tokens = header[:-1]
                    if not count_tokens:
                        raise self.diagnostic("E105", "Missing Repeat Count", "The repeat count is missing.",
                                              "For example: repeat 3 times", line_num, col_num)
                else:
                    if header and header[-1].type == TokenType.KW_DO: header.pop()
                    if not header:
                        raise self.diagnostic("E105", "Missing While Condition", "The while condition is missing.",
                                              "For example: while 'n' is less than 3 do", line_num, col_num)
                body_start = end_header + (1 if end_header < n and tokens[end_header].type == TokenType.NEWLINE else 0)
                j, depth, at_start = body_start, 1, True
                while j < n and tokens[j].type != TokenType.EOF:
                    t = tokens[j]
                    if t.type == TokenType.NEWLINE:
                        at_start = True
                    elif at_start:
                        if t.type == tok.type: depth += 1
                        if t.type == TokenType.KW_END and j + 1 < n and tokens[j + 1].type == tok.type:
                            depth -= 1
                            if depth == 0: break
                        at_start = False
                    j += 1
                if depth:
                    raise self.diagnostic("E106", "Unclosed Block", f"This {kind} has no matching end {kind}.",
                                          f"Close the block with: end {kind}", line_num, col_num)
                body = tokens[body_start:j]
                idx = j + 2
                if idx < n and tokens[idx].type not in (TokenType.NEWLINE, TokenType.EOF):
                    raise self.diagnostic("E101", "Unexpected Text", f"Unexpected text after end {kind}.",
                                          "Put each statement on its own line.", tokens[idx].line, tokens[idx].col)
                if kind == "repeat":
                    count = self.eval_expr(count_tokens, line_num, count_tokens[0].col)
                    if not isinstance(count, (int, float)) or not math.isfinite(count) or count < 0 or int(count) != count or count > 100000:
                        raise self.diagnostic("E405", "Invalid Repeat Count", "Repeat needs a whole number from 0 to 100000.",
                                              "For example: repeat 3 times", line_num, col_num)
                    for _ in range(int(count)): self.parse_and_execute(body)
                else:
                    rounds = 0
                    while self.eval_condition(header, line_num, col_num):
                        if rounds >= 100000:
                            raise self.diagnostic("E405", "Endless Loop", "The while loop exceeded 100000 iterations.",
                                                  "Change a value in the loop so the condition becomes false.", line_num, col_num)
                        self.parse_and_execute(body)
                        rounds += 1
                continue

            # 3. RUN THE PYTHON CODE
            if tok.type == TokenType.KW_RUN:
                # Check if next tokens are (the)? python code
                chk = idx + 1
                if chk < n and tokens[chk].type == TokenType.KW_THE: chk += 1
                if chk + 1 < n and tokens[chk].type == TokenType.KW_PYTHON and tokens[chk+1].type == TokenType.KW_CODE:
                    idx = chk + 2
                    # Check single-line string: run the python code "..."
                    if idx < n and tokens[idx].type == TokenType.STRING:
                        py_code = tokens[idx].string_value
                        idx += 1
                        out_var = None
                        if match(TokenType.KW_AND) and match(TokenType.KW_SAVE):
                            if match(TokenType.KW_THE): pass
                            if match(TokenType.KW_OUTPUT) or match(TokenType.KW_RESULT): pass
                            if match(TokenType.KW_AS):
                                if idx < n and tokens[idx].type == TokenType.VARIABLE:
                                    out_var = tokens[idx].string_value
                                    idx += 1
                        res = self.execute_python_code(py_code, line_num, col_num)
                        if out_var:
                            self.set_var(out_var, res)
                        continue

                    # Check multi-line block token
                    if match(TokenType.COLON):
                        skip_newlines()
                        if idx < n and tokens[idx].type == TokenType.PYTHON_BLOCK:
                            py_code = tokens[idx].string_value
                            idx += 1
                            self.execute_python_code(py_code, line_num, col_num)
                            continue

            # 4. IF STATEMENT: Single-line and Multi-line
            if tok.type == TokenType.KW_IF:
                idx += 1
                # Enforce: otherwise cannot be on same line
                # Lookahead on same line for KW_OTHERWISE
                chk_idx = idx
                while chk_idx < n and tokens[chk_idx].line == line_num:
                    if tokens[chk_idx].type == TokenType.KW_OTHERWISE:
                        cur_line = self.get_source_line(line_num)
                        raise EppDiagnosticError(
                            code="E103",
                            name="Invalid Otherwise Syntax",
                            filename=self.filename,
                            line=line_num,
                            col=tokens[chk_idx].col,
                            source_line=cur_line,
                            reason="'otherwise' cannot be placed on the same line as 'if ... then'.",
                            help_msg="In E++, 'otherwise' always has to be on the next line immediately following the 'if' statement."
                        )
                    chk_idx += 1

                # Collect condition tokens until KW_THEN
                cond_tokens = []
                while idx < n and tokens[idx].type != TokenType.KW_THEN and tokens[idx].type not in (TokenType.NEWLINE, TokenType.EOF):
                    cond_tokens.append(tokens[idx])
                    idx += 1

                if not match(TokenType.KW_THEN):
                    cur_line = self.get_source_line(line_num)
                    raise EppDiagnosticError(
                        code="E101",
                        name="Syntax Error in If Statement",
                        filename=self.filename,
                        line=line_num,
                        col=col_num,
                        source_line=cur_line,
                        reason="Expected 'then' after if condition.",
                        help_msg="Format if statements as: if <condition> then <statement>"
                    )

                cond_result = self.eval_condition(cond_tokens, line_num, col_num)

                # Check if block if: then : \n
                if match(TokenType.COLON):
                    # Multi-line blocks: count only nested block ifs, not
                    # inline ifs or type-checks appearing inside a statement.
                    then_tokens = []
                    else_tokens = []
                    cur_block = then_tokens
                    skip_newlines()
                    depth, at_start = 1, True
                    while idx < n:
                        current = tokens[idx]
                        if current.type == TokenType.NEWLINE:
                            cur_block.append(current)
                            idx += 1
                            at_start = True
                            continue
                        if at_start and current.type == TokenType.KW_IF:
                            j = idx + 1
                            while j < n and tokens[j].type not in (TokenType.NEWLINE, TokenType.EOF): j += 1
                            header = tokens[idx:j]
                            then = next((k for k, t in enumerate(header) if t.type == TokenType.KW_THEN), -1)
                            if then >= 0 and then + 1 < len(header) and header[then + 1].type == TokenType.COLON:
                                depth += 1
                        elif at_start and current.type == TokenType.KW_END and idx + 1 < n and tokens[idx + 1].type == TokenType.KW_IF:
                            depth -= 1
                            if depth == 0:
                                idx += 2
                                break
                        elif at_start and depth == 1 and current.type in (TokenType.KW_OTHERWISE, TokenType.KW_ELSE):
                            j = idx + 1
                            if j < n and tokens[j].type == TokenType.COLON: j += 1
                            if j >= n or tokens[j].type in (TokenType.NEWLINE, TokenType.EOF):
                                cur_block = else_tokens
                                idx = j
                                skip_newlines()
                                at_start = True
                                continue
                        cur_block.append(current)
                        idx += 1
                        at_start = False

                    if depth != 0:
                        raise self.diagnostic("E106", "Unclosed Block", "This if has no matching end if.",
                                              "Close the block with: end if", line_num, col_num)
                    active_tokens = then_tokens if cond_result else else_tokens
                    sub_interp = Interpreter(self.filename)
                    sub_interp.vars = self.vars
                    sub_interp.original_var_names = self.original_var_names
                    sub_interp.libs = self.libs
                    sub_interp.source_lines = self.source_lines
                    sub_interp.parse_and_execute(active_tokens)
                    continue

                # Single-line if statement
                # Collect tokens for then-statement on the current line
                then_stmt_tokens = []
                while idx < n and tokens[idx].line == line_num and tokens[idx].type not in (TokenType.NEWLINE, TokenType.EOF):
                    then_stmt_tokens.append(tokens[idx])
                    idx += 1

                # Check if the next line begins with KW_OTHERWISE
                has_otherwise = False
                otherwise_stmt_tokens = []
                otherwise_line_num = line_num + 1

                saved_idx = idx
                skip_newlines()
                if idx < n and tokens[idx].type == TokenType.KW_OTHERWISE:
                    has_otherwise = True
                    oth_tok = tokens[idx]
                    otherwise_line_num = oth_tok.line
                    idx += 1
                    # Collect statement tokens on the otherwise line
                    while idx < n and tokens[idx].line == otherwise_line_num and tokens[idx].type not in (TokenType.NEWLINE, TokenType.EOF):
                        otherwise_stmt_tokens.append(tokens[idx])
                        idx += 1
                else:
                    # Rewind newlines if not otherwise
                    idx = saved_idx

                if not then_stmt_tokens:
                    raise self.diagnostic("E105", "Missing If Action", "There is no statement after 'then'.",
                                          'Write an action after then, or use then: and end if.', line_num, col_num)
                if cond_result:
                    if then_stmt_tokens:
                        self.execute_single_statement(then_stmt_tokens, line_num)
                elif has_otherwise:
                    if otherwise_stmt_tokens:
                        self.execute_single_statement(otherwise_stmt_tokens, otherwise_line_num)
                continue

            # Standalone OTHERWISE check (forbidden)
            if tok.type == TokenType.KW_OTHERWISE:
                cur_line = self.get_source_line(line_num)
                raise EppDiagnosticError(
                    code="E104",
                    name="Standalone Otherwise",
                    filename=self.filename,
                    line=line_num,
                    col=col_num,
                    source_line=cur_line,
                    reason="'otherwise' can only appear immediately on the next line after an 'if' statement.",
                    help_msg="Attach this 'otherwise' to a preceding 'if <condition> then' statement."
                )

            # Collect line tokens for standard statement execution
            stmt_tokens = []
            cur_stmt_line = tok.line
            while idx < n and tokens[idx].line == cur_stmt_line and tokens[idx].type not in (TokenType.NEWLINE, TokenType.EOF):
                stmt_tokens.append(tokens[idx])
                idx += 1

            if stmt_tokens:
                self.execute_single_statement(stmt_tokens, cur_stmt_line)

    def execute_single_statement(self, tokens: List[Token], line_num: int):
        first = tokens[0]
        col_num = first.col

        # SAY / TELL
        if first.type in (TokenType.KW_SAY, TokenType.KW_TELL):
            self.execute_say(tokens[1:], line_num, col_num)
            return

        # LET / SET / DEFINE (Golden Rule 2: Single quotes for variables!)
        if first.type in (TokenType.KW_LET, TokenType.KW_SET, TokenType.KW_DEFINE):
            if len(tokens) > 1 and tokens[1].type == TokenType.STRING:
                cur_line = self.get_source_line(line_num)
                raise EppDiagnosticError(
                    code="E202",
                    name="Golden Rule 2 Violation",
                    filename=self.filename,
                    line=line_num,
                    col=tokens[1].col,
                    source_line=cur_line,
                    reason="Variables in E++ must ALWAYS be wrapped in single quotes ('Name'), never double quotes!",
                    help_msg=f"Replace \"{tokens[1].string_value}\" with '{tokens[1].string_value}'."
                )

            if len(tokens) < 4 or tokens[1].type != TokenType.VARIABLE:
                cur_line = self.get_source_line(line_num)
                bad_name = len(tokens) > 1 and tokens[1].type != TokenType.VARIABLE
                raise EppDiagnosticError(
                    code="E202" if bad_name else "E101",
                    name="Syntax Error in Variable Assignment",
                    filename=self.filename,
                    line=line_num,
                    col=col_num,
                    source_line=cur_line,
                    reason="Invalid assignment statement.",
                    help_msg="Format assignment as: let 'Name' be <value> or define 'Name' as <value>"
                )

            var_name = tokens[1].string_value
            if tokens[2].type not in (TokenType.KW_BE, TokenType.KW_AS, TokenType.KW_TO):
                raise self.diagnostic("E101", "Invalid Assignment", "Expected 'be', 'as', or 'to' after the variable.",
                                      "For example: let 'Name' be \"Sam\"", line_num, tokens[2].col)
            rhs_idx = 3
            if rhs_idx >= len(tokens):
                raise self.diagnostic("E105", "Missing Value", "The assignment needs a value.",
                                      "For example: let 'Name' be \"Sam\"", line_num, col_num)
            val = self.eval_expr(tokens[rhs_idx:], line_num, tokens[rhs_idx].col)
            self.set_var(var_name, val)
            return

        # ASK — the variable after 'as' is the destination, not the first
        # variable that might appear in the prompt.
        if first.type == TokenType.KW_ASK:
            and_idx = next((i for i, t in enumerate(tokens) if t.type == TokenType.KW_AND), -1)
            if and_idx <= 1 or and_idx + 1 >= len(tokens) or tokens[and_idx + 1].type != TokenType.KW_SAVE:
                raise self.diagnostic("E101", "Invalid Ask", "Expected a prompt and 'and save ... as'.",
                                      "For example: ask \"Name?\" and save the output as 'Name'", line_num, col_num)
            j = and_idx + 2
            while j < len(tokens) and tokens[j].type in (TokenType.KW_THE, TokenType.KW_IT, TokenType.KW_OUTPUT, TokenType.KW_ANSWER, TokenType.KW_RESULT): j += 1
            if j >= len(tokens) or tokens[j].type not in (TokenType.KW_AS, TokenType.KW_IN):
                raise self.diagnostic("E101", "Invalid Ask", "Expected 'as' before the destination variable.",
                                      "Use a single-quoted name: as 'Name'", line_num, col_num)
            j += 1
            if j >= len(tokens) or tokens[j].type != TokenType.VARIABLE:
                bad_col = tokens[j].col if j < len(tokens) else col_num
                raise self.diagnostic("E202", "Invalid Variable Name", "The answer needs a single-quoted variable name.",
                                      "For example: as 'Name'", line_num, bad_col)
            if j + 1 != len(tokens):
                raise self.diagnostic("E101", "Invalid Ask", "Unexpected text after the answer variable.",
                                      "Put each statement on its own line.", line_num, tokens[j + 1].col)
            prompt_val = str(self.eval_expr(tokens[1:and_idx], line_num, tokens[1].col))
            try:
                user_val = input(prompt_val)
            except (EOFError, IOError):
                user_val = ""
            try:
                num = float(user_val) if "." in user_val else int(user_val)
                self.set_var(tokens[j].string_value, num)
            except ValueError:
                self.set_var(tokens[j].string_value, user_val)
            return

        if first.type == TokenType.KW_CHECK:
            if len(tokens) < 5 or tokens[1].type != TokenType.KW_IF:
                raise self.diagnostic("E101", "Invalid Type Check", "Expected check if <value> is [not] a number.",
                                      'For example: check if "hello" is not a number', line_num, col_num)
            is_idx = next((i for i, t in enumerate(tokens) if t.type == TokenType.KW_IS), -1)
            if is_idx < 2:
                raise self.diagnostic("E101", "Invalid Type Check", "Expected 'is' in the type check.",
                                      'For example: check if "hello" is a number', line_num, col_num)
            rest = [t.lexeme.lower() for t in tokens[is_idx + 1:]]
            if rest not in (["a", "number"], ["number"], ["not", "a", "number"], ["not", "number"]):
                raise self.diagnostic("E101", "Invalid Type Check", "Expected 'a number' or 'not a number'.",
                                      'For example: check if "hello" is not a number', line_num, col_num)
            value = self.eval_expr(tokens[2:is_idx], line_num, tokens[2].col)
            try:
                float(value)
                result = str(value).strip() != ""
            except (ValueError, TypeError):
                result = False
            print(str(not result if rest[0] == "not" else result).lower())
            return

        # WRITE TO FILE
        tok_words = [t.lexeme.lower() for t in tokens]
        if first.type == TokenType.IDENTIFIER and first.lexeme.lower() == "write":
            self.require_lib("Files", "Writing files", line_num, col_num)
            to_idx = -1
            for i, w in enumerate(tok_words):
                if w == "to": to_idx = i; break
            if to_idx != -1 and to_idx + 1 < len(tokens):
                content = str(self.eval_expr(tokens[1:to_idx], line_num, col_num))
                target_tok = tokens[-1]
                fname = target_tok.string_value if target_tok.type == TokenType.STRING else target_tok.lexeme
                with open(fname, "w", encoding="utf-8") as f:
                    f.write(content)
            return

        # APPEND TO FILE
        if first.type == TokenType.IDENTIFIER and first.lexeme.lower() == "append":
            self.require_lib("Files", "Appending files", line_num, col_num)
            to_idx = -1
            for i, w in enumerate(tok_words):
                if w == "to": to_idx = i; break
            if to_idx != -1 and to_idx + 1 < len(tokens):
                content = str(self.eval_expr(tokens[1:to_idx], line_num, col_num))
                target_tok = tokens[-1]
                fname = target_tok.string_value if target_tok.type == TokenType.STRING else target_tok.lexeme
                with open(fname, "a", encoding="utf-8") as f:
                    f.write(content)
            return

        # READ FILE
        if first.type == TokenType.IDENTIFIER and first.lexeme.lower() == "read":
            self.require_lib("Files", "Reading files", line_num, col_num)
            fname = None
            var_name = None
            for t in tokens:
                if t.type == TokenType.STRING: fname = t.string_value
                elif t.type == TokenType.VARIABLE: var_name = t.string_value
            if fname and var_name:
                try:
                    with open(fname, "r", encoding="utf-8") as f:
                        file_content = f.read()
                except Exception:
                    file_content = ""
                self.set_var(var_name, file_content)
            return

        # CLEAR CONSOLE
        if first.type == TokenType.IDENTIFIER and first.lexeme.lower() == "clear":
            self.require_lib("Console", "Clear console", line_num, col_num)
            print("\033[2J\033[H", end="")
            return

        # WAIT / SLEEP
        if first.type == TokenType.IDENTIFIER and first.lexeme.lower() in ("wait", "sleep"):
            self.require_lib("Time", "Wait statement", line_num, col_num)
            val = float(tokens[1].number_value if tokens[1].type == TokenType.NUMBER else 1)
            is_ms = "millisecond" in " ".join(tok_words)
            secs = val / 1000.0 if is_ms else val
            time.sleep(min(secs, 0.2)) # Cap sleep during automated runs
            return

        # RUN SYSTEM COMMAND
        if first.type == TokenType.KW_RUN and len(tokens) > 1 and tokens[1].lexeme.lower() == "system":
            self.require_lib("System", "Run system command", line_num, col_num)
            cmd_tok = None
            var_tok = None
            for t in tokens:
                if t.type == TokenType.STRING: cmd_tok = t
                elif t.type == TokenType.VARIABLE: var_tok = t
            if cmd_tok:
                cmd = cmd_tok.string_value
                import subprocess
                try:
                    res = subprocess.check_output(cmd, shell=True, text=True).strip()
                except Exception as e:
                    res = str(e)
                if var_tok:
                    self.set_var(var_tok.string_value, res)
                else:
                    print(res)
            return

        code = "E106" if first.type in (TokenType.KW_END, TokenType.KW_ELSE) else "E101"
        raise self.diagnostic(code, "Unknown Statement", f"E++ does not recognize '{first.lexeme}' as a statement.",
                              'Start with a command such as say, let, or if.', line_num, col_num)

    def execute_say(self, tokens: List[Token], line_num: int, col_num: int):
        if not tokens:
            raise self.diagnostic("E105", "Missing Value", "'say' needs a value to print.",
                                  'For example: say "Hello"', line_num, col_num)

        # Check Colors library keyword
        color_code = ""
        first_tok = tokens[0]
        if first_tok.type == TokenType.IDENTIFIER:
            col_word = first_tok.lexeme.lower()
            color_map = {
                "red": "\033[31m",
                "green": "\033[32m",
                "blue": "\033[34m",
                "yellow": "\033[33m",
                "cyan": "\033[36m",
                "magenta": "\033[35m"
            }
            if col_word in color_map:
                self.require_lib("Colors", "Colored say statement", line_num, col_num)
                color_code = color_map[col_word]
                tokens = tokens[1:]
                if not tokens:
                    raise self.diagnostic("E105", "Missing Value", "A colored say needs a value to print.",
                                          'For example: say red "Hello"', line_num, col_num)

        # Check for separation method
        sep_str = None
        sep_idx = -1
        for i, t in enumerate(tokens):
            if t.type == TokenType.KW_SEPARATION:
                sep_idx = i
                break
        if sep_idx != -1:
            # separation method of <sep>
            of_idx = -1
            for j in range(sep_idx, len(tokens)):
                if tokens[j].type == TokenType.KW_OF:
                    of_idx = j
                    break
            if of_idx != -1 and of_idx + 1 < len(tokens):
                sep_str = str(self.eval_expr(tokens[of_idx+1:], line_num, tokens[of_idx+1].col))
            tokens = tokens[:sep_idx]
            if tokens and tokens[-1].type == TokenType.KW_THE: tokens.pop()
            if tokens and tokens[-1].type == TokenType.KW_WITH: tokens.pop()

        # Evaluate concat parts separated by commas or 'and concat it with'
        parts = self.split_concat_tokens(tokens)
        evaluated = []
        for p in parts:
            if p:
                evaluated.append(str(self.eval_expr(p, line_num, p[0].col)))

        if sep_str is not None:
            out_str = sep_str.join(evaluated)
        else:
            out_str = self.join_say_parts(evaluated)

        if color_code:
            print(f"{color_code}{out_str}\033[0m")
        else:
            print(out_str)

    @staticmethod
    def join_say_parts(pieces: List[str]) -> str:
        """Joins the pieces of one `say` the way the other engines do.

        The pieces are written as they are; a space is added only where two
        words would otherwise run together, or after punctuation. So
        `say "Hello, ", 'Name'` prints `Hello, Ada`, `say "Hi", 'Name'`
        prints `Hi Ada`, and `say "Hi-", 'Name'` prints `Hi-there`.
        """
        out = ""
        for index, piece in enumerate(pieces):
            cur = "" if piece is None else str(piece)
            if index > 0 and out and cur:
                last, first = out[-1], cur[0]
                if re.match(r'[A-Za-z0-9]', last) and re.match(r'[A-Za-z0-9]', first):
                    out += " "
                elif last in "!?:," and first != " ":
                    out += " "
            out += cur
        return out

    def split_concat_tokens(self, tokens: List[Token]) -> List[List[Token]]:
        res = []
        cur = []
        i = 0
        while i < len(tokens):
            t = tokens[i]
            if t.type == TokenType.COMMA:
                if not cur:
                    raise self.diagnostic("E105", "Missing Value", "A comma needs a value before it.",
                                          'Separate values like: say "Hello", "world"', t.line, t.col)
                res.append(cur)
                cur = []
                i += 1
                if i < len(tokens) and tokens[i].type == TokenType.KW_AND and i + 1 < len(tokens) and tokens[i + 1].type == TokenType.KW_CONCAT:
                    i += 1
                if i == len(tokens):
                    raise self.diagnostic("E105", "Missing Value", "A comma needs a value after it.",
                                          'Separate values like: say "Hello", "world"', t.line, t.col)
                continue
            if t.type == TokenType.KW_CONCAT:
                if cur and cur[-1].type == TokenType.KW_AND: cur.pop()
                if cur: res.append(cur)
                cur = []
                i += 1
                if i < len(tokens) and tokens[i].type == TokenType.KW_IT: i += 1
                if i < len(tokens) and tokens[i].type == TokenType.KW_WITH: i += 1
                continue
            cur.append(t)
            i += 1
        if cur:
            res.append(cur)
        return res

    def eval_condition(self, tokens: List[Token], line: int, col: int) -> bool:
        if not tokens:
            return False

        # Find comparison operator: "is equal to", "is greater than", etc.
        eq_idx = -1
        for i, t in enumerate(tokens):
            if t.type == TokenType.KW_IS:
                eq_idx = i
                break

        if eq_idx != -1:
            left_toks = tokens[:eq_idx]
            rem = tokens[eq_idx+1:]
            left_val = self.eval_expr(left_toks, line, col)

            # is not equal to
            if rem and rem[0].type == TokenType.KW_NOT:
                rem = rem[1:]
                if rem and rem[0].type == TokenType.KW_EQUAL: rem = rem[1:]
                if rem and rem[0].type == TokenType.KW_TO: rem = rem[1:]
                right_val = self.eval_expr(rem, line, col)
                return str(left_val).lower() != str(right_val).lower()

            # is greater than or equal to
            if len(rem) >= 2 and rem[0].type == TokenType.KW_GREATER and rem[1].type == TokenType.KW_THAN:
                rem = rem[2:]
                right_val = self.eval_expr(rem, line, col)
                return float(left_val) > float(right_val)

            # is less than
            if len(rem) >= 2 and rem[0].type == TokenType.KW_LESS and rem[1].type == TokenType.KW_THAN:
                rem = rem[2:]
                right_val = self.eval_expr(rem, line, col)
                return float(left_val) < float(right_val)

            # is equal to / is
            if rem and rem[0].type == TokenType.KW_EQUAL: rem = rem[1:]
            if rem and rem[0].type == TokenType.KW_TO: rem = rem[1:]
            right_val = self.eval_expr(rem, line, col)

            # Numerical or string equality
            try:
                l_num = float(left_val)
                r_num = float(right_val)
                return l_num == r_num
            except (ValueError, TypeError):
                return str(left_val).lower() == str(right_val).lower()

        # Standalone expression evaluated as truthy
        val = self.eval_expr(tokens, line, col)
        return bool(val)

    def eval_expr(self, tokens: List[Token], line: int, col: int, allow_raw_words: bool = False) -> Any:
        tokens = [t for t in tokens if t.type not in (TokenType.NEWLINE, TokenType.EOF)]
        if not tokens:
            raise self.diagnostic("E105", "Missing Value", "An expression needs a value.",
                                  'Use a number, "text", or a single-quoted variable.', line, col)

        # Single string literal
        if len(tokens) == 1 and tokens[0].type == TokenType.STRING:
            return tokens[0].string_value

        # Single variable
        if len(tokens) == 1 and tokens[0].type == TokenType.VARIABLE:
            return self.get_var(tokens[0].string_value, line, tokens[0].col)

        # Single number
        if len(tokens) == 1 and tokens[0].type == TokenType.NUMBER:
            return int(tokens[0].number_value) if tokens[0].number_value.is_integer() else tokens[0].number_value

        # Library operations have exact prefixes and evaluate their arguments
        # through this same restricted expression evaluator. Never pass E++
        # source to Python's eval().
        words = [t.lexeme.lower() for t in tokens]
        tok_str = " ".join(words)
        base = 1 if words and words[0] == "the" else 0

        def rest_after(prefix):
            return tokens[base + len(prefix):] if words[base:base + len(prefix)] == prefix else None

        def evaluate(part):
            return self.eval_expr(part, line, part[0].col if part else col)

        def normal_number(value):
            return int(value) if isinstance(value, float) and value.is_integer() else value

        def divided_parts(part, word):
            where = next((i for i, t in enumerate(part) if t.lexeme.lower() == word), -1)
            if where <= 0 or where == len(part) - 1:
                raise self.diagnostic("E105", "Missing Value", f"Expected values on both sides of '{word}'.",
                                      "Check the library expression's arguments.", line, col)
            return part[:where], part[where + 1:]

        random_match = re.match(r"^(?:it['’]?s\s+)?(?:a\s+|the\s+)?(?:random\s+)?number\s+between\b", tok_str)
        if random_match:
            if "random" not in self.libs and "math" not in self.libs:
                self.require_lib("Random", "Random numbers", line, col)
            at = words.index("between")
            left, right = divided_parts(tokens[at + 1:], "and")
            low, high = float(evaluate(left)), float(evaluate(right))
            lo, hi = min(low, high), max(low, high)
            return random.randint(int(lo), int(hi)) if lo.is_integer() and hi.is_integer() else random.uniform(lo, hi)

        if re.match(r"^roll\s+(?:a\s+)?dice(?:\s|$)", tok_str):
            if "random" not in self.libs and "math" not in self.libs:
                self.require_lib("Random", "Rolling dice", line, col)
            if "with" in words:
                at = words.index("with")
                if words[-1] != "sides":
                    raise self.diagnostic("E105", "Invalid Dice", "Expected a number followed by 'sides'.", "For example: roll a dice with 6 sides", line, col)
                sides = int(evaluate(tokens[at + 1:-1]))
            elif tok_str in ("roll a dice", "roll dice"):
                sides = 6
            else:
                raise self.diagnostic("E105", "Invalid Dice", "The dice expression is incomplete.", "For example: roll a dice", line, col)
            if sides < 1: raise ValueError("A dice needs at least one side.")
            return random.randint(1, sides)

        if tok_str in ("flip a coin", "flip coin"):
            if "random" not in self.libs and "math" not in self.libs:
                self.require_lib("Random", "Flipping coin", line, col)
            return random.choice(["heads", "tails"])

        arg = rest_after(["square", "root", "of"])
        if arg is not None:
            self.require_lib("Math", "Square root", line, col)
            return normal_number(math.sqrt(float(evaluate(arg))))
        arg = rest_after(["absolute", "value", "of"])
        if arg is not None:
            self.require_lib("Math", "Absolute value", line, col)
            return normal_number(abs(float(evaluate(arg))))
        for name, function in (("minimum", min), ("maximum", max)):
            arg = rest_after([name, "of"])
            if arg is not None:
                self.require_lib("Math", name.title(), line, col)
                left, right = divided_parts(arg, "and")
                return normal_number(function(float(evaluate(left)), float(evaluate(right))))

        if "percent" in words:
            at = words.index("percent")
            start = 2 if words[:2] == ["how", "much"] else 0
            after = at + 1
            if after < len(words) and words[after] == "is": after += 1
            if after < len(words) and words[after] == "of":
                self.require_lib("Math", "Percentage calculation", line, col)
                return normal_number(float(evaluate(tokens[start:at])) * float(evaluate(tokens[after + 1:])) / 100.0)

        if tok_str in ("the value of pi", "value of pi", "pi", "the value of e", "value of e", "e"):
            self.require_lib("Math", "Mathematical constant", line, col)
            return math.e if words[-1] == "e" else math.pi

        for prefix, function in (
            (["uppercase", "of"], lambda x: x.upper()),
            (["lowercase", "of"], lambda x: x.lower()),
            (["trim", "of"], lambda x: x.strip()),
            (["reverse", "of"], lambda x: x[::-1]),
            (["length", "of"], len),
            (["first", "letter", "of"], lambda x: x[:1]),
            (["last", "letter", "of"], lambda x: x[-1:]),
        ):
            arg = rest_after(prefix)
            if arg is not None:
                self.require_lib("Strings", "Strings library", line, col)
                return function(str(evaluate(arg)))

        # System: the platform / the os
        if tok_str in ("the platform", "the system platform"):
            self.require_lib("System", "Platform diagnostics", line, col)
            return sys.platform
        if tok_str in ("the os", "the operating system"):
            self.require_lib("System", "OS diagnostics", line, col)
            return os.name

        # Time: the current time / date / year
        if tok_str == "the current time":
            self.require_lib("Time", "Current time", line, col)
            return datetime.datetime.now().strftime("%H:%M:%S")
        if tok_str == "the current date":
            self.require_lib("Time", "Current date", line, col)
            return datetime.date.today().isoformat()
        if tok_str == "the current year":
            self.require_lib("Time", "Current year", line, col)
            return datetime.date.today().year

        # Math arithmetic evaluation: plus, minus, times, divided by
        # Build mathematical string
        expr_parts = []
        for t in tokens:
            if t.type == TokenType.NUMBER:
                expr_parts.append(str(t.lexeme))
            elif t.type == TokenType.VARIABLE:
                v = self.get_var(t.string_value, line, t.col)
                expr_parts.append(str(v))
            elif t.type in (TokenType.MATH_PLUS, TokenType.KW_ADD):
                expr_parts.append("+")
            elif t.type == TokenType.MATH_MINUS:
                expr_parts.append("-")
            elif t.type == TokenType.MATH_TIMES:
                expr_parts.append("*")
            elif t.type == TokenType.MATH_DIVIDED_BY:
                expr_parts.append("/")
            elif t.type == TokenType.MATH_MODULO:
                expr_parts.append("%")
            elif t.lexeme == "+": expr_parts.append("+")
            elif t.lexeme == "-": expr_parts.append("-")
            elif t.lexeme == "*": expr_parts.append("*")
            elif t.lexeme == "/": expr_parts.append("/")
            elif t.lexeme == "%": expr_parts.append("%")
            elif t.type == TokenType.LPAREN: expr_parts.append("(")
            elif t.type == TokenType.RPAREN: expr_parts.append(")")
            elif t.type == TokenType.IDENTIFIER:
                # Raw identifier word
                expr_parts.append(t.lexeme)
            else:
                expr_parts.append(t.lexeme)

        expr_str = " ".join(expr_parts)
        # Evaluate only arithmetic AST nodes: never treat broken math as text.
        safe_eval_str = expr_str.replace("plus", "+").replace("minus", "-").replace("times", "*").replace("divided by", "/")
        if re.fullmatch(r'[\d\s+*/%().-]+', safe_eval_str):
            def calculate(node):
                if isinstance(node, ast.Expression): return calculate(node.body)
                if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)): return node.value
                if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
                    value = calculate(node.operand)
                    return value if isinstance(node.op, ast.UAdd) else -value
                if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod)):
                    left, right = calculate(node.left), calculate(node.right)
                    if isinstance(node.op, ast.Add): return left + right
                    if isinstance(node.op, ast.Sub): return left - right
                    if isinstance(node.op, ast.Mult): return left * right
                    if right == 0: raise ZeroDivisionError()
                    return left / right if isinstance(node.op, ast.Div) else left % right
                raise ValueError("Unsupported expression")
            try:
                res = calculate(ast.parse(safe_eval_str, mode="eval"))
                return int(res) if isinstance(res, float) and res.is_integer() else res
            except ZeroDivisionError:
                raise self.diagnostic("E403", "Division By Zero", "A number cannot be divided by zero.",
                                      "Use a divisor other than zero.", line, col)
            except (ValueError, SyntaxError, OverflowError):
                raise self.diagnostic("E105", "Invalid Expression", "This arithmetic expression is incomplete or invalid.",
                                      "Check the operands and matching parentheses.", line, col)

        bad = next((t for t in tokens if t.type == TokenType.IDENTIFIER), None)
        if bad:
            raise self.diagnostic("E402", "Unquoted Text", f"Unquoted text '{bad.lexeme}' is not a value.",
                                  'Put text in double quotes, or use single quotes for a variable.', line, bad.col)
        raise self.diagnostic("E105", "Invalid Expression", "This expression could not be understood.",
                              'Use a number, "text", or a single-quoted variable.', line, col)



# ==========================================
# CLI Entrypoint
# ==========================================

def _usage():
    print("E++ [1.3] Python Direct Engine")
    print("Usage:")
    print("  python3 epp.py <file.enpp|file.enppl>             Run a program")
    print("  python3 epp.py -e '<code string>'                 Run inline code")
    print()
    print("Sealed projects:")
    print("  python3 epp.py --key <64 hex> <file.enpp>         Open with one key")
    print("  python3 epp.py --keyring <keys.json> <file>       Try every key in a keyring")
    print("  python3 epp.py --new-key                          Print a fresh key")
    print("  python3 epp.py --save <in> -o <out> [--key]       Save a project")
    print("  python3 epp.py --open <file> [--key]              Print a saved project")


def _split_global_flags(args):
    """--key and --keyring work before or after the subcommand, like the C++ CLI."""
    keyhex = None
    keyring_path = None
    rest = []
    i = 0
    while i < len(args):
        arg = args[i]
        if arg in ("--key", "-k") and i + 1 < len(args):
            keyhex = args[i + 1]
            i += 2
        elif arg == "--keyring" and i + 1 < len(args):
            keyring_path = args[i + 1]
            i += 2
        else:
            rest.append(arg)
            i += 1
    if keyhex:
        try:
            bytes.fromhex(keyhex.strip())
        except ValueError:
            raise EppDiagnosticError(
                code="E522", name="Bad Key", filename="<cli>", line=1, col=1, source_line="",
                reason="--key needs 64 hex characters (a 32-byte E++ vault key).",
                help_msg="Copy the key from epp-keys.json, or pass --keyring that file."
            )
    return keyhex, keyring_path, rest


def _output_path(rest, default):
    if "-o" in rest:
        index = rest.index("-o")
        if index + 1 < len(rest):
            return rest[index + 1]
    if "--output" in rest:
        index = rest.index("--output")
        if index + 1 < len(rest):
            return rest[index + 1]
    return default


def main():
    args = sys.argv[1:]
    if not args:
        _usage()
        sys.exit(0)

    if args[0] in ("-h", "--help"):
        _usage()
        return

    try:
        keyhex, keyring_path, rest = _split_global_flags(args)
    except EppDiagnosticError as err:
        print(err)
        sys.exit(1)

    if not rest:
        _usage()
        sys.exit(0)

    arg = rest[0]

    # A fresh key, for sealing a project by hand.
    if arg == "--new-key":
        key = random_key()
        print(key.hex())
        print("Key fingerprint: " + vault_fingerprint(key), file=sys.stderr)
        return

    # Save a project.
    if arg in ("--save", "--seal", "--encrypt") and len(rest) > 1:
        src_path = rest[1]
        if not os.path.exists(src_path):
            print(f"[E++ Error E404: File Not Found] File '{src_path}' does not exist.")
            sys.exit(1)
        with open(src_path, "r", encoding="utf-8") as handle:
            content = handle.read()
        key = key_from_hex(keyhex) if keyhex else random_key()
        sealed = save_epp(content, key)
        out_path = _output_path(rest, src_path)
        with open(out_path, "w", encoding="utf-8") as handle:
            handle.write(sealed)
        print(f"Saved {src_path} -> {out_path}")
        print("Key (hex): " + key.hex())
        print("Fingerprint: " + vault_fingerprint(key))
        print("Keep the key: the project cannot be opened without it.")
        return

    # Print a saved project.
    if arg in ("--open", "--unseal", "--decrypt") and len(rest) > 1:
        src_path = rest[1]
        if not os.path.exists(src_path):
            print(f"[E++ Error E404: File Not Found] File '{src_path}' does not exist.")
            sys.exit(1)
        with open(src_path, "r", encoding="utf-8") as handle:
            content = handle.read()
        try:
            print(open_vault(content, src_path, keyhex=keyhex, keyring_path=keyring_path))
        except EppDiagnosticError as err:
            print(err)
            sys.exit(1)
        return

    # Inline execution.
    if arg == "-e" and len(rest) > 1:
        interp = Interpreter("<cli>")
        try:
            interp.run_source(rest[1])
        except EppDiagnosticError as err:
            print(err)
            sys.exit(1)
        return

    # Run a file, opening it first if it belongs to E++.
    filename = arg
    if not os.path.exists(filename):
        print(f"[E++ Error E404: File Not Found] File '{filename}' does not exist.")
        sys.exit(1)

    with open(filename, "r", encoding="utf-8") as handle:
        content = handle.read()

    if is_vault(content):
        try:
            content = open_vault(content, filename, keyhex=keyhex, keyring_path=keyring_path)
        except EppDiagnosticError as err:
            print(err)
            sys.exit(1)

    interp = Interpreter(filename)
    try:
        interp.run_source(content)
    except EppDiagnosticError as err:
        print(err)
        sys.exit(1)


if __name__ == "__main__":
    main()
