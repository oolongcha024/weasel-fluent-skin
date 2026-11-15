import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from '../environment';
import type { InputSnapshot } from '../input/snapshot';
import type { BrowserReport } from '../preview/report';
import type { SnapshotIdentity } from '../input/identity';
import type { Diagnostic } from '../core/diagnostics';
import { LAYOUT_BASIS } from '../core/geometry';

export interface CaptureShot { scheme: string; scene: string; image: string; report: string; html: string }
export interface CaptureManifest {
  schemaVersion: 2; status: 'failed' | 'complete'; runId: string; createdAt: string;
  viewport: { width: number; height: number }; deviceScaleFactor: number; zoom: 1; layoutBasis: typeof LAYOUT_BASIS;
  screenshots: CaptureShot[]; diagnostics: Diagnostic[];
  identity?: SnapshotIdentity; input?: { path: string; sha256: string; readAt: string };
  defaults?: InputSnapshot['defaults']; scenesSha256?: string; browser?: string;
  note?: string; lastRenderedInput?: string; error?: string;
}

/** Owns the artifact contract, filenames, CSS embedding and final manifest. */
export async function createCaptureBundle(out: string, dpr: number) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const directory = join(out, runId);
  await mkdir(directory, { recursive: true });
  const manifest: CaptureManifest = { schemaVersion: 2, status: 'failed', runId, createdAt: new Date().toISOString(),
    viewport: { width: 1600, height: 1000 }, deviceScaleFactor: dpr, zoom: 1, layoutBasis: LAYOUT_BASIS, screenshots: [], diagnostics: [] };
  let rendererCss: string | undefined;
  return {
    directory, manifest,
    async input(snapshot: InputSnapshot) {
      Object.assign(manifest, { identity: snapshot.identity, input: { path: snapshot.file, sha256: snapshot.sha256, readAt: snapshot.readAt },
        defaults: snapshot.defaults, scenesSha256: snapshot.scenesSha256, diagnostics: snapshot.config.diagnostics });
      await Promise.all([
        writeFile(join(directory, 'input.yaml'), snapshot.source),
        writeFile(join(directory, 'effective.json'), JSON.stringify({ ...snapshot.config, defaults: snapshot.defaults, sha256: snapshot.sha256, identity: snapshot.identity }, null, 2)),
        writeFile(join(directory, 'scenes.json'), JSON.stringify(snapshot.scenes, null, 2)),
      ]);
    },
    async shot(stem: string, report: BrowserReport, isDark: boolean) {
      rendererCss ??= await readFile(join(ROOT, 'src/render/candidate.css'), 'utf8');
      const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weasel preview</title><style>${rendererCss}\nbody{margin:0;min-height:100vh;display:grid;place-items:center;background:${isDark ? '#20252e' : '#f0f2f6'};--editor-ink:${isDark ? '#a9b4c4' : '#555e6d'}}</style><body>${report.html}</body></html>`;
      await Promise.all([writeFile(join(directory, `${stem}.json`), JSON.stringify(report, null, 2)), writeFile(join(directory, `${stem}.html`), html)]);
      manifest.screenshots.push({ scheme: report.scheme, scene: report.scene, image: `${stem}.png`, report: `${stem}.json`, html: `${stem}.html` });
    },
    async finish() { await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2)); },
  };
}
