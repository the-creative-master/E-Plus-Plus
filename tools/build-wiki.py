#!/usr/bin/env python3
"""Build the offline Studio wiki from WIKI.md with only the Python stdlib.

The wiki intentionally uses a small Markdown subset: headings, paragraphs,
links, bold, inline/fenced code, and flat ordered or unordered lists.
"""
import html
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
lines = (root / 'WIKI.md').read_text(encoding='utf-8').splitlines()


def inline(text):
    codes = []
    def protect(match):
        codes.append('<code>' + html.escape(match.group(1)) + '</code>')
        return '\x00' + str(len(codes) - 1) + '\x00'
    text = re.sub(r'`([^`]+)`', protect, text)
    text = html.escape(text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'\x00(\d+)\x00', lambda m: codes[int(m.group(1))], text)


def slug(text):
    text = re.sub(r'[^a-z0-9\s-]', '', text.lower())
    return re.sub(r'\s+', '-', text.strip())


def special(line):
    return bool(re.match(r'^(?:#{1,6}\s|```|[-*]\s|\d+\.\s)', line))

out = []
i = 0
while i < len(lines):
    line = lines[i]
    if not line.strip():
        i += 1
        continue
    if line.startswith('```'):
        i += 1
        code = []
        while i < len(lines) and not lines[i].startswith('```'):
            code.append(lines[i])
            i += 1
        if i == len(lines):
            raise SystemExit('Unclosed code fence in WIKI.md')
        out.append('<pre><code>' + html.escape('\n'.join(code)) + '</code></pre>')
        i += 1
        continue
    heading = re.match(r'^(#{1,6})\s+(.+)$', line)
    if heading:
        level, title = len(heading.group(1)), heading.group(2)
        out.append(f'<h{level} id="{slug(title)}">{inline(title)}</h{level}>')
        i += 1
        continue
    item = re.match(r'^([-*]|\d+\.)\s+(.+)$', line)
    if item:
        ordered = item.group(1)[0].isdigit()
        tag = 'ol' if ordered else 'ul'
        items = []
        while i < len(lines):
            item = re.match(r'^([-*]|\d+\.)\s+(.+)$', lines[i])
            if not item or item.group(1)[0].isdigit() != ordered:
                break
            items.append('<li>' + inline(item.group(2)) + '</li>')
            i += 1
        out.append('<' + tag + '>' + '\n'.join(items) + '</' + tag + '>')
        continue
    paragraph = [line.strip()]
    i += 1
    while i < len(lines) and lines[i].strip() and not special(lines[i]):
        paragraph.append(lines[i].strip())
        i += 1
    out.append('<p>' + inline(' '.join(paragraph)) + '</p>')

page = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>E++ 1.3.5 Wiki</title>
<link rel="stylesheet" href="css/wiki.css">
</head>
<body>
<a class="skip" href="#wiki-content">Skip to guide</a>
<header class="wiki-header"><a href="index.html" class="back">← Back to Studio</a><span>THE E++ GUIDE <strong>1.3.5</strong></span></header>
<main id="wiki-content" class="wiki-content">
''' + '\n'.join(out) + '''
<footer><a href="index.html">← Return to the Studio</a> · <a href="LANGUAGE.md">Language reference</a></footer>
</main>
</body>
</html>
'''
(root / 'wiki.html').write_text(page, encoding='utf-8')
print('Built wiki.html from WIKI.md')
