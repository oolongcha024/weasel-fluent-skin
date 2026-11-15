import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { ROOT } from '../src/server/server';

export function options(kind: 'dev' | 'capture') {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    config: { type: 'string' }, scenes: { type: 'string' }, port: { type: 'string' },
    out: { type: 'string' }, scheme: { type: 'string' }, dpr: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log(`pnpm ${kind} --config <weasel.custom.yaml> [--scenes <scenes.json>] [--port <port>]${kind === 'capture' ? ' [--out <directory>] [--scheme <id>] [--dpr <0.5–4>]' : ''}\n默认示例：examples/fluent.custom.yaml\n服务监听 10.126.179.2；capture 默认使用空闲端口。`);
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
    config: resolve(values.config ?? positional[0] ?? resolve(ROOT, 'examples/fluent.custom.yaml')),
    scenes: values.scenes ? resolve(values.scenes) : undefined, port,
    out: resolve(values.out ?? resolve(ROOT, 'artifacts')), scheme: values.scheme, dpr,
  };
}
