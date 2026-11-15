import type { LAYOUT_BASIS } from '../core/geometry';

export interface SnapshotIdentity {
  inputSha256: string; defaultsSha256: string; scenesSha256: string; layoutBasis: typeof LAYOUT_BASIS;
}
export function sameIdentity(left: SnapshotIdentity, right: SnapshotIdentity): boolean {
  return left.inputSha256 === right.inputSha256 && left.defaultsSha256 === right.defaultsSha256
    && left.scenesSha256 === right.scenesSha256 && left.layoutBasis === right.layoutBasis;
}
