import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { REPOSITORY_ROOT } from '../src/environment';
import { resolveNetworkOptions } from '../src/server/network';
import { startServer } from '../src/server/server';

const input = { config: join(REPOSITORY_ROOT, 'skins/fluent-2/weasel.custom.yaml'), live: false };

test('network defaults are local-only with an automatically allocated port', () => {
  assert.deepEqual(resolveNetworkOptions(), { host: 'localhost', port: 0 });
  assert.deepEqual(resolveNetworkOptions({ host: '[::1]', port: '0' }), { host: '::1', port: 0 });
  assert.deepEqual(resolveNetworkOptions({ host: 'preview.example', port: '65535' }), { host: 'preview.example', port: 65535 });
});

test('network options reject malformed hosts and ports before starting a listener', () => {
  for (const host of ['', 'http://localhost', 'localhost/path', 'localhost:0', 'local host', '[localhost]']) {
    assert.throws(() => resolveNetworkOptions({ host }), /监听地址/, host);
  }
  for (const port of ['', ' ', '-1', '1.5', '1e3', '65536', -1, .5, Infinity, NaN]) {
    assert.throws(() => resolveNetworkOptions({ port }), /端口/, String(port));
  }
});

test('concurrent default servers publish their actual distinct and reachable ports', async () => {
  const first = await startServer(input);
  try {
    const second = await startServer(input);
    try {
      assert.notEqual(new URL(first.url).port, new URL(second.url).port);
      for (const instance of [first, second]) {
        const address = instance.server.httpServer!.address();
        assert.ok(address && typeof address !== 'string');
        assert.equal(Number(new URL(instance.url).port), address.port);
        assert.equal(instance.server.config.server.host, 'localhost');
        const response = await fetch(`${instance.url}/api/config`);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).file, input.config);
      }
    } finally { await second.server.close(); }
  } finally { await first.server.close(); }
});

test('an explicitly requested busy port fails instead of silently selecting another', async () => {
  const first = await startServer(input);
  try {
    const address = first.server.httpServer!.address();
    assert.ok(address && typeof address !== 'string');
    await assert.rejects(startServer({ ...input, host: address.address, port: address.port }), /already in use/);
    assert.equal((await fetch(first.url)).status, 200);
  } finally { await first.server.close(); }
});

test('wildcard and IPv6 listeners return concrete, correctly formatted connection URLs', async (t) => {
  for (const host of ['0.0.0.0', '::1', '::']) await t.test(host, async (t) => {
    let instance: Awaited<ReturnType<typeof startServer>>;
    try { instance = await startServer({ ...input, host }); }
    catch (error) {
      if (host.includes(':') && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        t.skip('IPv6 is unavailable on this system'); return;
      }
      throw error;
    }
    try {
      const url = new URL(instance.url);
      assert.equal(instance.server.config.server.host, host);
      assert.equal(url.hostname, host === '0.0.0.0' ? '127.0.0.1' : '[::1]');
      assert.ok(Number(url.port) > 0);
      assert.equal((await fetch(`${instance.url}/api/config`)).status, 200);
    } finally { await instance.server.close(); }
  });
});
