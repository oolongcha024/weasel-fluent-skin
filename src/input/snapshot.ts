import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from '../environment';
import { resolveConfig } from '../core/config';
import type { ConfigResult } from '../core/config-model';
import { readYaml } from '../core/yaml';
import { DEFAULT_SCENES, validateScenes, type Scene } from '../core/scenes';
import type { Diagnostic } from '../core/diagnostics';
import { LAYOUT_BASIS } from '../core/geometry';
import type { SnapshotIdentity } from './identity';

export interface InputSnapshot {
  file: string; source: string; sha256: string; readAt: string;
  defaults: { commit: string; sha256: string; configVersion: string; url: string };
  config: ConfigResult; scenes: Scene[]; scenesSha256: string; identity: SnapshotIdentity;
}
export interface InputOptions { config: string; scenes?: string }
export interface InputDependencies { readText(path: string): Promise<string>; now(): string }
const diskInput: InputDependencies = { readText: (path) => readFile(path, 'utf8'), now: () => new Date().toISOString() };
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export async function loadSnapshot(options: InputOptions, dependencies: InputDependencies = diskInput): Promise<InputSnapshot> {
  const [defaultSource, upstreamSource] = await Promise.all([
    dependencies.readText(resolve(ROOT, 'data/weasel-defaults.yaml')),
    dependencies.readText(resolve(ROOT, 'data/upstream.json')),
  ]);
  const defaults = readYaml(defaultSource);
  if (defaults.diagnostics.length) throw new Error('内置默认配置无法读取。');
  const upstream = JSON.parse(upstreamSource);
  const diagnostics: Diagnostic[] = [];
  let source = '';
  try { source = await dependencies.readText(options.config); }
  catch (e) { diagnostics.push({ level: 'error', code: 'file', message: `无法读取 ${options.config}：${(e as Error).message}` }); }
  const config = resolveConfig(source, defaults.data);
  let scenes = DEFAULT_SCENES;
  if (options.scenes) {
    try {
      const result = validateScenes(JSON.parse(await dependencies.readText(options.scenes)));
      scenes = result.scenes;
      diagnostics.push(...result.diagnostics);
    } catch (e) { diagnostics.push({ level: 'error', code: 'scenes', message: `无法读取场景文件：${(e as Error).message}` }); scenes = []; }
  }
  const allDiagnostics = [...config.diagnostics, ...diagnostics];
  const resolved = { ...config, diagnostics: allDiagnostics, ok: !allDiagnostics.some((d) => d.level === 'error') };
  const inputHash = sha256(source), defaultsHash = sha256(defaultSource), scenesHash = sha256(JSON.stringify(scenes));
  return {
    file: options.config, source, sha256: inputHash, readAt: dependencies.now(),
    defaults: { commit: upstream.commit, sha256: defaultsHash, configVersion: String(defaults.data.config_version), url: upstream.url },
    config: resolved, scenes, scenesSha256: scenesHash,
    identity: { inputSha256: inputHash, defaultsSha256: defaultsHash, scenesSha256: scenesHash, layoutBasis: LAYOUT_BASIS },
  };
}

