// run.mjs — run the tests from the terminal:  node tests/run.mjs
// Runs the shared tests in tests.js, then checks the project rules from CLAUDE.md
// by reading the source files.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAll, PALETTE } from './tests.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// List every file under a folder (skipping .git and node_modules).
function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

const files = listFiles(root).map((f) => relative(root, f).split('\\').join('/'));
const webFiles = files.filter((f) => /\.(js|mjs|html|css)$/.test(f));
const read = (f) => readFileSync(join(root, f), 'utf8');

// Each rule check returns a list of problems (empty = pass).
const ruleChecks = [
  ['rule: no Math.random() (use js/engine/rng.js)', () =>
    webFiles.filter((f) => f.startsWith('js/') && /Math\.random\s*\(/.test(read(f)))],

  ['rule: no paths starting with / in src or href', () =>
    webFiles.filter((f) => /(src|href)\s*=\s*["']\/(?!\/)/.test(read(f)))],

  ['rule: imports use relative paths', () =>
    webFiles.filter((f) => /from\s+["']\/(?!\/)/.test(read(f)))],

  ['rule: game files are lowercase-with-hyphens', () =>
    files.filter((f) => /^(js|css|data|tests)\//.test(f) || f === 'index.html')
      .filter((f) => !/^[a-z0-9\-./]+$/.test(f))],

  ['rule: js/engine/ never touches the page', () =>
    webFiles.filter((f) => f.startsWith('js/engine/') && /\b(document|window)\b/.test(read(f)))],

  ['rule: every data/*.json file is valid JSON', () =>
    files.filter((f) => f.startsWith('data/') && f.endsWith('.json')).filter((f) => {
      try { JSON.parse(read(f)); return false; } catch (err) { return true; }
    })],

  ['rule: js/engine/ never hard-codes place names', () =>
    webFiles.filter((f) => f.startsWith('js/engine/') && /Verdun|Paris|France/.test(read(f)))],

  ['rule: css/style.css only uses docs/STYLE.md palette colours', () => {
    const hexes = read('css/style.css').match(/#[0-9a-fA-F]{6}\b/g) || [];
    return [...new Set(hexes.filter((h) => !PALETTE.includes(h.toUpperCase())))];
  }],

  ['rule: every js file has the version stamp from js/version.js (no stale copies on phones)', () => {
    const version = (read('js/version.js').match(/VERSION = '([^']+)'/) || [])[1];
    const html = read('index.html');
    const problems = [];
    for (const f of files.filter((x) => x.startsWith('js/') && x.endsWith('.js') && x !== 'js/main.js')) {
      if (!html.includes(`"./${f}": "./${f}?v=${version}"`)) problems.push(`${f} is missing from the import map in index.html (or has an old version)`);
    }
    for (const f of ['css/style.css', 'js/main.js']) if (!html.includes(`./${f}?v=${version}`)) problems.push(`${f} in index.html needs ?v=${version}`);
    return problems;
  }],

  ['rule: index.html has the phone viewport tag', () => {
    const html = read('index.html');
    return html.includes('width=device-width, initial-scale=1, viewport-fit=cover') ? [] : ['index.html'];
  }],
];

// Node reads the data files straight from disk.
const results = await runAll(async (f) => JSON.parse(read(f)), async (f) => read(f));
for (const [name, fn] of ruleChecks) {
  const problems = fn();
  results.push(problems.length === 0
    ? { name, ok: true }
    : { name, ok: false, error: 'in ' + problems.join(', ') });
}

let failed = 0;
for (const r of results) {
  if (r.ok) console.log('  PASS  ' + r.name);
  else { failed++; console.log('  FAIL  ' + r.name + ' — ' + r.error); }
}
console.log(failed === 0
  ? `\nAll ${results.length} tests pass.`
  : `\n${failed} of ${results.length} tests FAILED.`);
process.exit(failed === 0 ? 0 : 1);
