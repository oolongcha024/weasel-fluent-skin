import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ROOT } from '../src/environment';
import { sha256 } from '../src/input/snapshot';
import { readYaml } from '../src/core/yaml';
import { resolveConfig } from '../src/core/config';
import { calculateLayout } from '../src/core/layout';
import { nativeCases, fixedMeasurement, visibleRectangles, type NativeRectangles } from './native/cases';
import reference from './native/reference.json';

const { values } = parseArgs({ options: { upstream: { type: 'string' }, out: { type: 'string' } } });
const out = resolve(values.out ?? join(ROOT, 'artifacts/native-reference', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`));
const work = await mkdtemp(join(tmpdir(), 'weasel-native-'));
try {
  const sources = await Promise.all(Object.entries(reference.sources).map(async ([name, expected]) => {
    const response = values.upstream ? null : await fetch(`https://raw.githubusercontent.com/rime/weasel/${reference.commit}/WeaselUI/${name}`, { signal: AbortSignal.timeout(30000) });
    if (response && !response.ok) throw new Error(`下载 ${name} 失败：HTTP ${response.status}`);
    const text = values.upstream ? await readFile(resolve(values.upstream, name), 'utf8') : await response!.text();
    if (sha256(text) !== expected) throw new Error(`${name} 摘要不匹配，拒绝执行未固定的上游代码。`);
    // Only platform includes/namespace qualifiers are substituted; method bodies
    // remain the original upstream implementation, never a TS-derived oracle.
    return text.split(/\r?\n/).filter((line) => !line.startsWith('#include') && !line.startsWith('using namespace')).join('\n').replaceAll('weasel::', '');
  }));
  const bridge = await readFile(join(ROOT, 'scripts/native/bridge.cpp'), 'utf8');
  const sourcePath = join(work, 'reference.cpp'), executable = join(work, 'reference');
  await writeFile(sourcePath, bridge.replace('// INSERT_NATIVE_LAYOUTS', sources.join('\n')));
  const compile = spawnSync(process.env.CXX ?? 'g++', ['-std=c++17', '-O2', sourcePath, '-o', executable], { encoding: 'utf8', timeout: 60000 });
  if (compile.error || compile.status !== 0) throw new Error(`编译原生对照失败（需要 C++17 编译器）：${compile.error?.message ?? compile.stderr}`);
  const defaults = readYaml(await readFile(join(ROOT, 'data/weasel-defaults.yaml'), 'utf8')).data;
  const config = resolveConfig('patch: {}', defaults);
  const cases = nativeCases(config.style, config.schemes.aqua.colors, reference.cases, reference.seed);
  const run = spawnSync(executable, { input: cases.map((c) => c.input).join('\n'), encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  if (run.error || run.status !== 0) throw new Error(`运行原生对照失败：${run.error?.message ?? run.stderr}`);
  const native: NativeRectangles[] = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  if (native.length !== cases.length) throw new Error('原生输出数量与输入数量不一致。');
  const measure = fixedMeasurement(reference.measurements);
  const failures = cases.flatMap((fixture, index) => {
    const actual = visibleRectangles(calculateLayout(fixture.style, fixture.colors, fixture.scene, measure), fixture);
    const expected = visibleRectangles(native[index], fixture);
    return isDeepStrictEqual(actual, expected) ? [] : [{ index, fixture, expected, actual }];
  });
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'report.json'), JSON.stringify({ ...reference, status: failures.length ? 'failed' : 'complete', checked: cases.length,
    note: '固定字体尺寸；不验证 DirectWrite、圆角区域、阴影像素或状态图标。', failures }, null, 2));
  console.log(`原生布局对照：${cases.length - failures.length}/${cases.length} 一致；结果：${join(out, 'report.json')}`);
  if (failures.length) process.exitCode = 1;
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
finally { await rm(work, { recursive: true, force: true }); }
