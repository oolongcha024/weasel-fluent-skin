import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, sha256 } from '../../src/server/server';

function run(args: string[]) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/capture.ts', ...args], { cwd: ROOT });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

test('capture CLI creates a frozen, reproducible bundle and fails without stale images on invalid input', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'weasel-capture-test-'));
  try {
    const input = join(dir, 'skin.custom.yaml'), scenes = join(dir, 'scenes.json'), out = join(dir, 'output');
    const source = `patch:
  style/+:
    color_scheme: custom
    color_scheme_dark: custom_dark
    font_face: sans-serif
    horizontal: false
  preset_color_schemes/+:
    custom: { color_format: rgba, back_color: 0x123456ff, text_color: 0xf0f0f0ff }
    custom_dark: { color_format: argb, back_color: 0xff222222, text_color: 0xffffffff }
`;
    await writeFile(input, source);
    await writeFile(scenes, JSON.stringify([{ id: 'test', name: 'Test', preedit: 'ni', highlighted: 0, candidates: [{ text: '<img src=x>', comment: '注释' }] }]));
    const success = await run(['--config', input, '--scenes', scenes, '--out', out, '--dpr', '1.5']);
    assert.equal(success.code, 0, success.output);
    const [successDir] = await readdir(out);
    const manifest = JSON.parse(await readFile(join(out, successDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'complete');
    assert.equal(manifest.input.sha256, sha256(source));
    assert.equal(manifest.screenshots.length, 2);
    assert.equal(manifest.deviceScaleFactor, 1.5);
    assert.equal(manifest.layoutBasis, 'weasel-0.17.4');
    for (const shot of manifest.screenshots) {
      const report = JSON.parse(await readFile(join(out, successDir, shot.report), 'utf8'));
      assert.equal(report.sha256, manifest.input.sha256);
      assert.ok(report.bounds.width > 0);
      assert.equal(report.geometry.density, 1.5);
      assert.equal(report.geometry.basis, 'weasel-0.17.4');
      assert.ok(report.html.includes('&lt;img src=x&gt;'));
      assert.ok(!report.html.includes('<img src=x>'));
      assert.ok((await readFile(join(out, successDir, shot.html), 'utf8')).includes('<style>'));
      assert.ok((await readFile(join(out, successDir, shot.image))).byteLength > 1000);
    }
    await writeFile(input, 'patch: [');
    const failure = await run(['--config', input, '--out', out]);
    assert.equal(failure.code, 1, failure.output);
    const failedDir = (await readdir(out)).find((name) => name !== successDir)!;
    const failed = JSON.parse(await readFile(join(out, failedDir, 'manifest.json'), 'utf8'));
    assert.equal(failed.status, 'failed');
    assert.deepEqual(failed.screenshots, []);
    assert.ok(failed.diagnostics.some((d: { level: string }) => d.level === 'error'));
    assert.ok(!(await readdir(join(out, failedDir))).some((name) => name.endsWith('.png')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
