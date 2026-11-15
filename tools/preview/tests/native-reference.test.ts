import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateLayout } from '../src/core/layout';
import type { Rect } from '../src/core/geometry';
import type { Scene } from '../src/core/scenes';
import type { Style } from '../src/core/config-model';

// Expected rectangles were produced by the original 0.17.4 C++ DoLayout
// methods, compiled in a temporary Linux harness. Only Windows rectangle types,
// font measurement and non-composing status-icon drawing were substituted.
// The renderer under test did not generate these expected values.
const reference = JSON.parse(await readFile(new URL('./fixtures/native-layout.json', import.meta.url), 'utf8'));
const rect = (r: Rect) => [r.x, r.y, r.width, r.height];

test('layouts agree with recorded output from native C++ methods', () => {
  for (const fixture of reference.fixtures) {
    const s = fixture.style as Style, scene = fixture.scene as Scene;
    const colors = { ...fixture.colors, comment_text_color: '#111111ff', hilited_comment_text_color: '#111111ff' };
    const g = calculateLayout(s, colors, scene, (text, role) => ({ width: text.length * reference.measurement[role][0], height: reference.measurement[role][1] }));
    assert.deepEqual({ width: g.width, height: g.height,
      ...(g.preedit ? { preedit: rect(g.preedit.bounds) } : {}),
      candidates: g.candidates.map((c) => ({ bounds: rect(c.bounds),
        ...(c.label ? { label: rect(c.label.rect) } : {}), text: rect(c.text.rect),
        ...(c.comment ? { comment: rect(c.comment.rect) } : {}) })),
    }, fixture.expected, `native case ${fixture.case}`);
  }
});
