import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWindowDragSession,
  normalizeDragPoint,
  resolveWindowDragBounds,
  updateWindowDragSession,
} from '../../src/core/windowDrag.mjs';

test('drag keeps the full displacement accumulated before the click threshold', () => {
  const session = createWindowDragSession(
    normalizeDragPoint({ screenX: 100, screenY: 200 }),
    { x: 20, y: 30, width: 128, height: 128 },
  );

  updateWindowDragSession(session, normalizeDragPoint({ screenX: 104, screenY: 203 }));
  updateWindowDragSession(session, normalizeDragPoint({ screenX: 106, screenY: 205 }));

  assert.deepEqual(resolveWindowDragBounds(session), {
    x: 26,
    y: 35,
    width: 128,
    height: 128,
  });
});

test('drag always resolves from the latest absolute pointer position', () => {
  const session = createWindowDragSession(
    normalizeDragPoint({ screenX: 500, screenY: 400 }),
    { x: -120, y: 40, width: 160, height: 160 },
  );
  for (let index = 1; index <= 100; index += 1) {
    updateWindowDragSession(
      session,
      normalizeDragPoint({ screenX: 500 + index, screenY: 400 - index }),
    );
  }

  assert.deepEqual(resolveWindowDragBounds(session), {
    x: -20,
    y: -60,
    width: 160,
    height: 160,
  });
});

test('drag accepts fractional and negative high-DPI screen coordinates safely', () => {
  assert.deepEqual(
    normalizeDragPoint({ screenX: -120.6, screenY: 300.4 }),
    { screenX: -121, screenY: 300 },
  );
  assert.equal(normalizeDragPoint({ screenX: Number.NaN, screenY: 0 }), undefined);
  assert.equal(normalizeDragPoint({ screenX: 100_001, screenY: 0 }), undefined);
});
