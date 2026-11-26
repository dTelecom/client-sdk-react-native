import { NativeModules } from 'react-native';
import { AudioDeviceModule } from '@dtelecom/react-native-webrtc';
import AudioSession from '../audio/AudioSession';

jest.mock('@dtelecom/react-native-webrtc', () => ({
  AudioDeviceModule: { setAutomaticAudioSessionConfiguration: jest.fn() },
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: { ios: string }) => options.ios },
  NativeModules: {
    DtelecomReactNative: { getAudioRoute: jest.fn() },
  },
}));

describe('iOS audio session', () => {
  afterEach(async () => {
    await AudioSession.stopAudioSession();
    await AudioSession.configureAudio({ ios: { defaultOutput: 'speaker' } });
    jest.clearAllMocks();
  });

  it('clears inherited recording options for playback and retains them for capture', async () => {
    await AudioSession.startAudioSession();
    expect(
      AudioDeviceModule.setAutomaticAudioSessionConfiguration
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        playout: {
          audioCategory: 'playback',
          audioMode: 'default',
          audioCategoryOptions: [],
        },
        recording: expect.objectContaining({
          audioCategory: 'playAndRecord',
          audioCategoryOptions: expect.arrayContaining([
            'allowBluetooth',
            'defaultToSpeaker',
          ]),
        }),
      })
    );
  });

  it('retains the duplex voice policy for explicit earpiece playback', async () => {
    await AudioSession.configureAudio({ ios: { defaultOutput: 'earpiece' } });
    await AudioSession.startAudioSession();
    expect(
      AudioDeviceModule.setAutomaticAudioSessionConfiguration
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        playout: expect.objectContaining({
          audioCategory: 'playAndRecord',
          audioMode: 'voiceChat',
        }),
      })
    );
  });

  it('reads the current manual actions across playback, capture and return to playback', async () => {
    const route = { selectedOutput: 'speaker', availableOutputs: ['speaker'] };
    const actions = ['default', 'force_speaker'];
    NativeModules.DtelecomReactNative.getAudioRoute
      .mockResolvedValueOnce({ ...route, selectableOutputs: [] })
      .mockResolvedValueOnce({ ...route, selectableOutputs: actions })
      .mockResolvedValueOnce({ ...route, selectableOutputs: [] });

    await expect(AudioSession.getAudioOutputs()).resolves.toEqual([]);
    await expect(AudioSession.getAudioOutputs()).resolves.toEqual(actions);
    await expect(AudioSession.getAudioOutputs()).resolves.toEqual([]);
  });
});
