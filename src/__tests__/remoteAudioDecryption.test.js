import {
  RTCFrameCryptorFactory as factory,
  RTCFrameCryptorState as state,
} from '@dtelecom/react-native-webrtc';
import { Platform } from 'react-native';
import { createRoomEncryption, RemoteAudioDecryptionError } from '../e2ee';

jest.mock('@dtelecom/livekit-client', () => ({
  Room: { supportsNativeMediaEncryption: true },
}));
jest.mock('@dtelecom/react-native-webrtc', () => ({
  RTCPeerConnection: class {
    prepareEncryptedReceivers() {}
  },
  RTCRtpTransceiver: class {
    activateEncryptedSender() {}
  },
  RTCFrameCryptorAlgorithm: { kAesGcm: 0 },
  RTCFrameCryptorState: {
    FrameCryptorStateOk: 1,
    FrameCryptorStateDecryptionFailed: 2,
    FrameCryptorStateMissingKey: 3,
    2: 'FrameCryptorStateDecryptionFailed',
    3: 'FrameCryptorStateMissingKey',
  },
  RTCFrameCryptorFactory: {
    createDefaultKeyProvider: jest.fn(() => ({ dispose: jest.fn() })),
    createFrameCryptorForRtpReceiver: jest.fn(),
    createFrameCryptorForRtpSender: jest.fn(),
  },
}));

function cryptor() {
  const listeners = new Set();
  return {
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
    setEnabled: async () => true,
    dispose: async () => {},
    emit: (value) =>
      listeners.forEach((listener) => listener({ state: value })),
  };
}

it('ties each audio error to its own receiver and resolves it on recovery or release', async () => {
  const encryption = createRoomEncryption();
  const report = jest.fn();
  encryption.bindRoom(report);
  let prepare;
  const pc = {
    prepareEncryptedReceivers: (prepareReceiver) => {
      prepare = prepareReceiver;
    },
  };
  encryption.configureSubscriber(pc);
  const first = cryptor();
  const second = cryptor();
  factory.createFrameCryptorForRtpReceiver
    .mockReturnValueOnce(first)
    .mockReturnValueOnce(second);
  const track = { kind: 'audio' };
  await prepare({ track });
  await prepare({ track: { kind: 'audio' } });
  first.emit(state.FrameCryptorStateDecryptionFailed);
  second.emit(state.FrameCryptorStateDecryptionFailed);
  const [[firstError], [secondError]] = report.mock.calls;
  expect(firstError).toBeInstanceOf(RemoteAudioDecryptionError);
  expect(firstError.track).toBe(track);
  const recovered = jest.fn();
  secondError.recovered.then(recovered);
  first.emit(state.FrameCryptorStateOk);
  await firstError.recovered;
  expect(recovered).not.toHaveBeenCalled();
  first.emit(state.FrameCryptorStateDecryptionFailed);
  expect(report.mock.lastCall[0]).not.toBe(firstError);
  await encryption.releaseTransport(pc);
  expect(recovered).toHaveBeenCalledTimes(1);
  first.emit(state.FrameCryptorStateDecryptionFailed);
  expect(report).toHaveBeenCalledTimes(3);
});

it('keeps missing keys, video failures and outgoing failures on the ordinary error path', async () => {
  const encryption = createRoomEncryption();
  const report = jest.fn();
  encryption.bindRoom(report);
  const video = cryptor();
  const audio = cryptor();
  const sender = cryptor();
  factory.createFrameCryptorForRtpReceiver
    .mockReturnValueOnce(video)
    .mockReturnValueOnce(audio);
  factory.createFrameCryptorForRtpSender.mockReturnValue(sender);
  let prepare;
  const pc = {
    prepareEncryptedReceivers: (fn) => {
      prepare = fn;
    },
  };
  encryption.configureSubscriber(pc);
  await prepare({ track: { kind: 'video' } });
  video.emit(state.FrameCryptorStateDecryptionFailed);
  await prepare({ track: { kind: 'audio' } });
  audio.emit(state.FrameCryptorStateMissingKey);
  await encryption.attachSender(pc, { track: { kind: 'audio' } }, 'local');
  sender.emit(state.FrameCryptorStateDecryptionFailed);
  for (const [error] of report.mock.calls) {
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RemoteAudioDecryptionError);
  }
  expect(report).toHaveBeenCalledTimes(3);
});

function reusedReceiver() {
  const provider = {
    setSharedKey: jest.fn().mockResolvedValue(true),
    restoreSharedKeyForParticipant: jest.fn().mockResolvedValue(true),
    dispose: jest.fn(),
  };
  factory.createDefaultKeyProvider.mockReturnValueOnce(provider);
  const encryption = createRoomEncryption();
  const pc = {
    prepareEncryptedReceivers(fn) {
      this.prepare = fn;
    },
  };
  encryption.configureSubscriber(pc);
  const receiver = { id: 'audio', track: { kind: 'audio' } };
  return { encryption, pc, receiver, provider };
}

it('keeps the current mic across negotiation and replaces both failure states for its successor', async () => {
  const { encryption, pc, receiver, provider } = reusedReceiver();
  const report = jest.fn();
  encryption.bindRoom(report);
  await encryption.setKey('test');
  const first = cryptor();
  first.dispose = jest.fn();
  const second = cryptor();
  const make = factory.createFrameCryptorForRtpReceiver
    .mockClear()
    .mockReturnValueOnce(first)
    .mockReturnValueOnce(second);
  await pc.prepare(receiver, 'first');
  first.emit(state.FrameCryptorStateDecryptionFailed);
  const stale = report.mock.lastCall[0];
  await pc.prepare(receiver, 'first');
  expect(make).toHaveBeenCalledTimes(1);
  await pc.prepare(receiver, 'second');
  await stale.recovered;
  const scopedKey = make.mock.calls[0][0];
  expect(make.mock.calls[1][0]).toBe(scopedKey);
  expect(provider.setSharedKey).toHaveBeenCalledTimes(1);
  expect(provider.restoreSharedKeyForParticipant).toHaveBeenCalledTimes(1);
  expect(provider.restoreSharedKeyForParticipant).toHaveBeenCalledWith(
    scopedKey
  );
  expect(first.dispose.mock.invocationCallOrder[0]).toBeLessThan(
    provider.restoreSharedKeyForParticipant.mock.invocationCallOrder[0]
  );
  expect(
    provider.restoreSharedKeyForParticipant.mock.invocationCallOrder[0]
  ).toBeLessThan(make.mock.invocationCallOrder[1]);
  first.emit(state.FrameCryptorStateDecryptionFailed);
  expect(report).toHaveBeenCalledTimes(1);
  second.emit(state.FrameCryptorStateDecryptionFailed);
  expect(report.mock.lastCall[0]).not.toBe(stale);
  await encryption.releaseTransport(pc);
});

it('rejects a failed receiver key restore before activation and retries on the same publication', async () => {
  const { encryption, pc, receiver, provider } = reusedReceiver();
  await encryption.setKey('test');
  const make = factory.createFrameCryptorForRtpReceiver
    .mockClear()
    .mockImplementation(cryptor);
  await pc.prepare(receiver, 'old');
  provider.restoreSharedKeyForParticipant.mockResolvedValueOnce(false);
  await expect(pc.prepare(receiver, 'new')).rejects.toThrow('restore');
  await expect(encryption.attachReceiver(pc, receiver)).rejects.toThrow(
    'restore'
  );
  expect(make).toHaveBeenCalledTimes(1);
  await pc.prepare(receiver, 'new');
  await encryption.attachReceiver(pc, receiver);
  expect(make).toHaveBeenCalledTimes(2);
  expect(provider.restoreSharedKeyForParticipant).toHaveBeenCalledTimes(2);
  await encryption.releaseTransport(pc);
});

it('finishes pending room key updates before rearming and closes safely during replacement', async () => {
  const { encryption, pc, receiver, provider } = reusedReceiver();
  await encryption.setKey('initial');
  const first = cryptor();
  first.dispose = jest.fn();
  const make = factory.createFrameCryptorForRtpReceiver
    .mockClear()
    .mockReturnValueOnce(first);
  await pc.prepare(receiver, 'old');
  let installKey;
  provider.setSharedKey.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        installKey = resolve;
      })
  );
  const keyChange = encryption.setKey('updated');
  const replacement = pc.prepare(receiver, 'new');
  await new Promise((resolve) => setImmediate(resolve));
  expect(first.dispose).toHaveBeenCalledTimes(1);
  expect(provider.restoreSharedKeyForParticipant).not.toHaveBeenCalled();
  const release = encryption.releaseTransport(pc);
  installKey(true);
  await keyChange;
  await expect(replacement).rejects.toThrow('closed');
  await release;
  expect(make).toHaveBeenCalledTimes(1);
  expect(provider.restoreSharedKeyForParticipant).not.toHaveBeenCalled();
});

describe('Android remote audio key retry', () => {
  const originalOS = Platform.OS;
  const advance = (ms) => jest.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    Platform.OS = 'android';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    Platform.OS = originalOS;
  });

  async function activeAudio() {
    const setup = reusedReceiver();
    const { encryption, pc, receiver } = setup;
    const report = jest.fn();
    encryption.bindRoom(report);
    await encryption.setKey('current-room-key');
    Object.assign(receiver.track, {
      enabled: true,
      muted: false,
      readyState: 'live',
    });
    const audio = cryptor();
    const make =
      factory.createFrameCryptorForRtpReceiver.mockReturnValueOnce(audio);
    await pc.prepare(receiver, 'published-mic');
    return { ...setup, audio, report, keyId: make.mock.lastCall[0] };
  }

  it('retries only the failed receiver at 1, 2, 4 and 4 seconds and resolves its error only on native OK', async () => {
    const { pc, encryption, audio, report, provider, keyId, receiver } =
      await activeAudio();
    const restore = provider.restoreSharedKeyForParticipant;
    restore
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValueOnce(false);
    const other = { id: 'other', track: { ...receiver.track } };
    factory.createFrameCryptorForRtpReceiver.mockReturnValueOnce(cryptor());
    await pc.prepare(other, 'other-mic');
    audio.emit(state.FrameCryptorStateDecryptionFailed);
    const failure = report.mock.lastCall[0];
    const recovered = jest.fn();
    failure.recovered.then(recovered);

    let attempts = 0;
    for (const delay of [1000, 2000, 4000, 4000]) {
      await advance(delay - 1);
      expect(restore).toHaveBeenCalledTimes(attempts);
      await advance(1);
      expect(restore).toHaveBeenCalledTimes(++attempts);
      expect(restore).toHaveBeenLastCalledWith(keyId);
      expect(recovered).not.toHaveBeenCalled();
      audio.emit(state.FrameCryptorStateDecryptionFailed);
    }
    expect(new Set(report.mock.calls.map(([e]) => e))).toEqual(
      new Set([failure])
    );
    expect(provider.setSharedKey).toHaveBeenCalledTimes(1);

    audio.emit(state.FrameCryptorStateOk);
    await failure.recovered;
    await advance(16000);
    expect(restore).toHaveBeenCalledTimes(4);
    audio.emit(state.FrameCryptorStateDecryptionFailed);
    expect(report.mock.lastCall[0]).not.toBe(failure);
    await advance(1000);
    expect(restore).toHaveBeenCalledTimes(5);
    await encryption.releaseTransport(pc);
  });

  it('waits for an explicit key update and rechecks track activity before using the current receiver key', async () => {
    const { pc, receiver, encryption, audio, provider, keyId } =
      await activeAudio();
    let finishUpdate;
    provider.setSharedKey.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUpdate = resolve;
        })
    );
    const userUpdate = encryption.setKey('updated-room-key');
    audio.emit(state.FrameCryptorStateDecryptionFailed);
    await advance(1000);
    expect(provider.restoreSharedKeyForParticipant).not.toHaveBeenCalled();
    receiver.track.muted = true;
    finishUpdate(true);
    await userUpdate;
    await advance(0);
    expect(provider.restoreSharedKeyForParticipant).not.toHaveBeenCalled();
    receiver.track.muted = false;
    await advance(2000);
    expect(provider.restoreSharedKeyForParticipant).toHaveBeenCalledTimes(1);
    expect(provider.restoreSharedKeyForParticipant).toHaveBeenCalledWith(keyId);
    await encryption.releaseTransport(pc);
  });

  it.each(['recovery', 'replacement', 'release', 'dispose'])(
    'invalidates retries queued behind a user key update upon %s',
    async (end) => {
      const { pc, receiver, encryption, audio, provider } = await activeAudio();
      let finishUpdate;
      provider.setSharedKey.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishUpdate = resolve;
          })
      );
      const userUpdate = encryption.setKey('updated-room-key');
      audio.emit(state.FrameCryptorStateDecryptionFailed);
      await advance(1000);
      const restore = provider.restoreSharedKeyForParticipant;
      expect(restore).not.toHaveBeenCalled();

      let finishing;
      if (end === 'recovery') audio.emit(state.FrameCryptorStateOk);
      if (end === 'replacement') {
        factory.createFrameCryptorForRtpReceiver.mockReturnValueOnce(cryptor());
        finishing = pc.prepare(receiver, 'next-mic');
      }
      if (end === 'release') finishing = encryption.releaseTransport(pc);
      if (end === 'dispose') finishing = encryption.dispose();
      await advance(0);
      finishUpdate(true);
      await userUpdate;
      await finishing;
      await advance(16000);
      // A new publication performs its own one-time restore.
      expect(restore).toHaveBeenCalledTimes(end === 'replacement' ? 1 : 0);
      await encryption.releaseTransport(pc);
    }
  );

  it.each([{ enabled: false }, { muted: true }, { readyState: 'ended' }])(
    'skips native key work after the track becomes %o',
    async (change) => {
      const { pc, receiver, encryption, audio, provider } = await activeAudio();
      audio.emit(state.FrameCryptorStateDecryptionFailed);
      Object.assign(receiver.track, change);
      await advance(16000);
      expect(provider.restoreSharedKeyForParticipant).not.toHaveBeenCalled();
      await encryption.releaseTransport(pc);
    }
  );

  it('leaves Android video, senders and iOS audio on their existing decryption paths', async () => {
    const { pc, receiver, encryption, provider } = await activeAudio();
    const video = cryptor();
    factory.createFrameCryptorForRtpReceiver.mockReturnValueOnce(video);
    await pc.prepare(
      { id: 'video', track: { ...receiver.track, kind: 'video' } },
      'video'
    );
    const outgoing = cryptor();
    factory.createFrameCryptorForRtpSender.mockReturnValueOnce(outgoing);
    await encryption.attachSender(pc, { track: receiver.track }, 'local');
    video.emit(state.FrameCryptorStateDecryptionFailed);
    outgoing.emit(state.FrameCryptorStateDecryptionFailed);
    await advance(16000);
    expect(provider.restoreSharedKeyForParticipant).not.toHaveBeenCalled();
    await encryption.releaseTransport(pc);

    Platform.OS = 'ios';
    const ios = await activeAudio();
    ios.audio.emit(state.FrameCryptorStateDecryptionFailed);
    await advance(16000);
    expect(ios.provider.restoreSharedKeyForParticipant).not.toHaveBeenCalled();
    await ios.encryption.releaseTransport(ios.pc);
  });
});
