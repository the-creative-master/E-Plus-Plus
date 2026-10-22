#!/usr/bin/env python3
"""
E++ (E-Plus-Plus) 1.1 Workspace Patch 1 Direct Python Runtime & Engine
Uses the native Python lexer to run E++ and Python code directly.
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
from typing import Dict, Any, List, Optional

from lexer import (
    Lexer, Token, TokenType, EppDiagnosticError,
    encrypt_epp, decrypt_epp
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
        # Transparent secret decryption if encrypted
        if source.strip().startswith("call ENCRYPTION_KEY"):
            source = decrypt_epp(source, self.filename)

        self.source_lines = source.split("\n")
        lexer = Lexer(source, self.filename)
        tokens = lexer.tokenize()

        self.parse_and_execute(tokens)

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

            # 1. NOTE
            if tok.type == TokenType.KW_NOTE:
                idx += 1
                continue

            # 2. ADD THE "<LIB>" LIBRARY
            if tok.type == TokenType.KW_ADD:
                idx += 1
                if match(TokenType.KW_THE): pass
                lib_name = ""
                if idx < n and tokens[idx].type in (TokenType.STRING, TokenType.IDENTIFIER):
                    lib_name = tokens[idx].string_value if tokens[idx].type == TokenType.STRING else tokens[idx].lexeme
                    idx += 1
                if match(TokenType.KW_LIBRARY): pass
                self.libs.add(self.norm(lib_name))
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
                while idx < n and tokens[idx].type != TokenType.KW_THEN and tokens[idx].type != TokenType.NEWLINE:
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
                    # Multi-line block if
                    then_tokens = []
                    else_tokens = []
                    cur_block = then_tokens
                    skip_newlines()
                    depth = 1
                    while idx < n:
                        if tokens[idx].type == TokenType.KW_IF:
                            depth += 1
                        elif tokens[idx].type == TokenType.KW_END:
                            if idx + 1 < n and tokens[idx+1].type == TokenType.KW_IF:
                                depth -= 1
                                if depth == 0:
                                    idx += 2
                                    break
                        elif depth == 1 and tokens[idx].type in (TokenType.KW_OTHERWISE, TokenType.KW_ELSE):
                            cur_block = else_tokens
                            idx += 1
                            if match(TokenType.COLON): pass
                            skip_newlines()
                            continue
                        cur_block.append(tokens[idx])
                        idx += 1

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
                while idx < n and tokens[idx].line == line_num and tokens[idx].type != TokenType.NEWLINE:
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
                    while idx < n and tokens[idx].line == otherwise_line_num and tokens[idx].type != TokenType.NEWLINE:
                        otherwise_stmt_tokens.append(tokens[idx])
                        idx += 1
                else:
                    # Rewind newlines if not otherwise
                    idx = saved_idx

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
            while idx < n and tokens[idx].line == cur_stmt_line and tokens[idx].type != TokenType.NEWLINE:
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
                raise EppDiagnosticError(
                    code="E101",
                    name="Syntax Error in Variable Assignment",
                    filename=self.filename,
                    line=line_num,
                    col=col_num,
                    source_line=cur_line,
                    reason="Invalid assignment statement.",
                    help_msg="Format assignment as: let 'Name' be <value> or define 'Name' as <value>"
                )

            var_name = tokens[1].string_value
            # rhs tokens after be/as/to
            rhs_idx = 2
            while rhs_idx < len(tokens) and tokens[rhs_idx].type in (TokenType.KW_BE, TokenType.KW_AS, TokenType.KW_TO):
                rhs_idx += 1

            val = self.eval_expr(tokens[rhs_idx:], line_num, tokens[rhs_idx].col if rhs_idx < len(tokens) else col_num, allow_raw_words=True)
            self.set_var(var_name, val)
            return

        # ASK
        if first.type == TokenType.KW_ASK:
            # ask "Prompt" and save the output as 'Name'
            prompt_val = "Enter input: "
            name_idx = -1
            for i, t in enumerate(tokens):
                if t.type == TokenType.VARIABLE:
                    name_idx = i
                    break
            if name_idx != -1:
                prompt_tokens = tokens[1:name_idx]
                # filter keywords
                clean_prompt_tokens = [t for t in prompt_tokens if t.type not in (TokenType.KW_AND, TokenType.KW_SAVE, TokenType.KW_THE, TokenType.KW_OUTPUT, TokenType.KW_AS)]
                if clean_prompt_tokens:
                    prompt_val = str(self.eval_expr(clean_prompt_tokens, line_num, col_num))
                try:
                    user_val = input(prompt_val)
                except (EOFError, IOError):
                    user_val = "Alex"
                var_name = tokens[name_idx].string_value
                # Try int/float conversion
                try:
                    num = float(user_val) if "." in user_val else int(user_val)
                    self.set_var(var_name, num)
                except ValueError:
                    self.set_var(var_name, user_val)
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

    def execute_say(self, tokens: List[Token], line_num: int, col_num: int):
        if not tokens:
            print()
            return

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
                    return

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

        # Evaluate concat parts separated by commas or 'and concat it with'
        parts = self.split_concat_tokens(tokens)
        evaluated = []
        for p in parts:
            if p:
                evaluated.append(str(self.eval_expr(p, line_num, p[0].col)))

        if sep_str is not None:
            out_str = sep_str.join(evaluated)
        else:
            out_str = " ".join(evaluated)

        if color_code:
            print(f"{color_code}{out_str}\033[0m")
        else:
            print(out_str)

    def split_concat_tokens(self, tokens: List[Token]) -> List[List[Token]]:
        res = []
        cur = []
        i = 0
        while i < len(tokens):
            t = tokens[i]
            if t.type == TokenType.COMMA:
                if cur: res.append(cur)
                cur = []
                i += 1
                continue
            if t.type == TokenType.KW_CONCAT:
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
            return ""

        # Single string literal
        if len(tokens) == 1 and tokens[0].type == TokenType.STRING:
            return tokens[0].string_value

        # Single variable
        if len(tokens) == 1 and tokens[0].type == TokenType.VARIABLE:
            return self.get_var(tokens[0].string_value, line, tokens[0].col)

        # Single number
        if len(tokens) == 1 and tokens[0].type == TokenType.NUMBER:
            return int(tokens[0].number_value) if tokens[0].number_value.is_integer() else tokens[0].number_value

        # Random functions: "a random number between X and Y"
        tok_str = " ".join(t.lexeme for t in tokens).lower()
        if "random number between" in tok_str or "number between" in tok_str:
            if "random" not in self.libs and "math" not in self.libs:
                self.require_lib("Random", "Random numbers", line, col)
            m = re.search(r'between\s+(.+?)\s+and\s+(.+)$', tok_str)
            if m:
                # Find bounds
                low = int(float(m.group(1).strip()))
                high = int(float(m.group(2).strip()))
                return random.randint(min(low, high), max(low, high))

        # Roll a dice
        if "roll a dice" in tok_str or "roll dice" in tok_str:
            self.require_lib("Random", "Rolling dice", line, col)
            sides = 6
            m = re.search(r'with\s+(\d+)\s+sides', tok_str)
            if m: sides = int(m.group(1))
            return random.randint(1, sides)

        # Flip a coin
        if "flip a coin" in tok_str:
            self.require_lib("Random", "Flipping coin", line, col)
            return random.choice(["heads", "tails"])

        # Math: square root of X
        if "square root of" in tok_str:
            self.require_lib("Math", "Square root", line, col)
            m = re.search(r'square root of\s+(.+)$', tok_str)
            if m:
                arg = float(m.group(1).strip())
                res = math.sqrt(arg)
                return int(res) if res.is_integer() else res

        if "percent is of" in tok_str:
            self.require_lib("Math", "Percentage calculation", line, col)
            m = re.search(r'how much\s+(.+?)\s+percent\s+is\s+of\s+(.+)$', tok_str)
            if m:
                pct = float(m.group(1).strip())
                tot = float(m.group(2).strip())
                res = (pct / 100.0) * tot
                return int(res) if res.is_integer() else res

        if "absolute value of" in tok_str:
            self.require_lib("Math", "Absolute value", line, col)
            m = re.search(r'absolute value of\s+(.+)$', tok_str)
            if m:
                clean_expr = m.group(1).replace("plus", "+").replace("minus", "-").replace("times", "*")
                val = eval(clean_expr)
                return abs(int(val)) if isinstance(val, int) else abs(val)

        if "minimum of" in tok_str:
            self.require_lib("Math", "Minimum", line, col)
            m = re.search(r'minimum of\s+(.+?)\s+and\s+(.+)$', tok_str)
            if m:
                return min(int(float(m.group(1))), int(float(m.group(2))))

        if "maximum of" in tok_str:
            self.require_lib("Math", "Maximum", line, col)
            m = re.search(r'maximum of\s+(.+?)\s+and\s+(.+)$', tok_str)
            if m:
                return max(int(float(m.group(1))), int(float(m.group(2))))

        if tok_str in ("the value of pi", "pi"):
            self.require_lib("Math", "Value of pi", line, col)
            return math.pi

        if "the uppercase of" in tok_str or "the trim of" in tok_str or "the lowercase of" in tok_str or "the reverse of" in tok_str:
            self.require_lib("Strings", "Strings library", line, col)
            base_s = ""
            for t in tokens:
                if t.type == TokenType.STRING:
                    base_s = t.string_value
                    break
                elif t.type == TokenType.VARIABLE:
                    base_s = str(self.get_var(t.string_value, line, t.col))
                    break
            if "the trim of" in tok_str: base_s = base_s.strip()
            if "the uppercase of" in tok_str: base_s = base_s.upper()
            if "the lowercase of" in tok_str: base_s = base_s.lower()
            if "the reverse of" in tok_str: base_s = base_s[::-1]
            return base_s

        if "number between" in tok_str:
            self.require_lib("Random", "Random numbers", line, col)
            m = re.search(r'between\s+(\d+)\s+and\s+(\d+)', tok_str)
            if m:
                low = int(m.group(1))
                high = int(m.group(2))
                return random.randint(min(low, high), max(low, high))

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
        # Check if pure arithmetic
        safe_eval_str = expr_str.replace("plus", "+").replace("minus", "-").replace("times", "*").replace("divided by", "/")
        if re.match(r'^[\d\s\+\-\*\/\%\.\(\)]+$', safe_eval_str):
            try:
                res = eval(safe_eval_str)
                return int(res) if isinstance(res, float) and res.is_integer() else res
            except Exception:
                pass

        # Natural speech / words fallback
        return " ".join(t.lexeme for t in tokens)


# ==========================================
# CLI Entrypoint
# ==========================================

def main():
    if len(sys.argv) < 2:
        print("E++ [1.1 Workspace Patch 1] Python Direct Engine")
        print("Usage:")
        print("  python3 epp.py <file.enpp|file.enppl>")
        print("  python3 epp.py -e '<code string>'")
        sys.exit(0)

    arg = sys.argv[1]

    # Inline execution
    if arg == "-e" and len(sys.argv) > 2:
        code = sys.argv[2]
        interp = Interpreter("<cli>")
        try:
            interp.run_source(code)
        except EppDiagnosticError as err:
            print(err)
            sys.exit(1)
        return

    # Encryption tool
    if arg == "--encrypt" and len(sys.argv) > 2:
        src_path = sys.argv[2]
        with open(src_path, "r", encoding="utf-8") as f:
            content = f.read()
        encrypted = encrypt_epp(content)
        out_path = sys.argv[4] if len(sys.argv) > 4 and sys.argv[3] == "-o" else src_path
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(encrypted)
        print(f"Encrypted {src_path} -> {out_path} with Release 1.1 millisecond frame key.")
        return

    # Decryption tool
    if arg == "--decrypt" and len(sys.argv) > 2:
        src_path = sys.argv[2]
        with open(src_path, "r", encoding="utf-8") as f:
            content = f.read()
        dec = decrypt_epp(content, src_path)
        print(dec)
        return

    # Run file
    filename = arg
    if not os.path.exists(filename):
        print(f"[E++ Error E404: File Not Found] File '{filename}' does not exist.")
        sys.exit(1)

    with open(filename, "r", encoding="utf-8") as f:
        content = f.read()

    interp = Interpreter(filename)
    try:
        interp.run_source(content)
    except EppDiagnosticError as err:
        print(err)
        sys.exit(1)

if __name__ == "__main__":
    main()
