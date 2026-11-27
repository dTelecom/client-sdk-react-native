import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { remoteAudioWarnings } from '../src/remoteAudioWarnings.ts';

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const publications = new Map<object, {source: string; isMuted: boolean}>();
  let visible = false;
  const warnings = remoteAudioWarnings(track => publications.get(track), value => { visible = value; });
  t.after(() => warnings.dispose());
  function fail(track: object) {
    const { promise, resolve } = Promise.withResolvers<void>();
    warnings.add({ track, recovered: promise });
    return resolve;
  }
  return { publications, warnings, fail, visible: () => visible };
}

test('only the failing microphone affects its warning, including later mute, unmute and recovery', async t => {
  const { publications, warnings, fail, visible } = setup(t);
  const alice = {}, bob = {};
  const aliceMic = { source: 'microphone', isMuted: false };
  publications.set(alice, aliceMic);
  publications.set(bob, { source: 'microphone', isMuted: true });
  const recoverAlice = fail(alice);
  fail(bob);
  t.mock.timers.tick(999);
  assert.equal(visible(), false);
  t.mock.timers.tick(1);
  assert.equal(visible(), true);
  aliceMic.isMuted = true;
  warnings.publicationChanged();
  await Promise.resolve();
  assert.equal(visible(), false);
  aliceMic.isMuted = false;
  warnings.publicationChanged();
  await Promise.resolve();
  assert.equal(visible(), false);
  t.mock.timers.tick(1000);
  assert.equal(visible(), true);
  recoverAlice();
  await Promise.resolve();
  assert.equal(visible(), false);
});

test('an early failure binds on subscription and never flashes if mute or departure arrives in time', async t => {
  const { publications, warnings, fail, visible } = setup(t);
  const track = {};
  fail(track);
  t.mock.timers.tick(2000);
  assert.equal(visible(), false);
  const mic = { source: 'microphone', isMuted: false };
  publications.set(track, mic);
  warnings.publicationChanged();
  await Promise.resolve();
  t.mock.timers.tick(900);
  mic.isMuted = true;
  warnings.publicationChanged();
  await Promise.resolve();
  t.mock.timers.tick(1000);
  assert.equal(visible(), false);
  // The SDK notifies before removing the remote track from its publication.
  warnings.publicationChanged();
  publications.delete(track);
  await Promise.resolve();
  publications.set(track, { source: 'microphone', isMuted: false });
  warnings.publicationChanged();
  await Promise.resolve();
  t.mock.timers.tick(1000);
  assert.equal(visible(), false);
});

test('non-microphone audio warns immediately and departure clears an already visible warning', async t => {
  const { publications, warnings, fail, visible } = setup(t);
  const track = {};
  publications.set(track, { source: 'screen_share_audio', isMuted: true });
  fail(track);
  assert.equal(visible(), true);
  warnings.publicationChanged();
  publications.delete(track);
  await Promise.resolve();
  assert.equal(visible(), false);
});

test('recovery of an older episode cannot clear a newer failure on the same track', async t => {
  const { publications, fail, visible } = setup(t);
  const track = {};
  publications.set(track, { source: 'microphone', isMuted: false });
  const oldRecovery = fail(track);
  const currentRecovery = fail(track);
  oldRecovery();
  await Promise.resolve();
  t.mock.timers.tick(1000);
  assert.equal(visible(), true);
  currentRecovery();
  await Promise.resolve();
  assert.equal(visible(), false);
});
