import type { DeviceLayout } from './config-model';
export const LAYOUT_BASIS = 'weasel-0.17.4' as const;

/** Corner order follows CSS: top-left, top-right, bottom-right, bottom-left. */
export interface RoundShape { radius: number; corners: [boolean, boolean, boolean, boolean]; hemispherical: boolean }
export interface Size { width: number; height: number }
export interface Rect extends Size { x: number; y: number }
export type TextRole = 'text' | 'label' | 'comment' | 'preedit';
export interface TextRun { text: string; role: TextRole; rect: Rect; highlighted?: boolean }
export interface CandidateGeometry {
  index: number; row: number; bounds: Rect; background: Rect;
  label: TextRun | null; text: TextRun; comment: TextRun | null; rounding: RoundShape;
}
export interface PreviewGeometry extends Size {
  basis: typeof LAYOUT_BASIS; density: number; layout: DeviceLayout;
  candidates: CandidateGeometry[];
  preedit: { bounds: Rect; runs: TextRun[]; background: Rect | null; rounding: RoundShape } | null;
  pages: { previous: Rect; next: Rect } | null;
  mark: { rect: Rect; text: string } | null;
}
export type MeasureText = (text: string, role: TextRole) => Size;
