import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PreviewSession } from '../src/preview/session';
import type { PreviewRenderer, PreviewRequest, BrowserReport } from '../src/preview/report';
import { buildRenderPlan } from '../src/core/render-plan';
import { memoryInput } from './support/input';

const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function report(request: PreviewRequest): BrowserReport {
  const plan = buildRenderPlan(request, (text) => ({ width: text.length * 10, height: 20 }));
  return { sha256: request.identity.inputSha256, identity: request.identity, scheme: request.scheme.id, scene: request.scene.id,
    colors: request.scheme.colors, fonts: [], bounds: null, viewport: { width: 1000, height: 800, devicePixelRatio: 1 }, diagnostics: request.diagnostics,
    html: '<div></div>', geometry: plan.geometry, plan };
}
const renderer = (render: PreviewRenderer['render'] = async (request) => report(request)): PreviewRenderer => ({ render, dispose() {} });

test('session preserves selections and stale display while rejecting invalid input exports', async () => {
  const input = await memoryInput();
  const session = new PreviewSession(renderer(), () => input.read());
  await session.dispatch({ type: 'refresh' });
  assert.equal(session.view.state, 'ready');
  await session.dispatch({ type: 'select', scene: 'long', scheme: 'azure' });
  await session.dispatch({ type: 'zoom', zoom: 1.5 });
  await session.dispatch({ type: 'canvas' });
  input.files.set(input.config, 'patch: [');
  await session.dispatch({ type: 'refresh' });
  assert.equal(session.view.freshness, 'stale'); assert.equal(session.view.report, null);
  assert.equal(session.view.selection.scene, 'long'); assert.equal(session.view.selection.zoom, 1.5);
  assert.ok(session.view.displayInput?.config.ok);
  await assert.rejects(session.capture({}), /配置无效/);
  input.files.set(input.config, 'patch: {}');
  await session.dispatch({ type: 'refresh' });
  assert.equal(session.view.state, 'ready'); assert.equal(session.view.selection.scheme, 'azure');
  assert.equal(session.view.selection.canvasDark, true);
  await session.capture({ scene: 'everyday' });
  assert.equal(session.view.selection.zoom, 1);
  session.dispose();
});

test('latest rendering wins and superseded results never become exportable', async () => {
  const input = await memoryInput();
  const pending: { request: PreviewRequest; gate: ReturnType<typeof deferred<BrowserReport>> }[] = [];
  let delay = false;
  const session = new PreviewSession(renderer(async (request) => {
    if (!delay) return report(request);
    const gate = deferred<BrowserReport>(); pending.push({ request, gate }); return gate.promise;
  }), () => input.read());
  await session.dispatch({ type: 'refresh' }); delay = true;
  const old = session.dispatch({ type: 'select', scene: 'long' });
  const latest = session.dispatch({ type: 'select', scene: 'symbols' });
  pending[1].gate.resolve(report(pending[1].request)); await latest;
  pending[0].gate.resolve(report(pending[0].request)); await old;
  assert.equal(session.view.report!.scene, 'symbols');
  assert.equal(session.view.state, 'ready');
  session.dispose();
});

test('disconnect invalidates pending renders and reconnect loads a new snapshot', async () => {
  const input = await memoryInput();
  const gate = deferred<BrowserReport>(); let pending: PreviewRequest | undefined;
  let delay = false;
  const session = new PreviewSession(renderer(async (request) => { if (!delay) return report(request); pending = request; return gate.promise; }), () => input.read());
  await session.dispatch({ type: 'refresh' }); delay = true;
  const rendering = session.dispatch({ type: 'repaint' });
  await session.dispatch({ type: 'connection', connected: false });
  gate.resolve(report(pending!)); await rendering;
  assert.equal(session.view.state, 'error'); assert.equal(session.view.report, null);
  await assert.rejects(session.capture({}));
  delay = false; await session.dispatch({ type: 'connection', connected: true });
  assert.equal(session.view.state, 'ready');
  session.dispose();
});

test('newest input read wins and a late read failure cannot overwrite recovery', async () => {
  const input = await memoryInput(), snapshot = await input.read();
  const first = deferred<typeof snapshot>(), second = deferred<typeof snapshot>();
  let count = 0;
  const session = new PreviewSession(renderer(), () => ++count === 1 ? first.promise : second.promise);
  const old = session.dispatch({ type: 'refresh' }), latest = session.dispatch({ type: 'refresh' });
  second.resolve(snapshot); await latest;
  first.reject(new Error('late failure')); await old;
  assert.equal(session.view.state, 'ready'); assert.equal(session.view.reason, null);
  session.dispose();
});

test('read failures and mismatched full snapshot identities cannot be exported', async () => {
  const input = await memoryInput(); let failRead = false, wrongIdentity = false;
  const session = new PreviewSession(renderer(async (request) => ({ ...report(request), identity: wrongIdentity ? { ...request.identity, scenesSha256: 'wrong' } : request.identity })), async () => {
    if (failRead) throw new Error('unavailable'); return input.read();
  });
  await session.dispatch({ type: 'refresh' }); failRead = true;
  await session.dispatch({ type: 'refresh' });
  assert.equal(session.view.freshness, 'stale'); await assert.rejects(session.capture({}));
  failRead = false; wrongIdentity = true;
  await session.dispatch({ type: 'refresh' });
  assert.equal(session.view.state, 'error'); assert.match(session.view.reason!, /快照或选择不一致/);
  await assert.rejects(session.capture({}));
  wrongIdentity = false; await session.dispatch({ type: 'refresh' }); assert.equal(session.view.state, 'ready');
  session.dispose();
});

test('invalid unselected schemes do not block valid previews; selection is checked at export seam', async () => {
  const input = await memoryInput('patch:\n  preset_color_schemes/bad: { text_color: salmon }\n');
  const session = new PreviewSession(renderer(), () => input.read());
  await session.dispatch({ type: 'refresh' }); assert.equal(session.view.state, 'ready');
  await assert.rejects(session.capture({ scheme: 'bad' }), /无效/);
  await session.dispatch({ type: 'select', scheme: 'bad' });
  assert.equal(session.view.state, 'error'); assert.equal(session.view.freshness, 'stale');
  await session.capture({ scheme: 'aqua' }); assert.equal(session.view.state, 'ready');
  await assert.rejects(session.capture({ scene: 'missing' }), /找不到场景/);
  session.dispose();
});

test('disposing a session prevents unfinished reads from publishing or rendering', async () => {
  const input = await memoryInput(), snapshot = await input.read(), gate = deferred<typeof snapshot>();
  let renders = 0, disposals = 0;
  const session = new PreviewSession({ render: async (request) => { renders++; return report(request); }, dispose: () => { disposals++; } }, () => gate.promise);
  const pending = session.dispatch({ type: 'refresh' });
  session.dispose(); session.dispose(); gate.resolve(snapshot); await pending;
  assert.equal(renders, 0); assert.equal(disposals, 1);
  assert.equal(session.view.state, 'error'); assert.equal(session.view.report, null); assert.equal(session.view.freshness, 'empty');
  await assert.rejects(session.capture({}));
});
