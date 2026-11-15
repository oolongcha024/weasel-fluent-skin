import { buildRenderPlan } from '../core/render-plan';
import { uniqueDiagnostics } from '../core/diagnostics';
import { SupersededRender, type BrowserReport, type PreviewRenderer, type PreviewRequest } from '../preview/report';
import { availableFonts } from './fonts';
import { withMeasurements } from './measurement';
import { paintCandidate } from './candidate';
import './candidate.css';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** A completed render includes font readiness, device layout, paint and inspection.
 * New requests supersede pending work; dispose prevents pending reports escaping.
 */
export function createBrowserPreview(host: HTMLElement): PreviewRenderer {
  let generation = 0, disposed = false;
  return {
    async render(request: PreviewRequest): Promise<BrowserReport> {
      if (disposed) throw new Error('预览已关闭。');
      const token = ++generation, density = window.devicePixelRatio || 1;
      const paint = () => {
        const plan = withMeasurements(request.style, density, (measure) => buildRenderPlan(request, measure, density));
        const root = paintCandidate(plan, request.scheme.id, request.scene.id);
        host.replaceChildren(root); return { plan, root };
      };
      paint();
      await document.fonts.ready;
      if (disposed || token !== generation) throw new SupersededRender();
      const { plan, root } = paint();
      await nextFrame(); await nextFrame();
      if (disposed || token !== generation) throw new SupersededRender();
      const fonts = [...new Set(Object.values(plan.fonts).map((font) => font.requested))].flatMap(availableFonts);
      const diagnostics = uniqueDiagnostics([...request.diagnostics, ...request.scheme.diagnostics,
        ...fonts.filter((f) => !f.available).map((font) => ({ level: 'warning' as const, code: 'missing-font', path: font.requested,
          message: `此环境未检测到字体「${font.requested}」，实际显示使用回退字体。` })),
      ]);
      const win = root.querySelector<HTMLElement>('.ime-window')!;
      const box = plan.hidden ? null : win.getBoundingClientRect();
      const bounds = box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
      if (bounds && (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > innerWidth || bounds.y + bounds.height > innerHeight)) diagnostics.push({ level: 'warning', code: 'outside-viewport', message: '候选窗口超出了当前视口；截图可能不完整。' });
      return { sha256: request.identity.inputSha256, identity: request.identity, scheme: request.scheme.id, scene: request.scene.id,
        colors: request.scheme.colors, fonts, bounds, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        diagnostics, html: root.outerHTML, geometry: plan.geometry, plan };
    },
    dispose() { if (disposed) return; disposed = true; generation++; host.replaceChildren(); },
  };
}
