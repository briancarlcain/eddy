// index.html is generated and is what GitHub Pages serves. If someone changes src/ or data/ and forgets to rebuild,
// the change never reaches the live app. This rebuilds into a temp file and fails if the committed index.html differs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'eddy-build-'));
const out = join(dir, 'index.html');
try {
  execFileSync(process.execPath, ['build.mjs'], { env: { ...process.env, BUILD_OUT: out }, stdio: 'pipe' });
  assert.ok(readFileSync(out).equals(readFileSync('index.html')), 'index.html is out of date with src/ and data/. Run "npm run build" and commit index.html.');
  console.log('index.html is up to date with the source');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
