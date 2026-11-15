import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { inputPath, REPOSITORY_ROOT } from '../src/environment';

export function options(kind: 'dev' | 'capture') {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    config: { type: 'string' }, scenes: { type: 'string' }, port: { type: 'string' },
    out: { type: 'string' }, scheme: { type: 'string' }, dpr: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log(`pnpm ${kind} --config <weasel.custom.yaml> [--scenes <scenes.json>] [--port <port>]${kind === 'capture' ? ' [--out <directory>] [--scheme <id>] [--dpr <0.5–4>]' : ''}\n默认皮肤：skins/fluent-2/weasel.custom.yaml\n默认场景：previews/scenes.json\n相对路径按调用 pnpm 时的目录解析。\n服务监听 10.126.179.2；capture 默认使用空闲端口。`);
    process.exit(0);
  }
  // pnpm forwards a literal -- in some invocation forms.
  const positional = positionals.filter((p) => p !== '--');
  if (positional.length > 1) throw new Error('只接受一个配置文件路径。');
  const port = values.port === undefined ? (kind === 'dev' ? 5173 : 0) : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('端口应在 0–65535 之间。');
  const dpr = Number(values.dpr ?? 1);
  if (!Number.isFinite(dpr) || dpr < .5 || dpr > 4) throw new Error('截图 DPR 应在 0.5–4 之间。');
  return {
    config: inputPath(values.config ?? positional[0] ?? join(REPOSITORY_ROOT, 'skins/fluent-2/weasel.custom.yaml')),
    scenes: inputPath(values.scenes ?? join(REPOSITORY_ROOT, 'previews/scenes.json')), port,
    out: inputPath(values.out ?? join(REPOSITORY_ROOT, 'artifacts')), scheme: values.scheme, dpr,
  };
}
