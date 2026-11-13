#!/usr/bin/env node
// 1.5a1 — build epp.exe for Windows with Zig's cross compiler.
//
// E++ is plain C++17 with no platform-specific code, so one command produces
// a static 64-bit console program that runs in Windows PowerShell, Command
// Prompt and Windows Terminal. Nothing needs to be installed on the Windows
// side.
//
// Usage:  ZIG=/path/to/zig node tools/build-windows.mjs
//         make windows
//
// The ziglang pip package is enough:
//   pip install ziglang
//   ZIG=$(python3 -c "import ziglang,os;print(os.path.join(os.path.dirname(ziglang.__file__),'zig'))") \
//     node tools/build-windows.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const zig = process.env.ZIG || 'zig';
const sources = ['src/lexer.cpp', 'src/parser.cpp', 'src/interpreter.cpp', 'src/vault.cpp', 'src/main.cpp'];

try {
  execFileSync(zig, [
    'c++', '-std=c++17', '-O2', '-Iinclude', '--target=x86_64-windows-gnu',
    ...sources, '-o', 'epp.exe', '-static'
  ], { cwd: root, stdio: 'inherit' });
} catch (error) {
  console.error('\nCould not build epp.exe with ' + zig + '.');
  console.error('Install Zig (https://ziglang.org/download/ or `pip install ziglang`) and run:');
  console.error('  ZIG=/path/to/zig node tools/build-windows.mjs');
  process.exit(1);
}

const output = path.join(root, 'epp.exe');
const bytes = statSync(output).size;
if (!existsSync(output) || bytes < 100000) {
  console.error('epp.exe was not written, or is far too small to be the engine.');
  process.exit(1);
}
console.log('\nBuilt epp.exe — ' + Math.round(bytes / 1024) + ' KB, 64-bit Windows console program.');
console.log('On Windows, open PowerShell where epp.exe lives and run:');
console.log('  .\\epp.exe -e "say \\"Hello from Windows\\""');
console.log('  .\\epp.exe examples\\01_hello.enpp');
