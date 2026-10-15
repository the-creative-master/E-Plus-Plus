/*
 * E++ Standalone HTML Generator for E++.zip.
 * Produces a self-contained index.html with the complete E++ language core:
 * Lexer, Parser, AST, Interpreter, Error system, and Syntax Highlighter.
 *
 * Rules:
 * - Libraries are NOT supported in E++.zip (pure .eppl only).
 * - "save project as name.eppl" manually typed in the command prompt saves the file.
 */
(function (global) {
  'use strict';

  var EPP = global.EPP || (global.EPP = {});

  function generateStandaloneHtml(initialCode) {
    initialCode = initialCode || (
      'note: Welcome to E++ Standalone Runtime (Dev Build 5)!\n' +
      'note: Type "save project as name.eppl" in the command bar to save.\n' +
      'note: Libraries are not supported in E++.zip — pure .eppl code only.\n\n' +
      'Define greeting as Hello from E++!\n' +
      'say \'greeting\'\n' +
      'say "Maths in plain English: " plus (5 times 4 plus 2)\n\n' +
      'ask "What is your name?" and save answer as user\n' +
      'say "Welcome to E++, " plus \'user\' plus "!"\n'
    );

    var html = '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<title>E++ Standalone Runtime — Dev Build 5</title>\n' +
'<style>\n' +
'  :root {\n' +
'    --bg: #0b1120;\n' +
'    --panel: #111a2e;\n' +
'    --panel-2: #0f172a;\n' +
'    --border: #22304f;\n' +
'    --text: #e2e8f0;\n' +
'    --muted: #8ea0bd;\n' +
'    --accent: #34d399;\n' +
'    --accent-2: #a78bfa;\n' +
'    --danger: #f87171;\n' +
'    --warning: #fbbf24;\n' +
'    --mono: "JetBrains Mono", Consolas, ui-monospace, monospace;\n' +
'    --sans: system-ui, -apple-system, sans-serif;\n' +
'  }\n' +
'  * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
'  body {\n' +
'    background: var(--bg);\n' +
'    color: var(--text);\n' +
'    font-family: var(--sans);\n' +
'    display: flex;\n' +
'    flex-direction: column;\n' +
'    height: 100vh;\n' +
'    overflow: hidden;\n' +
'  }\n' +
'  header {\n' +
'    display: flex; align-items: center; justify-content: space-between; gap: 12px;\n' +
'    padding: 10px 16px; border-bottom: 1px solid var(--border);\n' +
'    background: #0d1527;\n' +
'  }\n' +
'  .brand { display: flex; align-items: center; gap: 10px; }\n' +
'  .logo { font-family: var(--mono); font-weight: 800; font-size: 20px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #06131f; border-radius: 8px; padding: 6px 9px; }\n' +
'  .badge { font-size: 10px; font-weight: 700; color: var(--accent); background: rgba(52, 211, 153, 0.15); border: 1px solid rgba(52, 211, 153, 0.4); border-radius: 999px; padding: 2px 7px; }\n' +
'  .badge-warn { color: var(--warning); background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.4); }\n' +
'  .actions { display: flex; align-items: center; gap: 8px; }\n' +
'  .btn {\n' +
'    font-family: var(--sans); font-size: 13px; font-weight: 600;\n' +
'    padding: 7px 14px; border-radius: 8px; cursor: pointer; border: 1px solid var(--border);\n' +
'    background: var(--panel); color: var(--text);\n' +
'    transition: all .15s ease;\n' +
'  }\n' +
'  .btn:hover { background: #1a2744; border-color: #3b82f6; }\n' +
'  .btn-run { background: #059669; color: #fff; border-color: #10b981; }\n' +
'  .btn-run:hover { background: #10b981; }\n' +
'  .btn-stop { background: #dc2626; color: #fff; border-color: #ef4444; }\n' +
'  .main-layout { display: flex; flex: 1; overflow: hidden; }\n' +
'  .editor-section, .console-section { flex: 1; display: flex; flex-direction: column; overflow: hidden; }\n' +
'  .editor-section { border-right: 1px solid var(--border); }\n' +
'  .section-head {\n' +
'    display: flex; align-items: center; justify-content: space-between;\n' +
'    padding: 8px 12px; background: var(--panel-2); border-bottom: 1px solid var(--border);\n' +
'    font-size: 12px; color: var(--muted); font-weight: 600;\n' +
'  }\n' +
'  .editor-wrap { position: relative; flex: 1; display: flex; overflow: hidden; background: #080d19; }\n' +
'  .line-numbers { width: 44px; padding: 12px 6px; font-family: var(--mono); font-size: 13px; color: #475569; text-align: right; user-select: none; border-right: 1px solid var(--border); background: #070b14; line-height: 1.5; }\n' +
'  .editor-code { position: relative; flex: 1; height: 100%; overflow: hidden; }\n' +
'  textarea#editor {\n' +
'    position: absolute; top: 0; left: 0; width: 100%; height: 100%;\n' +
'    padding: 12px; background: transparent; color: var(--text);\n' +
'    font-family: var(--mono); font-size: 14px; line-height: 1.5;\n' +
'    border: none; outline: none; resize: none; tab-size: 2;\n' +
'  }\n' +
'  .console-out {\n' +
'    flex: 1; padding: 12px; font-family: var(--mono); font-size: 13px;\n' +
'    overflow-y: auto; background: #050811; color: #cbd5e1; line-height: 1.5;\n' +
'  }\n' +
'  .console-line { margin-bottom: 4px; word-break: break-word; }\n' +
'  .console-line.error { color: #f87171; }\n' +
'  .console-line.system { color: #38bdf8; }\n' +
'  .console-line.prompt { color: #fbbf24; }\n' +
'  .cmd-bar {\n' +
'    display: flex; align-items: center; gap: 8px; padding: 8px 12px;\n' +
'    background: #090e1a; border-top: 1px solid var(--border);\n' +
'  }\n' +
'  .cmd-bar input {\n' +
'    flex: 1; padding: 7px 12px; font-family: var(--mono); font-size: 13px;\n' +
'    background: var(--panel); border: 1px solid var(--border); border-radius: 6px;\n' +
'    color: var(--text); outline: none;\n' +
'  }\n' +
'  .cmd-bar input:focus { border-color: var(--accent); }\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<header>\n' +
'  <div class="brand">\n' +
'    <div class="logo">E++</div>\n' +
'    <div>\n' +
'      <strong>E++ Standalone Runtime</strong>\n' +
'      <span class="badge">Dev Build 5</span>\n' +
'      <span class="badge badge-warn">Pure .eppl (No Libraries)</span>\n' +
'    </div>\n' +
'  </div>\n' +
'  <div class="actions">\n' +
'    <button id="btnRun" class="btn btn-run">▶ Run</button>\n' +
'    <button id="btnStop" class="btn btn-stop" disabled>■ Stop</button>\n' +
'  </div>\n' +
'</header>\n' +
'<main class="main-layout">\n' +
'  <section class="editor-section">\n' +
'    <div class="section-head">\n' +
'      <span>Code Editor (.eppl)</span>\n' +
'      <span id="lineCount">0 lines</span>\n' +
'    </div>\n' +
'    <div class="editor-wrap">\n' +
'      <div class="line-numbers" id="lineNums">1</div>\n' +
'      <div class="editor-code">\n' +
'        <textarea id="editor" spellcheck="false">' + initialCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>\n' +
'      </div>\n' +
'    </div>\n' +
'  </section>\n' +
'  <section class="console-section">\n' +
'    <div class="section-head">\n' +
'      <span>Console Output</span>\n' +
'      <button id="btnClear" class="btn" style="padding: 3px 8px; font-size: 11px;">Clear</button>\n' +
'    </div>\n' +
'    <div class="console-out" id="consoleOut">\n' +
'      <div class="console-line system">E++ Standalone Runtime (Dev Build 5) Ready.</div>\n' +
'      <div class="console-line system">Note: Libraries are not supported in E++.zip. Use pure .eppl code.</div>\n' +
'      <div class="console-line prompt">Type "save project as name.eppl" below to save your code.</div>\n' +
'    </div>\n' +
'    <form id="cmdForm" class="cmd-bar">\n' +
'      <input id="cmdInput" type="text" placeholder="Type command: save project as name.eppl" autocomplete="off">\n' +
'      <button type="submit" class="btn">Execute</button>\n' +
'    </form>\n' +
'  </section>\n' +
'</main>\n' +
'<script>\n' +
'// Embedded E++ Language Core (Synced to Lexer, Parser & Interpreter)\n' +
'window.EPP = {};\n' +
'(function(EPP) {\n' +
'  function EppError(cat, msg, l, c, h) {\n' +
'    this.category = cat || "Error"; this.message = msg || ""; this.line = l; this.column = c; this.hint = h;\n' +
'  }\n' +
'  EppError.prototype.format = function() {\n' +
'    var w = this.line ? " (line " + this.line + (this.column ? ", column " + this.column : "") + ")" : "";\n' +
'    return this.category + w + ": " + this.message + (this.hint ? "\\nHint: " + this.hint : "");\n' +
'  };\n' +
'  function sub(name) {\n' +
'    function S(m, l, c, h) { EppError.call(this, name, m, l, c, h); }\n' +
'    S.prototype = Object.create(EppError.prototype);\n' +
'    return S;\n' +
'  }\n' +
'  EPP.LexError = sub("LexError");\n' +
'  EPP.ParseError = sub("ParseError");\n' +
'  EPP.RuntimeError = sub("RuntimeError");\n' +
'  EPP.LibraryError = sub("LibraryError");\n' +
'})(window.EPP);\n' +
'</script>\n' +
'<script src="https://cdn.jsdelivr.net/npm/eplusplus-core@1.0.0/dist/core.js" onerror="/* fallback to inline */"></script>\n' +
'<script>\n' +
'// Synchronized E++ Lexer & Parser\n' +
'(function(global) {\n' +
'  var EPP = global.EPP;\n' +
'  var TT = { STRING: "STRING", VARIABLE: "VARIABLE", NUMBER: "NUMBER", WORD: "WORD", PERIOD: "PERIOD", NEWLINE: "NEWLINE", LPAREN: "LPAREN", RPAREN: "RPAREN", EOF: "EOF" };\n' +
'  function Lexer(src) { this.src = String(src || ""); this.i = 0; this.l = 1; this.c = 1; this.tokens = []; }\n' +
'  Lexer.prototype.tokenize = function() {\n' +
'    var s = this.src;\n' +
'    while (this.i < s.length) {\n' +
'      var ch = s[this.i];\n' +
'      if (ch === "\\n") { this.tokens.push({ type: TT.NEWLINE, value: "\\n", line: this.l, column: this.c }); this.l++; this.c = 1; this.i++; continue; }\n' +
'      if (ch === " " || ch === "\\t" || ch === "\\r") { this.c++; this.i++; continue; }\n' +
'      if (ch === "#" || (ch === "/" && s[this.i+1] === "/")) { while(this.i < s.length && s[this.i] !== "\\n") this.i++; continue; }\n' +
'      if (ch === "\\\"") {\n' +
'        var sl = this.l, sc = this.c; this.i++; this.c++; var val = "";\n' +
'        while (this.i < s.length && s[this.i] !== "\\\"" && s[this.i] !== "\\n") { val += s[this.i]; this.i++; this.c++; }\n' +
'        if (this.i < s.length && s[this.i] === "\\\"") { this.i++; this.c++; }\n' +
'        else throw new EPP.LexError("String never ends. Missing closing \\\"", sl, sc, "Close the string with \\\"");\n' +
'        this.tokens.push({ type: TT.STRING, value: val, line: sl, column: sc }); continue;\n' +
'      }\n' +
'      if (ch === "\'") {\n' +
'        var vl = this.l, vc = this.c; this.i++; this.c++; var vname = "";\n' +
'        while (this.i < s.length && s[this.i] !== "\'" && s[this.i] !== "\\n") { vname += s[this.i]; this.i++; this.c++; }\n' +
'        if (this.i < s.length && s[this.i] === "\'") { this.i++; this.c++; }\n' +
'        else throw new EPP.LexError("Variable reference never ends. Missing closing \'", vl, vc, "Close with \'");\n' +
'        this.tokens.push({ type: TT.VARIABLE, value: vname.trim(), line: vl, column: vc }); continue;\n' +
'      }\n' +
'      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(s[this.i+1]||""))) {\n' +
'        var n = /^[0-9]*\\.?[0-9]+/.exec(s.slice(this.i))[0];\n' +
'        this.tokens.push({ type: TT.NUMBER, value: parseFloat(n), line: this.l, column: this.c });\n' +
'        this.i += n.length; this.c += n.length; continue;\n' +
'      }\n' +
'      if (ch === ".") { this.tokens.push({ type: TT.PERIOD, value: ".", line: this.l, column: this.c }); this.i++; this.c++; continue; }\n' +
'      if (ch === "(") { this.tokens.push({ type: TT.LPAREN, value: "(", line: this.l, column: this.c }); this.i++; this.c++; continue; }\n' +
'      if (ch === ")") { this.tokens.push({ type: TT.RPAREN, value: ")", line: this.l, column: this.c }); this.i++; this.c++; continue; }\n' +
'      if (/[A-Za-z_]/.test(ch)) {\n' +
'        var w = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(s.slice(this.i))[0];\n' +
'        if (w.toLowerCase() === "note") { while(this.i < s.length && s[this.i] !== "\\n") this.i++; continue; }\n' +
'        this.tokens.push({ type: TT.WORD, value: w, line: this.l, column: this.c });\n' +
'        this.i += w.length; this.c += w.length; continue;\n' +
'      }\n' +
'      throw new EPP.LexError("Unexpected character " + JSON.stringify(ch) + ".", this.l, this.c, "E++ uses plain English words.");\n' +
'    }\n' +
'    this.tokens.push({ type: TT.EOF, value: "", line: this.l, column: this.c });\n' +
'    return this.tokens;\n' +
'  };\n' +
'  EPP.Lexer = Lexer;\n' +
'  EPP.TokenType = TT;\n' +
'})(window);\n' +
'</script>\n' +
'<script>\n' +
'// Standalone Parser & Interpreter with Disabled Libraries Constraint\n' +
'(function(global) {\n' +
'  var EPP = global.EPP;\n' +
'  function Parser(src) {\n' +
'    this.tokens = new EPP.Lexer(src).tokenize();\n' +
'    this.pos = 0;\n' +
'  }\n' +
'  Parser.prototype.cur = function() { return this.tokens[this.pos] || { type: "EOF" }; };\n' +
'  Parser.prototype.adv = function() { return this.tokens[this.pos++]; };\n' +
'  Parser.prototype.isW = function(w) { var t = this.cur(); return t && t.type === "WORD" && t.value.toLowerCase() === w.toLowerCase(); };\n' +
'  Parser.prototype.matchW = function(w) { if (this.isW(w)) { this.adv(); return true; } return false; };\n' +
'  Parser.prototype.skipSep = function() { while(this.cur().type === "NEWLINE" || this.cur().type === "PERIOD") this.adv(); };\n' +
'  Parser.prototype.parse = function() {\n' +
'    var stmts = [];\n' +
'    this.skipSep();\n' +
'    while(this.cur().type !== "EOF") {\n' +
'      stmts.push(this.parseStmt());\n' +
'      this.skipSep();\n' +
'    }\n' +
'    return { type: "Program", body: stmts };\n' +
'  };\n' +
'  Parser.prototype.parseStmt = function() {\n' +
'    var t = this.cur();\n' +
'    if (this.isW("library") || this.isW("add")) {\n' +
'      // In E++.zip libraries are NOT supported\n' +
'      throw new EPP.LibraryError(\n' +
'        "Libraries are not supported in the standalone E++.zip runtime! E++.zip is strictly for pure .eppl code without libraries. To use libraries, run your code in the full E++ IDE with .eppla files.",\n' +
'        t.line, t.column, "Remove library statements or run in the full E++ IDE."\n' +
'      );\n' +
'    }\n' +
'    if (this.isW("define")) {\n' +
'      var kw = this.adv();\n' +
'      var name = this.adv().value;\n' +
'      this.matchW("as");\n' +
'      var val = this.parseExpr();\n' +
'      return { type: "Define", name: name, value: val, line: kw.line, column: kw.column };\n' +
'    }\n' +
'    if (this.isW("say") || this.isW("display") || this.isW("show")) {\n' +
'      var skw = this.adv();\n' +
'      return { type: "Say", value: this.parseExpr(), line: skw.line, column: skw.column };\n' +
'    }\n' +
'    if (this.isW("set") || this.isW("change")) {\n' +
'      var ckw = this.adv(); var n = this.adv().value; this.matchW("to");\n' +
'      return { type: "Set", name: n, value: this.parseExpr(), line: ckw.line, column: ckw.column };\n' +
'    }\n' +
'    if (this.isW("increase") || this.isW("decrease")) {\n' +
'      var ikw = this.adv(); var isInc = ikw.value.toLowerCase() === "increase";\n' +
'      var iname = this.cur().type === "VARIABLE" ? this.adv().value : this.adv().value;\n' +
'      this.matchW("by");\n' +
'      return { type: isInc ? "Increase" : "Decrease", name: iname, amount: this.parseExpr(), line: ikw.line, column: ikw.column };\n' +
'    }\n' +
'    if (this.isW("ask")) {\n' +
'      var akw = this.adv(); var pr = this.parseExpr();\n' +
'      this.matchW("and"); this.matchW("save"); this.matchW("answer"); this.matchW("as");\n' +
'      var v = this.adv().value;\n' +
'      return { type: "Ask", prompt: pr, name: v, line: akw.line, column: akw.column };\n' +
'    }\n' +
'    if (this.isW("wait")) {\n' +
'      var wkw = this.adv(); var dur = this.parseExpr();\n' +
'      this.matchW("seconds"); this.matchW("second");\n' +
'      return { type: "Wait", duration: dur, line: wkw.line, column: wkw.column };\n' +
'    }\n' +
'    if (this.isW("repeat")) {\n' +
'      var rkw = this.adv(); var count = this.parseExpr(); this.matchW("times");\n' +
'      var body = []; this.skipSep();\n' +
'      while (!this.isW("end") && this.cur().type !== "EOF") { body.push(this.parseStmt()); this.skipSep(); }\n' +
'      this.matchW("end"); this.matchW("repeat");\n' +
'      return { type: "Repeat", count: count, body: body, line: rkw.line, column: rkw.column };\n' +
'    }\n' +
'    if (this.isW("if")) {\n' +
'      var ifkw = this.adv(); var cond = this.parseCond(); this.matchW("then");\n' +
'      var thenB = []; var elseB = []; this.skipSep();\n' +
'      while (!this.isW("otherwise") && !this.isW("end") && this.cur().type !== "EOF") {\n' +
'        thenB.push(this.parseStmt()); this.skipSep();\n' +
'      }\n' +
'      if (this.matchW("otherwise")) {\n' +
'        this.skipSep();\n' +
'        while (!this.isW("end") && this.cur().type !== "EOF") { elseB.push(this.parseStmt()); this.skipSep(); }\n' +
'      }\n' +
'      this.matchW("end"); this.matchW("if");\n' +
'      return { type: "If", condition: cond, thenBranch: thenB, elseBranch: elseB, line: ifkw.line, column: ifkw.column };\n' +
'    }\n' +
'    throw new EPP.ParseError("I do not understand the statement starting with " + JSON.stringify(t.value) + ".", t.line, t.column, "Statements start with Define, say, ask, if, Increase, Decrease, repeat, wait.");\n' +
'  };\n' +
'  Parser.prototype.parseCond = function() {\n' +
'    var left = this.parseExpr();\n' +
'    if (this.matchW("is")) {\n' +
'      var not = this.matchW("not");\n' +
'      if (this.matchW("equal")) {\n' +
'        this.matchW("to");\n' +
'        return { op: not ? "notEqual" : "equal", left: left, right: this.parseExpr() };\n' +
'      }\n' +
'      if (this.matchW("greater")) {\n' +
'        this.matchW("than");\n' +
'        return { op: "greater", left: left, right: this.parseExpr() };\n' +
'      }\n' +
'      if (this.matchW("less") || this.matchW("lesser")) {\n' +
'        this.matchW("than");\n' +
'        return { op: "less", left: left, right: this.parseExpr() };\n' +
'      }\n' +
'    }\n' +
'    return { op: "truthy", left: left };\n' +
'  };\n' +
'  Parser.prototype.parseExpr = function() {\n' +
'    var l = this.parseTerm();\n' +
'    while (this.isW("plus") || this.isW("minus")) {\n' +
'      var op = this.adv().value.toLowerCase();\n' +
'      var r = this.parseTerm();\n' +
'      l = { type: "Binary", op: op, left: l, right: r };\n' +
'    }\n' +
'    return l;\n' +
'  };\n' +
'  Parser.prototype.parseTerm = function() {\n' +
'    var l = this.parseFactor();\n' +
'    while (this.isW("times")) {\n' +
'      this.adv();\n' +
'      var r = this.parseFactor();\n' +
'      l = { type: "Binary", op: "times", left: l, right: r };\n' +
'    }\n' +
'    return l;\n' +
'  };\n' +
'  Parser.prototype.parseFactor = function() {\n' +
'    var t = this.cur();\n' +
'    if (t.type === "NUMBER") { this.adv(); return { type: "Literal", value: t.value }; }\n' +
'    if (t.type === "STRING") { this.adv(); return { type: "Literal", value: t.value }; }\n' +
'    if (t.type === "VARIABLE") { this.adv(); return { type: "Variable", name: t.value }; }\n' +
'    if (t.type === "LPAREN") { this.adv(); var e = this.parseExpr(); this.adv(); return e; }\n' +
'    if (t.type === "WORD") {\n' +
'      this.adv();\n' +
'      return { type: "BareWord", value: t.value };\n' +
'    }\n' +
'    throw new EPP.ParseError("Expected a value but found " + JSON.stringify(t.value), t.line, t.column, "Values can be numbers, \\\"strings\\\", or \'variables\'.");\n' +
'  };\n' +
'  EPP.StandaloneParser = Parser;\n' +
'})(window);\n' +
'</script>\n' +
'<script>\n' +
'// Standalone Interpreter\n' +
'(function(global) {\n' +
'  var EPP = global.EPP;\n' +
'  function Interpreter(opts) {\n' +
'    this.output = opts.output || console.log;\n' +
'    this.input = opts.input || (async function() { return ""; });\n' +
'    this.vars = new Map();\n' +
'    this.cancelled = false;\n' +
'  }\n' +
'  Interpreter.prototype.eval = async function(node) {\n' +
'    if (!node) return null;\n' +
'    if (node.type === "Literal") return node.value;\n' +
'    if (node.type === "Variable") {\n' +
'      var k = node.name.toLowerCase();\n' +
'      if (!this.vars.has(k)) throw new EPP.RuntimeError("Variable \'" + node.name + "\' has not been defined yet.");\n' +
'      return this.vars.get(k);\n' +
'    }\n' +
'    if (node.type === "BareWord") return node.value;\n' +
'    if (node.type === "Binary") {\n' +
'      var l = await this.eval(node.left);\n' +
'      var r = await this.eval(node.right);\n' +
'      if (node.op === "plus") {\n' +
'        if (typeof l === "number" && typeof r === "number") return l + r;\n' +
'        return String(l) + String(r);\n' +
'      }\n' +
'      if (node.op === "minus") return Number(l) - Number(r);\n' +
'      if (node.op === "times") return Number(l) * Number(r);\n' +
'    }\n' +
'    return null;\n' +
'  };\n' +
'  Interpreter.prototype.exec = async function(stmt) {\n' +
'    if (this.cancelled) return;\n' +
'    if (stmt.type === "Define" || stmt.type === "Set") {\n' +
'      var val = await this.eval(stmt.value);\n' +
'      this.vars.set(stmt.name.toLowerCase(), val);\n' +
'      return;\n' +
'    }\n' +
'    if (stmt.type === "Say") {\n' +
'      var out = await this.eval(stmt.value);\n' +
'      this.output(String(out));\n' +
'      return;\n' +
'    }\n' +
'    if (stmt.type === "Increase" || stmt.type === "Decrease") {\n' +
'      var cur = this.vars.get(stmt.name.toLowerCase()) || 0;\n' +
'      var amt = await this.eval(stmt.amount);\n' +
'      var res = stmt.type === "Increase" ? Number(cur) + Number(amt) : Number(cur) - Number(amt);\n' +
'      this.vars.set(stmt.name.toLowerCase(), res);\n' +
'      return;\n' +
'    }\n' +
'    if (stmt.type === "Ask") {\n' +
'      var pr = await this.eval(stmt.prompt);\n' +
'      var ans = await this.input(String(pr));\n' +
'      this.vars.set(stmt.name.toLowerCase(), ans);\n' +
'      return;\n' +
'    }\n' +
'    if (stmt.type === "Wait") {\n' +
'      var sec = Number(await this.eval(stmt.duration));\n' +
'      await new Promise(function(res) { setTimeout(res, sec * 1000); });\n' +
'      return;\n' +
'    }\n' +
'    if (stmt.type === "Repeat") {\n' +
'      var cnt = Number(await this.eval(stmt.count));\n' +
'      for (var i = 0; i < cnt; i++) {\n' +
'        for (var b = 0; b < stmt.body.length; b++) await this.exec(stmt.body[b]);\n' +
'      }\n' +
'      return;\n' +
'    }\n' +
'    if (stmt.type === "If") {\n' +
'      var cl = await this.eval(stmt.condition.left);\n' +
'      var cr = stmt.condition.right ? await this.eval(stmt.condition.right) : null;\n' +
'      var pass = false;\n' +
'      if (stmt.condition.op === "equal") pass = (String(cl) === String(cr));\n' +
'      else if (stmt.condition.op === "notEqual") pass = (String(cl) !== String(cr));\n' +
'      else if (stmt.condition.op === "greater") pass = (Number(cl) > Number(cr));\n' +
'      else if (stmt.condition.op === "less") pass = (Number(cl) < Number(cr));\n' +
'      else pass = Boolean(cl);\n' +
'      var branch = pass ? stmt.thenBranch : stmt.elseBranch;\n' +
'      for (var bi = 0; bi < branch.length; bi++) await this.exec(branch[bi]);\n' +
'      return;\n' +
'    }\n' +
'  };\n' +
'  Interpreter.prototype.run = async function(prog) {\n' +
'    this.vars.clear(); this.cancelled = false;\n' +
'    for (var i = 0; i < prog.body.length; i++) await this.exec(prog.body[i]);\n' +
'  };\n' +
'  EPP.StandaloneInterpreter = Interpreter;\n' +
'})(window);\n' +
'</script>\n' +
'<script>\n' +
'// Standalone UI logic + "save project as name.eppl" feature (Requirement 7)\n' +
'(function() {\n' +
'  var editor = document.getElementById("editor");\n' +
'  var lineNums = document.getElementById("lineNums");\n' +
'  var lineCount = document.getElementById("lineCount");\n' +
'  var consoleOut = document.getElementById("consoleOut");\n' +
'  var btnRun = document.getElementById("btnRun");\n' +
'  var btnStop = document.getElementById("btnStop");\n' +
'  var btnClear = document.getElementById("btnClear");\n' +
'  var cmdForm = document.getElementById("cmdForm");\n' +
'  var cmdInput = document.getElementById("cmdInput");\n' +
'  var runningInterp = null;\n' +
'\n' +
'  function log(msg, cls) {\n' +
'    var div = document.createElement("div");\n' +
'    div.className = "console-line " + (cls || "output");\n' +
'    div.textContent = msg;\n' +
'    consoleOut.appendChild(div);\n' +
'    consoleOut.scrollTop = consoleOut.scrollHeight;\n' +
'  }\n' +
'\n' +
'  function updateLines() {\n' +
'    var lines = editor.value.split("\\n").length;\n' +
'    lineCount.textContent = lines + " line" + (lines === 1 ? "" : "s");\n' +
'    var arr = [];\n' +
'    for (var i = 1; i <= lines; i++) arr.push(i);\n' +
'    lineNums.textContent = arr.join("\\n");\n' +
'  }\n' +
'  editor.addEventListener("input", updateLines);\n' +
'  updateLines();\n' +
'\n' +
'  btnClear.addEventListener("click", function() { consoleOut.innerHTML = ""; });\n' +
'\n' +
'  // Feature: save project as name.eppl\n' +
'  cmdForm.addEventListener("submit", function(e) {\n' +
'    e.preventDefault();\n' +
'    var text = cmdInput.value.trim();\n' +
'    cmdInput.value = "";\n' +
'    if (!text) return;\n' +
'    log("> " + text, "prompt");\n' +
'    var match = /^save\\s+project\\s+as\\s+([A-Za-z0-9_.-]+)$/i.exec(text);\n' +
'    if (match) {\n' +
'      var rawName = match[1];\n' +
'      var saveName = rawName.toLowerCase().endsWith(".eppl") ? rawName : rawName + ".eppl";\n' +
'      var blob = new Blob([editor.value], { type: "application/octet-stream" });\n' +
'      var url = URL.createObjectURL(blob);\n' +
'      var a = document.createElement("a");\n' +
'      a.href = url;\n' +
'      a.download = saveName;\n' +
'      document.body.appendChild(a);\n' +
'      a.click();\n' +
'      a.remove();\n' +
'      setTimeout(function() { URL.revokeObjectURL(url); }, 500);\n' +
'      log("✓ Project successfully saved as " + saveName, "system");\n' +
'      return;\n' +
'    }\n' +
'    log("Command not recognized. To save, type: save project as <name>.eppl", "error");\n' +
'  });\n' +
'\n' +
'  btnRun.addEventListener("click", async function() {\n' +
'    if (runningInterp) return;\n' +
'    btnRun.disabled = true; btnStop.disabled = false;\n' +
'    log("—— Running Program ——", "system");\n' +
'    var parser = new window.EPP.StandaloneParser(editor.value);\n' +
'    try {\n' +
'      var prog = parser.parse();\n' +
'      runningInterp = new window.EPP.StandaloneInterpreter({\n' +
'        output: function(t) { log(t); },\n' +
'        input: async function(pr) {\n' +
'          return window.prompt(pr) || "";\n' +
'        }\n' +
'      });\n' +
'      await runningInterp.run(prog);\n' +
'      log("—— Finished ——", "system");\n' +
'    } catch(err) {\n' +
'      log(err.format ? err.format() : String(err.message || err), "error");\n' +
'    } finally {\n' +
'      runningInterp = null;\n' +
'      btnRun.disabled = false; btnStop.disabled = true;\n' +
'    }\n' +
'  });\n' +
'\n' +
'  btnStop.addEventListener("click", function() {\n' +
'    if (runningInterp) {\n' +
'      runningInterp.cancelled = true;\n' +
'      log("Execution stopped.", "system");\n' +
'    }\n' +
'  });\n' +
'})();\n' +
'</script>\n' +
'</body>\n' +
'</html>\n';

    return html;
  }

  function crc32(buf) {
    var table = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      table[i] = c >>> 0;
    }
    var crc = 0 ^ (-1);
    for (var j = 0; j < buf.length; j++) crc = (crc >>> 8) ^ table[(crc ^ buf[j]) & 0xFF];
    return (crc ^ (-1)) >>> 0;
  }

  function buildZip(files) {
    var enc = new TextEncoder();
    var parts = [];
    var cdParts = [];
    var offset = 0;

    for (var fi = 0; fi < files.length; fi++) {
      var nameBuf = enc.encode(files[fi].name);
      var dataBuf = enc.encode(files[fi].content);
      var crc = crc32(dataBuf);
      var size = dataBuf.length;

      var lh = new Uint8Array(30);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBuf.length, true);
      dv.setUint16(28, 0, true);

      parts.push(lh, nameBuf, dataBuf);

      var cdh = new Uint8Array(46);
      var cdv = new DataView(cdh.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, 0, true);
      cdv.setUint16(14, 0, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, size, true);
      cdv.setUint32(24, size, true);
      cdv.setUint16(28, nameBuf.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);

      cdParts.push(cdh, nameBuf);
      offset += lh.length + nameBuf.length + dataBuf.length;
    }

    var cdOffset = offset;
    var cdSize = 0;
    for (var cdi = 0; cdi < cdParts.length; cdi++) cdSize += cdParts[cdi].length;

    var eocd = new Uint8Array(22);
    var edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, cdOffset, true);
    edv.setUint16(20, 0, true);

    var totalLen = offset + cdSize + 22;
    var out = new Uint8Array(totalLen);
    var p = 0;
    for (var pi = 0; pi < parts.length; pi++) {
      out.set(parts[pi], p);
      p += parts[pi].length;
    }
    for (var pj = 0; pj < cdParts.length; pj++) {
      out.set(cdParts[pj], p);
      p += cdParts[pj].length;
    }
    out.set(eocd, p);

    return out;
  }

  function downloadEppZip(currentCode) {
    if (typeof document === 'undefined') {
      throw new Error('ZIP downloading is only available in a browser.');
    }
    var htmlContent = generateStandaloneHtml(currentCode);
    var zipData = buildZip([{ name: 'index.html', content: htmlContent }]);

    // Try Blob URL first with application/octet-stream (standard for zip binary downloads)
    if (typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        var blob = new Blob([zipData], { type: 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'E++.zip';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        }, 60000);
        return;
      } catch (blobErr) {
        // Fall through to Base64 Data URI fallback
      }
    }

    // Base64 Data URI fallback for environments where Blob URLs are blocked
    try {
      var binary = '';
      var chunkSize = 8192;
      for (var i = 0; i < zipData.length; i += chunkSize) {
        var slice = zipData.subarray(i, Math.min(i + chunkSize, zipData.length));
        binary += String.fromCharCode.apply(null, slice);
      }
      var base64 = (typeof btoa !== 'undefined') ? btoa(binary) : Buffer.from(zipData).toString('base64');
      var fallbackA = document.createElement('a');
      fallbackA.href = 'data:application/zip;base64,' + base64;
      fallbackA.download = 'E++.zip';
      fallbackA.style.display = 'none';
      document.body.appendChild(fallbackA);
      fallbackA.click();
      setTimeout(function () {
        if (fallbackA.parentNode) fallbackA.parentNode.removeChild(fallbackA);
      }, 10000);
    } catch (fallbackErr) {
      throw new Error('Browser prevented ZIP download: ' + fallbackErr.message);
    }
  }

  EPP.generateStandaloneHtml = generateStandaloneHtml;
  EPP.buildZip = buildZip;
  EPP.downloadEppZip = downloadEppZip;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      generateStandaloneHtml: generateStandaloneHtml,
      buildZip: buildZip,
      downloadEppZip: downloadEppZip
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
