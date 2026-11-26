import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanCameraLifecycle } from '../src/scanCamera.ts';

for (const grantBeforeResume of [true, false]) {
  test(`camera permission resolves ${grantBeforeResume ? 'before' : 'after'} the app resumes`, () => {
    const events: string[] = [];
    const camera = scanCameraLifecycle('active', () => events.push('start'), () => events.push('close'));
    camera.onAppState('background');
    assert.deepEqual(events, []);
    if (grantBeforeResume) {
      camera.onGrant();
      assert.deepEqual(events, []);
      camera.onAppState('active');
    } else {
      camera.onAppState('active');
      assert.deepEqual(events, []);
      camera.onGrant();
    }
    camera.onAppState('active');
    assert.deepEqual(events, ['start']);
    camera.onAppState('background');
    assert.deepEqual(events, ['start', 'close']);
  });
}
