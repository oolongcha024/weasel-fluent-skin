import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { inputPath, REPOSITORY_ROOT } from '../src/environment';
import { resolveNetworkOptions } from '../src/server/network';

export function options(kind: 'dev' | 'capture') {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    config: { type: 'string' }, scenes: { type: 'string' }, host: { type: 'string' }, port: { type: 'string' },
    out: { type: 'string' }, scheme: { type: 'string' }, dpr: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log(`pnpm ${kind} [--config <weasel.custom.yaml>] [--scenes <scenes.json>] [--host <host>] [--port <port>]${kind === 'capture' ? ' [--out <directory>] [--scheme <id>] [--dpr <0.5–4>]' : ''}\n默认皮肤：skins/fluent-2/weasel.custom.yaml\n默认场景：previews/scenes.json\n相对路径按调用 pnpm 时的目录解析。\n默认仅本机访问，端口自动分配；远程访问请用 --host 指定监听地址。\n--port 0 自动分配端口；指定非零端口时，占用即报错。`);
    process.exit(0);
  }
  // pnpm forwards a literal -- in some invocation forms.
  const positional = positionals.filter((p) => p !== '--');
  if (positional.length > 1) throw new Error('只接受一个配置文件路径。');
  const network = resolveNetworkOptions(values);
  const dpr = Number(values.dpr ?? 1);
  if (!Number.isFinite(dpr) || dpr < .5 || dpr > 4) throw new Error('截图 DPR 应在 0.5–4 之间。');
  return {
    config: inputPath(values.config ?? positional[0] ?? join(REPOSITORY_ROOT, 'skins/fluent-2/weasel.custom.yaml')),
    scenes: inputPath(values.scenes ?? join(REPOSITORY_ROOT, 'previews/scenes.json')), ...network,
    out: inputPath(values.out ?? join(REPOSITORY_ROOT, 'artifacts')), scheme: values.scheme, dpr,
  };
}
