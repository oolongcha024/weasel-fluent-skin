import { resolve } from 'node:path';
import { createServer } from 'vite';
import { TOOL_ROOT } from '../environment';
import { loadSnapshot } from '../input/snapshot';
import { connectionUrl, resolveNetworkOptions, type NetworkOptions } from './network';

export interface ServerOptions extends Partial<NetworkOptions> { config: string; scenes?: string; live?: boolean }

export async function startServer(options: ServerOptions) {
  const network = resolveNetworkOptions(options);
  let snapshot = await loadSnapshot(options);
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const paths = [options.config, options.scenes].filter((p): p is string => !!p).map((p) => resolve(p));
  const server = await createServer({
    root: TOOL_ROOT, configFile: false, clearScreen: false,
    server: { ...network, strictPort: true,
      hmr: options.live === false ? false : undefined,
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
                if (current !== generation) return;
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
      closeBundle() { generation++; clearTimeout(timer); },
    }],
  });
  try {
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('无法取得预览服务地址。');
    return { server, get snapshot() { return snapshot; }, url: connectionUrl(address) };
  } catch (error) {
    await server.close();
    throw error;
  }
}
