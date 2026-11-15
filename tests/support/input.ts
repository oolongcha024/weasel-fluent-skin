import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../../src/environment';
import { loadSnapshot, type InputDependencies } from '../../src/input/snapshot';

export async function memoryInput(source = 'patch: {}') {
  const config = '/virtual/weasel.custom.yaml', scenes = '/virtual/scenes.json';
  const files = new Map<string, string>([
    [join(ROOT, 'data/weasel-defaults.yaml'), await readFile(join(ROOT, 'data/weasel-defaults.yaml'), 'utf8')],
    [join(ROOT, 'data/upstream.json'), await readFile(join(ROOT, 'data/upstream.json'), 'utf8')],
    [config, source],
  ]);
  const dependencies: InputDependencies = { readText: async (path) => { if (!files.has(path)) throw new Error('missing file'); return files.get(path)!; }, now: () => '2026-01-01T00:00:00.000Z' };
  return { files, config, scenes, read: (customScenes = false) => loadSnapshot({ config, ...(customScenes ? { scenes } : {}) }, dependencies) };
}

