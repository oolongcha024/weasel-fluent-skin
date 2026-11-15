import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { resolveConfig } from '../core/config';
import { readYaml } from '../core/yaml';
import { DEFAULT_SCENES, validateScenes } from '../core/scenes';
import type { InputSnapshot, Diagnostic } from '../core/types';

export const HOST = '10.126.179.2';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export interface ServerOptions { config: string; scenes?: string; port?: number; live?: boolean }

export async function loadSnapshot(options: ServerOptions): Promise<InputSnapshot> {
  const [defaultSource, upstreamSource] = await Promise.all([
    readFile(resolve(ROOT, 'data/weasel-defaults.yaml'), 'utf8'),
    readFile(resolve(ROOT, 'data/upstream.json'), 'utf8'),
  ]);
  const defaults = readYaml(defaultSource);
  if (defaults.diagnostics.length) throw new Error('内置默认配置无法读取。');
  const upstream = JSON.parse(upstreamSource);
  const diagnostics: Diagnostic[] = [];
  let source = '';
  try { source = await readFile(options.config, 'utf8'); }
  catch (e) { diagnostics.push({ level: 'error', code: 'file', message: `无法读取 ${options.config}：${(e as Error).message}` }); }
  const config = resolveConfig(source, defaults.data);
  let scenes = DEFAULT_SCENES;
  if (options.scenes) {
    try {
      const result = validateScenes(JSON.parse(await readFile(options.scenes, 'utf8')));
      scenes = result.scenes;
      diagnostics.push(...result.diagnostics);
    } catch (e) { diagnostics.push({ level: 'error', code: 'scenes', message: `无法读取场景文件：${(e as Error).message}` }); scenes = []; }
  }
  config.diagnostics.push(...diagnostics);
  config.ok = !config.diagnostics.some((d) => d.level === 'error');
  return {
    file: options.config, source, sha256: sha256(source), readAt: new Date().toISOString(),
    defaults: { commit: upstream.commit, sha256: sha256(defaultSource), configVersion: String(defaults.data.config_version), url: upstream.url },
    config, scenes, scenesSha256: sha256(JSON.stringify(scenes)),
  };
}

export async function startServer(options: ServerOptions) {
  let snapshot = await loadSnapshot(options);
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const paths = [options.config, options.scenes].filter((p): p is string => !!p).map((p) => resolve(p));
  const server = await createServer({
    root: ROOT, configFile: false, clearScreen: false,
    server: { host: HOST, port: options.port ?? 5173, strictPort: options.port !== 0,
      hmr: options.live === false ? false : { host: HOST },
      watch: { ignored: ['**/artifacts/**'] } },
    plugins: [{
      name: 'weasel-local-input',
      configureServer(vite) {
        vite.middlewares.use('/api/config', (req, res) => {
          if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(snapshot));
        });
        if (options.live !== false) {
          vite.watcher.add(paths);
          const refresh = (file: string) => {
            if (!paths.includes(resolve(file))) return;
            const current = ++generation;
            clearTimeout(timer);
            timer = setTimeout(() => {
              void loadSnapshot(options).then((next) => {
                if (current !== generation) return;
                snapshot = next;
                vite.ws.send({ type: 'custom', event: 'weasel:updated', data: { sha256: next.sha256 } });
              }).catch((error: Error) => {
                snapshot = { ...snapshot, config: { ...snapshot.config, ok: false, diagnostics: [{ level: 'error', code: 'read', message: error.message }] } };
                vite.ws.send({ type: 'custom', event: 'weasel:updated', data: {} });
              });
            }, 80);
          };
          vite.watcher.on('all', (_event, file) => refresh(file));
        }
      },
      handleHotUpdate(context) {
        if (paths.includes(resolve(context.file))) return [];
      },
      closeBundle() { clearTimeout(timer); },
    }],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('无法取得预览服务端口。');
  return { server, snapshot, url: `http://${HOST}:${address.port}` };
}
