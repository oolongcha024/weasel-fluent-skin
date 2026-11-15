import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT } from '../src/environment';
import { memoryInput } from './support/input';
import { sameIdentity } from '../src/input/identity';

test('snapshot identity covers YAML, defaults and scenes independently of read time', async () => {
  const input = await memoryInput();
  const original = await input.read();
  assert.equal(original.identity.inputSha256, original.sha256);
  assert.equal(original.identity.defaultsSha256, original.defaults.sha256);
  assert.equal(original.identity.scenesSha256, original.scenesSha256);
  assert.ok(sameIdentity(original.identity, (await input.read()).identity));
  input.files.set(input.scenes, JSON.stringify(original.scenes.slice(0, 1)));
  const custom = await input.read(true);
  assert.equal(custom.sha256, original.sha256);
  assert.ok(!sameIdentity(custom.identity, original.identity));
  input.files.set(join(ROOT, 'data/weasel-defaults.yaml'), input.files.get(join(ROOT, 'data/weasel-defaults.yaml'))! + '\n# different snapshot\n');
  assert.ok(!sameIdentity((await input.read()).identity, original.identity));
});

test('unreadable input and invalid scene documents produce diagnostic snapshots', async () => {
  const input = await memoryInput();
  input.files.delete(input.config);
  assert.equal((await input.read()).config.ok, false);
  input.files.set(input.config, 'patch: {}');
  input.files.set(input.scenes, '[invalid');
  const broken = await input.read(true);
  assert.equal(broken.config.ok, false); assert.deepEqual(broken.scenes, []);
  assert.ok(broken.config.diagnostics.some((d) => d.code === 'scenes'));
});
