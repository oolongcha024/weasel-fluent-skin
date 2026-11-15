import type { Colors } from '../core/config-model';
import type { Diagnostic } from '../core/diagnostics';
import type { PreviewGeometry } from '../core/geometry';
import type { PreviewSelection, RenderPlan } from '../core/render-plan';
import type { SnapshotIdentity } from '../input/identity';

export interface PreviewRequest extends PreviewSelection { identity: SnapshotIdentity; diagnostics: Diagnostic[] }
export interface BrowserReport {
  sha256: string; identity: SnapshotIdentity; scheme: string; scene: string;
  colors: Colors;
  fonts: { requested: string; available: boolean; css: string }[];
  bounds: { x: number; y: number; width: number; height: number } | null;
  viewport: { width: number; height: number; devicePixelRatio: number };
  diagnostics: Diagnostic[]; html: string; geometry: PreviewGeometry; plan: RenderPlan;
}
export interface PreviewRenderer { render(request: PreviewRequest): Promise<BrowserReport>; dispose(): void }
export class SupersededRender extends Error { constructor() { super('渲染已被更新的请求取代。'); } }
